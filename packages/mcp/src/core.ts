/**
 * Dev-mode import shim.
 *
 * @memoryprocess/core's published exports point at dist/index.js (built by
 * tsdown). In the workspace we want the MCP server to run the same TS the
 * tests do -- so we import core's source directly. For the published package
 * this file is replaced by `import '@memoryprocess/core'`.
 */
export { Process, encodeValue, MemoryProcessError } from '@memoryprocess/core';
export type {
  NextScanMode,
  ProcessDescribe,
  ScanHit,
  ScanValueType,
  WritePreview,
  WriteValueType,
} from '@memoryprocess/core';
