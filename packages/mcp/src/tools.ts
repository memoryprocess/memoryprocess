/**
 * Session-handle tool layer for @memoryprocess/mcp.
 *
 * The MCP wire layer (server.ts) is a thin adapter over the definitions in
 * this file so the handlers are unit-testable without a stdio transport:
 * `createSessions()` + `callTool(sessions, name, args)`.
 *
 * Wire format follows docs/json-conventions.md:
 *  - every result is `{ok:true,data} | {ok:false,error:{code,message,win32code?}}`
 *  - bigints (addresses, pointers, 64-bit values) -> '0x…' strings
 *  - Buffers -> lowercase hex strings
 *  - errors carry the typed `.code` from @memoryprocess/core when available
 */
import { z } from 'zod';
import { MemoryProcessError, Process } from './core.js';
import type {
  NextScanMode,
  ScanHit,
  ScanValueType,
  WritePreview,
} from './core.js';

// ---------------------------------------------------------------------------
// serialization
// ---------------------------------------------------------------------------

export const hex = (v: number | bigint): string =>
  `0x${BigInt(v).toString(16)}`;

/** Recursively convert a JS value into the JSON-safe wire shape. */
export function jsonSafe(v: unknown): unknown {
  if (typeof v === 'bigint') return hex(v);
  if (v === null || v === undefined) return v;
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean')
    return v;
  if (Buffer.isBuffer(v)) return v.toString('hex');
  if (ArrayBuffer.isView(v)) {
    if (v instanceof Float32Array || v instanceof Float64Array)
      return Array.from(v);
    return Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString('hex');
  }
  if (Array.isArray(v)) return v.map(jsonSafe);
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) out[k] = jsonSafe(val);
    return out;
  }
  return String(v);
}

// ---------------------------------------------------------------------------
// error envelope
// ---------------------------------------------------------------------------

export interface ToolError {
  code: string;
  message: string;
  win32code?: number;
}

export type ToolResult = {
  ok: boolean;
  data?: unknown;
  error?: ToolError;
};

const fail = (code: string, message: string): Error & { code: string } => {
  const e = new Error(message) as Error & { code: string };
  e.code = code;
  return e;
};

function errorEnvelope(e: unknown): ToolResult {
  const err = e as {
    code?: string;
    message?: string;
    win32code?: number;
    issues?: unknown;
  };
  const out: ToolError = {
    code:
      typeof err?.code === 'string'
        ? err.code
        : err instanceof MemoryProcessError
          ? err.code
          : 'INTERNAL_ERROR',
    message: err?.message ?? String(e),
  };
  if (typeof err?.win32code === 'number') out.win32code = err.win32code;
  return { ok: false, error: out };
}

// ---------------------------------------------------------------------------
// argument parsing
// ---------------------------------------------------------------------------

/**
 * Parse an address argument: `0x…` hex string, decimal string, or
 * `"module+rva"` (resolved against the session's module table — the rva is
 * optional). Returns the absolute address as bigint.
 */
function parseAddress(proc: Process, v: unknown, name = 'addr'): bigint {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v < 0)
      throw fail('INVALID_ARGS', `${name} invalid`);
    return BigInt(v);
  }
  if (typeof v === 'string') {
    const s = v.trim();
    const plus = s.lastIndexOf('+');
    if (plus > 0) {
      const mod = proc.module(s.slice(0, plus));
      if (!mod)
        throw fail(
          'MODULE_NOT_FOUND',
          `module not found: ${s.slice(0, plus)} (in "${s}")`,
        );
      const rva = s.slice(plus + 1);
      let off: bigint;
      try {
        off = BigInt(rva);
      } catch {
        throw fail('INVALID_ARGS', `bad rva in "${s}"`);
      }
      return BigInt(mod.base) + off;
    }
    if (/\.(exe|dll)$/i.test(s)) {
      const mod = proc.module(s);
      if (!mod) throw fail('MODULE_NOT_FOUND', `module not found: ${s}`);
      return BigInt(mod.base);
    }
    try {
      return BigInt(s);
    } catch {
      throw fail('INVALID_ARGS', `${name} must be an address ("${v}")`);
    }
  }
  throw fail('INVALID_ARGS', `${name} must be an address`);
}

