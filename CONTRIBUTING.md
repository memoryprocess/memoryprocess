# Contributing

Thanks for considering a contribution -- bug reports, features, docs, tests, all welcome.

## Setup

**Requirements:** Windows, [Bun](https://bun.sh) >=1.4.4, MSVC build tools (Visual Studio), Python (for node-gyp), Node >=22.

```bash
git clone https://github.com/memoryprocess/memoryprocess
cd memoryprocess
bun install
```

The native addon needs MSVC. From a `x64 Native Tools` prompt (or after running `vcvars64.bat`):

```bash
bun run build          # builds packages/bindings .node + packages/core
bun run test           # runs the suite (spawns test victim processes)
```

## Workflow

- All changes go through **pull requests** to `main`. No direct pushes, no force-pushes.
- Branch naming: `feat/<slug>`, `fix/<slug>`, `docs/<slug>`, `test/<slug>`.
- **Conventional commits** -- `feat:`, `fix:`, `refactor:`, `test:`, `chore:`, `docs:`. PR titles must be conventional (checked by CI); release-please uses them to version.
- Squash-merge, delete the branch after.

## What a PR needs

- **Tests** for any behavior change (`bun test` must stay green). Fuzz/abuse cases go in `packages/core/tests/`.
- **Docs** -- JSDoc on new public API, README touch-up if the surface changed.
- **`bun run check`** clean (typecheck per package).
- **`bun fmt`** clean.
- CI `verify` green (fmt -> typecheck -> native build -> tests) + `compat` on Node 22/24/25/26.

## Project layout

```
packages/bindings   native .node N-API layer (src/native.ts interface)
packages/core       Process class + structs.ts (Address/Entity/Offsets)
packages/cli        mproc CLI (18 commands, --json, attach session)
packages/mcp        MCP stdio server (18 tools + eval_js, --no-eval mode)
```

`bindings` is the raw native; `core` is the engine; `cli`/`mcp` consume `core`.

## Reporting bugs

Open an issue with: Windows version, Node/Bun version, repro steps, expected vs actual. For crashes include the exit code (e.g. `0xC0000005` access-violation).

## Security issues

See `SECURITY.md` -- don't open a public issue for vulns.

## Code of conduct

See `CODE_OF_CONDUCT.md` -- Contributor Covenant 2.1.
