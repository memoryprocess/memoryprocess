/**
 * Command handlers — the Process API as composable shell commands.
 *
 * Each handler receives a Ctx; in one-shot mode `ctx.proc` is a freshly-opened
 * Process closed by the dispatcher, in `attach` mode it's the persistent one.
 * Handlers never open/close themselves.
 */
import { Process, type ScanHit, type WritePreview } from './core.js';
import {
  UsageError,
  parseAddr,
  parseFlags,
  parseIntArg,
  parsePointerDef,
  parseScanType,
  parseType,
  parseValue,
  type Flags,
} from './parse.js';
import { cap, emitLine, emitOk, emitProgress, hex, table } from './out.js';
import {
  appendJournal,
  loadJournal,
  loadScan,
  saveJournal,
  saveScan,
  scanStatePath,
} from './state.js';

export interface Ctx {
  flags: Flags;
  /** persistent Process (attach mode) or null (one-shot: dispatcher opens) */
  proc: Process | null;
  /** pid the dispatcher should open when ctx.proc is null */
  pid: number | null;
  /** argv positionals AFTER the command name */
  pos: string[];
}

export type Handler = (ctx: Ctx) => Promise<void> | void;

const ok = (ctx: Ctx, data: unknown) => emitOk(data);

function needPos(ctx: Ctx, n: number, usage: string): void {
  if (ctx.pos.length < n)
    throw new UsageError(`missing arguments — usage: ${usage}`);
}

function num(v: number | bigint): number | string {
  return typeof v === 'bigint' ? hex(v) : v;
}

/* ---------------- list ---------------- */
function cmdList(ctx: Ctx): void {
  const procs = Process.list();
  if (ctx.flags.json) return ok(ctx, procs);
  const rows = procs.map((p) => [p.pid, p.name]);
  console.log(table(rows, ['PID', 'NAME']));
}

/* ---------------- modules ---------------- */
function cmdModules(ctx: Ctx): void {
  const proc = ctx.proc!;
  const mods = proc.modules().map((m) => ({
    name: m.path.split(/[\\/]/).pop()!,
    base: hex(m.base),
    size: m.size,
    path: m.path,
  }));
  if (ctx.flags.json) return ok(ctx, mods);
  console.log(
    table(
      mods.map((m) => [m.base, String(m.size), m.name]),
      ['BASE', 'SIZE', 'NAME'],
    ),
  );
}

/* ---------------- describe ---------------- */
function cmdDescribe(ctx: Ctx): void {
  const d = ctx.proc!.describe();
  if (ctx.flags.json) return ok(ctx, d);
  console.log(`pid ${d.pid}  ${d.arch}  ptr=${d.pointerSize}`);
  console.log(`threads: ${d.threads.join(', ')}`);
  console.log(`modules (${d.modules.length}):`);
  const [shown, omitted] = cap(d.modules, 16);
  console.log(
    table(
      shown.map((m) => [m.base, String(m.size), m.name]),
      ['BASE', 'SIZE', 'NAME'],
    ),
  );
  if (omitted) console.log(`  … ${omitted} more`);
  console.log(`rwxRegions: ${d.rwxRegions.length}`);
}

/* ---------------- read ---------------- */
function cmdRead(ctx: Ctx): void {
  needPos(ctx, 1, 'mproc read <pid> <addr> [type]');
  const proc = ctx.proc!;
  const addr = parseAddr(proc, ctx.pos[0]!);
  const t = parseType(ctx.pos[1]);
  let value: unknown;
  if (t.kind === 'bytes') {
    value = `0x${proc.readBuffer(addr, t.n!).toString('hex')}`;
  } else if (t.kind === 'str') {
    value = proc.readString(addr);
  } else if (t.kind === 'wstr') {
    value = proc.readWideString(addr);
  } else {
    switch (t.core) {
      case 'int32':
        value = proc.readInt32(addr);
        break;
      case 'uint32':
        value = proc.readUInt32(addr);
        break;
      case 'int64':
        value = proc.readInt64(addr);
        break;
      case 'uint64':
        value = proc.readUInt64(addr);
        break;
      case 'float':
        value = proc.readFloat(addr);
        break;
      case 'double':
        value = proc.readDouble(addr);
        break;
      case 'pointer':
        value = proc.readPointer(addr);
        break;
      case 'u8':
        value = proc.readUInt8(addr);
        break;
      case 'u16':
        value = proc.readUInt16(addr);
        break;
    }
  }
  if (ctx.flags.json)
    return ok(ctx, { addr: hex(addr), type: ctx.pos[1] ?? 'ptr', value });
  console.log(
    `${hex(addr)}  ${typeof value === 'bigint' ? hex(value) : String(value)}`,
  );
}

