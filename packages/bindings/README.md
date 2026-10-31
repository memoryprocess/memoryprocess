# @memoryprocess/bindings

The raw N-API native layer of the [memoryprocess](https://github.com/memoryprocess/memoryprocess) toolkit: the `.node` binary plus a typed TypeScript interface over the stateless process-memory functions (open/close, read/write, VirtualQueryEx walk, pattern scan, thread ops, hooks primitives).

Most consumers want [`@memoryprocess/core`](https://www.npmjs.com/package/@memoryprocess/core) instead -- it wraps this layer in the `Process` class with typed reads/writes, CE-style scanning, and remote structs.

## Install

```bash
npm install @memoryprocess/bindings
```

Windows only (`"os": ["win32"]`), Node >= 22. Prebuilt binaries ship under `prebuilds/` for the CI-covered Node majors via `node-gyp-build`.

## Usage

```ts
import { native } from '@memoryprocess/bindings';

const { handle, pid } = native.openProcess('notepad.exe');
try {
  const mods = native.getModules(handle, pid);
  const buf = native.readBuffer(handle, Number(mods[0].base), 16);
} finally {
  native.closeHandle(handle);
}
```

Every function is stateless: it takes a `handle`/`pid`/`tid` argument and holds no shared native state. The full function surface is declared in `src/native.ts` (`Native` interface).

## Binary resolution

At load time the addon resolves in order:

1. `dist/memoryprocess.node` (bundled in the published tarball)
2. `prebuilds/<platform>-<arch>/memoryprocess.node` via `node-gyp-build`
3. `build/Release/memoryprocess.node` (local `node-gyp` build)

Future Node majors not covered by the shipped prebuilds will need a local `node-gyp rebuild` (`binding.gyp` + `native/` sources are included in the tarball), or wait for a new release.

## Part of

[`memoryprocess`](https://github.com/memoryprocess/memoryprocess) -- a Windows process-memory toolkit (`@memoryprocess/{bindings,core,cli,mcp}`), a ground-up rewrite of `memoryjs`.

## License

MIT
