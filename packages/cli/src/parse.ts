/**
 * CLI arg parsing + typed value/address grammar.
 *
 * Address forms accepted everywhere an <addr> appears:
 *   0x7ff6a1b20000   hex
 *   140700000        decimal
 *   game.exe+0x1F2A3C  module+rva (resolved via the process module table)
 *
 * Type names: i8|u8|i16|u16|i32|u32|i64|u64|f32|f64|ptr|bytes:N|str|wstr
 *
 * The narrow ints (i8|u8|i16|u16) are CLI-level pseudo-types: core has no
 * readInt8/writeInt8 — commands.ts reads/writes them via readBuffer +
 * Buffer LE (de)coding, the same way it already handles u8/u16.
 */
import type { Process, ScanValueType, WriteValueType } from './core.js';

export class UsageError extends Error {
  readonly code = 'INVALID_ARGS';
  constructor(msg: string) {
    super(msg);
    this.name = 'UsageError';
  }
}

/** Integer literal → number when safe, bigint when it needs >2^53. */
export function parseIntArg(s: string, name = 'value'): number | bigint {
  const t = s.trim();
  if (!/^[+-]?(0x[0-9a-fA-F]+|\d+)$/.test(t))
    throw new UsageError(`${name}: expected integer, got '${s}'`);
  if (t.startsWith('-')) return BigInt(t); // negatives only meaningful for i64
  const b = BigInt(t);
  return b <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(b) : b;
}

/** Numeric value for a type — floats parse as double, ints as above. */
export function parseValue(s: string, type: string): number | bigint {
  if (
    type === 'f32' ||
    type === 'f64' ||
    type === 'float' ||
    type === 'double'
  ) {
    const n = Number(s);
    if (!Number.isFinite(n))
      throw new UsageError(`value: expected a number, got '${s}'`);
    return n;
  }
  return parseIntArg(s, 'value');
}

/**
 * Resolve an address argument against an open process. 'mod+rva' (and bare
 * 'mod') defer to Process.addr() so the module-table rules stay in core.
 */
export function parseAddr(proc: Process, s: string): bigint {
  const t = s.trim();
  if (/^[+-]?(0x[0-9a-fA-F]+|\d+)$/.test(t)) return BigInt(t);
  if (!/^[A-Za-z0-9_.\-]+(\+0x[0-9a-fA-F]+|\+\d+)?$/.test(t))
    throw new UsageError(`address: expected 0x…|decimal|mod+rva, got '${s}'`);
  const a = proc.addr(t).resolve();
  return a;
}

/**
 * Narrow int pseudo-types — not core WriteValueTypes; commands.ts
 * reads/writes them through readBuffer + Buffer LE (de)coding.
 */
export type NarrowType = 'i8' | 'u8' | 'i16' | 'u16';

/** Byte width of a parsed scalar — used for pre-write journal snapshots. */
export const TYPE_WIDTHS: Record<WriteValueType | NarrowType, number> = {
  i8: 1,
  u8: 1,
  i16: 2,
  u16: 2,
  int32: 4,
  uint32: 4,
  float: 4,
  int64: 8,
  uint64: 8,
  double: 8,
  pointer: 8,
};

/** CLI type name → core WriteValueType or a narrow pseudo-type. */
export const TYPE_MAP: Record<string, WriteValueType | NarrowType> = {
  i8: 'i8',
  u8: 'u8',
  i16: 'i16',
  u16: 'u16',
  i32: 'int32',
  u32: 'uint32',
  i64: 'int64',
  u64: 'uint64',
  f32: 'float',
  f64: 'double',
  ptr: 'pointer',
};

export interface ParsedType {
  kind: 'scalar' | 'bytes' | 'str' | 'wstr';
  /** core type name, or a narrow pseudo-type (i8|u8|i16|u16) */
  core?: WriteValueType | NarrowType | undefined;
  /** bytes:N length */
  n?: number;
}

