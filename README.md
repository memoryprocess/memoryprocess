# memoryprocess

A Windows process-memory toolkit for Node.js / Bun / Deno — read, write, scan, hook, and debug remote processes, plus the agentic tooling (CLI + MCP server) built on top.

**A ground-up rewrite of [`memoryjs`](https://github.com/Rob--/memoryjs)** (the unmaintained, ~680★ classic). Not a fork — a modern reimplementation with a typed API, Cheat-Engine-style value scanning, MinHook-grade trampoline hooks, and first-class support for AI-agent consumption.

> ⚠️ **Work in progress** — the packages are on the `dev` channel. Nothing is on `latest` yet; `npm install` returns no matching version by design.

## Packages

| Package                                        | What it is                                                                                                                                        | Status  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| [`@memoryprocess/bindings`](packages/bindings) | Raw N-API native layer — the `.node` binary (35 stateless process-memory functions)                                                               | `dev`   |
| [`@memoryprocess/core`](packages/core)         | The engine — `Process` class, typed r/w, CE-style scanning, hooks, inject, threads, findWhatWrites, remote structs (`Address`/`Entity`/`Offsets`) | `dev`   |
| [`@memoryprocess/cli`](packages/cli)           | `mproc` — CLI for interactive/agentic use (`scan`/`read`/`write`/`pointers`/`watch`/`attach`, `--json`)                                           | planned |
| [`@memoryprocess/mcp`](packages/mcp)           | MCP server exposing the toolkit to LLM agents (~12 coarse tools + `eval_js` + dryRun/undo)                                                        | planned |

`cli` and `mcp` depend on `core`; `core` depends on `bindings`.

## Install

```bash
npm install @memoryprocess/core@dev
```

## Quickstart

```ts
import { Process } from '@memoryprocess/core';

using proc = Process.open('notepad.exe');
const mod = proc.module('notepad.exe');
const hits = await proc.scanValue(100);
const refined = await proc.nextScan(hits, { type: 'decreased' });
```

## Build from source

Requires MSVC + Python (node-gyp) + Bun ≥1.4.4:

```bash
bun install
bun run build        # node-gyp -> tsdown -> tsc -> .node
bun run test         # 408 tests
```

See `CONTRIBUTING.md` and `AGENTS.md` for the full dev workflow.

## License

MIT
