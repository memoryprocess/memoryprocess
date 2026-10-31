# memoryprocess

A Windows process-memory toolkit for Node.js / Bun / Deno -- read, write, scan, hook, and debug remote processes, plus the agentic tooling (CLI + MCP server) built on top.

**A ground-up rewrite of [`memoryjs`](https://github.com/Rob--/memoryjs)** (the unmaintained classic). Not a fork -- a modern reimplementation with a typed API, Cheat-Engine-style value scanning, MinHook-grade trampoline hooks, and first-class support for AI-agent consumption.

> **Early access** -- all four packages are published on npm (`0.0.1` on `latest`; newer prereleases ride the `beta`/`dev` dist-tag channels). APIs may still change before `1.0.0`.

## Packages

| Package                                        | What it is                                                                                                                                                                       |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@memoryprocess/bindings`](packages/bindings) | Raw N-API native layer -- the `.node` binary (35 stateless process-memory functions)                                                                                             |
| [`@memoryprocess/core`](packages/core)         | The engine -- `Process` class, typed r/w, CE-style scanning, hooks, inject, threads, findWhatWrites, remote structs (`Address`/`Entity`/`Offsets`)                               |
| [`@memoryprocess/cli`](packages/cli)           | `mproc` -- CLI for interactive/agentic use: 18 commands + `attach` session (`scan`/`scan-pattern`/`next`/`read`/`write`/`pointers`/`watch`/`freeze`/`undo`/`entities`, `--json`) |
| [`@memoryprocess/mcp`](packages/mcp)           | MCP server exposing the toolkit to LLM agents (18 coarse tools + `eval_js` escape hatch, `--no-eval` restricted mode)                                                            |

`cli` and `mcp` depend on `core`; `core` depends on `bindings`.

## Install

```bash
npm install @memoryprocess/core
# bleeding edge: npm install @memoryprocess/core@beta
```

CLI / MCP server:

```bash
npx mproc list --json
npx memoryprocess-mcp --help
```

## Quickstart

```ts
import { Process } from '@memoryprocess/core';

using proc = Process.open('notepad.exe');
const mod = proc.module('notepad.exe');
const hits = await proc.scanValue(100);
const refined = await proc.nextScan(hits, { type: 'decreased' });
```

See [`examples/quickstart.mjs`](examples/quickstart.mjs) for a runnable Node script.

## Build from source

Requires MSVC + Python (node-gyp) + Bun >=1.4.4:

```bash
bun install
bun run build        # node-gyp -> tsdown -> tsc -> .node
bun run test         # ~440 tests
```

See `CONTRIBUTING.md` and `AGENTS.md` for the full dev workflow.

## License

MIT
