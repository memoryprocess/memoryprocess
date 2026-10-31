/**
 * Cross-invocation state -- what makes one-shot `mproc` commands composable.
 *
 * Two artifacts, both under `.mproc/` in the CURRENT working directory (a
 * per-directory workspace, like .git):
 *
 *   .mproc/scan-<pid>.json     scan/next hit list: {pid,type,hits:[{addr,value}]}
 *   .mproc/journal-<pid>.json  write journal for `undo`: [{addr,bytes(hex)}]
 *
 * Rationale: writeLog lives on a Process instance and dies with it. Persisting
 * the journaled pre-write bytes makes `mproc write` -> `mproc undo` work across
 * separate invocations (and across attach sessions), which is the CLI's
 * self-correction primitive.
 */
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const DIR = '.mproc';

function stateDir(): string {
  const d = join(process.cwd(), DIR);
  mkdirSync(d, { recursive: true });
  return d;
}

export function scanStatePath(pid: number): string {
  return join(stateDir(), `scan-${pid}.json`);
}
export function journalPath(pid: number): string {
  return join(stateDir(), `journal-${pid}.json`);
}

export interface StoredHit {
  addr: string; // '0x...'
  value: number | string; // number, or '0x...' hex string for 64-bit
}
export interface ScanState {
  pid: number;
  type: string;
  hits: StoredHit[];
}

export function saveScan(path: string, st: ScanState): void {
  writeFileSync(path, `${JSON.stringify(st)}\n`);
}

export function loadScan(path: string): ScanState {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw Object.assign(
      new Error(
        `scan state not found: ${path} -- run 'mproc scan <pid> <value>' first`,
      ),
      { code: 'STATE_NOT_FOUND' },
    );
  }
  const st = JSON.parse(raw) as ScanState;
  if (!Array.isArray(st.hits))
    throw Object.assign(new Error(`corrupt scan state: ${path}`), {
      code: 'STATE_CORRUPT',
    });
  return st;
}

export interface JournalEntry {
  addr: string; // '0x...'
  /** hex string of prior bytes, or null when the pre-write snapshot failed */
  bytes: string | null;
}

/** In-process shadow of the on-disk journal (attached sessions write a lot). */
const journalMem = new Map<number, JournalEntry[]>();

export function loadJournal(pid: number): JournalEntry[] {
  const mem = journalMem.get(pid);
  if (mem) return mem.map((e) => ({ ...e }));
  try {
    const raw = readFileSync(journalPath(pid), 'utf8');
    const j = JSON.parse(raw);
    return Array.isArray(j) ? (j as JournalEntry[]) : [];
  } catch {
    return [];
  }
}

const JOURNAL_CAP = 256;

export function appendJournal(pid: number, e: JournalEntry): void {
  const j = loadJournal(pid);
  j.push(e);
  while (j.length > JOURNAL_CAP) j.shift();
  saveJournal(pid, j);
}

export function saveJournal(pid: number, j: JournalEntry[]): void {
  journalMem.set(
    pid,
    j.map((e) => ({ ...e })),
  );
  // write-then-rename so a crash mid-write can't corrupt the undo log.
  // rename() also SIDESTEPS the create-then-truncate AV scan window that
  // occasionally makes writeFileSync-to-existing-file a no-op on Windows
  // (journal written but the on-disk bytes are still the old write's).
  const p = journalPath(pid);
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(j)}\n`);
  renameSync(tmp, p);
}
