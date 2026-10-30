/**
 * Dev-mode import shim.
 *
 * @memoryprocess/core's published exports point at dist/index.js (built by
 * tsdown). In the workspace we want the CLI to run the same TS the tests do â€”
 * so we import core's source directly. For the published package this file is
 * replaced by `import '@memoryprocess/core'`.
 */
export {
  Process,
  RegionView,
  encodeValue,
  Protection,
  AllocationType,
  ProcessAccess,
  Address,
  Entity,
  EntityList,
  Offsets,
  MemoryProcessError,
  ProcessNotFoundError,
  ProcessClosedError,
  AccessDeniedError,
  ReadError,
  WriteError,
  ScanError,
  InjectError,
  InvalidSchemaError,
} from '@memoryprocess/core';
export type {
  ProcessInfo,
  ModuleInfo,
  Region,
  ScanOptions,
  ScanHit,
  NextScanMode,
  ScanValueOptions,
  ScanValueType,
  WriteValueType,
  WriteOptions,
  WritePreview,
  WriteLogEntry,
  ProcessDescribe,
  ThreadContext,
  EntitySchema,
  FieldType,
  SigEntry,
  OffsetsJson,
  EntityListOptions,
} from '@memoryprocess/core';
