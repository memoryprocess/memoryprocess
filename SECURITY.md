# Security Policy

## Reporting a vulnerability

If you find a security vulnerability, **do not open a public issue**. Report it privately to the maintainer (via GitHub Security Advisories on this repo, or the maintainer's listed contact). Please include:

- A description of the vulnerability and its impact.
- Repro steps or a proof-of-concept.
- Affected versions/packages.

We'll acknowledge within a few days and coordinate a fix + disclosure.

## Scope

This toolkit **reads, writes, hooks, injects into, and debugs other Windows processes** — it's a reverse-engineering / instrumentation library. Its intended use is on processes you own or are authorized to analyze.

In-scope for a security report:

- A bug in the native binding that crashes or corrupts the **host** process (the one running the library), leaks handles, or escapes the documented access model.
- Malformed input to a public API that causes an out-of-bounds read/write in _our_ address space, or unexpected privilege escalation.
- The `eval_js` / injection paths in `@memoryprocess/mcp` allowing unintended code execution.
- Unsafe handling of paths/args in `@memoryprocess/cli`.

Out of scope:

- Crashes of the **target** process you attach to — touching a remote process can destabilize it by nature (e.g. `callRemote` on a bad address). That's the documented behavior, not a vuln.
- Whether the library itself is flagged by antivirus.

## A note on antivirus false-positives

This library performs process-memory operations, remote-thread creation, DLL injection, and hardware-breakpoint manipulation — the same primitives antivirus heuristics flag. **A detection on `memoryprocess.node` or a binary built with it is most likely a false-positive**, not an indicator of compromise. It's an expected consequence of the domain; report it to your AV vendor as a false positive. We will note this in release artifacts but cannot control per-vendor heuristics.
