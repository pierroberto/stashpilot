import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  splitting: true,
  sourcemap: false,
  minify: false,
  shims: false,
  banner: {
    js: [
      '#!/usr/bin/env node',
      "import { createRequire as __spilotCreateRequire } from 'node:module';",
      'const require = __spilotCreateRequire(import.meta.url);',
    ].join('\n'),
  },
  // Bundle runtime dependencies: one pre-resolved file graph starts measurably faster.
  noExternal: [/^(?!react-devtools-core)/],
  env: { NODE_ENV: 'production' },
  // Ink only loads react-devtools-core when DEV=true; it is never needed at runtime.
  external: ['react-devtools-core'],
});