/** Parse a numeric value argument (accepts numbers, bigints, dec/hex strings). */
function parseNumeric(
  v: unknown,
  wide: boolean,
  name = 'value',
): number | bigint {
  if (typeof v === 'bigint') return wide ? v : Number(v);
  if (typeof v === 'number') {
    if (!Number.isFinite(v))
      throw fail('INVALID_ARGS', `${name} must be finite`);
    return wide ? BigInt(Math.trunc(v)) : v;
  }
  if (typeof v === 'string') {
    const s = v.trim();
    if (wide) {
      try {
        return BigInt(s);
      } catch {
        throw fail('INVALID_ARGS', `${name} must be an integer ("${v}")`);
      }
    }
    const n = /^0x[0-9a-f]+$/i.test(s) ? Number(BigInt(s)) : Number(s);
    if (!Number.isFinite(n))
      throw fail('INVALID_ARGS', `${name} must be a number ("${v}")`);
    return n;
  }
  throw fail('INVALID_ARGS', `${name} must be a number`);
}

// ---------------------------------------------------------------------------
// type normalisation
// ---------------------------------------------------------------------------

/** Agent-facing type aliases -> core WriteValueType/ScanValueType. */
const NUMERIC_TYPES: Record<string, string> = {
  i8: 'uint8',
  u8: 'uint8',
  i16: 'uint16',
  u16: 'uint16',
  i32: 'int32',
  u32: 'uint32',
  i64: 'int64',
  u64: 'uint64',
  f32: 'float',
  f64: 'double',
  ptr: 'pointer',
  int8: 'int8',
  uint8: 'uint8',
  int16: 'int16',
  uint16: 'uint16',
  int32: 'int32',
  uint32: 'uint32',
  int64: 'int64',
  uint64: 'uint64',
  float: 'float',
  double: 'double',
  pointer: 'pointer',
};
const SCAN_TYPES = new Set<ScanValueType>([
  'int32',
  'uint32',
  'int64',
  'uint64',
  'float',
  'double',
]);
const WIDE_TYPES = new Set(['int64', 'uint64', 'pointer']);

const SIGNED_READ_TYPES = new Set(['int8', 'int16']);
const READ_WIDTHS: Record<string, number> = {
  int8: 1,
  uint8: 1,
  int16: 2,
  uint16: 2,
  int32: 4,
  uint32: 4,
  float: 4,
  int64: 8,
  uint64: 8,
  double: 8,
  pointer: 8,
};

/**
 * Normalise an agent-facing type name to the core name.
 * Accepts `bytes`/`bytes:N` (needs `len`), `str`/`wstr`, and numeric types.
 */
function normType(t: unknown, name = 'type'): string {
  if (typeof t !== 'string' || !t)
    throw fail('INVALID_ARGS', `${name} must be a string`);
  const lower = t.toLowerCase();
  const hit = NUMERIC_TYPES[lower];
  if (hit) return hit;
  if (lower === 'str' || lower === 'wstr') return lower;
  if (lower === 'bytes' || /^bytes:\d+$/.test(lower)) return 'bytes';
  throw fail('INVALID_ARGS', `unknown type "${t}"`);
}

// ---------------------------------------------------------------------------
// session store
// ---------------------------------------------------------------------------

export interface WatchRec {
  events: { value: number; ts: number }[];
  stop: () => void;
}

export class SessionStore {
  private procs = new Map<string, Process>();
  private watches = new Map<string, WatchRec>();
  private freezes = new Map<string, () => void>();
  private seq = 0;
  private wseq = 0;
  private fseq = 0;

