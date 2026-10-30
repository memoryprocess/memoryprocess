# Releasing — channels, dist-tags, and hotfixes

## Channels

npm **dist-tags** separate what's installable by default from opt-in channels:

| Tag      | Installs on `npm i <pkg>` | Purpose                                                                                                            |
| -------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `latest` | ✅ the only default       | **Stable.** Empty until the maintainer authorizes a real release — `npm i` errors "no matching version" till then. |
| `dev`    | ❌ (needs `@dev`)         | Auto-published `*.*.*-dev.N` per merge to `main`. Iterate freely.                                                  |
| `next`   | ❌ (needs `@next`)        | Optional stabilization preview before promoting to `latest`.                                                       |

release-please (manifest mode) versions each package independently. With `versioning: "prerelease"` + `prerelease-type: "dev"` in `release-please-config.json`, merges to `main` produce `0.0.x-dev.N` versions and `publish.yml` pushes them to `npm --tag dev`.

**The `latest` gate:** nothing here ever `npm dist-tag ... latest` or publishes a non-prerelease version automatically. Promoting `dev`→`latest` is a manual `npm dist-tag add @memoryprocess/<pkg>@X.Y.Z latest` the maintainer triggers.

## Promoting dev → latest (a real stable release)

`latest` publishes are automatable, but the _decision_ to mark something stable stays manual — a bad merge should never auto-promote to `latest`. The flow, when you decide `main` is release-ready:

1. Pin the version in `release-please-config.json` — add `"release-as": "X.Y.Z"` to the package(s) you're stabilizing (e.g. `"release-as": "1.0.0"`).
2. Open a normal PR with that change → merge.
3. release-please opens a release PR proposing `X.Y.Z` (a **stable** version, not `-dev`) → merge → it tags `pkg@X.Y.Z`.
4. `publish.yml` fires on that tag. **To publish to `latest` (not `dev`), the workflow picks the tag from the version**: a non-prerelease version → `--tag latest`; a `-dev`/`-next` version → `--tag dev`/`next`. The maintainer-authored `release-as` is the trigger — nothing reaches `latest` without it.
5. Remove `release-as` after (next merge re-versions normally to `-dev.N`).

So `latest` is gated on a deliberate `release-as` commit — automated once you pull the trigger, never auto-promoted by a merge. `dev`/`next`/`beta` stay auto channels.

## Hotfix flow (critical bug on a released stable)

Once a `latest` version exists, a critical fix shouldn't go through `main`'s dev line (which may have unrelated half-work). The model:

```
main  ──●────●────●───  (dev channel, keeps moving)
         \
          └─ tag core@1.2.0  (the released stable)
                  \
hotfix/1.2.1  ────● fix → release-as:1.2.1 → publish to latest
```

1. Branch off the release tag: `git checkout -b hotfix/core-1.2.1 core@1.2.0` (or the relevant `bindings@x.y.z` tag).
2. Commit the fix (conventional `fix:`), PR it into the hotfix branch.
3. Run release-please in **branch mode** against the hotfix branch with `release-as` pinning the patch (`release-please --target-branch hotfix/core-1.2.1 --release-as 1.2.1`) → it opens a release PR on that branch → merge → tag → `publish.yml` fires.
4. **Publish to `latest`**, not `dev` — a stable hotfix is exactly what `latest` is for. (publish.yml would need a `latest` path enabled for hotfix tags; that's a deliberately manual step today.)
5. Cherry-pick the fix back to `main` (`git cherry-pick <sha>` → conventional `fix:`) so it lands in the next `-dev.N` and doesn't regress.

Until the first `latest` release exists there's nothing to hotfix — this flow is the documented plan, not yet wired, because wiring a `latest` publish path now would weaken the "never publish latest" gate.

## Why not git-flow (develop/release branches)?

The trunk stays `main`-only: every change is a PR + full CI + squash. `dev` IS the integration line — prerelease versions make it installable-but-clearly-not-stable. A `develop` branch would just be a second trunk to keep in sync; dist-tag channels give the same safety without branch overhead. Hotfixes branch off a tag, not off a long-lived branch.
