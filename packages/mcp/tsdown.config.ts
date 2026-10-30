import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  dts: false,
  outDir: 'dist',
  clean: true,
  // Core, the MCP SDK and zod are real dependencies the consumer installs — never bundled.
  external: [
    /\.node$/,
    '@memoryprocess/core',
    '@memoryprocess/bindings',
    '@modelcontextprotocol/sdk',
    'zod',
  ],
});
