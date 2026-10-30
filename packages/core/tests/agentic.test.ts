import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Process, type WritePreview } from '../src/index.js';
import { spawnVictim, type Victim } from './victim.js';

let victim: Victim;

beforeAll(async () => {
  victim = await spawnVictim();
});
afterAll(() => {
  victim?.kill();
});

const isPreview = (v: unknown): v is WritePreview =>
  typeof v === 'object' && v !== null && 'would' in v && 'current' in v;

describe('dryRun — preview-before-write', () => {
  test('writeInt32 dryRun returns preview and does NOT write', () => {
    using proc = Process.open(victim.pid);
    const before = proc.readInt32(victim.addr.g_i32);
    const p = proc.writeInt32(victim.addr.g_i32, 0xdeadbeef | 0, {
      dryRun: true,
    });
    expect(isPreview(p)).toBe(true);
    if (!isPreview(p)) return;
    expect(p.addr).toBe(victim.addr.g_i32);
    expect(p.bytes).toBe(4);
    expect(p.would.readInt32LE(0)).toBe(0xdeadbeef | 0); // LE encoding
    expect(p.current.readInt32LE(0)).toBe(before); // snapshot of prior bytes
    expect(proc.readInt32(victim.addr.g_i32)).toBe(before); // unchanged
  });

  test('writeBuffer dryRun on g_buf/pattern → preview only', () => {
    using proc = Process.open(victim.pid);
    const before = proc.readBuffer(victim.addr.g_pattern, 16);
    const p = proc.writeBuffer(victim.addr.g_pattern, Buffer.alloc(16, 0x41), {
      dryRun: true,
    });
    expect(isPreview(p)).toBe(true);
    if (!isPreview(p)) return;
    expect(p.bytes).toBe(16);
    expect(p.would.every((b) => b === 0x41)).toBe(true);
    expect(Buffer.compare(p.current, before)).toBe(0);
    expect(
      Buffer.compare(proc.readBuffer(victim.addr.g_pattern, 16), before),
    ).toBe(0);
  });

  test('writeProtected dryRun → preview, target unchanged', () => {
    using proc = Process.open(victim.pid);
    const before = proc.readInt64(victim.addr.g_i64);
    const p = proc.writeProtected(victim.addr.g_i64, Buffer.alloc(8, 0x90), {
      dryRun: true,
    });
    expect(isPreview(p)).toBe(true);
    expect(proc.readInt64(victim.addr.g_i64)).toBe(before);
  });

  test('nop dryRun → would is 0x90s, no write', () => {
    using proc = Process.open(victim.pid);
    const before = proc.readBuffer(victim.addr.g_array, 8);
    const p = proc.nop(victim.addr.g_array, 8, { dryRun: true });
    expect(isPreview(p)).toBe(true);
    if (!isPreview(p)) return;
    expect(p.would.every((b) => b === 0x90)).toBe(true);
    expect(
      Buffer.compare(proc.readBuffer(victim.addr.g_array, 8), before),
    ).toBe(0);
  });

  test('patchJump dryRun → would is E9 + rel32', () => {
    using proc = Process.open(victim.pid);
    const dst = victim.addr.g_pattern + 0x1000n;
    const p = proc.patchJump(victim.addr.g_pattern, dst, { dryRun: true });
    expect(isPreview(p)).toBe(true);
    if (!isPreview(p)) return;
    expect(p.would[0]).toBe(0xe9);
    expect(p.would.readInt32LE(1)).toBe(
      Number(dst - (victim.addr.g_pattern + 5n)),
    );
  });

  test('dryRun does not grow the write log', () => {
    using proc = Process.open(victim.pid);
    const n = proc.writeLog.length;
    proc.writeInt32(victim.addr.g_i32, 1, { dryRun: true });
    proc.writeBuffer(victim.addr.g_i32, Buffer.alloc(4), { dryRun: true });
    expect(proc.writeLog.length).toBe(n);
  });
});

