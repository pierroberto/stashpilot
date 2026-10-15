import { afterEach, describe, expect, it } from 'vitest';
import { runCli, VERSION } from '../../src/program.js';
import { createRepo, createTempDir, type TestRepo } from '../helpers/repo.js';

let repo: TestRepo | undefined;
afterEach(() => repo?.cleanup());

async function run(argv: string[], cwd: string, isTTY = false) {
  let stdout = '';
  let stderr = '';
  const code = await runCli(argv, {
    cwd,
    isTTY,
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
  });
  return { code, stdout, stderr };
}

describe('spilot CLI', () => {
  it('prints version and help', async () => {
    const tmp = createTempDir();
    try {
      expect(await run(['--version'], tmp.dir)).toMatchObject({ code: 0, stdout: `${VERSION}\n` });
      const help = await run(['--help'], tmp.dir);
      expect(help.code).toBe(0);
      expect(help.stdout).toContain('spilot list --json');
    } finally {
      tmp.cleanup();
    }
  });

  it('fails with a clear error outside a repository', async () => {
    const tmp = createTempDir();
    try {
      const result = await run(['list'], tmp.dir);
      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(/not a Git repository/);
    } finally {
      tmp.cleanup();
    }
  });

  it('rejects unknown commands with exit code 2', async () => {
    const tmp = createTempDir();
    try {
      const result = await run(['frobnicate'], tmp.dir);
      expect(result.code).toBe(2);
      expect(result.stderr).toMatch(/Unknown command: frobnicate/);
    } finally {
      tmp.cleanup();
    }
  });

  it('requires a TTY for interactive mode', async () => {
    repo = createRepo();
    const result = await run([], repo.dir, false);
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/requires a terminal/);
  });

  it('lists zero stashes', async () => {
    repo = createRepo();
    expect(await run(['list'], repo.dir)).toMatchObject({ code: 0, stdout: 'No stashes.\n' });
    const json = await run(['list', '--json'], repo.dir);
    expect(JSON.parse(json.stdout)).toEqual({ stashes: [] });
  });

  it('prints a table and valid JSON with all displayed metadata', async () => {
    repo = createRepo({ 'a.txt': '1\n' });
    repo.write('a.txt', '2\n3\n');
    repo.write('u.txt', 'u\n');
    repo.git('stash', 'push', '-q', '-u', '-m', 'fix the thing');

    const table = await run(['list'], repo.dir);
    expect(table.code).toBe(0);
    expect(table.stdout).toMatch(
      /^stash@\{0\}\s+main\s+just now\s+2 files\s+\+3 -1\s+U\s+fix the thing$/m,
    );

    const json = await run(['list', '--json'], repo.dir);
    expect(json.code).toBe(0);
    const [stash] = JSON.parse(json.stdout).stashes;
    expect(stash).toMatchObject({
      index: 0,
      ref: 'stash@{0}',
      message: 'fix the thing',
      branch: 'main',
      branchExists: true,
      relativeAge: 'just now',
      fileCount: 2,
      insertions: 3,
      deletions: 1,
      hasUntracked: true,
      untrackedCount: 1,
      baseIsMerge: false,
    });
    expect(stash.files.map((f: { path: string }) => f.path)).toEqual(['a.txt', 'u.txt']);
    expect(new Date(stash.createdAt).getTime()).toBe(stash.timestamp * 1000);
  });
});
