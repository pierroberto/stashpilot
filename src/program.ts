import pkg from '../package.json' with { type: 'json' };
import { GitClient, NotARepositoryError, findRepositoryRoot } from './git/client.js';
import { formatStashJson, formatStashTable, loadStashSummaries } from './list.js';
import { errorMessage } from './utils/errors.js';

export const VERSION: string = pkg.version;

export const USAGE = `spilot ${VERSION}
The missing interface for Git stashes: preview, search, and clean up stashes without leaving the terminal.

Usage:
  spilot                 Open the interactive stash browser
  spilot list            Print a summary of all stashes
  spilot list --json     Print stash metadata as JSON

Options:
  -h, --help             Show this help
  -v, --version          Show the version

Run spilot inside a Git repository. Press ? in the interface for keyboard shortcuts.`;

export interface CliIO {
  cwd: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  isTTY: boolean;
}

type Parsed =
  | { command: 'help' }
  | { command: 'version' }
  | { command: 'tui' }
  | { command: 'list'; json: boolean }
  | { command: 'error'; message: string };

export function parseArgs(argv: readonly string[]): Parsed {
  if (argv.includes('-h') || argv.includes('--help')) return { command: 'help' };
  if (argv.includes('-v') || argv.includes('--version')) return { command: 'version' };
  const [command, ...rest] = argv;
  if (command === undefined) return { command: 'tui' };
  if (command === 'list') {
    const unknown = rest.filter((a) => a !== '--json');
    if (unknown.length > 0) return { command: 'error', message: `Unknown option: ${unknown[0]}` };
    return { command: 'list', json: rest.includes('--json') };
  }
  if (command === 'help') return { command: 'help' };
  return { command: 'error', message: `Unknown command: ${command}` };
}

/** Runs the CLI and returns the process exit code. */
export async function runCli(argv: readonly string[], io: CliIO): Promise<number> {
  const parsed = parseArgs(argv);
  switch (parsed.command) {
    case 'help':
      io.stdout(`${USAGE}\n`);
      return 0;
    case 'version':
      io.stdout(`${VERSION}\n`);
      return 0;
    case 'error':
      io.stderr(`spilot: ${parsed.message}\n\n${USAGE}\n`);
      return 2;
  }

  let repoRoot: string;
  try {
    repoRoot = await findRepositoryRoot(io.cwd);
  } catch (error) {
    if (error instanceof NotARepositoryError) {
      io.stderr(`spilot: not a Git repository: ${io.cwd}\nRun spilot inside a Git working tree.\n`);
    } else {
      io.stderr(`spilot: ${errorMessage(error)}\n`);
    }
    return 1;
  }

  try {
    if (parsed.command === 'list') {
      const git = new GitClient({ cwd: repoRoot, concurrency: 8 });
      const summaries = await loadStashSummaries(git);
      io.stdout(parsed.json ? formatStashJson(summaries) : formatStashTable(summaries));
      return 0;
    }

    if (!io.isTTY) {
      io.stderr(
        'spilot: interactive mode requires a terminal. Use `spilot list` or `spilot list --json` instead.\n',
      );
      return 1;
    }
    // Loaded lazily so `list`, `--help`, and `--version` never pay for React/Ink startup.
    const { runTui } = await import('./app/run.js');
    await runTui(repoRoot);
    return 0;
  } catch (error) {
    io.stderr(`spilot: ${errorMessage(error)}\n`);
    return 1;
  }
}
