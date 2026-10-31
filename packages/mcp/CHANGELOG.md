# Changelog

## [0.0.3-beta.6](https://github.com/memoryprocess/memoryprocess/compare/mcp@0.0.3-beta.5...mcp@0.0.3-beta.6) (2026-10-31)


### Features

* **mcp:** @memoryprocess/mcp — 17-tool MCP server, the primary agentic surface ([#4](https://github.com/memoryprocess/memoryprocess/issues/4)) ([2fbc623](https://github.com/memoryprocess/memoryprocess/commit/2fbc62389fe20c4a6ccfd61db3475daec3340199))
* **mcp:** mem_scan_pattern, mem_regions, fix narrow-int read/freeze ([#14](https://github.com/memoryprocess/memoryprocess/issues/14)) ([f1a67df](https://github.com/memoryprocess/memoryprocess/commit/f1a67dfc113cf17085dae3dfddc85fa11b3b46c9))
* monorepo scaffold — @memoryprocess/{bindings,core,cli,mcp} ([a8a9d77](https://github.com/memoryprocess/memoryprocess/commit/a8a9d77287c1a78365c6e0730fdc392c6854aab8))
* publish-prep — dev-shim→real import, dual-condition exports, dist builds ([#8](https://github.com/memoryprocess/memoryprocess/issues/8)) ([fe39054](https://github.com/memoryprocess/memoryprocess/commit/fe3905464ecc7f41eed5ed6ebc94e3db5b8e293f))
* **release:** publish inside release-please.yml (kills phantom runs + GITHUB_TOKEN wall) ([#25](https://github.com/memoryprocess/memoryprocess/issues/25)) ([03748db](https://github.com/memoryprocess/memoryprocess/commit/03748dbe7bc3d2137e35b0cf51c39e8f3d4df7ae))


### Bug Fixes

* purge mojibake - sanitize all .ts sources/tests to pure ASCII ([#23](https://github.com/memoryprocess/memoryprocess/issues/23)) ([6a30817](https://github.com/memoryprocess/memoryprocess/commit/6a308175572a5c096c4291588bd8972b1a57e1f1))
* **release:** bun publish so workspace:* deps rewrite ([#33](https://github.com/memoryprocess/memoryprocess/issues/33)) ([7448c94](https://github.com/memoryprocess/memoryprocess/commit/7448c94ce758cf7f9f318109e806a586754035c7))
* **release:** drop --provenance from bun publish ([#36](https://github.com/memoryprocess/memoryprocess/issues/36)) ([b71c920](https://github.com/memoryprocess/memoryprocess/commit/b71c920cfe48fce73f921a4208e6ac486ee23d75))
* **release:** PATH for prebuildify's node-gyp ([#43](https://github.com/memoryprocess/memoryprocess/issues/43)) ([02c734b](https://github.com/memoryprocess/memoryprocess/commit/02c734be25a02f6a26dff3b72b690c98b4bc1dd2))
* **release:** prebuild bindings as explicit CI step ([#40](https://github.com/memoryprocess/memoryprocess/issues/40)) ([66e08a1](https://github.com/memoryprocess/memoryprocess/commit/66e08a127bb57652cdf4b8c949c3f1a6465556cf))
* sanitize remaining non-ASCII (round 2) + harden release pipeline ([#30](https://github.com/memoryprocess/memoryprocess/issues/30)) ([db192a6](https://github.com/memoryprocess/memoryprocess/commit/db192a601ed0963d9f351c90525ca8cfc2fe459d))


### Reverts

* undo direct-push duplicate-if fix ([#26](https://github.com/memoryprocess/memoryprocess/issues/26)) ([5e6d708](https://github.com/memoryprocess/memoryprocess/commit/5e6d7083c8af2412385f8be399780f305eb59c77))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @memoryprocess/core bumped to 0.0.3-beta.6

## [0.0.3-beta.5](https://github.com/memoryprocess/memoryprocess/compare/mcp@0.0.3-beta.4...mcp@0.0.3-beta.5) (2026-10-31)

### Features

- **mcp:** @memoryprocess/mcp — 17-tool MCP server, the primary agentic surface ([#4](https://github.com/memoryprocess/memoryprocess/issues/4)) ([2fbc623](https://github.com/memoryprocess/memoryprocess/commit/2fbc62389fe20c4a6ccfd61db3475daec3340199))
- **mcp:** mem_scan_pattern, mem_regions, fix narrow-int read/freeze ([#14](https://github.com/memoryprocess/memoryprocess/issues/14)) ([f1a67df](https://github.com/memoryprocess/memoryprocess/commit/f1a67dfc113cf17085dae3dfddc85fa11b3b46c9))
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
    - @memoryprocess/core bumped to 0.0.3-beta.5

## [0.0.3-beta.4](https://github.com/memoryprocess/memoryprocess/compare/mcp@0.0.3-beta.3...mcp@0.0.3-beta.4) (2026-10-31)

### Features

- **mcp:** @memoryprocess/mcp — 17-tool MCP server, the primary agentic surface ([#4](https://github.com/memoryprocess/memoryprocess/issues/4)) ([2fbc623](https://github.com/memoryprocess/memoryprocess/commit/2fbc62389fe20c4a6ccfd61db3475daec3340199))
- **mcp:** mem_scan_pattern, mem_regions, fix narrow-int read/freeze ([#14](https://github.com/memoryprocess/memoryprocess/issues/14)) ([f1a67df](https://github.com/memoryprocess/memoryprocess/commit/f1a67dfc113cf17085dae3dfddc85fa11b3b46c9))
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
    - @memoryprocess/core bumped to 0.0.3-beta.4

## [0.0.3-beta.3](https://github.com/memoryprocess/memoryprocess/compare/mcp@0.0.3-beta.3...mcp@0.0.3-beta.3) (2026-10-31)

### Bug Fixes

- **release:** drop --provenance from bun publish ([#36](https://github.com/memoryprocess/memoryprocess/issues/36)) ([b71c920](https://github.com/memoryprocess/memoryprocess/commit/b71c920cfe48fce73f921a4208e6ac486ee23d75))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @memoryprocess/core bumped to 0.0.3-beta.3

## [0.0.3-beta.3](https://github.com/memoryprocess/memoryprocess/compare/mcp@0.0.3-beta.2...mcp@0.0.3-beta.3) (2026-10-31)

### Bug Fixes

- **release:** bun publish so workspace:* deps rewrite ([#33](https://github.com/memoryprocess/memoryprocess/issues/33)) ([7448c94](https://github.com/memoryprocess/memoryprocess/commit/7448c94ce758cf7f9f318109e806a586754035c7))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @memoryprocess/core bumped to 0.0.3-beta.3

## [0.0.3-beta.2](https://github.com/memoryprocess/memoryprocess/compare/mcp@0.0.3-beta.1...mcp@0.0.3-beta.2) (2026-10-31)

### Bug Fixes

- sanitize remaining non-ASCII (round 2) + harden release pipeline ([#30](https://github.com/memoryprocess/memoryprocess/issues/30)) ([db192a6](https://github.com/memoryprocess/memoryprocess/commit/db192a601ed0963d9f351c90525ca8cfc2fe459d))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @memoryprocess/core bumped to 0.0.3-beta.2

## [0.0.3-beta.1](https://github.com/memoryprocess/memoryprocess/compare/mcp@0.0.2-dev.2...mcp@0.0.3-beta.1) (2026-10-31)

### Features

- **release:** publish inside release-please.yml (kills phantom runs + GITHUB_TOKEN wall) ([#25](https://github.com/memoryprocess/memoryprocess/issues/25)) ([03748db](https://github.com/memoryprocess/memoryprocess/commit/03748dbe7bc3d2137e35b0cf51c39e8f3d4df7ae))

### Reverts

- undo direct-push duplicate-if fix ([#26](https://github.com/memoryprocess/memoryprocess/issues/26)) ([5e6d708](https://github.com/memoryprocess/memoryprocess/commit/5e6d7083c8af2412385f8be399780f305eb59c77))

### Dependencies

- The following workspace dependencies were updated
- dependencies
- @memoryprocess/core bumped to 0.0.3-beta.1

## [0.0.2-dev.2](https://github.com/memoryprocess/memoryprocess/compare/mcp@0.0.2-dev.1...mcp@0.0.2-dev.2) (2026-10-31)

### Bug Fixes

- purge mojibake - sanitize all .ts sources/tests to pure ASCII ([#23](https://github.com/memoryprocess/memoryprocess/issues/23)) ([6a30817](https://github.com/memoryprocess/memoryprocess/commit/6a308175572a5c096c4291588bd8972b1a57e1f1))

### Dependencies

- The following workspace dependencies were updated
- dependencies
- @memoryprocess/core bumped to 0.0.2-dev.2

## [0.0.2-dev.1](https://github.com/memoryprocess/memoryprocess/compare/mcp@0.0.2-dev...mcp@0.0.2-dev.1) (2026-10-30)

### Features

- **mcp:** @memoryprocess/mcp - 17-tool MCP server, the primary agentic surface ([#4](https://github.com/memoryprocess/memoryprocess/issues/4)) ([2fbc623](https://github.com/memoryprocess/memoryprocess/commit/2fbc62389fe20c4a6ccfd61db3475daec3340199))
- **mcp:** mem_scan_pattern, mem_regions, fix narrow-int read/freeze ([#14](https://github.com/memoryprocess/memoryprocess/issues/14)) ([f1a67df](https://github.com/memoryprocess/memoryprocess/commit/f1a67dfc113cf17085dae3dfddc85fa11b3b46c9))
- monorepo scaffold - @memoryprocess/{bindings,core,cli,mcp} ([a8a9d77](https://github.com/memoryprocess/memoryprocess/commit/a8a9d77287c1a78365c6e0730fdc392c6854aab8))
- publish-prep - dev-shim->real import, dual-condition exports, dist builds ([#8](https://github.com/memoryprocess/memoryprocess/issues/8)) ([fe39054](https://github.com/memoryprocess/memoryprocess/commit/fe3905464ecc7f41eed5ed6ebc94e3db5b8e293f))

### Dependencies

- The following workspace dependencies were updated
- dependencies
- @memoryprocess/core bumped to 0.0.2-dev.1

## [0.0.2-dev](https://github.com/memoryprocess/memoryprocess/compare/mcp-v0.0.1...mcp-v0.0.2-dev) (2026-10-30)

### Features

- **mcp:** @memoryprocess/mcp - 17-tool MCP server, the primary agentic surface ([#4](https://github.com/memoryprocess/memoryprocess/issues/4)) ([2fbc623](https://github.com/memoryprocess/memoryprocess/commit/2fbc62389fe20c4a6ccfd61db3475daec3340199))
- monorepo scaffold - @memoryprocess/{bindings,core,cli,mcp} ([a8a9d77](https://github.com/memoryprocess/memoryprocess/commit/a8a9d77287c1a78365c6e0730fdc392c6854aab8))
- publish-prep - dev-shim->real import, dual-condition exports, dist builds ([#8](https://github.com/memoryprocess/memoryprocess/issues/8)) ([fe39054](https://github.com/memoryprocess/memoryprocess/commit/fe3905464ecc7f41eed5ed6ebc94e3db5b8e293f))

### Dependencies

- The following workspace dependencies were updated
- dependencies
- @memoryprocess/core bumped to 0.0.2-dev