  open(nameOrPid: string | number, access?: string): string {
    const proc =
      access === 'ro'
        ? Process.openReadOnly(nameOrPid)
        : Process.open(nameOrPid);
    const id = `p${++this.seq}`;
    this.procs.set(id, proc);
    return id;
  }

  get(id: unknown): Process {
    if (typeof id !== 'string')
      throw fail('INVALID_ARGS', 'session must be a string');
    const p = this.procs.get(id);
    if (!p) throw fail('UNKNOWN_SESSION', `unknown session "${id}"`);
    return p;
  }

  close(id: unknown): void {
    if (typeof id !== 'string')
      throw fail('INVALID_ARGS', 'session must be a string');
    const p = this.procs.get(id);
    if (!p) throw fail('UNKNOWN_SESSION', `unknown session "${id}"`);
    // drop watch/freeze handles bound to this session
    for (const k of [...this.watches.keys()])
      if (k.startsWith(`${id}:`)) {
        this.watches.get(k)!.stop();
        this.watches.delete(k);
      }
    for (const k of [...this.freezes.keys()])
      if (k.startsWith(`${id}:`)) {
        this.freezes.get(k)!();
        this.freezes.delete(k);
      }
    this.procs.delete(id);
    p.close();
  }

  addWatch(session: string, rec: WatchRec): string {
    const id = `${session}:w${++this.wseq}`;
    this.watches.set(id, rec);
    return id;
  }

  getWatch(id: unknown): WatchRec {
    if (typeof id !== 'string')
      throw fail('INVALID_ARGS', 'watchId must be a string');
    const w = this.watches.get(id);
    if (!w) throw fail('UNKNOWN_WATCH', `unknown watchId "${id}"`);
    return w;
  }

  removeWatch(id: unknown): void {
    const w = this.getWatch(id);
    w.stop();
    this.watches.delete(id as string);
  }

  addFreeze(session: string, stop: () => void): string {
    const id = `${session}:f${++this.fseq}`;
    this.freezes.set(id, stop);
    return id;
  }

  removeFreeze(id: unknown): void {
    if (typeof id !== 'string')
      throw fail('INVALID_ARGS', 'freezeId must be a string');
    const stop = this.freezes.get(id);
    if (!stop) throw fail('UNKNOWN_FREEZE', `unknown freezeId "${id}"`);
    stop();
    this.freezes.delete(id);
  }

  closeAll(): void {
    for (const [id] of this.procs) {
      try {
        this.close(id);
      } catch {
        /* best effort on shutdown */
      }
    }
    for (const [, w] of this.watches) w.stop();
    for (const [, f] of this.freezes) f();
    this.watches.clear();
    this.freezes.clear();
  }

  get size(): number {
    return this.procs.size;
  }
}

export function createSessions(): SessionStore {
  return new SessionStore();
}

// ---------------------------------------------------------------------------
// read/write dispatch
// ---------------------------------------------------------------------------

function readTyped(proc: Process, addr: bigint, args: Record<string, unknown>) {
  const type = normType(args.type);
  switch (type) {
    case 'str':
      return proc.readString(
        addr,
        typeof args.len === 'number' ? args.len : undefined,
      );
    case 'wstr':
      return proc.readWideString(
        addr,
        typeof args.len === 'number' ? args.len : undefined,
      );
    case 'bytes': {
      const m =
        typeof args.type === 'string' && /^bytes:(\d+)$/.exec(args.type);
      const len =
        typeof args.len === 'number' ? args.len : m ? Number(m[1]) : undefined;
      if (len === undefined || !Number.isInteger(len) || len < 1)
        throw fail('INVALID_ARGS', 'bytes read needs len (or bytes:N)');
      return proc.readBuffer(addr, len);
    }
    case 'int8':
      return (proc.readUInt8(addr) << 24) >> 24;
    case 'int16':
      return (proc.readUInt16(addr) << 16) >> 16;
    case 'uint8':
      return proc.readUInt8(addr);
    case 'uint16':
      return proc.readUInt16(addr);
    case 'int32':
      return proc.readInt32(addr);
    case 'uint32':
      return proc.readUInt32(addr);
    case 'int64':
      return proc.readInt64(addr);
    case 'uint64':
      return proc.readUInt64(addr);
    case 'float':
      return proc.readFloat(addr);
    case 'double':
      return proc.readDouble(addr);
    case 'pointer':
      return proc.readPointer(addr);
    default:
      throw fail('INVALID_ARGS', `unsupported read type "${args.type}"`);
  }
}