export function parseType(s: string | undefined): ParsedType {
  const t = (s ?? 'ptr').trim().toLowerCase();
  const m = /^bytes:(\d+)$/.exec(t);
  if (m) {
    const n = Number(m[1]);
    if (!Number.isInteger(n) || n < 1 || n > 1 << 20)
      throw new UsageError(`bytes:N — N must be 1..1048576, got ${m[1]}`);
    return { kind: 'bytes', n };
  }
  if (t === 'str') return { kind: 'str' };
  if (t === 'wstr') return { kind: 'wstr' };
  const core = TYPE_MAP[t];
  if (!core)
    throw new UsageError(
      `unknown type '${s}' — use i8|u8|i16|u16|i32|u32|i64|u64|f32|f64|ptr|bytes:N|str|wstr`,
    );
  return { kind: 'scalar', core };
}

/**
 * Scalar types readValueAt accepts — everything TYPE_MAP knows minus the
 * narrow pseudo-types (i8|u8|i16|u16) which readValueAt would reject.
 */
export const READVALUE_TYPES = new Set<string>([
  'int32',
  'uint32',
  'int64',
  'uint64',
  'float',
  'double',
  'pointer',
]);

/** Scalar types scanValue/nextScan accept ('pointer' is write-only). */
const VALID_SCAN_TYPES: readonly ScanValueType[] = [
  'int32',
  'uint32',
  'int64',
  'uint64',
  'float',
  'double',
];

/** Scan-capable type → core ScanValueType (narrows + ptr are not scannable). */
export function parseScanType(s: string | undefined): ScanValueType {
  const p = parseType(s ?? 'i32');
  if (
    p.kind !== 'scalar' ||
    p.core === undefined ||
    !VALID_SCAN_TYPES.includes(p.core as ScanValueType)
  )
    throw new UsageError(
      `scan type must be i32|u32|i64|u64|f32|f64, got '${s}'`,
    );
  return p.core as ScanValueType;
}

/**
 * Parse `name:base,off,off,...` pointer-chain specs (the `pointers` command
 * grammar). base is anything parseAddr accepts; offsets are integers.
 */
export function parsePointerDef(arg: string): {
  name: string;
  base: string;
  chain: number[];
} {
  const ci = arg.indexOf(':');
  if (ci < 1)
    throw new UsageError(
      `pointer def '${arg}' — expected 'name:base,off,off…'`,
    );
  const name = arg.slice(0, ci).trim();
  if (!name) throw new UsageError(`pointer def '${arg}' — empty name`);
  const parts = arg
    .slice(ci + 1)
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length === 0)
    throw new UsageError(`pointer def '${arg}' — no base/offsets`);
  const base = parts[0]!;
  const chain = parts.slice(1).map((p) => {
    const v = parseIntArg(p, `offset in '${arg}'`);
    const n = Number(v);
    if (!Number.isInteger(n))
      throw new UsageError(`offset '${p}' in '${arg}' — must be an integer`);
    return n;
  });
  return { name, base, chain };
}

/** Global flags shared by every command. */
export interface Flags {
  json: boolean;
  dry: boolean;
  out?: string;
  limit?: number;
  ms?: number;
  all?: boolean;
  module?: string;
  start?: string;
  end?: string;
  /** remaining unknown flags → error */
  rest: string[];
}

export function parseFlags(argv: string[]): { flags: Flags; pos: string[] } {
  const flags: Flags = { json: false, dry: false, rest: [] };
  const pos: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const take = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new UsageError(`flag ${a} needs a value`);
      return v;
    };
    if (a === '--json') flags.json = true;
    else if (a === '--dry' || a === '--dry-run') flags.dry = true;
    else if (a === '--all') flags.all = true;
    else if (a === '--out' || a === '-o') flags.out = take();
    else if (a === '--limit' || a === '-n') {
      const v = Number(take());
      if (!Number.isInteger(v) || v < 1)
        throw new UsageError('--limit must be an integer >= 1');
      flags.limit = v;
    } else if (a === '--ms') {
      const v = Number(take());
      if (!Number.isInteger(v) || v < 1)
        throw new UsageError('--ms must be an integer >= 1');
      flags.ms = v;
    } else if (a === '--module' || a === '-m') flags.module = take();
    else if (a === '--start') flags.start = take();
    else if (a === '--end') flags.end = take();
    else if (a.startsWith('--')) flags.rest.push(a);
    else pos.push(a);
  }
  return { flags, pos };
}