/* ---------------- write ---------------- */
function isPreview(v: unknown): v is WritePreview {
  return typeof v === 'object' && v !== null && 'would' in v;
}

function cmdWrite(ctx: Ctx): void {
  needPos(ctx, 3, 'mproc write <pid> <addr> <type> <value> [--dry]');
  const proc = ctx.proc!;
  const addr = parseAddr(proc, ctx.pos[0]!);
  const t = parseType(ctx.pos[1]);
  const raw = ctx.pos[2]!;
  const opts = { dryRun: ctx.flags.dry };

  // Snapshot prior bytes BEFORE the write — the undo journal must hold the
  // pre-write state (snapshotting after would journal the just-written
  // value, making `undo` a no-op). Length = exactly what the write touches.
  const writeLen =
    t.kind === 'bytes'
      ? Buffer.from(raw.startsWith('0x') ? raw.slice(2) : raw, 'hex').length
      : t.kind === 'wstr'
        ? (raw.length + 1) * 2
        : t.kind === 'str'
          ? Buffer.byteLength(raw) + 1
          : t.core === 'int64' ||
              t.core === 'uint64' ||
              t.core === 'pointer' ||
              t.core === 'double'
            ? 8
            : t.core === 'u8'
              ? 1
              : t.core === 'u16'
                ? 2
                : 4;
  let priorBytes: string | null = null;
  if (!ctx.flags.dry) {
    try {
      priorBytes = proc.readBuffer(addr, writeLen).toString('hex');
    } catch {
      priorBytes = null; // unreadable target — journaled as un-undoable
    }
  }

  let r: boolean | WritePreview;
  if (t.kind === 'bytes') {
    const h = raw.startsWith('0x') ? raw.slice(2) : raw;
    if (!/^[0-9a-fA-F]*$/.test(h) || h.length === 0 || h.length % 2 !== 0)
      throw new UsageError(`bytes write needs even-length hex, got '${raw}'`);
    r = proc.writeBuffer(addr, Buffer.from(h, 'hex'), opts);
  } else if (t.kind === 'str') {
    r = proc.writeString(addr, raw, 'utf8', opts);
  } else if (t.kind === 'wstr') {
    r = proc.writeWideString(addr, raw, opts);
  } else {
    const v = parseValue(raw, t.core!);
    switch (t.core) {
      case 'int32':
        r = proc.writeInt32(addr, Number(v), opts);
        break;
      case 'uint32':
        r = proc.writeUInt32(addr, Number(v), opts);
        break;
      case 'int64':
        r = proc.writeInt64(addr, BigInt(v), opts);
        break;
      case 'uint64':
        r = proc.writeUInt64(addr, BigInt(v), opts);
        break;
      case 'float':
        r = proc.writeFloat(addr, Number(v), opts);
        break;
      case 'double':
        r = proc.writeDouble(addr, Number(v), opts);
        break;
      case 'pointer':
        r = proc.writePointer(addr, BigInt(v), opts);
        break;
      case 'u8':
        r = proc.writeUInt8(addr, Number(v), opts);
        break;
      case 'u16':
        r = proc.writeUInt16(addr, Number(v), opts);
        break;
    }
    r ??= false;
  }
  if (isPreview(r)) {
    const preview = {
      dry: true,
      addr: hex(r.addr),
      current: `0x${r.current.toString('hex')}`,
      would: `0x${r.would.toString('hex')}`,
      bytes: r.bytes,
    };
    if (ctx.flags.json) return ok(ctx, preview);
    console.log(
      `dry-run ${hex(r.addr)}: ${preview.current} → ${preview.would} (${r.bytes}B)`,
    );
    return;
  }
  // Real write → journal the PRIOR bytes for cross-invocation `undo`.
  appendJournal(proc.pid, { addr: hex(addr), bytes: priorBytes });
  if (ctx.flags.json) return ok(ctx, { addr: hex(addr), written: true });
  console.log(`${hex(addr)} written`);
}

