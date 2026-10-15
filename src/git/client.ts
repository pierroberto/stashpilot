import { spawn } from 'node:child_process';
import { createLimiter, type Limiter } from '../utils/limit.js';
import { formatCommand } from '../utils/shell.js';

export class GitError extends Error {
  constructor(
    readonly args: readonly string[],
    readonly exitCode: number | null,
    readonly stdout: string,
    readonly stderr: string,
    message?: string,
  ) {
    super(message ?? GitError.describe(args, exitCode, stdout, stderr));
    this.name = 'GitError';
  }

  get command(): string {
    return formatCommand(this.args);
  }

  /** Git's own explanation of the failure, falling back to stdout (e.g. CONFLICT lines). */
  get detail(): string {
    return (this.stderr.trim() || this.stdout.trim() || `exit code ${this.exitCode}`).trim();
  }

  private static describe(
    args: readonly string[],
    exitCode: number | null,
    stdout: string,
    stderr: string,
  ): string {
    const detail = stderr.trim() || stdout.trim() || `exit code ${exitCode}`;
    return `\`${formatCommand(args)}\` failed: ${detail}`;
  }
}

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface RunOptions {
  /** Exit codes that should resolve instead of throwing. Defaults to `[0]`. */
  okExitCodes?: number[];
  /** Run ahead of queued background work. */
  urgent?: boolean;
}

/**
 * Config overrides applied to every Git call so output is deterministic and parseable
 * regardless of user configuration. None of these change repository state.
 */
const READ_CONFIG = ['-c', 'core.quotePath=false', '-c', 'color.ui=false'];

interface CacheEntry {
  started: boolean;
  promise: Promise<RunResult>;
}

const MAX_BUFFER = 256 * 1024 * 1024;

export interface GitClientOptions {
  cwd: string;
  /** Maximum number of concurrent Git subprocesses. */
  concurrency?: number;
}

/**
 * Thin, non-blocking wrapper around the Git CLI. Read-only commands are cached until
 * `invalidate()` is called (on explicit refresh or after a mutating action).
 */
export class GitClient {
  readonly cwd: string;
  private readonly limit: Limiter;
  private readonly cache = new Map<string, CacheEntry>();

  constructor({ cwd, concurrency = 4 }: GitClientOptions) {
    this.cwd = cwd;
    this.limit = createLimiter(concurrency);
  }

  /** Runs a read-only Git command, sharing results for identical arguments. */
  read(args: string[], options: RunOptions = {}): Promise<RunResult> {
    const key = JSON.stringify([args, options.okExitCodes ?? [0]]);
    const cached = this.cache.get(key);
    // An urgent request must not wait behind a queued background copy of the same command.
    if (cached && (cached.started || !options.urgent)) return cached.promise;
    const entry: CacheEntry = { started: false, promise: Promise.resolve() as never };
    entry.promise = this.limit(() => {
      entry.started = true;
      return this.spawn(args, options);
    }, options.urgent);
    this.cache.set(key, entry);
    // Do not cache failures: a later retry may succeed.
    entry.promise.catch(() => {
      if (this.cache.get(key) === entry) this.cache.delete(key);
    });
    return entry.promise;
  }

  /** Runs a read-only command without caching, e.g. working tree status checks. */
  readFresh(args: string[], options: RunOptions = {}): Promise<RunResult> {
    return this.limit(() => this.spawn(args, options), options.urgent);
  }

  /** Runs a mutating command. Never cached; always invalidates the cache afterwards. */
  async mutate(args: string[], options: RunOptions = {}): Promise<RunResult> {
    try {
      return await this.spawn(args, options);
    } finally {
      this.invalidate();
    }
  }

  invalidate(): void {
    this.cache.clear();
  }

  private spawn(args: string[], { okExitCodes = [0] }: RunOptions): Promise<RunResult> {
    return new Promise((resolve, reject) => {
      const child = spawn('git', [...READ_CONFIG, ...args], {
        cwd: this.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        env: {
          ...process.env,
          GIT_PAGER: 'cat',
          GIT_TERMINAL_PROMPT: '0',
          // Prevent `git status` from refreshing the index while we only inspect state.
          GIT_OPTIONAL_LOCKS: '0',
        },
      });
      const out: Buffer[] = [];
      const err: Buffer[] = [];
      let size = 0;
      let overflow = false;

      child.stdout.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BUFFER) {
          overflow = true;
          child.kill();
          return;
        }
        out.push(chunk);
      });
      child.stderr.on('data', (chunk: Buffer) => err.push(chunk));

      child.on('error', (error: NodeJS.ErrnoException) => {
        const message =
          error.code === 'ENOENT'
            ? 'Git executable not found. Install Git and make sure it is on your PATH.'
            : `Failed to run git: ${error.message}`;
        reject(new GitError(args, null, '', '', message));
      });

      child.on('close', (code) => {
        const stdout = Buffer.concat(out).toString('utf8');
        const stderr = Buffer.concat(err).toString('utf8');
        if (overflow) {
          reject(
            new GitError(args, code, '', '', `Output of \`${formatCommand(args)}\` is too large.`),
          );
          return;
        }
        const exitCode = code ?? -1;
        if (okExitCodes.includes(exitCode)) {
          resolve({ stdout, stderr, exitCode });
        } else {
          reject(new GitError(args, code, stdout, stderr));
        }
      });
    });
  }
}

export class NotARepositoryError extends Error {
  constructor(readonly detail: string) {
    super('Not a Git repository (or any of the parent directories).');
    this.name = 'NotARepositoryError';
  }
}

/** Resolves the repository top-level directory for `cwd`, or throws NotARepositoryError. */
export async function findRepositoryRoot(cwd: string): Promise<string> {
  const probe = new GitClient({ cwd, concurrency: 1 });
  try {
    const { stdout } = await probe.readFresh(['rev-parse', '--show-toplevel']);
    const root = stdout.trim();
    if (!root) throw new NotARepositoryError('Bare repositories are not supported.');
    return root;
  } catch (error) {
    if (error instanceof GitError && error.exitCode !== null) {
      throw new NotARepositoryError(error.detail);
    }
    throw error;
  }
}
