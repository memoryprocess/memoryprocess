/**
 * mproc end-to-end tests — spawn the real CLI against victim.exe where the
 * address table is known, and against process.pid for self-reads.
 *
 * The CLI is `src/cli.ts` run under bun; tests spawn it the way an agent
 * would (`bun src/cli.ts …`), parse stdout, and assert on the envelope.
 */
import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { spawn, type ChildProcess } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, rmSync } from 'node:fs';

const dir = dirname(fileURLToPath(import.meta.url));
const CLI = join(dir, '..', 'src', 'cli.ts');
// reuse the core test victim — the same binary, one directory up
const VICIM_EXE = join(dir, '..', '..', 'core', 'tests', 'victim.exe');

interface Victim {
  proc: ChildProcess;
  pid: number;
  addr: Record<string, bigint>;
  kill: () => void;
}

async function spawnVictim(): Promise<Victim> {
  const proc = spawn(VICIM_EXE, [], { stdio: ['ignore', 'pipe', 'inherit'] });
  let buf = '';
  await new Promise<void>((res, rej) => {
    let ptrTimer: NodeJS.Timeout | undefined;
    proc.stdout!.on('data', (d) => {
      buf += d.toString();
      if (buf.includes('&g_guard_end')) {
        clearTimeout(ptrTimer);
        res();
      } else if (buf.includes('&g_ptr') && !ptrTimer) {
        ptrTimer = setTimeout(res, 300);
      }
    });
    proc.on('error', rej);
    setTimeout(() => rej(new Error('victim spawn timeout')), 10_000);
  });
  const pid = Number(buf.match(/PID=(\d+)/)![1]);
  const addr: Record<string, bigint> = {};
  for (const m of buf.matchAll(/&(g_\w+)=([0-9A-Fa-f]+)/g))
    addr[m[1]] = BigInt('0x' + m[2]);
  return { proc, pid, addr, kill: () => proc.kill() };
}

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function mproc(args: string[], input?: string): Promise<RunResult> {
  return new Promise((res) => {
    const p = spawn('bun', [CLI, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: dir, // .mproc/ state lands under tests/
      // inherit the parent env so .mproc state + PATH resolve identically to
      // an interactive shell (spawn sanitizes env when undefined on Windows).
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    p.stdout!.on('data', (d) => (stdout += d));
    p.stderr!.on('data', (d) => (stderr += d));
    if (input !== undefined) {
      p.stdin!.write(input);
      p.stdin!.end();
    }
    p.on('close', (code) => res({ code, stdout, stderr }));
    setTimeout(() => {
      p.kill();
      res({ code: null, stdout, stderr });
    }, 30_000);
  });
}

const envelope = (stdout: string) => JSON.parse(stdout.trim().split('\n')[0]!);

let victim: Victim;
beforeAll(async () => {
  victim = await spawnVictim();
});
afterAll(() => {
  victim?.kill();
  rmSync(join(dir, '.mproc'), { recursive: true, force: true });
});

describe('mproc — discovery', () => {
  test('list outputs pids incl. the victim', async () => {
    const r = await mproc(['list', '--json']);
    expect(r.code).toBe(0);
    const env = envelope(r.stdout);
    expect(env.ok).toBe(true);
    const pids = env.data.map((p: { pid: number }) => p.pid);
    expect(pids).toContain(victim.pid);
  });

  test('describe returns the ProcessDescribe shape', async () => {
    const r = await mproc(['describe', String(victim.pid), '--json']);
    expect(r.code).toBe(0);
    const env = envelope(r.stdout);
    expect(env.ok).toBe(true);
    expect(env.data.pid).toBe(victim.pid);
    expect(env.data.arch).toBe('x64');
    expect(Array.isArray(env.data.modules)).toBe(true);
    expect(env.data.modules[0].base).toMatch(/^0x[0-9a-f]+$/);
    expect(
      env.data.modules.some((m: { name: string }) => m.name === 'victim.exe'),
    ).toBe(true);
    expect(Array.isArray(env.data.threads)).toBe(true);
  });

  test('modules lists victim.exe', async () => {
    const r = await mproc(['modules', String(victim.pid), '--json']);
    expect(r.code).toBe(0);
    const env = envelope(r.stdout);
    expect(env.ok).toBe(true);
    const names = env.data.map((m: { name: string }) => m.name);
    expect(names).toContain('victim.exe');
  });
});

describe('mproc — read/write', () => {
  test('read i32 returns the live value', async () => {
    const r = await mproc([
      'read',
      String(victim.pid),
      `0x${victim.addr.g_i32!.toString(16)}`,
      'i32',
      '--json',
    ]);
    expect(r.code).toBe(0);
    const env = envelope(r.stdout);
    expect(env.ok).toBe(true);
    expect(env.data.addr).toBe(`0x${victim.addr.g_i32!.toString(16)}`);
    expect(typeof env.data.value).toBe('number');
    expect(env.data.value).toBeGreaterThanOrEqual(0x12345678);
  });

  test('read ptr returns a hex string', async () => {
    const r = await mproc([
      'read',
      String(victim.pid),
      `0x${victim.addr.g_ptr!.toString(16)}`,
      'ptr',
      '--json',
    ]);
    const env = envelope(r.stdout);
    expect(env.ok).toBe(true);
    expect(env.data.value).toMatch(/^0x[0-9a-f]+$/);
  });

  test('read bytes:N returns hex', async () => {
    const r = await mproc([
      'read',
      String(victim.pid),
      `0x${victim.addr.g_i32!.toString(16)}`,
      'bytes:4',
      '--json',
    ]);
    const env = envelope(r.stdout);
    expect(env.data.value).toMatch(/^0x[0-9a-f]{8}$/);
  });

  test('write --dry previews without writing', async () => {
    const a = `0x${victim.addr.g_i32!.toString(16)}`;
    const before = await mproc([
      'read',
      String(victim.pid),
      a,
      'i32',
      '--json',
    ]);
    const v0 = envelope(before.stdout).data.value;
    const r = await mproc([
      'write',
      String(victim.pid),
      a,
      'u32',
      '42',
      '--dry',
      '--json',
    ]);
    const env = envelope(r.stdout);
    expect(env.ok).toBe(true);
    expect(env.data.dry).toBe(true);
    expect(env.data.would).toBe('0x2a000000'); // u32 LE 42
    const after = await mproc(['read', String(victim.pid), a, 'i32', '--json']);
    expect(envelope(after.stdout).data.value).toBe(v0); // unchanged
  });

  test('write then undo round-trips through the journal file', async () => {
    const a = `0x${victim.addr.g_u32!.toString(16)}`;
    const v0 = envelope(
      (await mproc(['read', String(victim.pid), a, 'u32', '--json'])).stdout,
    ).data.value;
    const w = await mproc([
      'write',
      String(victim.pid),
      a,
      'u32',
      '4242',
      '--json',
    ]);
    expect(envelope(w.stdout).ok).toBe(true);
    expect(
      envelope(
        (await mproc(['read', String(victim.pid), a, 'u32', '--json'])).stdout,
      ).data.value,
    ).toBe(4242);
    const u = await mproc(['undo', String(victim.pid), '1', '--json']);
    expect(envelope(u.stdout).data.reverted).toBe(1);
    await new Promise((r) => setTimeout(r, 50));
    const vAfter = envelope(
      (await mproc(['read', String(victim.pid), a, 'u32', '--json'])).stdout,
    ).data.value;
    // g_u32 is static (the victim loop never touches it), so v0 is the exact
    // pre-write value — the undo must restore it byte-for-byte.
    expect(vAfter).toBe(v0);
  });
});

describe('mproc — scan/next via state file', () => {
  test('scan writes a state file next can refine', async () => {
    // Full-VA scan for a live counter is timing-fragile — bound it to
    // victim.exe's module via a raw start/end range covering .data, the same
    // way core tests seed hits (scanValue(start,end)).
    const state = join(dir, '.mproc', `scan-${victim.pid}.json`);
    const mods = envelope(
      (await mproc(['modules', String(victim.pid), '--json'])).stdout,
    ).data;
    const base = BigInt(
      mods.find((m: { name: string }) => m.name === 'victim.exe').base,
    );
    const r = await mproc([
      'scan',
      String(victim.pid),
      '0xdeadbeef',
      'u32',
      '--start',
      `0x${base.toString(16)}`,
      '--end',
      `0x${(base + BigInt(mods[0].size)).toString(16)}`,
      '--json',
    ]);
    expect(r.code).toBe(0);
    const hits = r.stdout
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l))
      .filter((o) => o.type === 'hit')
      .map((o) => o.addr);
    expect(hits).toContain(`0x${victim.addr.g_u32!.toString(16)}`);
    expect(existsSync(state)).toBe(true);

    // 'unchanged' on a never-mutated value keeps every hit — proves the
    // state file round-trips and nextScan relative modes work end-to-end.
    const n = await mproc([
      'next',
      String(victim.pid),
      state,
      'unchanged',
      '--json',
    ]);
    const nLines = n.stdout
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    const nHits = nLines.filter((o) => o.type === 'hit').map((o) => o.addr);
    expect(nHits).toContain(`0x${victim.addr.g_u32!.toString(16)}`);
    // and a destructive refine drops it: 'changed' should return ZERO hits
    const n2 = await mproc([
      'next',
      String(victim.pid),
      state,
      'changed',
      '--json',
    ]);
    const n2Hits = n2.stdout
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l))
      .filter((o) => o.type === 'hit');
    expect(n2Hits.length).toBe(0);
  });
});