/* ---------------- scan / next ---------------- */
function scanToStored(hits: readonly ScanHit[]) {
  return hits.map((h) => ({
    addr: hex(h.addr),
    value: typeof h.value === 'bigint' ? hex(h.value) : h.value,
  }));
}

async function cmdScan(ctx: Ctx): Promise<void> {
  needPos(ctx, 1, 'mproc scan <pid> <value> [type] [--module m] [--out f]');
  const proc = ctx.proc!;
  const type = parseScanType(ctx.pos[1]);
  const value = parseValue(ctx.pos[0]!, type);
  emitProgress({ type: 'progress', op: 'scan', pid: proc.pid });
  const hits = await proc.scanValue(value, {
    type,
    module: ctx.flags.module,
    start: ctx.flags.start ? BigInt(ctx.flags.start) : undefined,
    end: ctx.flags.end ? BigInt(ctx.flags.end) : undefined,
  });
  const limit = ctx.flags.limit ?? hits.length;
  const shown = hits.slice(0, limit);
  if (ctx.flags.json) {
    for (const h of shown)
      emitLine({ type: 'hit', addr: hex(h.addr), value: num(h.value) });
    emitLine({ type: 'done', count: hits.length, shown: shown.length });
  } else {
    const [rows, omitted] = cap(shown, 40);
    console.log(
      table(
        rows.map((h) => [hex(h.addr), String(num(h.value))]),
        ['ADDR', 'VALUE'],
      ),
    );
    if (omitted) console.log(`… ${omitted} more (use --limit)`);
    console.log(`${hits.length} hits`);
  }
  const statePath = ctx.flags.out ?? scanStatePath(proc.pid);
  saveScan(statePath, {
    pid: proc.pid,
    type,
    hits: scanToStored(hits),
  });
  emitProgress({ type: 'state', path: statePath });
}

function storedToHits(st: {
  hits: { addr: string; value: number | string }[];
}): ScanHit[] {
  return st.hits.map((h) => ({
    addr: BigInt(h.addr),
    value: typeof h.value === 'string' ? BigInt(h.value) : h.value,
  }));
}

async function cmdNext(ctx: Ctx): Promise<void> {
  needPos(
    ctx,
    2,
    'mproc next <pid> <state-file> <mode> [args…]  modes: exact V | changed | unchanged | increased | decreased | increasedBy V | decreasedBy V | between LO HI',
  );
  const proc = ctx.proc!;
  const st = loadScan(ctx.pos[0]!);
  const modeName = ctx.pos[1]!;
  const arg = (i: number) => {
    const v = ctx.pos[i];
    if (v === undefined)
      throw new UsageError(`mode '${modeName}' needs more arguments`);
    return parseIntArg(v, `mode arg '${v}'`);
  };
  let mode: Parameters<Process['nextScan']>[1];
  switch (modeName) {
    case 'exact':
      mode = { type: 'exact', value: arg(2) };
      break;
    case 'changed':
      mode = { type: 'changed' };
      break;
    case 'unchanged':
      mode = { type: 'unchanged' };
      break;
    case 'increased':
      mode = { type: 'increased' };
      break;
    case 'decreased':
      mode = { type: 'decreased' };
      break;
    case 'increasedBy':
      mode = { type: 'increasedBy', value: arg(2) };
      break;
    case 'decreasedBy':
      mode = { type: 'decreasedBy', value: arg(2) };
      break;
    case 'between':
    case 'range':
      mode = { type: 'between', lo: arg(2), hi: arg(3) };
      break;
    default:
      throw new UsageError(
        `unknown next mode '${modeName}' — exact|changed|unchanged|increased|decreased|increasedBy|decreasedBy|between`,
      );
  }
  const hits = await proc.nextScan(storedToHits(st), mode, {
    type: st.type as never,
  });
  if (ctx.flags.json) {
    for (const h of hits)
      emitLine({ type: 'hit', addr: hex(h.addr), value: num(h.value) });
    emitLine({ type: 'done', count: hits.length, shown: hits.length });
  } else {
    const [rows, omitted] = cap(hits, 40);
    console.log(
      table(
        rows.map((h) => [hex(h.addr), String(num(h.value))]),
        ['ADDR', 'VALUE'],
      ),
    );
    if (omitted) console.log(`… ${omitted} more`);
    console.log(`${hits.length} hits`);
  }
  saveScan(ctx.pos[0]!, {
    pid: proc.pid,
    type: st.type,
    hits: scanToStored(hits),
  });
  emitProgress({ type: 'state', path: ctx.pos[0] });
}

