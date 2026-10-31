/**
 * bindings-arg-validation -- 1.0.0 audit T1: uniform argument-type checks at
 * the N-API boundary plus the writeValue int64/uint64/pointer contract.
 *
 * With NAPI_DISABLE_CPP_EXCEPTIONS, `As<Napi::Number>()`/`As<Napi::BigInt>()`
 * on a wrong-typed arg is an unchecked static_cast: the raw napi getter fails
 * and leaves the out-param UNINITIALIZED (garbage HANDLE/address/value), and
 * no C++ exception is raised. These tests prove every validated function now
 * throws a real TypeError before touching the value, and that writeValue's
 * 64-bit path honors the documented `number|bigint` TS contract.
 *
 * IMPORTANT: run `taskkill /F /IM victim.exe` before `bun test`.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Process, Protection } from '../src/index.js';
import { native } from '@memoryprocess/bindings';
import { spawnVictim, type Victim } from './victim.js';

// Additive exports may not be declared on the Native interface yet.
const nat = native as any;

let victim: Victim;
let proc: Process;
let rawHandle = 0;
beforeAll(async () => {
  victim = await spawnVictim();
  proc = Process.open(victim.pid);
  rawHandle = nat.openProcess(victim.pid).handle;
});
afterAll(() => {
  if (rawHandle) nat.closeHandle(rawHandle);
  proc?.close();
  victim?.kill();
});

function probe<T>(fn: () => T): { threw: boolean; err?: Error; val?: T } {
  try {
    return { threw: false, val: fn() };
  } catch (e: any) {
    return {
      threw: true,
      err: e instanceof Error ? e : new Error(String(e)),
    };
  }
}

const BADS: [string, unknown][] = [
  ['string', 'not-a-number'],
  ['object', { x: 1 }],
  ['null', null],
  ['array', [1, 2]],
  ['boolean', true],
];

/* ===== writeValue int64/uint64/pointer: number|bigint contract ===== */
describe('writeValue 64-bit path accepts number|bigint, rejects other types', () => {
  test('writeValue uint64 with a NUMBER writes correctly (no garbage)', () => {
    const a = proc.alloc(0x100, Protection.PAGE_READWRITE);
    try {
      expect(nat.writeValue(rawHandle, Number(a), 'uint64', 0x11223344)).toBe(
        true,
      );
      expect(nat.readValue(rawHandle, Number(a), 'uint64')).toBe(0x11223344n);
    } finally {
      proc.free(a);
    }
  });

  test('writeValue int64/pointer with a NUMBER writes correctly', () => {
    const a = proc.alloc(0x100, Protection.PAGE_READWRITE);
    try {
      expect(nat.writeValue(rawHandle, Number(a), 'int64', -5)).toBe(true);
      expect(nat.readValue(rawHandle, Number(a), 'int64')).toBe(-5n);
      expect(nat.writeValue(rawHandle, Number(a), 'pointer', Number(a))).toBe(
        true,
      );
      expect(nat.readValue(rawHandle, Number(a), 'pointer')).toBe(a);
    } finally {
      proc.free(a);
    }
  });

  test('writeValue int64/uint64/pointer with a BigInt still works', () => {
    const a = proc.alloc(0x100, Protection.PAGE_READWRITE);
    try {
      expect(
        nat.writeValue(rawHandle, Number(a), 'uint64', 0xdeadbeefcafe1234n),
      ).toBe(true);
      expect(nat.readValue(rawHandle, Number(a), 'uint64')).toBe(
        0xdeadbeefcafe1234n,
      );
      expect(nat.writeValue(rawHandle, Number(a), 'int64', -1n)).toBe(true);
      expect(nat.readValue(rawHandle, Number(a), 'int64')).toBe(-1n);
    } finally {
      proc.free(a);
    }
  });

  test('writeValue 64-bit path with string/object -> TypeError, nothing written', () => {
    const a = proc.alloc(0x100, Protection.PAGE_READWRITE);
    try {
      proc.writeBuffer(a, Buffer.alloc(8, 0xaa));
      for (const [name, bad] of BADS) {
        for (const t of ['int64', 'uint64', 'pointer']) {
          const r = probe(() =>
            nat.writeValue(rawHandle, Number(a), t, bad as any),
          );
          expect(r.threw, `${t} value=${name}`).toBe(true);
          expect(r.err, `${t} value=${name}`).toBeInstanceOf(TypeError);
        }
      }
      // Sentinel bytes untouched -- no garbage write reached the target.
      expect(proc.readBuffer(a, 8).equals(Buffer.alloc(8, 0xaa))).toBe(true);
    } finally {
      proc.free(a);
    }
  });

  test('writeValue 32-bit path with string/bigint -> TypeError', () => {
    const a = proc.alloc(0x100, Protection.PAGE_READWRITE);
    try {
      for (const bad of ['nope', 1n, {}, null]) {
        const r = probe(() =>
          nat.writeValue(rawHandle, Number(a), 'int32', bad as any),
        );
        expect(r.threw, `value=${String(bad)}`).toBe(true);
        expect(r.err).toBeInstanceOf(TypeError);
      }
    } finally {
      proc.free(a);
    }
  });
});

