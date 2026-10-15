import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type {
  ApplyAssessment,
  FileChange,
  MutatingAction,
  StashEntry,
  StashRevisions,
  StashStats,
} from '../models/stash.js';
import { GitError, type GitClient, type RunResult } from './client.js';
import {
  STASH_LIST_FORMAT,
  parseMergeCommits,
  parseMergeTreeConflicts,
  parsePorcelainStatus,
  parseRawNumstat,
  parseStashList,
  summarizeChanges,
} from './parsers.js';

/** `git stash list` with a machine-readable format. One subprocess regardless of stash count. */
export async function listStashes(git: GitClient): Promise<StashEntry[]> {
  const { stdout } = await git.read(['stash', 'list', `--format=${STASH_LIST_FORMAT}`]);
  return parseStashList(stdout);
}

/** Marks which stash branches still exist locally (detects deleted or renamed branches). */
export async function resolveBranches(
  git: GitClient,
  stashes: StashEntry[],
): Promise<StashEntry[]> {
  if (stashes.length === 0) return stashes;
  const { stdout } = await git.read(['for-each-ref', '--format=%(refname:short)', 'refs/heads']);
  const local = new Set(stdout.split('\n').filter(Boolean));
  return stashes.map((s) => ({
    ...s,
    branchExists: s.branch === null ? null : local.has(s.branch),
  }));
}

/** Marks stashes whose base commit is a merge commit. */
export async function resolveMergeBases(
  git: GitClient,
  stashes: StashEntry[],
): Promise<StashEntry[]> {
  const bases = [...new Set(stashes.map((s) => s.baseSha).filter(Boolean))];
  if (bases.length === 0) return stashes;
  const { stdout } = await git.read(['rev-list', '--no-walk', '--parents', ...bases]);
  const merges = parseMergeCommits(stdout);
  return stashes.map((s) => ({ ...s, baseIsMerge: merges.has(s.baseSha) }));
}

/**
 * Changed files for a stash: tracked changes (base → stash commit) plus untracked files
 * stored in the third parent. Uses plumbing (`diff-tree`) so user config such as
 * `stash.showIncludeUntracked` or `diff.external` cannot alter the output.
 */
export async function getStashStats(
  git: GitClient,
  stash: StashRevisions,
  urgent = false,
): Promise<StashStats> {
  const tracked = git.read(
    [
      'diff-tree',
      '-r',
      '-z',
      '-M',
      '--no-commit-id',
      '--raw',
      '--numstat',
      stash.baseSha,
      stash.sha,
    ],
    { urgent },
  );
  const untracked = stash.untrackedSha
    ? git.read(
        [
          'diff-tree',
          '-r',
          '-z',
          '--root',
          '--no-commit-id',
          '--raw',
          '--numstat',
          stash.untrackedSha,
        ],
        { urgent },
      )
    : null;
  const files: FileChange[] = parseRawNumstat((await tracked).stdout);
  if (untracked) files.push(...parseRawNumstat((await untracked).stdout, true));
  return summarizeChanges(files);
}

/** `git status --porcelain=v1 -z --untracked-files=all`, always uncached. */
export async function getWorkingTreeStatus(git: GitClient) {
  const { stdout } = await git.readFresh([
    'status',
    '--porcelain=v1',
    '-z',
    '--untracked-files=all',
  ]);
  return parsePorcelainStatus(stdout);
}

/**
 * Predicts whether applying a stash is likely to conflict, without touching the working tree:
 * - overlap between stash paths and locally modified paths,
 * - untracked stash files that already exist on disk,
 * - a simulated merge of the stash into HEAD via `git merge-tree` (Git ≥ 2.40).
 */
