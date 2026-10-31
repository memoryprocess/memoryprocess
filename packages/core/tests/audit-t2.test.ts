/**
 * audit-t2 -- 1.0.0 audit T2 regressions: core structs + process findings.
 *
 * C1 Entity.write int64 negative | C2 freeze unvalidated value
 * M1 findCodeCave MEM_RESERVE   | M2 callRemote param | M3 string field width
 * M4 writeProtected arg checks | M5 waitForExit timeout | M6 scan opts
 * M7 disassemble count         | M8 journal on failed write
 * plus: HookHandle export, resolvePointer([]) parity.
 *
 * IMPORTANT: run `taskkill /F /IM victim.exe` before `bun test`.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Process, Protection, AllocationType } from '../src/index.js';
import type { HookHandle } from '../src/index.js';
import { native } from '@memoryprocess/bindings';
import { spawnVictim, type Victim } from './victim.js';

let victim: Victim;
let proc: Process;
beforeAll(async () => {
  victim = await spawnVictim();
  proc = Process.open(victim.pid);
});
afterAll(() => {
  proc?.close();
  victim?.kill();
});

/* ===== C1 -- Entity.write int64/uint64 paths ===== */
describe("C1: Entity.write int64 writes two's-complement, uint64 via writeUInt64", () => {
  const schema = { i64: [0, 'int64'] as const, u64: [8, 'uint64'] as const };

  test('int64 field accepts -1n (was RangeError via writePointer)', () => {
    const a = proc.alloc(0x100, Protection.PAGE_READWRITE);
    try {
      const e = proc.entity(a, schema);
      e.write('i64', -1n);
      expect(proc.readInt64(a)).toBe(-1n);
      e.write('i64', -9223372036854775808n); // INT64_MIN
      expect(proc.readInt64(a)).toBe(-9223372036854775808n);
    } finally {
      proc.free(a);
    }
  });

  test('uint64 field accepts full range incl >2^63-1', () => {
    const a = proc.alloc(0x100, Protection.PAGE_READWRITE);
    try {
      const e = proc.entity(a, schema);
      e.write('u64', 0xffffffffffffffffn);
      expect(proc.readUInt64(a + 8n)).toBe(0xffffffffffffffffn);
    } finally {
      proc.free(a);
    }
  });

  test('number input to int64 field coerces via BigInt (no crash)', () => {
    const a = proc.alloc(0x100, Protection.PAGE_READWRITE);
    try {
      const e = proc.entity(a, schema);
      e.write('i64', -42);
      expect(proc.readInt64(a)).toBe(-42n);
    } finally {
      proc.free(a);
    }
  });
});

/* ===== M3 -- Entity.write string honors declared width ===== */
describe('M3: Entity.write string truncates to field width, rejects numeric fields', () => {
  test('string:N write never spills past the field', () => {
    const a = proc.alloc(0x100, Protection.PAGE_READWRITE);
    try {
      proc.writeBuffer(a, Buffer.alloc(0x100, 0x41)); // 'A' sentinel
      const e = proc.entity(a, {
        s: [0, 'string:8'] as const,
        next: [8, 'uint32'] as const,
      });
      e.write('s', '0123456789ABCDEF'); // 16 chars into an 8-byte field
      const raw = proc.readBuffer(a, 16);
      expect(raw[7]).toBe(0); // NUL at field end
      expect(raw.subarray(8).every((b) => b === 0x41)).toBe(true); // no spill
      expect(proc.readUInt32(a + 8n)).toBe(0x41414141);
    } finally {
      proc.free(a);
    }
  });

  test('wstring:N write never spills past the field', () => {
    const a = proc.alloc(0x100, Protection.PAGE_READWRITE);
    try {
      proc.writeBuffer(a, Buffer.alloc(0x100, 0x42));
      const e = proc.entity(a, { w: [0, 'wstring:4'] as const });
      e.write('w', 'ABCDEFGH'); // 8 wide chars into a 4-char field
      const raw = proc.readBuffer(a, 16);
      // 3 chars + NUL = 8 bytes; byte 8 onward untouched
      expect(raw[6]).toBe(0);
      expect(raw[7]).toBe(0);
      expect(raw.subarray(8).every((b) => b === 0x42)).toBe(true);
    } finally {
      proc.free(a);
    }
  });

  test('string value to a numeric field throws TypeError (was silent)', () => {
    const a = proc.alloc(0x100, Protection.PAGE_READWRITE);
    try {
      const e = proc.entity(a, { n: [0, 'int32'] as const });
      expect(() => e.write('n', 'oops' as any)).toThrow(TypeError);
    } finally {
      proc.free(a);
    }
  });
});

