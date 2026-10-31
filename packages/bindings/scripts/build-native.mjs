// Build ONLY the native .node via node-gyp (no tsdown/tsc bundle).
// Used by the compat matrix so each Node version links against its own
// node.lib - a .node built against Node 24's node.lib can crash on Node 20.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// Bun hoists deps to the workspace root - walk up to find node-gyp.
const findNodeGyp = () => {
  let dir = root;
  for (let i = 0; i < 4; i++) {
    const p = join(dir, 'node_modules', 'node-gyp', 'bin', 'node-gyp.js');
    if (existsSync(p)) return p;
    const up = join(dir, '..');
    if (up === dir) break;
    dir = up;
  }
  return join(root, 'node_modules', 'node-gyp', 'bin', 'node-gyp.js');
};
const nodeGypJs = findNodeGyp();

const run = (args) => {
  const r = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (r.status !== 0)
    throw new Error(`node-gyp ${args.join(' ')} failed (${r.status})`);
};

try {
  run([nodeGypJs, 'clean']);
  run([nodeGypJs, 'configure', '--arch', 'x64']);
  run([nodeGypJs, 'build']);
  const out = join(root, 'build', 'Release', 'memoryprocess.node');
  if (!existsSync(out)) throw new Error('memoryprocess.node not produced');
  console.log('built', out);
} catch (e) {
  console.error('[fail] native build failed:', e.message);
  process.exit(1);
}
