import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  GitClient,
  GitError,
  NotARepositoryError,
  findRepositoryRoot,
} from '../../src/git/client.js';
import { getStashDiff } from '../../src/git/diff.js';
import {
  StaleStashError,
  assessApply,
  getStashStats,
  listStashes,
  resolveBranches,
  resolveMergeBases,
  runAction,
  validateBranchName,
} from '../../src/git/stash.js';
import { createRepo, createTempDir, type TestRepo } from '../helpers/repo.js';

let repo: TestRepo;
afterEach(() => repo?.cleanup());

const client = () => new GitClient({ cwd: repo.dir });

async function onlyStash(git: GitClient) {
  const [stash] = await listStashes(git);
  if (!stash) throw new Error('expected a stash');
  return stash;
}

describe('repository detection', () => {
  it('finds the top-level directory from a subdirectory', async () => {
    repo = createRepo({ 'sub/dir/file.txt': 'x\n' });
    await expect(findRepositoryRoot(join(repo.dir, 'sub/dir'))).resolves.toBe(repo.dir);
  });

  it('rejects directories outside a repository', async () => {
    const tmp = createTempDir();
    try {
      await expect(findRepositoryRoot(tmp.dir)).rejects.toBeInstanceOf(NotARepositoryError);
    } finally {
      tmp.cleanup();
    }
  });
});

describe('listing and inspecting stashes', () => {
  it('handles zero stashes', async () => {
    repo = createRepo();
    expect(await listStashes(client())).toEqual([]);
  });

  it('lists stashes with message, branch, and index', async () => {
    repo = createRepo({ 'a.txt': '1\n' });
    repo.write('a.txt', '2\n');
    repo.git('stash', 'push', '-q', '-m', 'first');
    repo.write('a.txt', '3\n');
    repo.git('stash', 'push', '-q');
    const stashes = await listStashes(client());
    expect(stashes.map((s) => [s.ref, s.message, s.branch])).toEqual([
      ['stash@{0}', null, 'main'],
      ['stash@{1}', 'first', 'main'],
    ]);
    expect(stashes[0]!.baseSubject).toBe('initial');
  });

  it('computes stats and diffs including untracked files', async () => {
    repo = createRepo({ 'a.txt': 'one\ntwo\n' });
    repo.write('a.txt', 'one\nTWO\nthree\n');
    repo.write('new dir/untracked file.txt', 'u1\nu2\n');
    repo.git('stash', 'push', '-q', '-u', '-m', 'with untracked');
    const git = client();
    const stash = await onlyStash(git);
    expect(stash.hasUntracked).toBe(true);

    const stats = await getStashStats(git, stash);
    expect(stats).toMatchObject({ fileCount: 2, insertions: 4, deletions: 1, untrackedCount: 1 });
    expect(stats.files.map((f) => [f.path, f.status])).toEqual([
      ['a.txt', 'modified'],
      ['new dir/untracked file.txt', 'untracked'],
    ]);

    const diff = await getStashDiff(git, stash);
    expect(diff.files.map((f) => [f.path, f.untracked])).toEqual([
      ['a.txt', false],
      ['new dir/untracked file.txt', true],
    ]);
    expect(diff.lines.some((l) => l.kind === 'add' && l.text === '+u2')).toBe(true);
  });

  it('detects deleted branches and detached HEAD', async () => {
    repo = createRepo({ 'a.txt': '1\n' });
    repo.git('checkout', '-q', '-b', 'temp');
    repo.write('a.txt', 'temp\n');
    repo.git('stash', 'push', '-q', '-m', 'on temp');
    repo.git('checkout', '-q', 'main');
    repo.git('branch', '-q', '-D', 'temp');
    repo.git('checkout', '-q', '--detach');
    repo.write('a.txt', 'detached\n');
    repo.git('stash', 'push', '-q', '-m', 'detached');
    repo.git('checkout', '-q', 'main');

    const git = client();
    const stashes = await resolveBranches(git, await listStashes(git));
    expect(stashes.map((s) => [s.message, s.branch, s.branchExists])).toEqual([
      ['detached', null, null],
      ['on temp', 'temp', false],
    ]);
  });

  it('flags stashes whose base is a merge commit', async () => {
    repo = createRepo({ 'a.txt': '1\n' });
    repo.git('checkout', '-q', '-b', 'side');
    repo.write('b.txt', 'b\n');
    repo.git('add', '.');
    repo.git('commit', '-q', '-m', 'side');
    repo.git('checkout', '-q', 'main');
    repo.write('c.txt', 'c\n');
    repo.git('add', '.');
    repo.git('commit', '-q', '-m', 'main change');
    repo.git('merge', '-q', '--no-edit', 'side');
    repo.write('a.txt', 'after merge\n');
    repo.git('stash', 'push', '-q');
    const git = client();
    const [stash] = await resolveMergeBases(git, await listStashes(git));
    expect(stash?.baseIsMerge).toBe(true);
  });

  it('handles many stashes', async () => {
    repo = createRepo({ 'a.txt': '0\n' });
    for (let i = 1; i <= 120; i++) {
      repo.write('a.txt', `${i}\n`);
      repo.git('stash', 'push', '-q', '-m', `stash ${i}`);
    }
    const git = client();
    const stashes = await listStashes(git);
    expect(stashes).toHaveLength(120);
    expect(stashes[0]!.message).toBe('stash 120');
    expect(stashes[119]!.ref).toBe('stash@{119}');
  });

  it('caches reads until invalidated', async () => {
    repo = createRepo({ 'a.txt': '1\n' });
    const git = client();
    expect(await listStashes(git)).toHaveLength(0);
    repo.write('a.txt', '2\n');
    repo.git('stash', 'push', '-q');
    expect(await listStashes(git)).toHaveLength(0);
    git.invalidate();
    expect(await listStashes(git)).toHaveLength(1);
  });

  it('does not change repository state while inspecting', async () => {
    repo = createRepo({ 'a.txt': '1\n' });
    repo.write('a.txt', '2\n');
    repo.git('stash', 'push', '-q', '-u');
    repo.write('a.txt', 'local\n');
    const before = repo.git('status', '--porcelain');
    const git = client();
    const stash = await onlyStash(git);
    await getStashStats(git, stash);
    await getStashDiff(git, stash);
    await assessApply(git, stash, await getStashStats(git, stash));
    expect(repo.git('status', '--porcelain')).toBe(before);
    expect(repo.git('stash', 'list').trim().split('\n')).toHaveLength(1);
  });
});

