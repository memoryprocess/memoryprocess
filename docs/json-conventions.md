# JSON conventions -- the agent-facing output contract

Every `@memoryprocess/*` surface that emits structured data (the `mproc` CLI,
the MCP server, `Process.describe()`, `eval_js` results) follows these rules.
They exist so an agent can `JSON.parse` output and branch on it without
regexing human text or losing precision.

## Addresses and 64-bit values are hex strings

`bigint` does not survive `JSON.stringify` (it throws) and `JSON.parse` can't
represent integers above `2^53` -- a u64 pointer silently corrupts. So:

- **Addresses, pointers, module bases** -> `"0x"`-prefixed hex strings:
  `"0x7ff6a1b20000"`. This is also how agents naturally write addresses, and
  it matches radare2's convention (`0x%08"PFMT64x`).
- **Values that fit in a JS number** (int32, uint32, float, double, sizes,
  pids, tids) -> plain JSON numbers.
- **True 64-bit values** (int64/uint64 reads, pointer values) -> hex strings
  unless the consumer is inside the JS API where `bigint` is native.

Parse back with `BigInt(str)` -- `BigInt("0x7ff6...")` handles the prefix.

## Envelope

Operations that can fail return a uniform envelope:

```jsonc
// success
{ "ok": true, "data": ... }

// failure -- agent branches on error.code, never on message text
{ "ok": false, "error": { "code": "WRITE_FAILED", "message": "WriteProcessMemory failed at 0xdead", "win32code": 299 } }
```

`error.code` is the typed code from `@memoryprocess/core` errors
(`PROCESS_NOT_FOUND`, `ACCESS_DENIED`, `READ_FAILED`, `WRITE_FAILED`,
`PATTERN_NOT_FOUND`, `PATTERN_NOT_UNIQUE`, `INJECT_FAILED`, `PROCESS_CLOSED`,
`HOOK_MISALIGNED`, `SELF_SUSPEND`, `FOREIGN_TID`, `INVALID_SCHEMA`).
`win32code` is included when the OS reported one.

## Long/streaming output -> NDJSON

Scans can produce thousands of hits. Emit **one JSON object per line**
(NDJSON) so a consumer can take the first N and stop:

```jsonl
{"type":"hit","addr":"0x7ff6a1b23840","value":1337}
{"type":"hit","addr":"0x7ff6a1b25a90","value":1337}
{"type":"done","count":2}
```

Progress mid-operation goes to **stderr** (stdout stays pure data):
`{"type":"progress","regionsDone":3,"regionsTotal":17}`.

## dryRun preview -- `WritePreview`

Every byte-write method accepts `{ dryRun: true }` and returns a preview
instead of writing:

```ts
proc.writeInt32(addr, 42); // -> true (written)
proc.writeInt32(addr, 42, { dryRun: true }); // -> WritePreview (nothing written)
```

```ts
type WritePreview = {
  addr: bigint; // target
  current: Buffer; // bytes there NOW (zero-filled if unreadable)
  would: Buffer; // bytes that would be written
  bytes: number; // === would.length
};
```

Applies to `writeInt32/UInt32/Int64/UInt64/Float/Double/Pointer/UInt8/UInt16`,
`writeBuffer`, `writeProtected`, `writeString`, `writeWideString`, `nop`,
`patchJump`, `patchCall`. **Not** `alloc`/`free`/`protect` -- those aren't
byte-writes. In JSON surfaces, `current`/`would` serialize as hex strings.

## writeLog + undo -- self-correction primitive

Every real write journals its **prior** bytes into a per-`Process` ring
buffer (cap 256, oldest dropped):

- `proc.writeLog` -> readonly snapshot `[{addr, bytes, index}]`;
  `bytes === null` means the pre-write snapshot failed -- that entry can't be
  undone and is skipped.
- `proc.undo(count = 1)` -> pops the last `count` entries newest-first and
  restores each via `writeProtected` (originals may live in code/protected
  pages). Returns the number actually reverted (null-byte entries don't
  count). Restores are themselves journaled, so a second `undo()` "redoes".
- `dryRun` previews are **not** journaled; `close()` clears the journal.

## describe() schema -- `ProcessDescribe`

```ts
{
  pid: number,
  arch: 'x64' | 'x86',           // x86 => WOW64 target
  pointerSize: 8,                // 4 on WOW64
  modules: [{ name: 'victim.exe', base: '0x7ff6...', size: 155136 }],
  rwxRegions: [{                 // committed, writable and/or executable pages
    base: '0x7ff6...',
    size: 4096,
    protection: 'PAGE_EXECUTE_READWRITE'   // Win32 constant name (+ '|PAGE_GUARD')
  }],
  threads: [12340, 8844]
}
```
