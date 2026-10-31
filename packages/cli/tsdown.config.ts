import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  dts: false,
  outDir: 'dist',
  clean: true,
  // @memoryprocess/core is a real dependency the consumer installs - never bundled.
  external: [/\.node$/, '@memoryprocess/core', '@memoryprocess/bindings'],
});
