// Quickstart for @memoryprocess/core -- Windows only.
//
// Run against an installed release:
//   npm i @memoryprocess/core
//   node examples/quickstart.mjs notepad.exe
//
// Or inside this repo (dev workspace resolves TS sources via Bun):
//   bun examples/quickstart.mjs notepad.exe
//
// Usage: node quickstart.mjs [process-name-or-pid]   (defaults to self)

import { Process } from '@memoryprocess/core';

const target = process.argv[2];

let proc;
if (target === undefined) {
  // No argument: open THIS process (always safe -- read-only).
  proc = Process.openReadOnly(process.pid);
  console.log(`opened self pid=${proc.pid}`);
} else {
  // Name or numeric pid. `using` guarantees CloseHandle on scope exit;
  // the try/finally below does the same thing explicitly for clarity.
  const nameOrPid = /^\d+$/.test(target) ? Number(target) : target;
  proc = Process.open(nameOrPid);
}

try {
  const mod = proc.modules()[0];
  if (!mod) throw new Error('no modules -- is the target alive?');

  console.log(`pid=${proc.pid}  arch=${proc.isWow64 ? 'x86 (WOW64)' : 'x64'}`);
  console.log(`main module: ${mod.path}`);
  console.log(
    `  base=0x${mod.base.toString(16)}  size=0x${mod.size.toString(16)}`,
  );

  // A real read: the 'MZ' magic at the module base (0x5A4D little-endian).
  const mz = proc.readUInt16(mod.base);
  console.log(
    `first 2 bytes at base = 0x${mz.toString(16)} (${mz === 0x5a4d ? 'MZ ok' : 'unexpected'})`,
  );

  const regions = proc.regions();
  console.log(`${regions.length} committed memory regions`);
} finally {
  proc.close();
}