describe('mproc — pointers', () => {
  test("resolves 'mod+rva,off' chains", async () => {
    // g_ppp points at g_pp: 'victim.exe+rva(g_ppp),0x0' resolves to &g_pp.
    const mods = envelope(
      (await mproc(['modules', String(victim.pid), '--json'])).stdout,
    ).data;
    const base = BigInt(
      mods.find((m: { name: string }) => m.name === 'victim.exe').base,
    );
    const rva = victim.addr.g_ppp! - base;
    const r = await mproc([
      'pointers',
      String(victim.pid),
      `pp:victim.exe+0x${rva.toString(16)},0x0`,
      '--json',
    ]);
    const env = envelope(r.stdout);
    expect(env.ok).toBe(true);
    expect(env.data[0].name).toBe('pp');
    // resolvePointer reads the pointer AT base+0 → dereferences g_ppp → &g_pp
    expect(BigInt(env.data[0].addr)).toBe(victim.addr.g_pp!);
  });
});

describe('mproc — attach session', () => {
  test('piped stdin: describe + read + exit, one JSON result per line', async () => {
    const a = `0x${victim.addr.g_i32!.toString(16)}`;
    const r = await mproc(
      ['attach', String(victim.pid), '--json'],
      `describe\nread ${a} i32\nexit\n`,
    );
    const lines = r.stdout
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    expect(lines[0].type).toBe('attached');
    expect(lines[0].pid).toBe(victim.pid);
    const describeRes = lines.find(
      (o) => o.ok === true && o.data?.pid === victim.pid,
    );
    expect(describeRes).toBeDefined();
    const readRes = lines.find((o) => o.ok === true && o.data?.addr === a);
    expect(readRes).toBeDefined();
    expect(typeof readRes.data.value).toBe('number');
    expect(lines.at(-1).type).toBe('detached');
    expect(r.code).toBe(0);
  });

  test('session write → undo works inside one attach (writeLog lives in-session)', async () => {
    const a = `0x${victim.addr.g_i64!.toString(16)}`;
    const r = await mproc(
      ['attach', String(victim.pid), '--json'],
      `write ${a} i64 0x1111\nundo\nexit\n`,
    );
    const lines = r.stdout
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    const undoRes = lines.find(
      (o) => o.ok === true && o.data?.reverted !== undefined,
    );
    expect(undoRes).toBeDefined();
    expect(undoRes.data.reverted).toBe(1);
  });
});