/* ---------------- pointers ---------------- */
function cmdPointers(ctx: Ctx): void {
  needPos(
    ctx,
    1,
    "mproc pointers <pid> '<name>:<mod+rva,off,off>'…  e.g. health:game.exe+0x1F2A3C,0x10,0x8",
  );
  const proc = ctx.proc!;
  const defs = ctx.pos.map(parsePointerDef);
  const out = defs.map((d) => {
    const a = proc.addr(d.base, ...d.chain).resolve();
    return { name: d.name, addr: hex(a) };
  });
  if (ctx.flags.json) return ok(ctx, out);
  console.log(
    table(
      out.map((o) => [o.name, o.addr]),
      ['NAME', 'ADDR'],
    ),
  );
}

/* ---------------- undo / journal ---------------- */
function cmdUndo(ctx: Ctx): void {
  const proc = ctx.proc!;
  const count = ctx.pos[0] ? Number(parseIntArg(ctx.pos[0], 'count')) : 1;
  if (!Number.isInteger(count) || count < 1)
    throw new UsageError('undo count must be an integer >= 1');
  const j = loadJournal(proc.pid);
  const batch = j.splice(Math.max(0, j.length - count)).reverse();
  let reverted = 0;
  for (const e of batch) {
    if (e.bytes === null) continue;
    try {
      proc.writeProtected(BigInt(e.addr), Buffer.from(e.bytes, 'hex'));
      reverted++;
    } catch {
      /* target region gone — skip */
    }
  }
  saveJournal(proc.pid, j);
  if (ctx.flags.json) return ok(ctx, { reverted, remaining: j.length });
  console.log(`reverted ${reverted} write(s), ${j.length} journaled`);
}

function cmdJournal(ctx: Ctx): void {
  const j = loadJournal(ctx.proc!.pid);
  const entries = j.map((e, i) => ({ index: i, addr: e.addr, bytes: e.bytes }));
  if (ctx.flags.json) return ok(ctx, entries);
  console.log(
    table(
      entries.map((e) => [String(e.index), e.addr, e.bytes ?? '(no snapshot)']),
      ['#', 'ADDR', 'PRIOR BYTES'],
    ),
  );
}

