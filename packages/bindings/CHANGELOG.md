# Changelog

## [0.0.3-beta.2](https://github.com/memoryprocess/memoryprocess/compare/bindings@0.0.3-beta.1...bindings@0.0.3-beta.2) (2026-10-31)

### Bug Fixes

- sanitize remaining non-ASCII (round 2) + harden release pipeline ([#30](https://github.com/memoryprocess/memoryprocess/issues/30)) ([db192a6](https://github.com/memoryprocess/memoryprocess/commit/db192a601ed0963d9f351c90525ca8cfc2fe459d))

## [0.0.3-beta.1](https://github.com/memoryprocess/memoryprocess/compare/bindings@0.0.2-dev.2...bindings@0.0.3-beta.1) (2026-10-31)

### Features

- **release:** publish inside release-please.yml (kills phantom runs + GITHUB_TOKEN wall) ([#25](https://github.com/memoryprocess/memoryprocess/issues/25)) ([03748db](https://github.com/memoryprocess/memoryprocess/commit/03748dbe7bc3d2137e35b0cf51c39e8f3d4df7ae))

### Reverts

- undo direct-push duplicate-if fix ([#26](https://github.com/memoryprocess/memoryprocess/issues/26)) ([5e6d708](https://github.com/memoryprocess/memoryprocess/commit/5e6d7083c8af2412385f8be399780f305eb59c77))

## [0.0.2-dev.2](https://github.com/memoryprocess/memoryprocess/compare/bindings@0.0.2-dev.1...bindings@0.0.2-dev.2) (2026-10-31)

### Bug Fixes

- purge mojibake - sanitize all .ts sources/tests to pure ASCII ([#23](https://github.com/memoryprocess/memoryprocess/issues/23)) ([6a30817](https://github.com/memoryprocess/memoryprocess/commit/6a308175572a5c096c4291588bd8972b1a57e1f1))

## [0.0.2-dev.1](https://github.com/memoryprocess/memoryprocess/compare/bindings@0.0.2-dev...bindings@0.0.2-dev.1) (2026-10-30)

### Features

- monorepo scaffold - @memoryprocess/{bindings,core,cli,mcp} ([a8a9d77](https://github.com/memoryprocess/memoryprocess/commit/a8a9d77287c1a78365c6e0730fdc392c6854aab8))
- publish-prep - dev-shim->real import, dual-condition exports, dist builds ([#8](https://github.com/memoryprocess/memoryprocess/issues/8)) ([fe39054](https://github.com/memoryprocess/memoryprocess/commit/fe3905464ecc7f41eed5ed6ebc94e3db5b8e293f))

## [0.0.2-dev](https://github.com/memoryprocess/memoryprocess/compare/bindings-v0.0.1...bindings-v0.0.2-dev) (2026-10-30)

### Features

- monorepo scaffold - @memoryprocess/{bindings,core,cli,mcp} ([a8a9d77](https://github.com/memoryprocess/memoryprocess/commit/a8a9d77287c1a78365c6e0730fdc392c6854aab8))
- publish-prep - dev-shim->real import, dual-condition exports, dist builds ([#8](https://github.com/memoryprocess/memoryprocess/issues/8)) ([fe39054](https://github.com/memoryprocess/memoryprocess/commit/fe3905464ecc7f41eed5ed6ebc94e3db5b8e293f))
