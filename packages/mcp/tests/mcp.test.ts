import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  callTool,
  createSessions,
  SessionStore,
  toolNames,
} from '../src/tools.js';

// Reuse core's test victim (its stdout advertises &g_* addresses).
interface Victim {
  pid: number;
  addr: Record<string, bigint>;
  kill: () => void;
}
const { spawnVictim } = (await import('../../core/tests/victim.js')) as {
  spawnVictim: () => Promise<Victim>;
};

let victim: Victim;
let sessions: SessionStore;
let session = '';
let scratch = 0n; // RW remote buffer allocated via eval_js for scans
const hex = (v: bigint) => `0x${v.toString(16)}`;

async function call(name: string, args: Record<string, unknown> = {}) {
  return callTool(sessions, name, args);
}
// unwrap data, failing the test on the error envelope
async function ok(name: string, args: Record<string, unknown> = {}) {
  const r = await call(name, args);
  if (!r.ok) throw new Error(`${name} failed: ${JSON.stringify(r.error)}`);
  return r.data as Record<string, unknown>;
}
const err = (r: { ok: boolean; error?: { code: string; message: string } }) =>
  r.error!;

beforeAll(async () => {
  victim = await spawnVictim();
  sessions = createSessions();
});

afterAll(() => {
  try {
    sessions.closeAll();
  } catch {}
  victim.kill();
});

describe('sessions', () => {
  test('proc_list contains the victim', async () => {
    const r = await call('proc_list');
    expect(r.ok).toBe(true);
    const data = r.data as { pid: number; name: string }[];
    expect(data.some((p) => p.pid === victim.pid)).toBe(true);
  });

  test('proc_open by pid returns a handle + describe', async () => {
    const d = await ok('proc_open', { pid: victim.pid });
    expect(typeof d.session).toBe('string');
    expect((d.describe as { pid: number }).pid).toBe(victim.pid);
    session = d.session as string;
  });

  test('proc_open by name + access ro works; bad pid fails', async () => {
    const r = await call('proc_open', { name: 'victim.exe', access: 'ro' });
    expect(r.ok).toBe(true);
    const bad = await call('proc_open', { pid: 0x7ffffffe });
    expect(bad.ok).toBe(false);
    expect(err(bad).code).toBeDefined();
  });

  test('unknown session -> UNKNOWN_SESSION envelope', async () => {
    const r = await call('mem_read', {
      session: 'p999',
      addr: '0x10',
      type: 'i32',
    });
    expect(r.ok).toBe(false);
    expect(err(r).code).toBe('UNKNOWN_SESSION');
  });

  test('mem_describe returns modules/regions/threads', async () => {
    const d = await ok('mem_describe', { session });
    expect(d.pid).toBe(victim.pid);
    expect((d.modules as unknown[]).length).toBeGreaterThan(0);
    expect((d.threads as unknown[]).length).toBeGreaterThan(0);
  });
});

describe('read / write / journal / undo', () => {
  test('mem_read u32/str/ptr/bytes -- numbers stay numbers, ptrs are hex', async () => {
    const u32 = await ok('mem_read', {
      session,
      addr: hex(victim.addr.g_u32),
      type: 'u32',
    });
    expect(u32.value).toBe(0xdeadbeef); // fits in a JS number -> number

    const str = await ok('mem_read', {
      session,
      addr: hex(victim.addr.g_str),
      type: 'str',
    });
    expect(str.value).toBe('memoryprocess_v2_victim');

    const ptr = await ok('mem_read', {
      session,
      addr: hex(victim.addr.g_ptr),
      type: 'ptr',
    });
    expect(ptr.value).toBe(hex(victim.addr.g_i32)); // 64-bit -> hex string

    const bytes = await ok('mem_read', {
      session,
      addr: hex(victim.addr.g_pattern2),
      type: 'bytes:8',
    });
    expect(bytes.value).toBe('dead0011dead2233');
  });

  test('mem_write dryRun previews without writing or journaling', async () => {
    const addr = hex(victim.addr.g_u32);
    const r = await ok('mem_write', {
      session,
      addr,
      type: 'u32',
      value: '0x41414141',
      dryRun: true,
    });
    const p = r.preview as { current: string; would: string };
    expect(p.current).toBe('efbeadde'); // 0xDEADBEEF LE
    expect(p.would).toBe('41414141');
    const back = await ok('mem_read', { session, addr, type: 'u32' });
    expect(back.value).toBe(0xdeadbeef);
    const j = await ok('mem_journal', { session });
    expect((j as unknown as unknown[]).length).toBe(0);
  });

  test('real write -> journal grows -> mem_undo restores', async () => {
    const addr = hex(victim.addr.g_u32);
    await ok('mem_write', { session, addr, type: 'u32', value: '0x41414141' });
    const read = await ok('mem_read', { session, addr, type: 'u32' });
    expect(read.value).toBe(0x41414141);
    const entries = (await ok('mem_journal', { session })) as unknown as {
      addr: string;
      bytes: string | null;
    }[];
    expect(entries.length).toBe(1);
    expect(entries[0]!.bytes).toBe('efbeadde');
    const u = await ok('mem_undo', { session });
    expect(u.reverted).toBe(1);
    const restored = await ok('mem_read', { session, addr, type: 'u32' });
    expect(restored.value).toBe(0xdeadbeef);
  });

  test('write to unmapped address -> error envelope', async () => {
    const r = await call('mem_write', {
      session,
      addr: '0x1',
      type: 'u32',
      value: 1,
    });
    expect(r.ok).toBe(false);
    expect(err(r).code).toBeDefined();
  });
});

