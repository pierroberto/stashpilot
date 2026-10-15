/**
 * Builds standalone `spilot` executables with Bun. CI-only: npm users never need Bun.
 *
 *   bun scripts/build-binaries.ts                 # all release targets
 *   bun scripts/build-binaries.ts bun-linux-x64   # selected targets
 *
 * Equivalent to `bun build ./src/cli.ts --compile --outfile dist/spilot` per target, plus a
 * stub for `react-devtools-core`: Ink imports it only when DEV=true, but Bun would otherwise
 * resolve it eagerly inside the compiled binary.
 */
import type { BunPlugin } from 'bun';

const TARGETS = {
  'bun-darwin-arm64': 'spilot-darwin-arm64',
  'bun-darwin-x64': 'spilot-darwin-x64',
  'bun-linux-x64': 'spilot-linux-x64',
  'bun-linux-arm64': 'spilot-linux-arm64',
  'bun-windows-x64': 'spilot-windows-x64.exe',
} as const;

type Target = keyof typeof TARGETS;

const stubDevtools: BunPlugin = {
  name: 'stub-react-devtools-core',
  setup(build) {
    build.onResolve({ filter: /^react-devtools-core$/ }, () => ({
      path: 'react-devtools-core',
      namespace: 'stub',
    }));
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: 'export default { initialize() {}, connectToDevTools() {} };',
      loader: 'js',
    }));
  },
};

const requested = process.argv.slice(2);
const targets = (requested.length > 0 ? requested : Object.keys(TARGETS)) as Target[];

for (const target of targets) {
  const name = TARGETS[target];
  if (!name) throw new Error(`Unknown target: ${target}`);
  const outfile = `dist/${name}`;
  const result = await Bun.build({
    entrypoints: ['./src/cli.ts'],
    compile: { target, outfile },
    minify: true,
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [stubDevtools],
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
  console.log(`built ${outfile}`);
}
