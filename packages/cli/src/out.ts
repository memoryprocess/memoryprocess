/**
 * Output helpers -- the `--json` contract lives here.
 *
 * Conventions (docs/json-conventions.md):
 *  - bigint -> '0x'-prefixed hex string (addresses, pointers, 64-bit values).
 *  - JSON mode -> machine output on stdout; human mode -> aligned tables.
 *  - Errors -> { ok:false, error:{code,message,win32code?} } on stdout (JSON
 *    mode) or stderr (human mode), exit code 1 either way.
 */
import { writeSync } from 'node:fs';

export const hex = (v: number | bigint): string =>
  `0x${BigInt(v).toString(16)}`;

/** JSON.stringify replacer: bigint -> '0x...' hex string, Buffer -> hex string. */
export function toJson(v: unknown): unknown {
  if (typeof v === 'bigint') return hex(v);
  if (Buffer.isBuffer(v)) return `0x${v.toString('hex')}`;
  if (Array.isArray(v)) return v.map(toJson);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) out[k] = toJson(val);
    return out;
  }
  return v;
}

export const jstr = (v: unknown): string => JSON.stringify(toJson(v));

/** One envelope object on stdout (JSON mode). */
export function emitOk(data: unknown): void {
  writeSync(1, `${jstr({ ok: true, data })}\n`);
}

/** One NDJSON line on stdout. */
export function emitLine(obj: unknown): void {
  writeSync(1, `${jstr(obj)}\n`);
}

/** Progress/diagnostic line on stderr -- never pollutes stdout data. */
export function emitProgress(obj: unknown): void {
  writeSync(2, `${jstr(obj)}\n`);
}

export interface CliError {
  code: string;
  message: string;
  win32code?: number;
}

export function toCliError(e: unknown): CliError {
  const any = e as { code?: string; message?: string; win32code?: number };
  return {
    code:
      typeof any?.code === 'string'
        ? any.code
        : e instanceof RangeError || e instanceof TypeError
          ? 'INVALID_ARGS'
          : 'ERROR',
    message: any?.message ?? String(e),
    ...(typeof any?.win32code === 'number' ? { win32code: any.win32code } : {}),
  };
}

/**
 * Print the error envelope and return the process exit code (1). JSON mode
 * writes the envelope to stdout (piped agents read one channel); human mode
 * writes a terse line to stderr.
 */
export function fail(e: unknown, json: boolean): number {
  const err = toCliError(e);
  if (json) writeSync(1, `${jstr({ ok: false, error: err })}\n`);
  else writeSync(2, `mproc: ${err.code}: ${err.message}\n`);
  return 1;
}

/** Minimal aligned-columns table for human output. */
export function table(rows: (string | number)[][], headers: string[]): string {
  const all = [headers, ...rows.map((r) => r.map(String))];
  const widths = headers.map((_, i) =>
    Math.max(...all.map((r) => String(r[i] ?? '').length)),
  );
  const fmt = (r: (string | number)[]) =>
    r.map((c, i) => String(c).padEnd(widths[i]!)).join('  ');
  return `${fmt(headers)}\n${rows.map(fmt).join('\n')}`;
}

/** Truncate a list for human display; returns [shown, omittedCount]. */
export function cap<T>(arr: readonly T[], n: number): [T[], number] {
  return arr.length > n ? [arr.slice(0, n), arr.length - n] : [[...arr], 0];
}
