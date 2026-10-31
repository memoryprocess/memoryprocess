import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  outDir: 'dist',
  clean: true,
  // The native .node is provided by @memoryprocess/bindings - external, never bundled.
  external: [/\.node$/, '@memoryprocess/bindings'],
});
