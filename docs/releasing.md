# Releasing -- channels, dist-tags, and hotfixes

## How the pipeline actually works (verified end-to-end 2026-10-31)

`release-please.yml` does TWO jobs in one workflow (a `push` to `main` cannot
fire a second workflow -- GITHUB_TOKEN-created tags/releases never trigger
other workflows, the GitHub recursion guard):

1. `release-please` (ubuntu): runs `release-please-action` on every push to
   `main`, opens/updates a release PR, and on merge creates the
   `pkg@x.y.z` git tags + GitHub releases.
2. `publish` (windows): runs only when `releases_created == 'true'`. ONE
   sequential job -- `bun install` -> `build all packages` -> `prebuild
bindings (N-API ABIs)` -> `resolve release tag per package` -> `pick
dist-tag from version` -> `rewrite workspace deps` -> `npm publish`
   for `bindings core cli mcp` in that order. Any failure aborts the rest,
   so a partial release (a package live without its dependency) can never
   ship.

**Credentials:** npm OIDC Trusted Publishing (`id-token: write`, no secrets).
Trusted Publisher on npmjs.com points each package at `release-please.yml`.
`NPM_TOKEN` repo secret exists only as a manual fallback.

## Channels

npm **dist-tags** separate what's installable by default from opt-in channels:

| Tag      | Installs on `npm i <pkg>` | Purpose                                          |
| -------- | ------------------------- | ------------------------------------------------ |
| `latest` | [x] the only default      | **Stable.** Currently `0.0.1`.                   |
| `dev`    | [ ] (needs `@dev`)        | `*.*.*-dev.N` auto channel. Currently `0.0.1`.   |
| `beta`   | [ ] (needs `@beta`)       | Stabilization preview. Currently `0.0.3-beta.9`. |
| `next`   | [ ] (needs `@next`)       | Optional preview channel before `latest`.        |

With `versioning: "prerelease"` + `prerelease-type` in
`release-please-config.json`, release-please proposes prerelease versions;
the publish step derives the dist-tag from the version suffix
(`-dev`/`-next`/`-beta`/`-alpha` -> that channel; no prerelease -> `latest`).

## Promoting to `latest` (a real stable release)

`latest` publishes are automatable, but the _decision_ to mark something
stable stays manual -- a bad merge should never auto-promote:

1. Pin the version: add `"release-as": "X.Y.Z"` (a stable semver, no
   prerelease suffix) to the packages in `release-please-config.json`.
2. PR + merge that change.
3. release-please opens a release PR proposing `X.Y.Z` -> merge -> it tags
   `pkg@X.Y.Z` + creates the GH release.
4. The publish job resolves the tag, sees a **non-prerelease** version ->
   `npm publish --tag latest` via OIDC.
5. Remove `release-as` after (next merge re-versions normally).

So `latest` is gated on a deliberate maintainer `release-as` commit --
automated once you pull the trigger, never auto-promoted by a merge.

## Publish-mechanics rules (do not regress)

These burned us; each is now enforced in `release-please.yml` + `AGENTS.md`:

- **`workspace:*` must be rewritten before `npm publish`.** `npm publish`
  uploads `workspace:*` verbatim -> `npm install` fails
  `EUNSUPPORTEDPROTOCOL`. The `rewrite workspace deps` step replaces it
  with `^<version>` from the resolved tag.
- **Publish is sequential + dependency-ordered** (`bindings -> core -> cli
-> mcp`), never a parallel matrix -- a mid-chain failure leaves a broken
  partial release on npm.
- **`prebuildify` runs via `npm run`**, not `bun run` (needs the npm-bundled
  `node-gyp` on PATH).
- **`bun publish` is not used**: it cannot do OIDC Trusted Publishing
  (`missing authentication`) and rejects `--provenance`.
- **Stale tags**: if publish fails after release-please made the tags, clean
  the `pkg@x.y.z` tags + releases and bump `release-as` before re-running.

## Hotfix flow (critical bug on a released stable)

Once a `latest` version exists, a critical fix shouldn't ride `main`'s
prerelease line (which may carry unrelated half-work):

```
main  --*----*----*--  (prerelease channel, keeps moving)
         \
          -- tag core@1.2.0  (the released stable)
                  \
hotfix/1.2.1  ----* fix -> release-as:1.2.1 -> publish to latest
```

1. Branch off the release tag: `git checkout -b hotfix/core-1.2.1 core@1.2.0`.
2. Commit the fix (conventional `fix:`), PR into the hotfix branch.
3. Run release-please in branch mode against the hotfix branch with
   `release-as` pinning the patch -> release PR on that branch -> merge ->
   tag -> publish fires (`--tag latest` because the version is stable).
4. Cherry-pick the fix back to `main` so it lands in the next prerelease.

## Why not git-flow (develop/release branches)?

The trunk stays `main`-only: every change is a PR + full CI + squash. The
prerelease channel IS the integration line -- installable but clearly not
stable. A `develop` branch would just be a second trunk to keep in sync;
dist-tag channels give the same safety without branch overhead. Hotfixes
branch off a tag, not off a long-lived branch.