function serializePreview(p: WritePreview) {
  return {
    addr: hex(p.addr),
    current: p.current.toString('hex'),
    would: p.would.toString('hex'),
    bytes: p.bytes,
  };
}

function writeTyped(
  proc: Process,
  addr: bigint,
  args: Record<string, unknown>,
): true | ReturnType<typeof serializePreview> {
  const type = normType(args.type);
  const dryRun = args.dryRun === true;
  const opts = { dryRun };
  const fin = (r: boolean | WritePreview) =>
    r === true ? (true as const) : serializePreview(r as WritePreview);

  switch (type) {
    case 'str':
    case 'wstr': {
      if (typeof args.value !== 'string')
        throw fail('INVALID_ARGS', `${type} write needs a string value`);
      const r =
        type === 'str'
          ? proc.writeString(addr, args.value, 'utf8', opts)
          : proc.writeWideString(addr, args.value, opts);
      return fin(r);
    }
    case 'bytes': {
      const v = args.value;
      let buf: Buffer;
      if (typeof v === 'string' && /^(0x)?[0-9a-fA-F]*$/.test(v)) {
        buf = Buffer.from(v.replace(/^0x/, ''), 'hex');
      } else if (Array.isArray(v)) {
        buf = Buffer.from(v.map((b) => Number(b) & 0xff));
      } else {
        throw fail(
          'INVALID_ARGS',
          'bytes write needs a hex string or byte array',
        );
      }
      if (buf.length === 0)
        throw fail('INVALID_ARGS', 'bytes write needs at least 1 byte');
      return fin(proc.writeBuffer(addr, buf, opts));
    }
    case 'int8':
    case 'int16':
    case 'uint8':
    case 'uint16': {
      const v = parseNumeric(args.value, false) as number;
      const r =
        type === 'int8' || type === 'uint8'
          ? proc.writeUInt8(addr, v, opts)
          : proc.writeUInt16(addr, v, opts);
      return fin(r);
    }
    case 'int32':
      return fin(
        proc.writeInt32(addr, parseNumeric(args.value, false) as number, opts),
      );
    case 'uint32':
      return fin(
        proc.writeUInt32(addr, parseNumeric(args.value, false) as number, opts),
      );
    case 'int64':
      return fin(
        proc.writeInt64(addr, parseNumeric(args.value, true) as bigint, opts),
      );
    case 'uint64':
      return fin(
        proc.writeUInt64(addr, parseNumeric(args.value, true) as bigint, opts),
      );
    case 'float':
      return fin(
        proc.writeFloat(addr, parseNumeric(args.value, false) as number, opts),
      );
    case 'double':
      return fin(
        proc.writeDouble(addr, parseNumeric(args.value, false) as number, opts),
      );
    case 'pointer':
      return fin(
        proc.writePointer(addr, parseNumeric(args.value, true) as bigint, opts),
      );
    default:
      throw fail('INVALID_ARGS', `unsupported write type "${args.type}"`);
  }
}

// ---------------------------------------------------------------------------
// scan-hit (de)serialisation
// ---------------------------------------------------------------------------

function serializeHit(h: ScanHit): { addr: string; value: unknown } {
  return { addr: hex(h.addr), value: jsonSafe(h.value) };
}