describe('mproc — introspection', () => {
  test('--version prints name + semver', async () => {
    const r = await mproc(['--version']);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toMatch(/^@memoryprocess\/cli \d+\.\d+\.\d+/);
    const r2 = await mproc(['-v']);
    expect(r2.stdout.trim()).toBe(r.stdout.trim());
  });

  test('regions lists committed regions with hex bases', async () => {
    const r = await mproc(['regions', String(victim.pid), '--json']);
    expect(r.code).toBe(0);
    const env = envelope(r.stdout);
    expect(env.ok).toBe(true);
    expect(env.data.length).toBeGreaterThan(0);
    const reg = env.data[0];
    expect(reg.base).toMatch(/^0x[0-9a-f]+$/);
    expect(typeof reg.size).toBe('number');
    expect(reg.state).toBe('MEM_COMMIT');
    expect(reg.type).toMatch(/^MEM_|^0x/);
    // victim.exe's image region must be in the walk
    const mods = envelope(
      (await mproc(['modules', String(victim.pid), '--json'])).stdout,
    ).data;
    const vbase = mods.find(
      (m: { name: string }) => m.name === 'victim.exe',
    ).base;
    expect(env.data.some((x: { base: string }) => x.base === vbase)).toBe(true);
  });

  test('regions human table prints headers', async () => {
    const r = await mproc(['regions', String(victim.pid)]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('BASE');
    expect(r.stdout).toContain('PROTECT');
    expect(r.stdout).toMatch(/0x[0-9a-f]+/);
  });

  test('threads lists numeric tids incl. a resumable one', async () => {
    const r = await mproc(['threads', String(victim.pid), '--json']);
    expect(r.code).toBe(0);
    const env = envelope(r.stdout);
    expect(env.ok).toBe(true);
    expect(env.data.length).toBeGreaterThan(0);
    expect(
      env.data.every((t: { tid: number }) => Number.isInteger(t.tid)),
    ).toBe(true);
  });

  test('suspend + resume round-trips a victim thread', async () => {
    const tids = envelope(
      (await mproc(['threads', String(victim.pid), '--json'])).stdout,
    ).data.map((t: { tid: number }) => t.tid);
    const tid = tids[0];
    const s = await mproc([
      'suspend',
      String(victim.pid),
      String(tid),
      '--json',
    ]);
    expect(envelope(s.stdout).data).toMatchObject({ tid, suspended: true });
    const rr = await mproc([
      'resume',
      String(victim.pid),
      String(tid),
      '--json',
    ]);
    expect(envelope(rr.stdout).data).toMatchObject({ tid, resumed: true });
  });
});

describe('mproc — widened int types', () => {
  test('read u8/u16/i8/i16 hit the narrow decode path', async () => {
    for (const t of ['u8', 'u16', 'i8', 'i16']) {
      const r = await mproc([
        'read',
        String(victim.pid),
        `0x${victim.addr.g_u8!.toString(16)}`,
        t,
        '--json',
      ]);
      expect(r.code).toBe(0);
      const env = envelope(r.stdout);
      expect(env.ok).toBe(true);
      expect(typeof env.data.value).toBe('number');
    }
    // known victim globals: g_u8 = 0x7f, g_u16 = 0xbeef
    const u8 = envelope(
      (
        await mproc([
          'read',
          String(victim.pid),
          `0x${victim.addr.g_u8!.toString(16)}`,
          'u8',
          '--json',
        ])
      ).stdout,
    ).data.value;
    expect(u8).toBe(0x7f);
    const u16 = envelope(
      (
        await mproc([
          'read',
          String(victim.pid),
          `0x${victim.addr.g_u16!.toString(16)}`,
          'u16',
          '--json',
        ])
      ).stdout,
    ).data.value;
    expect(u16).toBe(0xbeef);
  });

  test('write i8 round-trips through writeBuffer + undo', async () => {
    const a = `0x${victim.addr.g_u8!.toString(16)}`;
    const v0 = envelope(
      (await mproc(['read', String(victim.pid), a, 'u8', '--json'])).stdout,
    ).data.value;
    const w = await mproc([
      'write',
      String(victim.pid),
      a,
      'i8',
      '-5',
      '--json',
    ]);
    expect(envelope(w.stdout).ok).toBe(true);
    const back = envelope(
      (await mproc(['read', String(victim.pid), a, 'i8', '--json'])).stdout,
    ).data.value;
    expect(back).toBe(-5);
    await mproc(['undo', String(victim.pid), '1', '--json']);
    const restored = envelope(
      (await mproc(['read', String(victim.pid), a, 'u8', '--json'])).stdout,
    ).data.value;
    expect(restored).toBe(v0);
  });
});

describe('mproc — errors', () => {
  test('unknown command → exit 1 with INVALID_ARGS envelope', async () => {
    const r = await mproc(['frobnicate', '--json']);
    expect(r.code).toBe(1);
    const env = envelope(r.stdout);
    expect(env.ok).toBe(false);
    expect(env.error.code).toBe('INVALID_ARGS');
  });

  test('missing args → exit 1', async () => {
    const r = await mproc(['read', '--json']);
    expect(r.code).toBe(1);
    expect(envelope(r.stdout).error.code).toBe('INVALID_ARGS');
  });

  test('unknown pid → open fails with a typed code', async () => {
    const r = await mproc(['describe', '2147483000', '--json']);
    expect(r.code).toBe(1);
    const env = envelope(r.stdout);
    expect(env.ok).toBe(false);
    // the native layer reports OPEN_FAILED for a pid OpenProcess rejects;
    // PROCESS_NOT_FOUND only fires for name lookups — either is a typed code.
    expect(['PROCESS_NOT_FOUND', 'OPEN_FAILED']).toContain(env.error.code);
  });

  test('bad address → error envelope, not a crash', async () => {
    const r = await mproc([
      'read',
      String(victim.pid),
      'notanaddr',
      'i32',
      '--json',
    ]);
    expect(r.code).toBe(1);
    expect(envelope(r.stdout).ok).toBe(false);
  });
});