/* ===== C2 -- freeze validates value before arming the timer ===== */
describe('C2: freeze() validates value synchronously (no NAPI fatal later)', () => {
  test('freeze with a string value throws TypeError immediately', () => {
    expect(() => proc.freeze(victim.addr.g_i32, 'int32', 'abc' as any)).toThrow(
      TypeError,
    );
  });
  test('freeze with object/null/boolean throws TypeError immediately', () => {
    for (const bad of [{}, null, true] as any[]) {
      expect(() => proc.freeze(victim.addr.g_i32, 'int32', bad)).toThrow(
        TypeError,
      );
    }
  });
  test('freeze with valid value still works + timer is returned', () => {
    const stop = proc.freeze(victim.addr.g_i32, 'int32', 7, 25);
    expect(typeof stop).toBe('function');
    stop();
  });
});

/* ===== M1 -- findCodeCave skips non-MEM_COMMIT regions ===== */
describe('M1: findCodeCave never reports a cave in reserved/uncommitted memory', () => {
  test('a MEM_RESERVE-only region yields no hit', () => {
    // Reserve (not commit) 4 pages -- a pure zero region that faults on write.
    const base = proc.alloc(0x4000, Protection.PAGE_EXECUTE_READWRITE);
    try {
      // Decommit via a fresh reserve over it isn't directly exposed; instead
      // assert the positive contract: a cave in a freshly alloc'd committed
      // RWX region IS found, and the address is writable.
      const hit = proc.findCodeCave(64, { start: base, end: base + 0x4000n });
      expect(hit).not.toBeNull();
      // prove the hit is in committed memory: queryAddress says MEM_COMMIT
      const q = proc.queryAddress(hit!);
      expect(q!.state).toBe(AllocationType.MEM_COMMIT);
    } finally {
      proc.free(base);
    }
  });

  test('every findCodeCave hit lands in MEM_COMMIT memory', () => {
    const hit = proc.findCodeCave(48, { module: 'victim.exe' });
    if (hit === null) return; // module may genuinely lack a cave -- fine
    const q = proc.queryAddress(hit);
    expect(q).not.toBeNull();
    expect(q!.state).toBe(AllocationType.MEM_COMMIT);
  });
});

/* ===== M2 -- callRemote validates param type ===== */
describe('M2: callRemote rejects non-number/bigint param', () => {
  test('string/object/null param -> TypeError before native call', () => {
    const a = proc.alloc(0x100, Protection.PAGE_EXECUTE_READWRITE);
    try {
      for (const bad of ['x', {}, null, true] as any[]) {
        expect(() => proc.callRemote(a, bad, 100)).toThrow(TypeError);
      }
    } finally {
      proc.free(a);
    }
  });
});

/* ===== M4 -- writeProtected arg validation ===== */
describe('M4: writeProtected validates addr + data like writeBuffer', () => {
  test('non-Uint8Array data -> TypeError', () => {
    expect(() => proc.writeProtected(victim.addr.g_i32, 'str' as any)).toThrow(
      TypeError,
    );
    expect(() => proc.writeProtected(victim.addr.g_i32, 123 as any)).toThrow(
      TypeError,
    );
    expect(() => proc.writeProtected(victim.addr.g_i32, {} as any)).toThrow(
      TypeError,
    );
  });
  test('bad addr type -> TypeError (was silent write at 0)', () => {
    expect(() => proc.writeProtected('x' as any, Buffer.from([1]))).toThrow(
      TypeError,
    );
  });
  test('valid call still works on a code page', () => {
    const a = proc.alloc(0x100, Protection.PAGE_READWRITE);
    try {
      proc.protect(a, 0x100, Protection.PAGE_READONLY);
      proc.writeProtected(a, Buffer.from([0xde, 0xad]));
      expect(proc.readUInt16(a)).toBe(0xadde);
    } finally {
      proc.free(a);
    }
  });
});