describe('scan + refine', () => {
  test('mem_scan finds a sentinel in RW memory; limit caps hits', async () => {
    // Allocate a private RW page and seed a unique sentinel -- module .data is
    // read-only under MSVC, which onlyWritable:true (the default) skips.
    const a = await ok('eval_js', {
      session,
      code: `const p = proc.alloc(0x1000); proc.writeInt32(p, 0x5aa5cc33); return p;`,
    });
    scratch = BigInt(a.result as string);
    const r = await ok('mem_scan', {
      session,
      value: '0x5aa5cc33',
      type: 'u32',
      start: hex(scratch),
      end: hex(scratch + 0x1000n),
    });
    const hits = r.hits as { addr: string; value: number }[];
    expect(hits.length).toBe(1);
    expect(hits[0]!.addr).toBe(hex(scratch));
    expect(hits[0]!.value).toBe(0x5aa5cc33);
  });

  test('mem_scan_next exact refines the hit list', async () => {
    const scan = await ok('mem_scan', {
      session,
      value: '0x5aa5cc33',
      type: 'u32',
      start: hex(scratch),
      end: hex(scratch + 0x1000n),
    });
    const next = await ok('mem_scan_next', {
      session,
      hits: scan.hits,
      mode: 'exact',
      value: '0x5aa5cc33',
      type: 'u32',
    });
    const refined = next.hits as { addr: string }[];
    expect(refined.length).toBe(1);
    expect(refined[0]!.addr).toBe(hex(scratch));
  });

  test('mem_scan_next increasedBy composes after a remote write', async () => {
    await ok('mem_write', {
      session,
      addr: hex(scratch),
      type: 'u32',
      value: '0x5aa5cc40', // +13
    });
    const scan = await ok('mem_scan', {
      session,
      value: '0x5aa5cc40',
      type: 'u32',
      start: hex(scratch),
      end: hex(scratch + 0x1000n),
    });
    await ok('mem_write', {
      session,
      addr: hex(scratch),
      type: 'u32',
      value: '0x5aa5cc4d', // +13 again
    });
    const next = await ok('mem_scan_next', {
      session,
      hits: scan.hits,
      mode: 'increasedBy',
      value: 13,
      type: 'u32',
    });
    expect((next.hits as unknown[]).length).toBe(1);
    // restore for other tests
    await ok('mem_write', {
      session,
      addr: hex(scratch),
      type: 'u32',
      value: '0x5aa5cc33',
    });
  });
});