export async function assessApply(
  git: GitClient,
  stash: StashEntry,
  stats: StashStats,
): Promise<ApplyAssessment> {
  const status = await getWorkingTreeStatus(git);
  const dirtyPaths = status.map((s) => s.path);
  const dirtySet = new Set([...dirtyPaths, ...status.flatMap((s) => s.origPath ?? [])]);

  const trackedPaths = stats.files.filter((f) => !f.untracked);
  const overlappingPaths = trackedPaths
    .filter((f) => dirtySet.has(f.path) || (f.oldPath !== null && dirtySet.has(f.oldPath)))
    .map((f) => f.path);
  const untrackedCollisions = stats.files
    .filter((f) => f.untracked && existsSync(join(git.cwd, f.path)))
    .map((f) => f.path);

  let mergeConflicts: string[] | null = null;
  try {
    const result = await git.readFresh(
      [
        'merge-tree',
        '--write-tree',
        '--name-only',
        '--no-messages',
        `--merge-base=${stash.baseSha}`,
        'HEAD',
        stash.sha,
      ],
      { okExitCodes: [0, 1] },
    );
    mergeConflicts = result.exitCode === 1 ? parseMergeTreeConflicts(result.stdout) : [];
  } catch {
    // Older Git without `merge-tree --write-tree --merge-base`: fall back to path overlap only.
    mergeConflicts = null;
  }

  const warnings: string[] = [];
  if (dirtyPaths.length > 0) {
    warnings.push(`Working tree has ${dirtyPaths.length} uncommitted change(s).`);
  }
  if (overlappingPaths.length > 0) {
    warnings.push(`Locally modified files also changed in the stash: ${list(overlappingPaths)}`);
  }
  if (untrackedCollisions.length > 0) {
    warnings.push(`Untracked stash files already exist: ${list(untrackedCollisions)}`);
  }
  if (mergeConflicts && mergeConflicts.length > 0) {
    warnings.push(`Stash conflicts with current HEAD in: ${list(mergeConflicts)}`);
  } else if (mergeConflicts === null) {
    warnings.push('Could not simulate the merge (requires Git 2.40+); conflict check is partial.');
  }

  return {
    dirtyPaths,
    overlappingPaths,
    untrackedCollisions,
    mergeConflicts,
    warnings,
    conflictLikely:
      overlappingPaths.length > 0 ||
      untrackedCollisions.length > 0 ||
      (mergeConflicts?.length ?? 0) > 0,
  };
}

function list(paths: string[], max = 3): string {
  const shown = paths.slice(0, max).join(', ');
  return paths.length > max ? `${shown} (+${paths.length - max} more)` : shown;
}

/** Exact Git arguments for each mutating action. Shown verbatim in confirmation modals. */
export function actionArgs(action: MutatingAction, stash: StashEntry, branch?: string): string[] {
  switch (action) {
    case 'apply':
      return ['stash', 'apply', stash.ref];
    case 'pop':
      return ['stash', 'pop', stash.ref];
    case 'drop':
      return ['stash', 'drop', stash.ref];
    case 'branch':
      if (!branch) throw new Error('Branch name is required');
      return ['stash', 'branch', branch, stash.ref];
  }
}

export class StaleStashError extends Error {
  constructor(stash: StashEntry) {
    super(
      `${stash.ref} no longer points to the stash you selected (the stash list changed). Press r to refresh.`,
    );
    this.name = 'StaleStashError';
  }
}

/**
 * Runs a mutating stash action after verifying `stash@{n}` still refers to the same commit,
 * so an externally modified stash list can never cause the wrong stash to be dropped.
 */
export async function runAction(
  git: GitClient,
  action: MutatingAction,
  stash: StashEntry,
  branch?: string,
): Promise<RunResult> {
  const current = await git
    .readFresh(['rev-parse', '--verify', '--quiet', stash.ref], { okExitCodes: [0, 1] })
    .then((r) => r.stdout.trim());
  if (current !== stash.sha) throw new StaleStashError(stash);
  return git.mutate(actionArgs(action, stash, branch));
}

/** Validates a new branch name with `git check-ref-format --branch`, and that it is unused. */
export async function validateBranchName(git: GitClient, name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return 'Branch name cannot be empty.';
  if (trimmed.startsWith('-')) return 'Branch name cannot start with "-".';
  try {
    await git.readFresh(['check-ref-format', '--branch', trimmed]);
  } catch (error) {
    if (error instanceof GitError) return `"${trimmed}" is not a valid branch name.`;
    throw error;
  }
  const exists = await git.readFresh(['show-ref', '--verify', '--quiet', `refs/heads/${trimmed}`], {
    okExitCodes: [0, 1],
  });
  if (exists.exitCode === 0) return `Branch "${trimmed}" already exists.`;
  return null;
}