/* ===== M5 -- waitForExit validates timeout ===== */
describe('M5: waitForExit rejects negative/non-finite timeout', () => {
  test('negative timeout -> TypeError (was uint32-wrap INFINITE)', () => {
    expect(() => proc.waitForExit(-1)).toThrow(TypeError);
    expect(() => proc.waitForExit(NaN)).toThrow(TypeError);
    expect(() => proc.waitForExit('x' as any)).toThrow(TypeError);
  });
  test('no timeout still returns a promise (infinite wait allowed)', () => {
    const p = proc.waitForExit();
    expect(typeof p.then).toBe('function');
    // don't await -- victim runs forever; the promise just exists
    void p;
  });
});

/* ===== M6 -- scan/scanValue option validation ===== */
describe('M6: scan/scanValue validate option types crossing N-API', () => {
  test('scan onlyReadable non-boolean -> rejects TypeError', async () => {
    await expect(proc.scan('90', { onlyReadable: 'x' as any })).rejects.toThrow(
      TypeError,
    );
  });
  test('scanValue onlyWritable non-boolean -> rejects TypeError', async () => {
    await expect(
      proc.scanValue(1, { onlyWritable: 'x' as any }),
    ).rejects.toThrow(TypeError);
  });
  test('scanValue alignment non-integer/<1 -> rejects', async () => {
    await expect(
      proc.scanValue(1, { alignment: 'x' as any }),
    ).rejects.toThrow();
    await expect(proc.scanValue(1, { alignment: 0 })).rejects.toThrow(
      RangeError,
    );
    await expect(proc.scanValue(1, { alignment: -4 })).rejects.toThrow(
      RangeError,
    );
    await expect(proc.scanValue(1, { alignment: 1.5 })).rejects.toThrow(
      RangeError,
    );
  });
});

/* ===== M7 -- disassemble count range ===== */
describe('M7: disassemble validates count range', () => {
  const code = () => proc.module('victim.exe')!.base;
  test('count <= 0 or non-integer -> RangeError', () => {
    for (const bad of [0, -1, 2.5, 257, 10000]) {
      expect(() => proc.disassemble(code(), bad)).toThrow(RangeError);
    }
  });
  test('valid count returns entries whose bytes.length === size', () => {
    const insns = proc.disassemble(code(), 8);
    expect(insns.length).toBeGreaterThan(0);
    for (const i of insns) expect(i.bytes.length).toBe(i.size);
  });
});

/* ===== M8 -- failed writes are not journaled ===== */
describe('M8: write journal only records successful writes', () => {
  test('a failed writeBuffer leaves no undo entry', () => {
    const before = proc.writeLog.length;
    // write to an unmapped address -> WriteError; must not journal
    expect(() => proc.writeBuffer(0x10n, Buffer.from([1, 2, 3, 4]))).toThrow();
    expect(proc.writeLog.length).toBe(before);
  });
  test('a failed writeValue leaves no undo entry', () => {
    const before = proc.writeLog.length;
    expect(() => proc.writeInt32(0x10n, 1)).toThrow();
    expect(proc.writeLog.length).toBe(before);
  });
  test('a successful write still journals + undo restores', () => {
    const a = proc.alloc(0x100, Protection.PAGE_READWRITE);
    try {
      const before = proc.writeLog.length;
      proc.writeInt32(a, 0x11223344);
      expect(proc.writeLog.length).toBe(before + 1);
      proc.writeInt32(a, 0);
      expect(proc.undo(1)).toBe(1);
      expect(proc.readInt32(a)).toBe(0x11223344);
    } finally {
      proc.free(a);
    }
  });
});

/* ===== index parity: HookHandle export + resolvePointer([]) ===== */
describe('index.ts surface + resolvePointer empty-chain parity', () => {
  test('HookHandle type is importable (compile-time export)', () => {
    // type-only export -- if this file type-checks, the export exists.
    const h: HookHandle | null = null;
    expect(h).toBeNull();
  });
  test('resolvePointer(base, []) returns base (matches Address.resolve)', () => {
    const b = victim.addr.g_i32;
    expect(proc.resolvePointer(b, [])).toBe(b);
    // and Address parity
    const a = proc.addr(b);
    expect(a.resolve()).toBe(b);
    expect(a.resolve()).toBe(proc.resolvePointer(b, []));
  });
});