/* ---------------- watch / freeze (long-running) ---------------- */
async function cmdWatch(ctx: Ctx): Promise<void> {
  needPos(ctx, 1, 'mproc watch <pid> <addr> [type] [ms]');
  const proc = ctx.proc!;
  const addr = parseAddr(proc, ctx.pos[0]!);
  // positional disambiguation: pos[1] is a type name or the interval
  let typeName = 'i32';
  let msPos: string | undefined;
  if (ctx.pos[1] && /^(i32|u32|i64|u64|f32|f64|ptr)$/i.test(ctx.pos[1])) {
    typeName = ctx.pos[1].toLowerCase();
    msPos = ctx.pos[2];
  } else {
    msPos = ctx.pos[1];
  }
  const ms = ctx.flags.ms ?? (msPos ? Number(msPos) : 50);
  if (!Number.isInteger(ms) || ms < 1)
    throw new UsageError(
      `watch interval must be an integer >= 1, got '${msPos}'`,
    );
  const t = parseType(typeName);
  const core: string =
    t.kind === 'scalar' &&
    t.core !== undefined &&
    t.core !== 'u8' &&
    t.core !== 'u16'
      ? t.core
      : 'int32';
  if (ctx.flags.json)
    emitLine({ type: 'watch', addr: hex(addr), valueType: core, ms });
  else
    console.error(
      `watching ${hex(addr)} (${core}) every ${ms}ms — Ctrl-C to stop`,
    );
  await new Promise<void>((res) => {
    let prev: number | bigint | undefined;
    const t2 = setInterval(() => {
      let cur: number | bigint;
      try {
        cur = proc.readValueAt(addr, core);
      } catch {
        return; // target may have exited — keep waiting for Ctrl-C
      }
      if (prev === undefined) prev = cur;
      else if (cur !== prev) {
        const old = prev;
        prev = cur;
        if (ctx.flags.json)
          emitLine({
            type: 'change',
            addr: hex(addr),
            from: num(old),
            to: num(cur),
          });
        else console.log(`${hex(addr)}: ${num(old)} → ${num(cur)}`);
      }
    }, ms);
    const stop = () => {
      clearInterval(t2);
      res();
    };
    process.on('SIGINT', stop);
    process.stdin?.on('end', stop);
    if (process.stdin && !process.stdin.isTTY) process.stdin.resume();
  });
}

async function cmdFreeze(ctx: Ctx): Promise<void> {
  needPos(ctx, 3, 'mproc freeze <pid> <addr> <type> <value> [ms]');
  const proc = ctx.proc!;
  const addr = parseAddr(proc, ctx.pos[0]!);
  const p = parseType(ctx.pos[1]);
  if (p.kind !== 'scalar' || p.core === 'u8' || p.core === 'u16')
    throw new UsageError(
      `freeze type must be i32|u32|i64|u64|f32|f64|ptr, got '${ctx.pos[1]}'`,
    );
  const v = parseValue(ctx.pos[2]!, p.core!);
  const ms = ctx.flags.ms ?? (ctx.pos[3] ? Number(ctx.pos[3]) : 50);
  const value =
    p.core === 'int64' || p.core === 'uint64' || p.core === 'pointer'
      ? BigInt(v)
      : Number(v);
  proc.freeze(addr, p.core!, value, ms);
  if (ctx.flags.json) emitLine({ type: 'freeze', addr: hex(addr), ms });
  else
    console.error(
      `freezing ${hex(addr)} = ${value} every ${ms}ms — Ctrl-C to stop`,
    );
  await new Promise<void>((res) => {
    const stop = () => res();
    process.on('SIGINT', stop);
    process.stdin?.on('end', stop);
    if (process.stdin && !process.stdin.isTTY) process.stdin.resume();
  });
}

/* ---------------- entity list ---------------- */
async function cmdEntities(ctx: Ctx): Promise<void> {
  needPos(ctx, 3, 'mproc entities <pid> <addr> <stride|next:OFF> [max]');
  const proc = ctx.proc!;
  const first = parseAddr(proc, ctx.pos[0]!);
  const spec = ctx.pos[1]!;
  const max = ctx.pos[2] ? Number(parseIntArg(ctx.pos[2], 'max')) : 256;
  let addrs: bigint[];
  if (spec.startsWith('next:')) {
    const off = Number(parseIntArg(spec.slice(5), 'next offset'));
    addrs = proc.entityList({ first, next: off, max }).toArray() as bigint[];
  } else {
    const stride = Number(parseIntArg(spec, 'stride'));
    addrs = proc.entityList({ first, stride, max }).toArray() as bigint[];
  }
  if (ctx.flags.json) return ok(ctx, addrs.map(hex));
  console.log(addrs.map(hex).join('\n'));
}

/* ---------------- dispatch ---------------- */
/** Commands that take a pid as their FIRST positional. */
const PID_COMMANDS = new Set([
  'modules',
  'describe',
  'read',
  'write',
  'scan',
  'next',
  'pointers',
  'watch',
  'freeze',
  'undo',
  'journal',
  'entities',
]);