describe('apply safety assessment', () => {
  it('reports a clean apply', async () => {
    repo = createRepo({ 'a.txt': '1\n' });
    repo.write('a.txt', '2\n');
    repo.git('stash', 'push', '-q');
    const git = client();
    const stash = await onlyStash(git);
    const result = await assessApply(git, stash, await getStashStats(git, stash));
    expect(result.conflictLikely).toBe(false);
    expect(result.dirtyPaths).toEqual([]);
  });

  it('warns about a dirty tree that overlaps the stash', async () => {
    repo = createRepo({ 'a.txt': '1\n', 'b.txt': '1\n' });
    repo.write('a.txt', '2\n');
    repo.git('stash', 'push', '-q');
    repo.write('a.txt', 'local edit\n');
    repo.write('scratch.txt', 'x\n');
    const git = client();
    const stash = await onlyStash(git);
    const result = await assessApply(git, stash, await getStashStats(git, stash));
    expect(result.conflictLikely).toBe(true);
    expect(result.overlappingPaths).toEqual(['a.txt']);
    expect(result.dirtyPaths.sort()).toEqual(['a.txt', 'scratch.txt']);
  });

  it('warns when a dirty tree does not overlap, without predicting a conflict', async () => {
    repo = createRepo({ 'a.txt': '1\n', 'b.txt': '1\n' });
    repo.write('a.txt', '2\n');
    repo.git('stash', 'push', '-q');
    repo.write('b.txt', 'local\n');
    const git = client();
    const stash = await onlyStash(git);
    const result = await assessApply(git, stash, await getStashStats(git, stash));
    expect(result.conflictLikely).toBe(false);
    expect(result.warnings[0]).toMatch(/uncommitted/);
  });

  it('detects untracked files that already exist', async () => {
    repo = createRepo();
    repo.write('u.txt', 'stashed\n');
    repo.git('stash', 'push', '-q', '-u');
    repo.write('u.txt', 'new local\n');
    const git = client();
    const stash = await onlyStash(git);
    const result = await assessApply(git, stash, await getStashStats(git, stash));
    expect(result.untrackedCollisions).toEqual(['u.txt']);
    expect(result.conflictLikely).toBe(true);
  });

  it('predicts conflicts with commits made after stashing', async () => {
    repo = createRepo({ 'a.txt': 'base\n' });
    repo.write('a.txt', 'stashed\n');
    repo.git('stash', 'push', '-q');
    repo.write('a.txt', 'committed\n');
    repo.git('commit', '-q', '-am', 'conflicting');
    const git = client();
    const stash = await onlyStash(git);
    const result = await assessApply(git, stash, await getStashStats(git, stash));
    if (result.mergeConflicts === null) return; // Git < 2.40 cannot simulate the merge.
    expect(result.mergeConflicts).toEqual(['a.txt']);
    expect(result.conflictLikely).toBe(true);
  });
});

