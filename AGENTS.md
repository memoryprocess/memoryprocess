# AGENTS.md -- how to work on this repo with an agent

This file distills the durable, repo-specific knowledge an agent (or contributor) needs to be productive here. For human-facing contribution rules see `CONTRIBUTING.md`; for release/CI see `docs/architecture.md`.

## What this repo is

`@memoryprocess/*` monorepo -- a Windows process-memory toolkit. Bun workspaces, `packages/*`, ESM-only, `bun` is the toolchain (install/test/check/fmt), `tsc` emits `.d.ts`, `tsdown` bundles, `node-gyp`+MSVC builds the native `.node`.

## Packages

- `packages/bindings` -- the `.node` N-API binary + `src/native.ts` (typed interface over 35 stateless fns). Everything takes a `handle`/`pid`/`tid` arg -- no shared native state.
- `packages/core` -- `Process` class + `structs.ts` (Address/Entity/EntityList/Offsets/readMany/findPointersTo). Depends on bindings via `workspace:*`.
- `packages/cli` -- `mproc` bin: the Process API as composable commands (`scan`/`scan-pattern`/`next`/`read`/`write`/`pointers`/`watch`/`freeze`/`undo`/`entities` + `attach` stdin session). `.mproc/` persists scan + journal state across one-shot invocations.
- `packages/mcp` -- MCP stdio server: 18 session-handle tools + `eval_js` escape hatch. `--no-eval`/`MEMP_NO_EVAL=1` = restricted mode (read/describe/scan/watch only; eval + write tools hidden).

## Hard-won gotchas (do NOT relearn these)

- **Node 26 thin-LTO**: official Node >=26 builds are clang+thin-LTO compiled -- `node-gyp` inherits `-flto=thin`/`/opt:lldltojobs` (LLVM flags) -> MSVC `LNK1117`. The fix lives in `binding.gyp` (`variables: enable_lto/enable_thin_lto/lto_jobs` + `msvs_settings` `AdditionalOptions!` stripping flto). **Keep that block when touching binding.gyp** -- removing it breaks Node 26.
- **Per-Node-version `.node`**: a `.node` built against Node 24 headers **access-violates** on Node 20/22. CI compat legs rebuild the `.node` per Node version -- never share a prebuilt `.node` across majors without rebuilding.
- **Windows dev**: vcvars = `C:\Program Files\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build\vcvars64.bat`. Native build: `node packages/bindings/scripts/build.mjs`. Test victims: `taskkill /F /IM victim.exe` + `gamevictim.exe` before `bun test` or they hold the PID.
- **`bun lint --type-aware` hangs** -- never use it. Types via `bun check`, format via `bun fmt`.
- **`bun fmt` needs Bun >=1.4.4** (`packageManager` pins it). `.gitattributes` `* text=auto eol=lf` -- Windows checkout keeps LF or fmt flags everything.
- **tsdown >=0.23.3 uses `Promise.withResolvers`** -- Node 22+ only for the _build_; the produced output runs on Node 20+. `engines: ">=22"`.
- **npm `workspace:*`**: bun resolves workspace deps to `packages/*` directly; `bindings`' `exports`/`main` point at `src/index.ts` in dev (bun eats TS), `dist/` only exists after build.
- **Release pipeline (release-please.yml) -- hard-won, do not regress**:
  - **Independent versioning (separate-pull-requests) + sequential publish**: each package versions independently; `node-workspace` propagates a patch bump to dependents when a shared dep changes, so a bump flows downstream (dep -> dependents), never upstream. Release PRs are per-package and CONFLICT on `.release-please-manifest.json` -- merge ONE, then close the rest and let release-please regenerate (re-push needed: close+reopen to fire CI, `bun fmt` the CHANGELOG). The `publish` job is ONE sequential job in dependency order `bindings -> core -> cli -> mcp`; a failure aborts the rest so a partial release never ships. It **skips a package whose version is already on npm** (registry check) so an unchanged package isn't republished. Do NOT re-add a parallel matrix.
  - **`npm publish` ships `workspace:*` verbatim** -> `npm install` fails `EUNSUPPORTEDPROTOCOL`. The `rewrite workspace deps` step replaces `workspace:*` with `^<release-version>` (read from the resolved tag) in each package.json BEFORE publish. `bun publish` rewrites it natively but has NO OIDC Trusted-Publisher support (`missing authentication`).
  - **`prebuildify` needs `npm run`, not `bun run`**: it shells out to `node-gyp.cmd`; only `npm run` puts the npm-bundled node-gyp bin on PATH. `bun run` (or a manual PATH prepend) fails `'node-gyp.cmd' is not recognized`.
  - **`bun publish` does not support `--provenance`** (errors before upload). npm publish is used; provenance attaches via OIDC automatically.
  - **`actions/setup-node` writes a literal `XXXXX-XXXXX` placeholder to `NODE_AUTH_TOKEN`** when no token is given (the OIDC path). It must be cleared/absent for the OIDC exchange; a stray real token also bypasses OIDC.
  - **Stale tag collision**: if a release's publish fails AFTER release-please created the git tags + GH releases, re-running hits `tag_name already_exists`. Clean the stale `pkg@x.y.z` tags + releases, bump `release-as` to a fresh prerelease, and let release-please regenerate.
  - **Skipped-publish recovery**: release-please can create a `pkg@ver` tag + GH release but then fail on an unrelated error (e.g. "already open PR"), so `releases_created` never fires and the publish is skipped -- the tag exists but was never published. Recovery: `gh workflow run release-please.yml` (workflow_dispatch publishes whatever tags exist; the skip-check prevents republishing). A `pkg@ver` tag push also triggers publish.
  - **npm E403 vs E409**: `E403 cannot publish over previously published` = version truly live; `E409 cannot publish over previously STAGED` = version accepted but still propagating (the registry per-version endpoint may 404 for ~15-45min). The skip-check (pre-publish registry lookup) can miss a still-staged version -- treat E409 as "already published", don't retry as a real failure.
  - **npm propagation is slow and uneven**: a publish `+` + provenance means accepted, but the version can take 15-45 min to appear in `dist-tags`/`versions` -- packages with native `.node` binaries and rewritten deps lag most. A missing dist-tag right after publish is propagation, not failure.