export const COMMANDS: Record<string, Handler> = {
  list: cmdList,
  modules: cmdModules,
  describe: cmdDescribe,
  read: cmdRead,
  write: cmdWrite,
  scan: cmdScan,
  next: cmdNext,
  pointers: cmdPointers,
  watch: cmdWatch,
  freeze: cmdFreeze,
  undo: cmdUndo,
  journal: cmdJournal,
  entities: cmdEntities,
};

export const USAGE = `mproc — memoryprocess CLI

  mproc list                                  running processes
  mproc modules <pid>                         loaded modules
  mproc describe <pid>                        process profile (JSON-safe)
  mproc read <pid> <addr> [type]              typed read (i32|u32|i64|u64|f32|f64|ptr|u8|u16|bytes:N|str|wstr)
  mproc write <pid> <addr> <type> <value> [--dry]
  mproc scan <pid> <value> [type] [--module m | --start a --end b] [--out f] [--limit n]   CE-style value scan → .mproc/scan-<pid>.json
  mproc next <pid> <file> <mode> [args]          refine: exact V|changed|unchanged|increased|decreased|increasedBy V|decreasedBy V|between LO HI
  mproc pointers <pid> '<name>:<mod+rva,off,off>'…   resolve named chains
  mproc watch <pid> <addr> [type] [ms]        stream value changes (Ctrl-C ends)
  mproc freeze <pid> <addr> <type> <value> [ms]    keep re-writing (Ctrl-C ends)
  mproc undo <pid> [n]                        revert last n journaled writes
  mproc journal <pid>                         show the persisted write journal
  mproc entities <pid> <addr> <stride|next:OFF> [max]
  mproc attach <pid>                          session: hold Process open, one command per stdin line

addr := 0x… | decimal | mod+rva   flags: --json --dry --out f --limit n --ms t --module m --start a --end b
`;

/**
 * Run one command line (attach-mode and standalone share this). `argv` does
 * NOT include the leading 'mproc'; when `session` is provided, pid positionals
 * are dropped (the session's pid is implied) and its proc is used.
 */
export async function runCommand(
  argv: string[],
  session: Process | null,
): Promise<number> {
  const { flags, pos } = parseFlags(argv);
  if (flags.rest.length)
    throw new UsageError(`unknown flag(s): ${flags.rest.join(' ')}`);
  const cmdName = pos[0];
  if (
    !cmdName ||
    cmdName === 'help' ||
    cmdName === '--help' ||
    cmdName === '-h'
  ) {
    console.log(USAGE);
    return 0;
  }
  const handler = COMMANDS[cmdName];
  if (!handler)
    throw new UsageError(`unknown command '${cmdName}' — try 'mproc help'`);

  let pid: number | null = null;
  let rest = pos.slice(1);
  if (session) {
    // session mode: the proc's pid is implied; drop a leading pid-looking arg
    if (
      PID_COMMANDS.has(cmdName) &&
      rest.length &&
      /^[0-9]+$/.test(rest[0]!) &&
      Number(rest[0]) === session.pid
    )
      rest = rest.slice(1);
    pid = session.pid;
  } else if (PID_COMMANDS.has(cmdName)) {
    const pidArg = rest[0];
    if (!pidArg)
      throw new UsageError(`missing <pid> — usage: mproc ${cmdName} <pid> …`);
    const n = Number(pidArg);
    if (!Number.isInteger(n) || n <= 0)
      throw new UsageError(`invalid pid '${pidArg}'`);
    pid = n;
    rest = rest.slice(1);
  }

  const ctx: Ctx = { flags, proc: session, pid, pos: rest };
  if (session || !PID_COMMANDS.has(cmdName)) {
    await handler(ctx);
    return 0;
  }
  // one-shot: open, run, close
  const proc = Process.open(pid!);
  ctx.proc = proc;
  try {
    await handler(ctx);
  } finally {
    proc.close();
  }
  return 0;
}