function parseHits(
  raw: unknown,
  type: string,
): { addr: bigint; value: number | bigint }[] {
  if (!Array.isArray(raw))
    throw fail('INVALID_ARGS', 'hits must be an array of {addr,value}');
  const wide = WIDE_TYPES.has(type);
  return raw.map((h, i) => {
    if (typeof h !== 'object' || h === null)
      throw fail('INVALID_ARGS', `hits[${i}] must be {addr,value}`);
    const rec = h as Record<string, unknown>;
    let addr: bigint;
    try {
      addr = BigInt(rec.addr as string | number | bigint);
    } catch {
      throw fail('INVALID_ARGS', `hits[${i}].addr is not an address`);
    }
    let value: number | bigint;
    if (wide) {
      try {
        value = BigInt(rec.value as string | number | bigint);
      } catch {
        throw fail('INVALID_ARGS', `hits[${i}].value is not an integer`);
      }
    } else {
      value = Number(rec.value);
      if (!Number.isFinite(value))
        throw fail('INVALID_ARGS', `hits[${i}].value is not a number`);
    }
    return { addr, value };
  });
}

// ---------------------------------------------------------------------------
// tool definitions
// ---------------------------------------------------------------------------

const sessionArg = {
  session: z.string().describe('session handle from proc_open'),
};
const addrArg = z
  .union([z.string(), z.number()])
  .describe('address: "0x…" hex, decimal, or "module+rva"');
const typeArg = z
  .string()
  .describe('i8 u8 i16 u16 i32 u32 i64 u64 f32 f64 ptr str wstr bytes[:N]');

type Handler = (
  s: SessionStore,
  a: Record<string, unknown>,
) => unknown | Promise<unknown>;

interface ToolDef {
  description: string;
  schema: Record<string, z.ZodTypeAny>;
  destructive?: boolean;
  handler: Handler;
}