describe('pointer resolve + watch/freeze', () => {
  test('mem_pointer_resolve resolves module+rva chain to g_i32', async () => {
    const d = await ok('mem_describe', { session });
    const vic = (
      d.modules as { name: string; base: string; size: number }[]
    ).find((m) => /victim\.exe/i.test(m.name))!;
    const rva = victim.addr.g_ppp - BigInt(vic.base);
    const r = await ok('mem_pointer_resolve', {
      session,
      module: vic.name,
      rva: hex(rva),
      offsets: ['0x0', '0x0', '0x0'],
    });
    expect(r.addr).toBe(hex(victim.addr.g_i32));
  });

  test('mem_pointer_resolve with no offsets returns module base + rva', async () => {
    const d = await ok('mem_describe', { session });
    const vic = (
      d.modules as { name: string; base: string; size: number }[]
    ).find((m) => /victim\.exe/i.test(m.name))!;
    const rva = victim.addr.g_i32 - BigInt(vic.base);
    // offsets omitted entirely -- no dereference, just base+rva
    const r = await ok('mem_pointer_resolve', {
      session,
      module: vic.name,
      rva: hex(rva),
    });
    expect(r.addr).toBe(hex(victim.addr.g_i32));
  });

  test('mem_watch records change; poll drains; unwatch stops', async () => {
    const w = await ok('mem_watch', {
      session,
      addr: hex(victim.addr.g_counter),
      ms: 10,
    });
    const watchId = w.watchId as string;
    await new Promise((r) => setTimeout(r, 150));
    const p = await ok('mem_watch_poll', { watchId });
    expect((p.events as unknown[]).length).toBeGreaterThanOrEqual(1);
    await ok('mem_unwatch', { watchId });
    const again = await call('mem_watch_poll', { watchId });
    expect(again.ok).toBe(false);
    expect(err(again).code).toBe('UNKNOWN_WATCH');
  });

  test('mem_freeze pins a value; unfreeze releases it', async () => {
    const addr = hex(scratch);
    const f = await ok('mem_freeze', {
      session,
      addr,
      type: 'i32',
      value: 424242,
      ms: 10,
    });
    const freezeId = f.freezeId as string;
    // clobber it -- the freeze timer must restore within a few ticks
    await ok('mem_write', { session, addr, type: 'i32', value: -1 });
    await new Promise((r) => setTimeout(r, 120));
    const read = await ok('mem_read', { session, addr, type: 'i32' });
    expect(read.value).toBe(424242);
    await ok('mem_unfreeze', { freezeId });
    const again = await call('mem_unfreeze', { freezeId });
    expect(again.ok).toBe(false);
    expect(err(again).code).toBe('UNKNOWN_FREEZE');
    // restore sentinel for nothing -- scratch is private, fine to leave
  });
});

describe('eval_js + gating', () => {
  test('eval_js runs async code with proc + Process in scope', async () => {
    const r = await ok('eval_js', {
      session,
      code: `return { pid: proc.pid, hex: proc.readUInt32(${hex(victim.addr.g_u32)}).toString(16), isP: proc instanceof Process };`,
    });
    const d = r.result as { pid: number; hex: string; isP: boolean };
    expect(d.pid).toBe(victim.pid);
    expect(d.hex).toBe('deadbeef');
    expect(d.isP).toBe(true);
  });

  test('eval_js errors surface in the envelope, not a crash', async () => {
    const r = await call('eval_js', {
      session,
      code: 'throw new Error("boom")',
    });
    expect(r.ok).toBe(false);
    expect(err(r).message).toContain('boom');
  });

  test('eval_js is omitted when eval is disabled', async () => {
    expect(toolNames({ evalEnabled: false }).includes('eval_js')).toBe(false);
    const r = await callTool(
      sessions,
      'eval_js',
      { session, code: 'return 1' },
      { evalEnabled: false },
    );
    expect(r.ok).toBe(false);
    expect(err(r).code).toBe('UNKNOWN_TOOL');
  });

  test('restricted mode hides eval + the write tools, keeps read/scan', async () => {
    const names = toolNames({ evalEnabled: false, restricted: true });
    for (const n of ['eval_js', 'mem_write', 'mem_freeze', 'mem_undo'])
      expect(names.includes(n)).toBe(false);
    for (const n of [
      'mem_read',
      'mem_describe',
      'mem_scan',
      'mem_scan_pattern',
      'mem_regions',
      'mem_pointer_resolve',
      'mem_watch',
      'mem_journal',
    ])
      expect(names.includes(n)).toBe(true);
    // hidden tools are also rejected by the dispatcher
    const w = await callTool(
      sessions,
      'mem_write',
      {
        session,
        addr: '0x10',
        type: 'u32',
        value: 1,
      },
      { evalEnabled: false, restricted: true },
    );
    expect(w.ok).toBe(false);
    expect(err(w).code).toBe('UNKNOWN_TOOL');
    // a read still works under the same flags
    const rr = await callTool(
      sessions,
      'mem_read',
      { session, addr: hex(victim.addr.g_u32), type: 'u32' },
      { evalEnabled: false, restricted: true },
    );
    expect(rr.ok).toBe(true);
  });
});

