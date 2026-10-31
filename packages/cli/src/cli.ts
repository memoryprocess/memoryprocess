#!/usr/bin/env node
/**
 * @memoryprocess/cli -- `mproc`
 *
 * The Process API as composable commands. `--json` on every command emits the
 * machine contract from docs/json-conventions.md (bigint -> '0x...' hex strings,
 * scan hits as NDJSON, {ok,error:{code}} envelope); without it, a compact
 * human table. `mproc attach <pid>` holds a Process open and takes commands on
 * stdin -- that's the agentic session surface.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fail } from './out.js';
import { UsageError, parseFlags } from './parse.js';
import { COMMANDS, runCommand, USAGE } from './commands.js';
import { attach } from './session.js';

const pkg = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'),
    'utf8',
  ),
) as { name: string; version: string };

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  if (argv.includes('--version') || argv.includes('-v')) {
    console.log(`${pkg.name} ${pkg.version}`);
    return 0;
  }
  const { flags, pos } = parseFlags(argv);
  if (flags.rest.length)
    throw new UsageError(`unknown flag(s): ${flags.rest.join(' ')}`);

  const cmd = pos[0];
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    console.log(USAGE);
    return cmd ? 0 : 1;
  }

  if (cmd === 'attach') {
    const pidArg = pos[1];
    if (!pidArg) throw new UsageError('usage: mproc attach <pid> [--json]');
    const pid = Number(pidArg);
    if (!Number.isInteger(pid) || pid <= 0)
      throw new UsageError(`invalid pid '${pidArg}'`);
    return attach(pid, flags.json);
  }

  return runCommand(argv, null);
}

main()
  .then((code) => process.exit(code))
  .catch((e) => process.exit(fail(e, process.argv.includes('--json'))));
