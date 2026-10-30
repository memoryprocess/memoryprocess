/**
 * CLI arg parsing + typed value/address grammar.
 *
 * Address forms accepted everywhere an <addr> appears:
 *   0x7ff6a1b20000   hex
 *   140700000        decimal
 *   game.exe+0x1F2A3C  module+rva (resolved via the process module table)
 *
 * Type names: i32|u32|i64|u64|f32|f64|ptr|u8|u16|bytes:N|str|wstr
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

/** CLI type name → core WriteValueType (null = non-scalar pseudo-type). */
export const TYPE_MAP: Record<string, WriteValueType | 'u8' | 'u16'> = {
  i32: 'int32',
  u32: 'uint32',
  i64: 'int64',
  u64: 'uint64',
  f32: 'float',
  f64: 'double',
  ptr: 'pointer',
  u8: 'u8',
  u16: 'u16',
};

export interface ParsedType {
  kind: 'scalar' | 'bytes' | 'str' | 'wstr';
  /** core type name for scalar/u8/u16 */
  core?:
    | 'int32'
    | 'uint32'
    | 'int64'
    | 'uint64'
    | 'float'
    | 'double'
    | 'pointer'
    | 'u8'
    | 'u16'
    | undefined;
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
      `unknown type '${s}' — use i32|u32|i64|u64|f32|f64|ptr|u8|u16|bytes:N|str|wstr`,
    );
  return { kind: 'scalar', core };
}

/** Scan-capable type → core ScanValueType. */
export function parseScanType(s: string | undefined): ScanValueType {
  const p = parseType(s ?? 'i32');
  if (
    p.kind !== 'scalar' ||
    p.core === 'u8' ||
    p.core === 'u16' ||
    p.core === 'pointer' ||
    p.core === undefined
  )
    throw new UsageError(
      `scan type must be i32|u32|i64|u64|f32|f64, got '${s}'`,
    );
  return p.core;
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