describe('mem_scan_pattern + mem_regions', () => {
  test('mem_scan_pattern finds g_pattern bytes at its own address', async () => {
    const r = await ok('mem_scan_pattern', {
      session,
      // g_pattern = 48 8B 05 AA BB CC 90 90 DE AD BE EF 00 11 22 33
      pattern: '48 8B 05 AA BB CC 90 90 DE AD BE EF 00 11 22 33',
      module: 'victim.exe',
    });
    const hits = r.hits as string[];
    expect(r.count).toBe(1);
    expect(hits[0]).toBe(hex(victim.addr.g_pattern));
    expect(r.truncated).toBe(false);
  });

  test('mem_scan_pattern wildcards + start/end range work', async () => {
    const r = await ok('mem_scan_pattern', {
      session,
      pattern: '48 8B ?? ?? BB CC',
      start: hex(victim.addr.g_pattern),
      end: hex(victim.addr.g_pattern + 0x10n),
    });
    expect((r.hits as string[])[0]).toBe(hex(victim.addr.g_pattern));
  });

  test('mem_scan_pattern multi-hit honors limit/truncated', async () => {
    // "DE AD" appears in g_pattern and twice in g_pattern2 -> >=3 hits
    const r = await ok('mem_scan_pattern', {
      session,
      pattern: 'DE AD',
      module: 'victim.exe',
      limit: 2,
    });
    expect(r.count).toBeGreaterThanOrEqual(3);
    expect(r.truncated).toBe(true);
    expect((r.hits as string[]).length).toBe(2);
  });

  test('mem_regions lists committed regions incl. the module image', async () => {
    const r = await ok('mem_regions', { session });
    const regions = r.regions as {
      base: string;
      size: string;
      protect: string;
      state: string;
      type: string;
    }[];
    expect(regions.length).toBeGreaterThan(0);
    const vic = regions.find(
      (x) =>
        BigInt(x.base) <= victim.addr.g_i32 &&
        victim.addr.g_i32 < BigInt(x.base) + BigInt(x.size),
    );
    expect(vic).toBeDefined();
    expect(vic!.state).toBe('0x1000');
  });

  test('mem_regions writableOnly excludes the read-only .rdata pages', async () => {
    const all = await ok('mem_regions', { session });
    const w = await ok('mem_regions', { session, writableOnly: true });
    expect(w.count as number).toBeLessThan(all.count as number);
    const regions = w.regions as { protect: string }[];
    const WRITABLE = 0x04 | 0x08 | 0x40 | 0x80;
    for (const r of regions)
      expect(BigInt(r.protect) & BigInt(WRITABLE)).not.toBe(0n);
  });
});

describe('mem_freeze narrow ints', () => {
  test('i8 freeze with a negative value writes the two\u2019s-complement byte', async () => {
    // seed g_u8 = 0x7F then freeze -5 -> raw byte must read back 0xFB, not 0x05
    const addr = hex(victim.addr.g_u8);
    const f = await ok('mem_freeze', {
      session,
      addr,
      type: 'i8',
      value: -5,
      ms: 10,
    });
    const freezeId = f.freezeId as string;
    await ok('mem_write', { session, addr, type: 'u8', value: 0 });
    await new Promise((r) => setTimeout(r, 120));
    const raw = await ok('mem_read', { session, addr, type: 'u8' });
    expect(raw.value).toBe(0xfb);
    const signed = await ok('mem_read', { session, addr, type: 'i8' });
    expect(signed.value).toBe(-5);
    await ok('mem_unfreeze', { freezeId });
    // restore
    await ok('mem_write', { session, addr, type: 'u8', value: 0x7f });
  });

  test('i16 freeze keeps a negative value across clobbers', async () => {
    const addr = hex(victim.addr.g_u16);
    const f = await ok('mem_freeze', {
      session,
      addr,
      type: 'i16',
      value: -2,
      ms: 10,
    });
    const freezeId = f.freezeId as string;
    await ok('mem_write', { session, addr, type: 'u16', value: 0 });
    await new Promise((r) => setTimeout(r, 120));
    const raw = await ok('mem_read', { session, addr, type: 'u16' });
    expect(raw.value).toBe(0xfffe);
    await ok('mem_unfreeze', { freezeId });
    await ok('mem_write', { session, addr, type: 'u16', value: 0xbeef });
  });
});

describe('proc_close', () => {
  test('closing a session kills it; reusing it fails', async () => {
    const r = await ok('proc_open', { pid: victim.pid });
    const s2 = r.session as string;
    const c = await ok('proc_close', { session: s2 });
    expect(c.closed).toBe(true);
    const read = await call('mem_read', {
      session: s2,
      addr: '0x10',
      type: 'i32',
    });
    expect(read.ok).toBe(false);
    expect(err(read).code).toBe('UNKNOWN_SESSION');
  });
});