const toolDefs: Record<string, ToolDef> = {
  proc_list: {
    description: 'List running processes as {pid,name}[]',
    schema: {},
    handler: () => Process.list(),
  },

  proc_open: {
    description:
      'Open a process and return a session handle plus a describe() snapshot. access:"ro" opens read-only.',
    schema: {
      pid: z.number().int().optional().describe('process id (use pid OR name)'),
      name: z.string().optional().describe('process name e.g. "victim.exe"'),
      access: z.enum(['rw', 'ro']).optional().describe('"ro" = openReadOnly'),
    },
    handler: (s, a) => {
      if (a.pid === undefined && a.name === undefined)
        throw fail('INVALID_ARGS', 'proc_open needs pid or name');
      const target =
        a.pid !== undefined ? (a.pid as number) : (a.name as string);
      const session = s.open(target, a.access as string | undefined);
      return { session, describe: s.get(session).describe() };
    },
  },

  proc_close: {
    description: 'Close a session and release its process handle',
    schema: sessionArg,
    handler: (s, a) => {
      s.close(a.session);
      return { closed: true };
    },
  },

  mem_describe: {
    description:
      'Machine-readable snapshot of the target: pid, arch, modules, writable/executable regions, threads',
    schema: sessionArg,
    handler: (s, a) => s.get(a.session).describe(),
  },

  mem_read: {
    description:
      'Read a typed value. Integers/pointers come back as hex strings, floats as numbers, str/wstr as strings, bytes as hex.',
    schema: {
      ...sessionArg,
      addr: addrArg,
      type: typeArg,
      len: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('byte/char count for bytes/str/wstr'),
    },
    handler: (s, a) => {
      const proc = s.get(a.session);
      const addr = parseAddress(proc, a.addr);
      return { addr: hex(addr), value: readTyped(proc, addr, a) };
    },
  },

  mem_write: {
    description:
      'Write a typed value (journaled — reversible via mem_undo). dryRun:true returns {addr,current,would,bytes} WITHOUT writing.',
    schema: {
      ...sessionArg,
      addr: addrArg,
      type: typeArg,
      value: z
        .union([z.string(), z.number(), z.array(z.number())])
        .describe(
          'value (hex/dec strings ok; bytes takes hex string or byte array)',
        ),
      dryRun: z.boolean().optional().describe('preview only, do not write'),
    },
    destructive: true,
    handler: (s, a) => {
      const proc = s.get(a.session);
      const addr = parseAddress(proc, a.addr);
      const r = writeTyped(proc, addr, a);
      return r === true ? { written: true } : { preview: r };
    },
  },

  mem_scan: {
    description:
      'CE-style value scan: find all occurrences of `value` in committed (writable by default) memory. Returns {hits:[{addr,value}],count,truncated}.',
    schema: {
      ...sessionArg,
      value: z.union([z.string(), z.number()]).describe('value to find'),
      type: z
        .string()
        .optional()
        .describe('i32 u32 i64 u64 f32 f64 (default i32)'),
      module: z.string().optional().describe('restrict to a module'),
      start: addrArg.optional().describe('range start'),
      end: addrArg.optional().describe('range end'),
      onlyWritable: z.boolean().optional(),
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('max hits returned (default 1000)'),
    },
    handler: async (s, a) => {
      const proc = s.get(a.session);
      const type = normType(a.type ?? 'i32');
      if (!SCAN_TYPES.has(type as ScanValueType))
        throw fail(
          'INVALID_ARGS',
          `mem_scan type must be a scan type, got "${a.type ?? 'i32'}"`,
        );
      const value = parseNumeric(a.value, WIDE_TYPES.has(type));
      const hits = await proc.scanValue(value, {
        type: type as ScanValueType,
        module: a.module as string | undefined,
        start:
          a.start !== undefined
            ? parseAddress(proc, a.start, 'start')
            : undefined,
        end: a.end !== undefined ? parseAddress(proc, a.end, 'end') : undefined,
        onlyWritable: a.onlyWritable as boolean | undefined,
      });
      const limit = (a.limit as number | undefined) ?? 1000;
      return {
        count: hits.length,
        truncated: hits.length > limit,
        hits: hits.slice(0, limit).map(serializeHit),
      };
    },
  },

  mem_scan_next: {
    description:
      'Refine a previous mem_scan hit list (CE "next scan"). mode: exact|changed|unchanged|increased|decreased|increasedBy|decreasedBy|between; relative modes compare against each hit\'s stored value.',
    schema: {
      ...sessionArg,
      hits: z
        .array(
          z.object({
            addr: z.union([z.string(), z.number()]),
            value: z.union([z.string(), z.number()]),
          }),
        )
        .describe('hits from mem_scan / a previous mem_scan_next'),
      mode: z
        .enum([
          'exact',
          'changed',
          'unchanged',
          'increased',
          'decreased',
          'increasedBy',
          'decreasedBy',
          'between',
        ])
        .describe('refine mode'),
      value: z
        .union([z.string(), z.number()])
        .optional()
        .describe('target for exact/increasedBy/decreasedBy'),
      lo: z.union([z.string(), z.number()]).optional().describe('between low'),
      hi: z.union([z.string(), z.number()]).optional().describe('between high'),
      type: z.string().optional().describe('same type as the original scan'),
      limit: z.number().int().positive().optional(),
    },
    handler: async (s, a) => {
      const proc = s.get(a.session);
      const type = normType(a.type ?? 'i32');
      if (!SCAN_TYPES.has(type as ScanValueType))
        throw fail('INVALID_ARGS', `mem_scan_next type must be a scan type`);
      const wide = WIDE_TYPES.has(type);
      const mode = a.mode as string;
      let m: NextScanMode;
      switch (mode) {
        case 'exact':
          m = { type: 'exact', value: parseNumeric(a.value, wide) };
          break;
        case 'increasedBy':
        case 'decreasedBy':
          m = { type: mode, value: parseNumeric(a.value, wide) };
          break;
        case 'between':
          m = {
            type: 'between',
            lo: parseNumeric(a.lo, wide, 'lo'),
            hi: parseNumeric(a.hi, wide, 'hi'),
          };
          break;
        case 'changed':
        case 'unchanged':
        case 'increased':
        case 'decreased':
          m = { type: mode };
          break;
        default:
          throw fail('INVALID_ARGS', `unknown mode "${mode}"`);
      }
      const hits = await proc.nextScan(parseHits(a.hits, type), m, {
        type: type as ScanValueType,
      });
      const limit = (a.limit as number | undefined) ?? 1000;
      return {
        count: hits.length,
        truncated: hits.length > limit,
        hits: hits.slice(0, limit).map(serializeHit),
      };
    },
  },

  mem_pointer_resolve: {
    description:
      'Resolve module+rva plus a pointer chain: base = module base + rva, then dereference each offset (CE "module.exe+RVA, offsets" style).',
    schema: {
      ...sessionArg,
      module: z.string().describe('module basename e.g. "victim.exe"'),
      rva: z
        .union([z.string(), z.number()])
        .describe('offset from module base (hex ok)'),
      offsets: z
        .array(z.union([z.string(), z.number()]))
        .describe('pointer-chain offsets; all but the last dereference'),
    },
    handler: (s, a) => {
      const proc = s.get(a.session);
      const mod = proc.module(a.module as string);
      if (!mod) throw fail('MODULE_NOT_FOUND', `module not found: ${a.module}`);
      let rva: bigint;
      try {
        rva = BigInt(a.rva as string | number | bigint);
      } catch {
        throw fail('INVALID_ARGS', `bad rva "${a.rva}"`);
      }
      const offsets = (a.offsets as (string | number)[]).map((o, i) => {
        const n = typeof o === 'string' ? Number(BigInt(o)) : Number(o);
        if (!Number.isFinite(n))
          throw fail('INVALID_ARGS', `offsets[${i}] invalid`);
        return n;
      });
      const base = BigInt(mod.base) + rva;
      const addr =
        offsets.length === 0 ? base : proc.resolvePointer(base, offsets);
      return { base: hex(base), addr: hex(addr) };
    },
  },

  mem_watch: {
    description:
      'Poll an i32 at addr every ms (default 50); changes are recorded and drained by mem_watch_poll.',
    schema: {
      ...sessionArg,
      addr: addrArg,
      ms: z.number().int().positive().optional().describe('poll interval ms'),
    },
    handler: (s, a) => {
      const proc = s.get(a.session);
      const addr = parseAddress(proc, a.addr);
      const events: { value: number; ts: number }[] = [];
      const stop = proc.watch(
        addr,
        (v) => events.push({ value: v, ts: Date.now() }),
        (a.ms as number | undefined) ?? 50,
      );
      return { watchId: s.addWatch(a.session as string, { events, stop }) };
    },
  },

  mem_watch_poll: {
    description:
      'Drain the recorded changes for a watchId: returns [{value,ts}] since the last poll.',
    schema: { watchId: z.string() },
    handler: (s, a) => {
      const w = s.getWatch(a.watchId);
      const events = w.events;
      w.events = [];
      return { events, count: events.length };
    },
  },

  mem_unwatch: {
    description: 'Stop a watch created by mem_watch',
    schema: { watchId: z.string() },
    handler: (s, a) => {
      s.removeWatch(a.watchId);
      return { stopped: true };
    },
  },

  mem_freeze: {
    description:
      'Freeze a value: rewrites `value` at addr every ms (default 50) until mem_unfreeze.',
    schema: {
      ...sessionArg,
      addr: addrArg,
      type: z.string().describe('i8 u8 i16 u16 i32 u32 i64 u64 f32 f64 ptr'),
      value: z.union([z.string(), z.number()]),
      ms: z.number().int().positive().optional(),
    },
    destructive: true,
    handler: (s, a) => {
      const proc = s.get(a.session);
      const addr = parseAddress(proc, a.addr);
      const type = normType(a.type);
      if (type === 'str' || type === 'wstr' || type === 'bytes')
        throw fail(
          'INVALID_ARGS',
          `freeze needs a numeric type, got "${a.type}"`,
        );
      const coreType =
        type === 'int8' || type === 'int16'
          ? type === 'int8'
            ? 'uint8'
            : 'uint16'
          : type;
      const stop = proc.freeze(
        addr,
        coreType as Parameters<Process['freeze']>[1],
        parseNumeric(a.value, WIDE_TYPES.has(type)),
        (a.ms as number | undefined) ?? 50,
      );
      return { freezeId: s.addFreeze(a.session as string, stop) };
    },
  },

  mem_unfreeze: {
    description: 'Stop a freeze created by mem_freeze',
    schema: { freezeId: z.string() },
    handler: (s, a) => {
      s.removeFreeze(a.freezeId);
      return { stopped: true };
    },
  },

  mem_undo: {
    description:
      'Revert the last n journaled writes (default 1), most-recent first — the self-correction primitive.',
    schema: {
      ...sessionArg,
      n: z.number().int().positive().optional(),
    },
    destructive: true,
    handler: (s, a) => {
      const reverted = s.get(a.session).undo((a.n as number | undefined) ?? 1);
      return { reverted };
    },
  },

  mem_journal: {
    description:
      'Snapshot of the write journal for this session: [{index,addr,bytes|null}] — bytes is the pre-write hex that undo() restores.',
    schema: sessionArg,
    handler: (s, a) => s.get(a.session).writeLog,
  },

  eval_js: {
    description:
      'Escape hatch: run JS with the bound Process in scope as `proc`. Code is wrapped in an async body — use `return` for a result, `await` is allowed.',
    schema: {
      ...sessionArg,
      code: z.string().describe('JS body; `proc` is the open Process'),
    },
    destructive: true,
    handler: async (s, a) => {
      const proc = s.get(a.session);
      if (typeof a.code !== 'string' || !a.code)
        throw fail('INVALID_ARGS', 'eval_js needs a code string');
      try {
        const fn = new Function(
          'proc',
          'Process',
          `return (async () => { ${a.code} })()`,
        );
        return { result: await fn(proc, Process) };
      } catch (e) {
        const err = e as { code?: string; message?: string };
        throw fail(err?.code ?? 'EVAL_ERROR', err?.message ?? String(e));
      }
    },
  },
};

export const TOOL_DEFS = toolDefs;

export function toolNames(opts: { evalEnabled?: boolean } = {}): string[] {
  const evalEnabled = opts.evalEnabled ?? true;
  return Object.keys(toolDefs).filter((n) => evalEnabled || n !== 'eval_js');
}

/** Direct dispatcher used by both the stdio server and the tests. */
export async function callTool(
  sessions: SessionStore,
  name: string,
  args: Record<string, unknown>,
  opts: { evalEnabled?: boolean } = {},
): Promise<ToolResult> {
  try {
    const evalEnabled = opts.evalEnabled ?? true;
    const def = toolDefs[name];
    if (!def || (name === 'eval_js' && !evalEnabled))
      throw fail('UNKNOWN_TOOL', `unknown tool "${name}"`);
    const parsed = z.object(def.schema).safeParse(args ?? {});
    if (!parsed.success) {
      const msg = parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      throw fail('INVALID_ARGS', msg);
    }
    const data = jsonSafe(
      await def.handler(sessions, parsed.data as Record<string, unknown>),
    );
    return { ok: true, data };
  } catch (e) {
    return errorEnvelope(e);
  }
}
