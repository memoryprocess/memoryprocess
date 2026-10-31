# @memoryprocess/core

The engine of the [memoryprocess](https://github.com/memoryprocess/memoryprocess) toolkit: the `Process` class for Windows process-memory work -- typed read/write, Cheat-Engine-style value scanning (`scanValue`/`nextScan`), MinHook-grade trampoline hooks, DLL inject/eject, thread control, `findWhatWrites`, and remote structs (`Address`/`Entity`/`EntityList`/`Offsets`).

Built on [`@memoryprocess/bindings`](https://www.npmjs.com/package/@memoryprocess/bindings). Windows only (`"os": ["win32"]`), Node >= 22 or Bun.

## Install

```bash
npm install @memoryprocess/core
```

## Quickstart

```ts
import { Process } from '@memoryprocess/core';

using proc = Process.open('notepad.exe');

const mod = proc.module('notepad.exe');
const hits = await proc.scanValue(100);
const refined = await proc.nextScan(hits, { type: 'decreased' });

proc.writeInt32(Number(hits[0].addr), 999); // journaled -> proc.undo()
```

## Highlights

- **Typed r/w**: `i8..i64`, `u8..u64`, `f32/f64`, `ptr`, `str`, `wstr`, raw buffers -- plus `readSafe` (VirtualQueryEx-walked, zero-fills `PAGE_GUARD`/`NOACCESS`).
- **CE-style scanning**: `scanValue` -> `nextScan` (`exact`/`changed`/`unchanged`/`increased`/`decreased`/`increasedBy`/`decreasedBy`/`between`), AoB `scan` with `??` wildcards, per-module/per-section scoping.
- **Hooks**: `hook`/`unhook` (E9 trampoline over whole instructions, position-relative operands relocated), `patchCall`, `execShellcode`, HDE64 length-disassembly via `disassemble`.
- **Agentic safety**: every write is journaled -> `writeLog`/`undo`; `dryRun` previews (`{current, would, bytes}`); typed errors (`MemoryProcessError` and subclasses with `.code`).
- **Remote structs**: `Address`, `Entity`, `EntityList`, `Offsets` -- declare a schema once, read structured objects out of a remote address space.
- **Threads/debug**: `threads`, `suspend`/`resume`, `getThreadContext`/`setThreadContext`, `hwBreakpoint` (Dr0-Dr3 + Dr7), `findWhatWrites`, `NtSuspendProcess`/`ResumeProcess`.
- **Pointer chains**: `resolvePointer`, CE-syntax `pointers()`/`entity()`/`entityList()`, `findPointersTo`, `module+rva` addressing.

`using`/`Symbol.dispose` is supported on `Process` -- the handle closes at scope exit.

## Agentic surfaces

This package is the engine; the agent-facing front-ends live in:

- [`@memoryprocess/cli`](https://www.npmjs.com/package/@memoryprocess/cli) -- `mproc`, the toolkit as composable `--json` shell commands + `attach` session.
- [`@memoryprocess/mcp`](https://www.npmjs.com/package/@memoryprocess/mcp) -- MCP stdio server (17 session-handle tools + `eval_js`, with a `--no-eval` restricted mode).

## Part of

[`memoryprocess`](https://github.com/memoryprocess/memoryprocess) -- a ground-up rewrite of `memoryjs` (the unmaintained classic). See the root README for the full toolkit overview, docs, and examples.

## License

MIT
