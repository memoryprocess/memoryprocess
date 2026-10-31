#!/usr/bin/env node
/**
 * @memoryprocess/mcp -- MCP server exposing the memoryprocess toolkit to
 * LLM agents over stdio (the primary agentic surface).
 *
 * Usage:
 *   memoryprocess-mcp              # serve MCP over stdio
 *   memoryprocess-mcp --no-eval    # omit the eval_js tool (restricted mode)
 *   memoryprocess-mcp --help       # list tools + exit
 *   memoryprocess-mcp --version
 *
 * Env: MEMP_NO_EVAL=1 is equivalent to --no-eval.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createSessions, TOOL_DEFS, toolNames, callTool } from './tools.js';

const dir = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(dir, '..', 'package.json'), 'utf8'),
) as { name: string; version: string };

const argv = process.argv.slice(2);
const evalEnabled =
  !argv.includes('--no-eval') && process.env.MEMP_NO_EVAL !== '1';

if (argv.includes('--version') || argv.includes('-v')) {
  console.log(`${pkg.name} ${pkg.version}`);
  process.exit(0);
}

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`${pkg.name} ${pkg.version}`);
  console.log(
    'MCP server exposing the memoryprocess toolkit to LLM agents (stdio).',
  );
  console.log('');
  console.log('Usage: memoryprocess-mcp [--no-eval] [--help] [--version]');
  console.log('       MEMP_NO_EVAL=1 is equivalent to --no-eval');
  console.log('');
  console.log('Session model: proc_open returns a handle; every mem_* tool');
  console.log('takes it as `session`. Writes are journaled (mem_journal) and');
  console.log('reversible (mem_undo); mem_write supports dryRun previews.');
  console.log('');
  console.log('Tools:');
  const names = toolNames({ evalEnabled });
  const width = Math.max(...names.map((n) => n.length));
  for (const n of names) {
    const def = TOOL_DEFS[n]!;
    console.log(`  ${n.padEnd(width)}  ${def.description}`);
  }
  if (!evalEnabled)
    console.log('\n(eval_js is disabled by --no-eval / MEMP_NO_EVAL=1)');
  process.exit(0);
}

const sessions = createSessions();
const server = new McpServer(
  { name: pkg.name, version: pkg.version },
  {
    instructions:
      'Process-memory toolkit. proc_open a target to get a session handle; ' +
      'all mem_* tools take it. Writes are journaled: mem_write with ' +
      'dryRun:true previews, mem_undo reverts. Prefer the coarse tools; ' +
      'eval_js is the escape hatch for anything else.',
  },
);

for (const name of toolNames({ evalEnabled })) {
  const def = TOOL_DEFS[name]!;
  server.registerTool(
    name,
    {
      description: def.description,
      inputSchema: def.schema,
      annotations: {
        readOnlyHint: !def.destructive,
        destructiveHint: def.destructive === true,
      },
    },
    async (args) => {
      const result = await callTool(
        sessions,
        name,
        args as Record<string, unknown>,
        { evalEnabled },
      );
      // structuredContent must be a JSON object -- wrap scalars/arrays.
      const data =
        result.ok === true
          ? result.data !== null &&
            typeof result.data === 'object' &&
            !Array.isArray(result.data)
            ? (result.data as Record<string, unknown>)
            : { result: result.data }
          : undefined;
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        structuredContent: data,
        isError: result.ok !== true,
      };
    },
  );
}

const shutdown = () => {
  try {
    sessions.closeAll();
  } finally {
    process.exit(0);
  }
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write(
  `${pkg.name} ${pkg.version} ready on stdio (${toolNames({ evalEnabled }).length} tools${evalEnabled ? '' : ', eval_js disabled'})\n`,
);
