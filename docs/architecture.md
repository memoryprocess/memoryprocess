# Architecture

## Package dependency graph

```
+------------------+
| @memoryprocess/  |   17 coarse tools + eval_js + dryRun/undo (agents)
|      mcp         |
+------------------+
+------------------+
| @memoryprocess/  |   mproc -- 17 commands: scan/read/write/pointers/
|      cli         |   watch/freeze/undo/attach (--json)
+------------------+
         | depends on
+------------------+
| @memoryprocess/  |   Process engine + structs.ts (Address/Entity/Offsets)
|      core        |   ~60 methods over the public bindings API
+------------------+
         | workspace:*
+------------------+
| @memoryprocess/  |   .node N-API -- 38 stateless free functions
|     bindings     |   (handle/pid/tid args, no shared native state)
+------------------+
```

## Why `bindings` is separate

The `.node` is a compiled binary tied to the Node ABI that built it. Keeping it its own package (the `@serialport/bindings-cpp` pattern) means:

- `core` is pure TypeScript -- installs fast, builds only the wrapper.
- The native binary is versioned/prebuilt on its own (prebuildify matrix per Node major).
- Embedders who only want the raw function surface can consume `bindings` without the `Process` class.

## `core` internals

`src/process.ts` -- the `Process` class (r/w, scan, hooks, inject, threads, debug, watch/freeze) plus thin wrappers that factory `structs.ts` objects (`proc.addr()`, `.pointers()`, `.entity()`, `.entityList()`, `.readMany()`, `.findPointersTo()`). Those wrappers stay in core because they're the primary user-facing API.

`src/structs.ts` -- the remote-struct / introspection layer: `Address` (lazy `mod+rva` chains), `Offsets` (cs2-dumper / hazedumper JSON + `ready()`), `Entity`/`EntityList` (schema'd remote objects + polymorphic iteration), `readMany`/`findPointersTo`. TS-only, consumes the public `Process` API.

## Native boundary

`bindings` exports 38 stateless functions on one `.node` -- split into `memory.cc` (r/w/readSafe), `process.cc` (open/threads/context/suspend), `module.cc` (modules/inject/eject/dump/hookSteal/writeProtected/findWhatWrites), `pattern.cc` (AOB + value scan AsyncWorkers), `hde/` (vendored HDE64 decoder). No shared global state -- every call takes the handle/pid it operates on, so there's no cross-call coupling to split further.

## Release model

Manifest-mode release-please versions all packages in lockstep (`pkg@x.y.z` tags, `separate-pull-requests: false` = one combined release PR). Publish channels are npm dist-tags derived from the version suffix: `dev`/`next`/`beta`/`alpha` prereleases -> that channel; stable -> `latest` (gated on a maintainer `release-as` commit). See `docs/releasing.md`.