## Common tasks

- Run all tests: `bun run test` (root) or `cd packages/core && bun test`.
- Typecheck: `bun run check` (runs per-package `bun check`).
- Build native: `bun run build:bindings`.
- Format: `bun fmt` (Prettier-compatible, reads `.editorconfig`).

## Conventions

- Conventional commits (`feat:`/`fix:`/`refactor:`/`test:`/`chore:`/`docs:`) -- release-please parses them.
- All changes via PR + green `verify` CI. No direct pushes to `main`, no force-push.
- Tests + docs required for behavior changes. Fuzz/abuse tests go in `packages/core/tests/`.
- Windows-only by design (`os: ["win32"]`) -- process-memory APIs are Win32.

## Don't

- Don't commit binaries (`.node/.exe/.dll/.lib/.exp/.obj/.pdb`) -- gitignored, built by scripts.
- Don't rename back to `hacks`/`cheat-dev` vocabulary -- the layer is `structs.ts`, remote-struct/introspection.
- Don't add a separate `sdk` package -- the struct layer lives in `core` (empty convenience packages look amateur).
- Don't publish `latest` manually -- `publish.yml` derives the dist-tag from the version: prerelease -> `dev`/`next`/`beta`, stable -> `latest`. `latest` only fires via a maintainer `release-as` commit (docs/releasing.md).
- Don't put backticks `` ` `` or `$` inside double-quoted PowerShell args for `gh pr create --body` -- pwsh escapes/expand them into literal `\` junk in the body. **Always use `--body-file <file>`** (write the markdown to a temp file, pass the path). Same for commit messages -- use `-F file` or write the file first.
- **Workflow YAML files stay pure ASCII** -- no `->`/`--`/smart quotes in `.github/workflows/*`: a UTF-8 glyph landed as `U+001A` in the pushed blob once and GitHub Actions loaded the workflow with **zero jobs** (invalid YAML control char). After pushing a workflow change, sanity-check the remote blob (`gh api .../contents/...yml`) -- local file can look fine while remote is corrupt.
- **release-please release PRs**: created by GITHUB_TOKEN -> don't trigger CI (GitHub recursion guard). Close+reopen the PR to fire checks. Their generated CHANGELOG.md fails `bun fmt --check` -- run `bun fmt` + commit on the release branch before merging. Tag format is `<pkg>@x.y.z` (config: `tag-separator:"@"` + `include-v-in-tag:false`); publish.yml runs the workflow **at the tagged commit** -- a tag on a commit whose publish.yml is broken can never publish.
- **Devin CLI in CI (`dependabot-triage.yml`)**: `irm cli.devin.ai/install.ps1 | iex` ends with `devin setup` -- an interactive auth wizard that **hangs forever** on a runner. Install the binary directly instead: `static.devin.ai/cli/current/manifest.json` -> `platforms['x86_64-pc-windows'].url` -> download zip -> verify `sha256` -> extract -> add dir to `GITHUB_PATH`. Auth comes from `credentials.toml` written from the `DEVIN_API_KEY` secret, so `devin setup` is unnecessary. `devin -p` needs `--permission-mode dangerous` (auto-approve tools) + `--respect-workspace-trust false`; `swe-2-high` is the pinned free model.

## PR workflow

- Body: write markdown to a temp file (`$env:TEMP\opencode\prN.md` UTF-8 no-BOM), `gh pr create/edit --body-file`. Never inline `--body "..."` with backticks.
- Follow `.github/PULL_REQUEST_TEMPLATE.md` -- What / Why / Checklist / Release note. Fill the checklist boxes you actually did (`- [x]`), don't leave the boilerplate `- [ ]` empty.
- Merge: `gh pr merge <n> --squash --delete-branch`. main requires ALL of: `verify`, `packaged`, `compat (22|24|25|26)` + `strict` (up-to-date) + linear history + conversations resolved. No force-push, no deletion, no direct pushes.
