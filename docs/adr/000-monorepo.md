# ADR 000: Monorepo layout -- `@memoryprocess/*` packages in one workspace

Status: accepted (2026-10-30)

## Context

The toolkit ships four npm packages -- `@memoryprocess/bindings` (raw `.node`
N-API layer), `@memoryprocess/core` (the `Process` engine + struct layer),
`@memoryprocess/cli` (`mproc` bin), and `@memoryprocess/mcp` (MCP server).
They could live in separate repos or in one monorepo.

## Decision

One monorepo (`memoryprocess/memoryprocess`), Bun workspaces, `packages/*`,
manifest-mode release-please, all packages versioned and published in
**lockstep** (one version across all four, published sequentially in
dependency order `bindings -> core -> cli -> mcp`).

## Rationale

- **Atomic ABI/API changes.** A native-signature change in `bindings` needs a
  matching `core` bump and a CLI/MCP rebuild. Separate repos force
  coordinated cross-repo PRs and risk a half-published state (core live
  without its bindings). One repo + one sequential publish job makes a
  partial release structurally impossible.
- _*workspace:* in dev._* Bun resolves `workspace:*` to `packages/*` directly,
  so the dev loop needs no published artifacts; the publish step rewrites it
  to `^<version>` before `npm publish`.
- **One CI gate.** verify + packaged + compat(22/24/25/26) covers the whole
  surface; contributors don't wait on four pipelines.
- **Precedent.** `@serialport/bindings-cpp`, `playwright-core` +
  `@playwright/test`, `puppeteer-core` -- engine/tooling splits ship from a
  single workspace.

## Consequences

- Lockstep versioning means a docs-only change still bumps all four packages
  on the next feature release. Accepted: lockstep guarantees every published
  set is internally consistent.
- No per-package release PRs (`separate-pull-requests: false`); tags are
  still per-package (`bindings@x.y.z`) so a package's history is queryable.
- Rejected alternatives: separate repos per package (partial-release risk),
  a fifth `sdk` convenience package (folded into `core` via `structs.ts` --
  empty wrapper packages look amateur).
