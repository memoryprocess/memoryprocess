# Changelog

## [0.0.3-beta.5](https://github.com/memoryprocess/memoryprocess/compare/core@0.0.3-beta.4...core@0.0.3-beta.5) (2026-10-31)

### Features

- **core:** agentic primitives — dryRun, write-log/undo, describe() ([#2](https://github.com/memoryprocess/memoryprocess/issues/2)) ([6924e71](https://github.com/memoryprocess/memoryprocess/commit/6924e713193f5f2f6abddd68c27f3dcc4f5cc301))
- monorepo scaffold — @memoryprocess/{bindings,core,cli,mcp} ([a8a9d77](https://github.com/memoryprocess/memoryprocess/commit/a8a9d77287c1a78365c6e0730fdc392c6854aab8))
- publish-prep — dev-shim→real import, dual-condition exports, dist builds ([#8](https://github.com/memoryprocess/memoryprocess/issues/8)) ([fe39054](https://github.com/memoryprocess/memoryprocess/commit/fe3905464ecc7f41eed5ed6ebc94e3db5b8e293f))
- **release:** publish inside release-please.yml (kills phantom runs + GITHUB_TOKEN wall) ([#25](https://github.com/memoryprocess/memoryprocess/issues/25)) ([03748db](https://github.com/memoryprocess/memoryprocess/commit/03748dbe7bc3d2137e35b0cf51c39e8f3d4df7ae))

### Bug Fixes

- purge mojibake - sanitize all .ts sources/tests to pure ASCII ([#23](https://github.com/memoryprocess/memoryprocess/issues/23)) ([6a30817](https://github.com/memoryprocess/memoryprocess/commit/6a308175572a5c096c4291588bd8972b1a57e1f1))
- **release:** bun publish so workspace:* deps rewrite ([#33](https://github.com/memoryprocess/memoryprocess/issues/33)) ([7448c94](https://github.com/memoryprocess/memoryprocess/commit/7448c94ce758cf7f9f318109e806a586754035c7))
- **release:** drop --provenance from bun publish ([#36](https://github.com/memoryprocess/memoryprocess/issues/36)) ([b71c920](https://github.com/memoryprocess/memoryprocess/commit/b71c920cfe48fce73f921a4208e6ac486ee23d75))
- **release:** prebuild bindings as explicit CI step ([#40](https://github.com/memoryprocess/memoryprocess/issues/40)) ([66e08a1](https://github.com/memoryprocess/memoryprocess/commit/66e08a127bb57652cdf4b8c949c3f1a6465556cf))
- sanitize remaining non-ASCII (round 2) + harden release pipeline ([#30](https://github.com/memoryprocess/memoryprocess/issues/30)) ([db192a6](https://github.com/memoryprocess/memoryprocess/commit/db192a601ed0963d9f351c90525ca8cfc2fe459d))

### Reverts

- undo direct-push duplicate-if fix ([#26](https://github.com/memoryprocess/memoryprocess/issues/26)) ([5e6d708](https://github.com/memoryprocess/memoryprocess/commit/5e6d7083c8af2412385f8be399780f305eb59c77))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @memoryprocess/bindings bumped to 0.0.3-beta.5

## [0.0.3-beta.4](https://github.com/memoryprocess/memoryprocess/compare/core@0.0.3-beta.3...core@0.0.3-beta.4) (2026-10-31)

### Features

- **core:** agentic primitives — dryRun, write-log/undo, describe() ([#2](https://github.com/memoryprocess/memoryprocess/issues/2)) ([6924e71](https://github.com/memoryprocess/memoryprocess/commit/6924e713193f5f2f6abddd68c27f3dcc4f5cc301))
- monorepo scaffold — @memoryprocess/{bindings,core,cli,mcp} ([a8a9d77](https://github.com/memoryprocess/memoryprocess/commit/a8a9d77287c1a78365c6e0730fdc392c6854aab8))
- publish-prep — dev-shim→real import, dual-condition exports, dist builds ([#8](https://github.com/memoryprocess/memoryprocess/issues/8)) ([fe39054](https://github.com/memoryprocess/memoryprocess/commit/fe3905464ecc7f41eed5ed6ebc94e3db5b8e293f))
- **release:** publish inside release-please.yml (kills phantom runs + GITHUB_TOKEN wall) ([#25](https://github.com/memoryprocess/memoryprocess/issues/25)) ([03748db](https://github.com/memoryprocess/memoryprocess/commit/03748dbe7bc3d2137e35b0cf51c39e8f3d4df7ae))

### Bug Fixes

- purge mojibake - sanitize all .ts sources/tests to pure ASCII ([#23](https://github.com/memoryprocess/memoryprocess/issues/23)) ([6a30817](https://github.com/memoryprocess/memoryprocess/commit/6a308175572a5c096c4291588bd8972b1a57e1f1))
- **release:** bun publish so workspace:* deps rewrite ([#33](https://github.com/memoryprocess/memoryprocess/issues/33)) ([7448c94](https://github.com/memoryprocess/memoryprocess/commit/7448c94ce758cf7f9f318109e806a586754035c7))
- **release:** drop --provenance from bun publish ([#36](https://github.com/memoryprocess/memoryprocess/issues/36)) ([b71c920](https://github.com/memoryprocess/memoryprocess/commit/b71c920cfe48fce73f921a4208e6ac486ee23d75))
- sanitize remaining non-ASCII (round 2) + harden release pipeline ([#30](https://github.com/memoryprocess/memoryprocess/issues/30)) ([db192a6](https://github.com/memoryprocess/memoryprocess/commit/db192a601ed0963d9f351c90525ca8cfc2fe459d))

### Reverts

- undo direct-push duplicate-if fix ([#26](https://github.com/memoryprocess/memoryprocess/issues/26)) ([5e6d708](https://github.com/memoryprocess/memoryprocess/commit/5e6d7083c8af2412385f8be399780f305eb59c77))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @memoryprocess/bindings bumped to 0.0.3-beta.4

## [0.0.3-beta.3](https://github.com/memoryprocess/memoryprocess/compare/core@0.0.3-beta.3...core@0.0.3-beta.3) (2026-10-31)

### Bug Fixes

- **release:** drop --provenance from bun publish ([#36](https://github.com/memoryprocess/memoryprocess/issues/36)) ([b71c920](https://github.com/memoryprocess/memoryprocess/commit/b71c920cfe48fce73f921a4208e6ac486ee23d75))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @memoryprocess/bindings bumped to 0.0.3-beta.3

## [0.0.3-beta.3](https://github.com/memoryprocess/memoryprocess/compare/core@0.0.3-beta.2...core@0.0.3-beta.3) (2026-10-31)

### Bug Fixes

- **release:** bun publish so workspace:* deps rewrite ([#33](https://github.com/memoryprocess/memoryprocess/issues/33)) ([7448c94](https://github.com/memoryprocess/memoryprocess/commit/7448c94ce758cf7f9f318109e806a586754035c7))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @memoryprocess/bindings bumped to 0.0.3-beta.3

## [0.0.3-beta.2](https://github.com/memoryprocess/memoryprocess/compare/core@0.0.3-beta.1...core@0.0.3-beta.2) (2026-10-31)

### Bug Fixes

- sanitize remaining non-ASCII (round 2) + harden release pipeline ([#30](https://github.com/memoryprocess/memoryprocess/issues/30)) ([db192a6](https://github.com/memoryprocess/memoryprocess/commit/db192a601ed0963d9f351c90525ca8cfc2fe459d))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @memoryprocess/bindings bumped to 0.0.3-beta.2

## [0.0.3-beta.1](https://github.com/memoryprocess/memoryprocess/compare/core@0.0.2-dev.2...core@0.0.3-beta.1) (2026-10-31)

### Features

- **release:** publish inside release-please.yml (kills phantom runs + GITHUB_TOKEN wall) ([#25](https://github.com/memoryprocess/memoryprocess/issues/25)) ([03748db](https://github.com/memoryprocess/memoryprocess/commit/03748dbe7bc3d2137e35b0cf51c39e8f3d4df7ae))

### Reverts

- undo direct-push duplicate-if fix ([#26](https://github.com/memoryprocess/memoryprocess/issues/26)) ([5e6d708](https://github.com/memoryprocess/memoryprocess/commit/5e6d7083c8af2412385f8be399780f305eb59c77))

### Dependencies

- The following workspace dependencies were updated
- dependencies
- @memoryprocess/bindings bumped to 0.0.3-beta.1

## [0.0.2-dev.2](https://github.com/memoryprocess/memoryprocess/compare/core@0.0.2-dev.1...core@0.0.2-dev.2) (2026-10-31)

### Bug Fixes

- purge mojibake - sanitize all .ts sources/tests to pure ASCII ([#23](https://github.com/memoryprocess/memoryprocess/issues/23)) ([6a30817](https://github.com/memoryprocess/memoryprocess/commit/6a308175572a5c096c4291588bd8972b1a57e1f1))

### Dependencies

- The following workspace dependencies were updated
- dependencies
- @memoryprocess/bindings bumped to 0.0.2-dev.2

## [0.0.2-dev.1](https://github.com/memoryprocess/memoryprocess/compare/core@0.0.2-dev...core@0.0.2-dev.1) (2026-10-30)

### Features

- **core:** agentic primitives - dryRun, write-log/undo, describe() ([#2](https://github.com/memoryprocess/memoryprocess/issues/2)) ([6924e71](https://github.com/memoryprocess/memoryprocess/commit/6924e713193f5f2f6abddd68c27f3dcc4f5cc301))
- monorepo scaffold - @memoryprocess/{bindings,core,cli,mcp} ([a8a9d77](https://github.com/memoryprocess/memoryprocess/commit/a8a9d77287c1a78365c6e0730fdc392c6854aab8))
- publish-prep - dev-shim->real import, dual-condition exports, dist builds ([#8](https://github.com/memoryprocess/memoryprocess/issues/8)) ([fe39054](https://github.com/memoryprocess/memoryprocess/commit/fe3905464ecc7f41eed5ed6ebc94e3db5b8e293f))

### Dependencies

- The following workspace dependencies were updated
- dependencies
- @memoryprocess/bindings bumped to 0.0.2-dev.1

## [0.0.2-dev](https://github.com/memoryprocess/memoryprocess/compare/core-v0.0.1...core-v0.0.2-dev) (2026-10-30)

### Features

- **core:** agentic primitives - dryRun, write-log/undo, describe() ([#2](https://github.com/memoryprocess/memoryprocess/issues/2)) ([6924e71](https://github.com/memoryprocess/memoryprocess/commit/6924e713193f5f2f6abddd68c27f3dcc4f5cc301))
- monorepo scaffold - @memoryprocess/{bindings,core,cli,mcp} ([a8a9d77](https://github.com/memoryprocess/memoryprocess/commit/a8a9d77287c1a78365c6e0730fdc392c6854aab8))
- publish-prep - dev-shim->real import, dual-condition exports, dist builds ([#8](https://github.com/memoryprocess/memoryprocess/issues/8)) ([fe39054](https://github.com/memoryprocess/memoryprocess/commit/fe3905464ecc7f41eed5ed6ebc94e3db5b8e293f))

### Dependencies

- The following workspace dependencies were updated
- dependencies
- @memoryprocess/bindings bumped to 0.0.2-dev
