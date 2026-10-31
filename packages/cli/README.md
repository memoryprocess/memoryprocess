# @memoryprocess/cli

`mproc` - the memoryprocess toolkit as composable shell commands. Drives a
live Windows process without writing a script: scan, read, write, refine,
pointer-chains, watch, freeze, undo - plus `attach`, a stdin-driven session
that holds a `Process` open (the agentic surface).

Every command takes `--json` and emits the contract in
[`docs/json-conventions.md`](../../docs/json-conventions.md): addresses/64-bit
values as `"0x..."` hex strings, scan hits as NDJSON, errors as
`{ok:false,error:{code,message}}` with exit code 1. Without `--json` you get
aligned tables.

```
mproc list                                  running processes (pid, name)
mproc modules <pid>                         loaded modules (base, size, name)
mproc describe <pid>                        Process.describe() - full target profile
mproc read <pid> <addr> [type]              typed read (default ptr)
mproc write <pid> <addr> <type> <value> [--dry]
mproc scan <pid> <value> [type] [--module m | --start a --end b] [--out f] [--limit n]
mproc scan-pattern <pid> '<aob>' [--module m [--section s] | --start a --end b] [--limit n]
mproc next <pid> <state-file> <mode> [args] refine a saved scan (see modes below)
mproc pointers <pid> '<name>:<base,off,off>'...   resolve named pointer chains
mproc watch <pid> <addr> [type] [ms]        stream value changes (Ctrl-C ends)
mproc freeze <pid> <addr> <type> <value> [ms]   keep re-writing (Ctrl-C ends)
mproc undo <pid> [n]                        revert last n journaled writes
mproc journal <pid>                         show the persisted write journal
mproc entities <pid> <addr> <stride|next:OFF> [max]
mproc attach <pid> [--json]                 session: commands on stdin, one per line
mproc help
```

- **addr** := `0x...` | decimal | `mod+rva` (e.g. `game.exe+0x1F2A3C`) | `mod` (bare module name -> its base)
- **type** := `i8 u8 i16 u16 i32 u32 i64 u64 f32 f64 ptr bytes:N str wstr`
- **scan types** := `i32 u32 i64 u64 f32 f64`
- **aob** := byte signature, hex bytes separated by spaces, `??` wildcards (e.g. `48 8B ?? 10`) -- hits are bare addresses, `next` doesn't refine them
- **next modes** := `exact V` | `changed` | `unchanged` | `increased` | `decreased` | `increasedBy V` | `decreasedBy V` | `between LO HI`
- **flags** := `--json --dry --out f --limit n --ms t --module m --section s --start a --end b`

## How state survives one-shot commands

A one-shot `mproc write` opens and closes the process - core's `writeLog`
dies with it. Two artifacts under `.mproc/` in the current directory make the
stateless commands composable:

- `.mproc/scan-<pid>.json` - `scan` writes every hit (`{addr,value}`); `next`
  reads it, `nextScan`s, and rewrites it in place. Chain refines like CE.
- `.mproc/journal-<pid>.json` - every real `write` journals its **prior**
  bytes; `undo [n]` restores them via `writeProtected`, newest-first.
  `journal` prints the log. `--dry` writes journal nothing.

## attach - the agentic session

`mproc attach <pid> --json` holds one `Process` open and reads the same
command grammar on stdin (no `mproc`, no pid - the session pid is implied).
One JSON result per line; `exit`/`quit`/EOF detaches.

```
{ "type":"attached", "pid":1234, "modules":37 }
<- describe          -> {"ok":true,"data":{...ProcessDescribe...}}
<- scan 100 i32      -> {"type":"hit",...}* + {"type":"done","count":N} (also saves state file)
<- read 0x7ff.. i32  -> {"ok":true,"data":{"addr":"0x..","value":42}}
<- write 0x7ff.. u32 99 -> {"ok":true,"data":{"addr":"0x..","written":true}}
<- undo              -> {"ok":true,"data":{"reverted":1}}
{ "type":"detached", "pid":1234 }
```

Inside a session, `watch`/`freeze` start **background** timers (they return
immediately with an id; stop with `unwatch <id>` / `unfreeze <id>`) - unlike
the standalone forms which block until Ctrl-C. `watch` emits
`{"type":"change",...}` lines as they happen.

The intended agent loop: spawn `mproc attach <pid> --json` once, then pipe
commands and branch on `ok`/`error.code`. All of the Process API's safety
primitives apply - `--dry` previews every write, `undo` reverts journaled
writes, errors carry typed `.code`s.

## Examples

```console
> mproc scan 1234 0xdeadbeef u32 --module game.exe --json
{"type":"hit","addr":"0x7ff6a1b23840","value":3735928559}
{"type":"done","count":1,"shown":1}
> mproc next 1234 .mproc/scan-1234.json changed --json
{"type":"done","count":0,"shown":0}
> mproc write 1234 0x7ff6a1b23840 u32 9999 --dry --json
{"ok":true,"data":{"dry":true,"addr":"0x7ff6a1b23840","current":"0xefbeadde","would":"0x0f270000","bytes":4}}
```
