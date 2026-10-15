/** A stash as listed by `git stash list`, available immediately from a single Git call. */
export interface StashEntry {
  /** Position in the stash reflog: `n` in `stash@{n}`. */
  index: number;
  /** `stash@{n}` */
  ref: string;
  /** Commit SHA of the stash. Stable across index shifts, used as cache key. */
  sha: string;
  /** First parent: the commit HEAD pointed to when the stash was created. */
  baseSha: string;
  /** Second parent: the commit recording the index state. */
  indexSha: string | null;
  /** Third parent: present only when the stash includes untracked files. */
  untrackedSha: string | null;
  /** Unix timestamp (seconds) of the stash commit. */
  timestamp: number;
  /** Raw reflog subject, e.g. `On main: fix login` or `WIP on main: abc1234 subject`. */
  subject: string;
  /** User-supplied message (`git stash push -m`), or null for auto-generated WIP stashes. */
  message: string | null;
  /** Subject of the base commit, for auto-generated WIP stashes. */
  baseSubject: string | null;
  /** Branch the stash was created on, or null when detached / unrecoverable. */
  branch: string | null;
  /** Whether `branch` still exists locally. Null when unknown. */
  branchExists: boolean | null;
  /** True when the stash's base commit is a merge commit. Null until known. */
  baseIsMerge: boolean | null;
  hasUntracked: boolean;
}

/** The commits needed to inspect a stash's contents. */
export type StashRevisions = Pick<StashEntry, 'sha' | 'baseSha' | 'untrackedSha'>;

export type FileStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'type-changed'
  | 'untracked'
  | 'unknown';

export interface FileChange {
  path: string;
  /** Source path for renames and copies. */
  oldPath: string | null;
  status: FileStatus;
  /** Null for binary files. */
  insertions: number | null;
  deletions: number | null;
  binary: boolean;
  untracked: boolean;
}

/** Per-stash statistics, loaded progressively after the list renders. */
export interface StashStats {
  files: FileChange[];
  fileCount: number;
  insertions: number;
  deletions: number;
  untrackedCount: number;
}

export type DiffLineKind = 'file-header' | 'meta' | 'hunk' | 'add' | 'del' | 'context' | 'note';

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
}

export interface FileDiff {
  path: string;
  untracked: boolean;
  lines: DiffLine[];
}

export interface StashDiff {
  files: FileDiff[];
  /** All lines concatenated, for the full-diff view. */
  lines: DiffLine[];
}

export type MutatingAction = 'apply' | 'pop' | 'drop' | 'branch';

export interface ApplyAssessment {
  /** Paths with uncommitted changes in the working tree (tracked or untracked). */
  dirtyPaths: string[];
  /** Stash paths that also have local, uncommitted modifications. */
  overlappingPaths: string[];
  /** Untracked files in the stash that already exist in the working tree. */
  untrackedCollisions: string[];
  /** Paths that conflict when merging the stash into HEAD, or null if it could not be simulated. */
  mergeConflicts: string[] | null;
  /** Human-readable warnings, empty when applying looks safe. */
  warnings: string[];
  conflictLikely: boolean;
}
