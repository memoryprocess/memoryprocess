# @memoryprocess/mcp

MCP server exposing the memoryprocess toolkit to LLM agents — the primary
agentic surface. Stdio transport; the agent's MCP client owns the server
process, so open process handles die with the session.

## Usage

Point your MCP client at the bin (works under bun or node):

```jsonc
// claude_desktop_config.json
{
  "mcpServers": {
    "memoryprocess": {
      "command": "bun",
      "args": ["C:/path/to/memoryprocess/packages/mcp/src/server.ts"],
    },
  },
}
```

```
memoryprocess-mcp [--no-eval] [--help] [--version]
MEMP_NO_EVAL=1   # same as --no-eval
```

## Session model

There is no implicit "current process". `proc_open` returns a session handle
(`p1`, `p2`, …); every `mem_*` tool takes it as `session`, so an agent can
hold several targets at once. `proc_close` releases the handle and any
watches/freezes bound to it.

## Tools

| Tool                  | Description                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| `proc_list`           | List running processes `{pid,name}[]`                                                                    |
| `proc_open`           | Open by `{pid}` or `{name}` → `{session, describe}`. `access:"ro"` = read-only                           |
| `proc_close`          | Close a session                                                                                          |
| `mem_describe`        | `Process.describe()`: arch, modules, writable/exec regions, threads                                      |
| `mem_read`            | Typed read: `i8…i64/u8…u64`, `f32/f64`, `ptr`, `str`, `wstr`, `bytes[:N]` (+`len`)                       |
| `mem_write`           | Typed write. `dryRun:true` → `{addr,current,would,bytes}` preview. Journaled                             |
| `mem_scan`            | CE value scan → `{hits:[{addr,value}],count,truncated}` (`module`/`start`/`end`/`limit`)                 |
| `mem_scan_next`       | Refine hits: `exact`/`changed`/`unchanged`/`increased`/`decreased`/`increasedBy`/`decreasedBy`/`between` |
| `mem_pointer_resolve` | `module`+`rva`+`offsets[]` → resolved address (CE pointer syntax)                                        |
| `mem_watch`           | Poll an i32 every `ms` → `{watchId}`; changes accumulate                                                 |
| `mem_watch_poll`      | Drain recorded changes `[{value,ts}]` for a `watchId`                                                    |
| `mem_unwatch`         | Stop a watch                                                                                             |
| `mem_freeze`          | Re-write a value every `ms` → `{freezeId}`                                                               |
| `mem_unfreeze`        | Stop a freeze                                                                                            |
| `mem_undo`            | Revert last `n` journaled writes (self-correction primitive)                                             |
| `mem_journal`         | Write-log snapshot `[{index,addr,bytes}]`                                                                |
| `eval_js`             | Run JS with `proc` (`Process`) in scope — the escape hatch                                               |

## Wire format (docs/json-conventions.md)

- Every result is `{ok:true,data}` or `{ok:false,error:{code,message,win32code?}}`
  — `error.code` is the typed code from `@memoryprocess/core`
  (`READ_FAILED`, `PROCESS_NOT_FOUND`, …) plus `UNKNOWN_SESSION`,
  `UNKNOWN_WATCH`, `UNKNOWN_FREEZE`, `MODULE_NOT_FOUND`, `INVALID_ARGS`,
  `EVAL_ERROR`.
- Addresses/pointers/64-bit values are `"0x…"` hex strings; values that fit
  in a JS number stay numbers; raw bytes are hex strings.
- Address args accept `"0x…"`, decimal strings, or `"module+rva"`.

## Safety

All writes are journaled → `mem_journal` + `mem_undo` let an agent preview
(`dryRun`), commit, inspect, and revert. `eval_js` runs arbitrary JS on the
host — it's on by default (agents already have code execution) and can be
disabled with `--no-eval` / `MEMP_NO_EVAL=1`, which omits it from
`tools/list` entirely.