/* ===== uniform IsNumber/IsString/IsBuffer guards -> TypeError ===== */
describe('arg-type validation throws TypeError (no garbage/crash)', () => {
  const ADDR = 0x1000; // bogus but well-formed; type check must fire first

  test('readBuffer/writBuffer arg types', () => {
    for (const [name, bad] of BADS) {
      for (const slot of [0, 1, 2]) {
        const args: any[] = [rawHandle, ADDR, 16];
        args[slot] = bad;
        const r = probe(() => nat.readBuffer(...(args as [any, any, any])));
        expect(r.threw, `readBuffer arg${slot}=${name}`).toBe(true);
        expect(r.err, `readBuffer arg${slot}=${name}`).toBeInstanceOf(
          TypeError,
        );
      }
      for (const slot of [0, 1]) {
        const args: any[] = [rawHandle, ADDR, Buffer.alloc(4)];
        args[slot] = bad;
        const r = probe(() => nat.writeBuffer(...(args as [any, any, any])));
        expect(r.threw, `writeBuffer arg${slot}=${name}`).toBe(true);
        expect(r.err).toBeInstanceOf(TypeError);
      }
      const r = probe(() =>
        nat.writeBuffer(rawHandle, ADDR, 'not-a-buffer' as any),
      );
      expect(r.threw).toBe(true);
      expect(r.err).toBeInstanceOf(TypeError);
    }
  });

  test('allocMemory/freeMemory/protectMemory arg types', () => {
    for (const [name, bad] of BADS) {
      let r = probe(() => nat.allocMemory(bad as any, 0x100, 0x40));
      expect(r.threw, `alloc arg0=${name}`).toBe(true);
      expect(r.err).toBeInstanceOf(TypeError);
      r = probe(() => nat.allocMemory(rawHandle, bad as any, 0x40));
      expect(r.threw, `alloc arg1=${name}`).toBe(true);
      expect(r.err).toBeInstanceOf(TypeError);
      r = probe(() => nat.freeMemory(rawHandle, bad as any));
      expect(r.threw, `free arg1=${name}`).toBe(true);
      expect(r.err).toBeInstanceOf(TypeError);
      r = probe(() => nat.protectMemory(rawHandle, ADDR, 16, bad as any));
      expect(r.threw, `protect arg3=${name}`).toBe(true);
      expect(r.err).toBeInstanceOf(TypeError);
    }
  });

  test('protectMemory with only 3 args -> TypeError (arity now 4)', () => {
    const r = probe(() => nat.protectMemory(rawHandle, 0x1000, 16));
    expect(r.threw).toBe(true);
    expect(r.err).toBeInstanceOf(TypeError);
  });

  test('readValue/readSafe/flushInstructions arg types', () => {
    for (const [name, bad] of BADS) {
      let r = probe(() => nat.readValue(rawHandle, ADDR, bad as any));
      expect(r.threw, `readValue type=${name}`).toBe(true);
      expect(r.err).toBeInstanceOf(TypeError);
      r = probe(() => nat.readValue(bad as any, ADDR, 'int32'));
      expect(r.threw, `readValue handle=${name}`).toBe(true);
      expect(r.err).toBeInstanceOf(TypeError);
      r = probe(() => nat.readSafe(rawHandle, bad as any, 16));
      expect(r.threw, `readSafe addr=${name}`).toBe(true);
      expect(r.err).toBeInstanceOf(TypeError);
      r = probe(() => nat.readSafe(rawHandle, ADDR, bad as any));
      expect(r.threw, `readSafe size=${name}`).toBe(true);
      expect(r.err).toBeInstanceOf(TypeError);
      r = probe(() => nat.flushInstructions(rawHandle, ADDR, bad as any));
      expect(r.threw, `flush size=${name}`).toBe(true);
      expect(r.err).toBeInstanceOf(TypeError);
    }
  });

  test('readValue non-string type arg -> TypeError (was unchecked Utf8Value)', () => {
    for (const bad of [123, {}, null, true]) {
      const r = probe(() => nat.readValue(rawHandle, 0x1000, bad as any));
      expect(r.threw, `type=${String(bad)}`).toBe(true);
      expect(r.err).toBeInstanceOf(TypeError);
    }
  });

  test('scan(pid, pattern) arg types -> TypeError', () => {
    for (const bad of ['pid', {}, null]) {
      expect(
        probe(() => nat.scan(bad as any, 'DE AD')).threw,
        `pid=${String(bad)}`,
      ).toBe(true);
    }
    // A non-string pattern (e.g. a Number) must throw TypeError, not read a
    // bogus Utf8Value from an unchecked As<String>() cast.
    for (const bad of [1234, {}, null, ['DE', 'AD']]) {
      const r = probe(() => nat.scan(proc.pid, bad as any));
      expect(r.threw, `pattern=${String(bad)}`).toBe(true);
      expect(r.err).toBeInstanceOf(TypeError);
    }
    // Valid pattern still returns a promise (sync throw would mean over-guard).
    const p = nat.scan(proc.pid, '90 90', { start: 0, end: 0x1000 });
    expect(p instanceof Promise || typeof p?.then === 'function').toBe(true);
    p.catch(() => {}); // pattern may legitimately error on range; not asserted
  });

  test('well-typed calls still work after validation', () => {
    const a = proc.alloc(0x100, Protection.PAGE_READWRITE);
    try {
      expect(
        nat.readBuffer(rawHandle, Number(a), 4).equals(Buffer.alloc(4)),
      ).toBe(true);
      expect(
        nat.writeBuffer(rawHandle, Number(a), Buffer.from([1, 2, 3, 4])),
      ).toBe(true);
      expect(nat.readValue(rawHandle, Number(a), 'int32')).toBe(0x04030201);
      expect(typeof nat.protectMemory(rawHandle, Number(a), 0x100, 0x04)).toBe(
        'number',
      );
      expect(nat.readSafe(rawHandle, Number(a), 4).length).toBe(4);
      expect(typeof nat.flushInstructions(rawHandle, Number(a), 4)).toBe(
        'boolean',
      );
    } finally {
      proc.free(a);
    }
  });
});
