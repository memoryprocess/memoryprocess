/**
 * `mproc attach <pid> [--json]` -- the session surface.
 *
 * Holds one Process open and reads commands from stdin, one per line -- the
 * same grammar as top-level `mproc`, minus the `mproc` prefix and the pid
 * positionals (the session pid is implied; a leading pid matching the
 * session's is tolerated and ignored so scripts can be reused verbatim).
 *
 * This is how an agent iterates: spawn `mproc attach <pid> --json`, write
 * `describe`, `scan 100`, `read 0x... i32`, `write 0x... u32 99`, `undo` lines,
 * read one result per line. `exit`/`quit`/EOF closes the handle and exits.
 * Also reachable interactively (prompt `mproc[pid]>` on a TTY).
 *
 * Session state that DOESN'T fit in a file lives here: proc.writeLog/undo,
 * watch()/freeze() timers stay live between commands -- timers are per-command
 * processes in one-shot mode but interval timers inside an attach session
 * keep running until `unwatch`/`unfreeze`/`exit`.
 */
import { Process, type WriteValueType } from './core.js';
import { UsageError, parseAddr, parseType, parseValue } from './parse.js';
import { emitLine, emitOk, hex } from './out.js';
import { isNarrow, runCommand, writeNarrow } from './commands.js';
import { createInterface } from 'node:readline';

/** Extra commands only meaningful inside a live session. */
async function sessionCommand(
  proc: Process,
  json: boolean,
  args: string[],
): Promise<boolean> {
  const [cmd, ...rest] = args;
  switch (cmd) {
    case 'exit':
    case 'quit':
      return true; // signal handled by caller
    case 'watch': {
      // session watch: starts a background watcher, returns immediately
      if (!rest[0]) throw new UsageError('watch <addr> [type] [ms]');
      const addr = parseAddr(proc, rest[0]);
      const TYPE_RE = /^(i8|u8|i16|u16|i32|u32|i64|u64|f32|f64|ptr)$/i;
      const t =
        rest[1] && TYPE_RE.test(rest[1])
          ? parseType(rest[1])
          : parseType('i32');
      const ms = Number(
        rest[1] && !TYPE_RE.test(rest[1]) ? rest[1] : (rest[2] ?? 50),
      );
      const core =
        t.kind === 'scalar' && t.core !== undefined ? t.core : 'int32';
      const id = watchers.size + 1;
      const stop = proc.watch(
        addr,
        (nw, old) => {
          if (json)
            emitLine({
              type: 'change',
              watch: id,
              addr: hex(addr),
              from: nw,
              to: old,
            });
          else
            process.stdout.write(
              `\n${hex(addr)}: ${old} -> ${nw}\n${promptFor(proc)}`,
            );
        },
        ms,
        { onError: () => {} },
      );
      watchers.set(id, stop);
      if (json) emitOk({ watch: id, addr: hex(addr), ms });
      else console.log(`watch ${id} on ${hex(addr)} every ${ms}ms`);
      return false;
    }
    case 'unwatch': {
      const id = Number(rest[0]);
      const stop = watchers.get(id);
      if (!stop) throw new UsageError(`no such watch id ${rest[0]}`);
      stop();
      watchers.delete(id);
      if (json) emitOk({ unwatched: id });
      else console.log(`watch ${id} stopped`);
      return false;
    }
    case 'freeze': {
      if (!rest[0] || !rest[1] || !rest[2])
        throw new UsageError('freeze <addr> <type> <value> [ms]');
      const addr = parseAddr(proc, rest[0]);
      const p = parseType(rest[1]);
      if (p.kind !== 'scalar' || p.core === undefined)
        throw new UsageError(
          `freeze type must be i8|u8|i16|u16|i32|u32|i64|u64|f32|f64|ptr`,
        );
      const v = parseValue(rest[2], p.core);
      const ms = Number(rest[3] ?? 50);
      const value =
        p.core === 'int64' || p.core === 'uint64' || p.core === 'pointer'
          ? BigInt(v)
          : Number(v);
      const id = freezes.size + 1;
      // narrow types: same re-write loop over writeNarrow -- freeze() itself
      // only speaks 4/8-byte core types.
      const stop = isNarrow(p.core)
        ? (() => {
            const timer = setInterval(() => {
              try {
                writeNarrow(proc, addr, p.core as never, value, {
                  dryRun: false,
                });
              } catch {
                /* closed or unwritable -- ignore */
              }
            }, ms);
            timer.unref();
            return () => clearInterval(timer);
          })()
        : proc.freeze(addr, p.core as WriteValueType, value, ms);
      freezes.set(id, stop);
      if (json) emitOk({ freeze: id, addr: hex(addr), ms });
      else console.log(`freeze ${id} on ${hex(addr)} = ${value} every ${ms}ms`);
      return false;
    }
    case 'unfreeze': {
      const id = Number(rest[0]);
      const stop = freezes.get(id);
      if (!stop) throw new UsageError(`no such freeze id ${rest[0]}`);
      stop();
      freezes.delete(id);
      if (json) emitOk({ unfrozen: id });
      else console.log(`freeze ${id} stopped`);
      return false;
    }
    default:
      return false; // not a session command -- fall through to runCommand
  }
}

const watchers = new Map<number, () => void>();
const freezes = new Map<number, () => void>();
const promptFor = (p: Process) => `mproc[${p.pid}]> `;

export async function attach(pid: number, json: boolean): Promise<number> {
  const proc = Process.open(pid);
  const mods = proc.modules().length;
  if (json) {
    emitLine({ type: 'attached', pid: proc.pid, modules: mods });
  } else {
    console.error(
      `attached to pid ${proc.pid} (${mods} modules) -- commands like 'read 0x... i32', 'scan 100', 'undo'. 'exit' quits.`,
    );
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: !!process.stdin.isTTY,
    prompt: promptFor(proc),
  });
  if (process.stdin.isTTY && !json) rl.prompt();

  const close = () => {
    for (const s of watchers.values()) s();
    for (const s of freezes.values()) s();
    watchers.clear();
    freezes.clear();
    proc.close();
  };

  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (process.stdin.isTTY && !json) rl.prompt();
        continue;
      }
      const args = trimmed.split(/\s+/);
      const c = args[0]!.toLowerCase();
      if (c === 'exit' || c === 'quit') break;
      try {
        const handled = await sessionCommand(proc, json, args);
        if (!handled) {
          // session --json forces machine output for every inner command --
          // the user shouldn't retype --json per line.
          await runCommand(json ? [...args, '--json'] : args, proc);
        }
      } catch (e) {
        const err = e as { code?: string; message?: string };
        if (json)
          emitLine({
            ok: false,
            error: {
              code: err?.code ?? 'ERROR',
              message: err?.message ?? String(e),
            },
          });
        else console.error(`${err?.code ?? 'ERROR'}: ${err?.message ?? e}`);
      }
      if (process.stdin.isTTY && !json) rl.prompt();
    }
  } finally {
    rl.close();
    close();
  }
  if (json) emitLine({ type: 'detached', pid });
  return 0;
}