describe('write-log + undo', () => {
  test('writes are journaled and undo() restores prior bytes', () => {
    using proc = Process.open(victim.pid);
    const a = victim.addr.g_u32;
    const v0 = proc.readUInt32(a);
    proc.writeUInt32(a, 0x11111111);
    proc.writeUInt32(a, 0x22222222);
    proc.writeUInt32(a, 0x33333333);
    const log = proc.writeLog;
    expect(log.length).toBe(3);
    expect(log[0]!.addr).toBe(a);
    expect(log[0]!.bytes!.readUInt32LE(0)).toBe(v0);
    expect(log[2]!.bytes!.readUInt32LE(0)).toBe(0x22222222);

    expect(proc.undo()).toBe(1); // restores 0x22222222
    expect(proc.readUInt32(a)).toBe(0x22222222);
    proc.writeUInt32(a, v0); // leave clean for other tests
  });

  test('undo(2) reverts two writes most-recent-first', () => {
    using proc = Process.open(victim.pid);
    const a = victim.addr.g_i64;
    const v0 = proc.readInt64(a);
    proc.writeInt64(a, 0xaaaan);
    proc.writeInt64(a, 0xbbbbn);
    expect(proc.undo(2)).toBe(2);
    expect(proc.readInt64(a)).toBe(v0);
  });

  test('undo() with empty log returns 0; bad count throws RangeError', () => {
    using proc = Process.open(victim.pid);
    expect(proc.undo()).toBe(0);
    expect(() => proc.undo(0)).toThrow(RangeError);
    expect(() => proc.undo(1.5)).toThrow(RangeError);
    expect(() => proc.undo(-3)).toThrow(RangeError);
  });

  test('undo() on unreadable-region write: recorded null, skipped, returns 0', () => {
    using proc = Process.open(victim.pid);
    // PAGE_GUARD page — pre-write snapshot fails → bytes:null entry. The
    // write itself also fails (WriteError), but the journal entry remains.
    try {
      proc.writeBuffer(victim.addr.g_guard + 0x1000n, Buffer.from([1, 2, 3]));
    } catch {
      /* WriteError expected — guard page faults */
    }
    const log = proc.writeLog;
    expect(log.length).toBeGreaterThan(0);
    const last = log[log.length - 1]!;
    expect(last.addr).toBe(victim.addr.g_guard + 0x1000n);
    expect(last.bytes).toBeNull();
    expect(proc.undo()).toBe(0); // skipped, doesn't count
  });

  test('undo round-trip: undo() again "redoes" the original write', () => {
    using proc = Process.open(victim.pid);
    const a = victim.addr.g_f64;
    const v0 = proc.readDouble(a);
    proc.writeDouble(a, 1234.5);
    expect(proc.undo()).toBe(1); // back to v0
    expect(proc.readDouble(a)).toBe(v0);
    expect(proc.undo()).toBe(1); // undo of the restore = redo 1234.5
    expect(proc.readDouble(a)).toBe(1234.5);
    proc.writeDouble(a, v0); // leave clean
  });

  test('writeLog returns copies — mutating it does not corrupt the journal', () => {
    using proc = Process.open(victim.pid);
    proc.writeUInt8(victim.addr.g_u8, 0x42);
    const snap = proc.writeLog;
    expect(snap.length).toBe(1);
    snap[0]!.bytes![0] = 0xff; // mutate the returned buffer copy
    // journal must be unaffected — undo restores the real prior byte
    proc.undo();
    expect(proc.readUInt8(victim.addr.g_u8)).toBe(0x7f);
  });

  test('close() clears the write log', () => {
    const proc = Process.open(victim.pid);
    proc.writeInt32(victim.addr.g_i32, 0x777);
    expect(proc.writeLog.length).toBe(1);
    proc.close();
    expect(proc.writeLog.length).toBe(0);
  });
});

describe('Process.describe()', () => {
  test('shape: pid/arch/pointerSize/modules/rwxRegions/threads', () => {
    using proc = Process.open(victim.pid);
    const d = proc.describe();
    expect(d.pid).toBe(victim.pid);
    expect(d.arch).toBe('x64');
    expect(d.pointerSize).toBe(8);
    expect(Array.isArray(d.threads)).toBe(true);
    expect(d.threads.length).toBeGreaterThan(0);
    expect(d.threads.every((t) => typeof t === 'number')).toBe(true);

    const vm = d.modules.find((m) => m.name === 'victim.exe');
    expect(vm).toBeDefined();
    expect(vm!.base).toMatch(/^0x[0-9a-f]+$/);
    expect(typeof vm!.size).toBe('number');

    expect(d.rwxRegions.length).toBeGreaterThan(0);
    for (const r of d.rwxRegions) {
      expect(r.base).toMatch(/^0x[0-9a-f]+$/);
      expect(typeof r.size).toBe('number');
      expect(typeof r.protection).toBe('string');
      expect(r.protection.startsWith('PAGE_')).toBe(true);
    }
    // victim has a real RWX-ish region? at minimum RW .data holds our globals
    expect(
      d.rwxRegions.some(
        (r) =>
          victim.addr.g_i32 >= BigInt(r.base) &&
          victim.addr.g_i32 < BigInt(r.base) + BigInt(r.size),
      ),
    ).toBe(true);

    // fully JSON-safe (the whole point of the hex-string convention)
    expect(() => JSON.stringify(d)).not.toThrow();
    const round = JSON.parse(JSON.stringify(d));
    expect(round.pid).toBe(victim.pid);
  });
});