describe('mutating actions', () => {
  it('applies without removing the stash', async () => {
    repo = createRepo({ 'a.txt': '1\n' });
    repo.write('a.txt', '2\n');
    repo.git('stash', 'push', '-q');
    const git = client();
    await runAction(git, 'apply', await onlyStash(git));
    expect(readFileSync(join(repo.dir, 'a.txt'), 'utf8')).toBe('2\n');
    expect(await listStashes(git)).toHaveLength(1);
  });

  it('pops: applies and removes the stash, restoring untracked files', async () => {
    repo = createRepo({ 'a.txt': '1\n' });
    repo.write('a.txt', '2\n');
    repo.write('u.txt', 'u\n');
    repo.git('stash', 'push', '-q', '-u');
    expect(existsSync(join(repo.dir, 'u.txt'))).toBe(false);
    const git = client();
    await runAction(git, 'pop', await onlyStash(git));
    expect(readFileSync(join(repo.dir, 'a.txt'), 'utf8')).toBe('2\n');
    expect(existsSync(join(repo.dir, 'u.txt'))).toBe(true);
    expect(await listStashes(git)).toHaveLength(0);
  });

  it('keeps the stash and surfaces Git errors when pop conflicts', async () => {
    repo = createRepo({ 'a.txt': 'base\n' });
    repo.write('a.txt', 'stashed\n');
    repo.git('stash', 'push', '-q');
    repo.write('a.txt', 'committed\n');
    repo.git('commit', '-q', '-am', 'conflicting');
    const git = client();
    const error = await runAction(git, 'pop', await onlyStash(git)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GitError);
    expect((error as GitError).detail).toMatch(/conflict/i);
    expect((error as GitError).command).toBe('git stash pop stash@{0}');
    expect(await listStashes(git)).toHaveLength(1);
  });

  it('refuses to overwrite local changes', async () => {
    repo = createRepo({ 'a.txt': '1\n' });
    repo.write('a.txt', '2\n');
    repo.git('stash', 'push', '-q');
    repo.write('a.txt', 'precious local work\n');
    const git = client();
    await expect(runAction(git, 'apply', await onlyStash(git))).rejects.toBeInstanceOf(GitError);
    expect(readFileSync(join(repo.dir, 'a.txt'), 'utf8')).toBe('precious local work\n');
  });

  it('drops the selected stash only', async () => {
    repo = createRepo({ 'a.txt': '1\n' });
    for (const n of ['one', 'two', 'three']) {
      repo.write('a.txt', `${n}\n`);
      repo.git('stash', 'push', '-q', '-m', n);
    }
    const git = client();
    const stashes = await listStashes(git);
    await runAction(git, 'drop', stashes[1]!);
    expect((await listStashes(git)).map((s) => s.message)).toEqual(['three', 'one']);
  });

  it('refuses to act when stash@{n} now points to another stash', async () => {
    repo = createRepo({ 'a.txt': '1\n' });
    repo.write('a.txt', '2\n');
    repo.git('stash', 'push', '-q', '-m', 'old');
    const git = client();
    const stale = await onlyStash(git);
    repo.write('a.txt', '3\n');
    repo.git('stash', 'push', '-q', '-m', 'new');
    await expect(runAction(git, 'drop', stale)).rejects.toBeInstanceOf(StaleStashError);
    expect(repo.git('stash', 'list').trim().split('\n')).toHaveLength(2);
  });

  it('creates a branch from a stash', async () => {
    repo = createRepo({ 'a.txt': '1\n' });
    repo.write('a.txt', '2\n');
    repo.git('stash', 'push', '-q');
    const git = client();
    expect(await validateBranchName(git, 'from-stash')).toBeNull();
    await runAction(git, 'branch', await onlyStash(git), 'from-stash');
    expect(repo.git('rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('from-stash');
    expect(readFileSync(join(repo.dir, 'a.txt'), 'utf8')).toBe('2\n');
    expect(await listStashes(git)).toHaveLength(0);
  });

  it('validates branch names', async () => {
    repo = createRepo();
    const git = client();
    expect(await validateBranchName(git, '')).toMatch(/empty/);
    expect(await validateBranchName(git, 'bad..name')).toMatch(/not a valid/);
    expect(await validateBranchName(git, '-x')).toMatch(/cannot start/);
    expect(await validateBranchName(git, 'main')).toMatch(/already exists/);
  });
});
