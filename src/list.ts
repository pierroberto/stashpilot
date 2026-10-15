import type { GitClient } from './git/client.js';
import { getStashStats, listStashes, resolveBranches, resolveMergeBases } from './git/stash.js';
import type { FileChange, StashEntry, StashStats } from './models/stash.js';
import { relativeTime } from './utils/time.js';

export interface StashSummary {
  stash: StashEntry;
  stats: StashStats;
}

/** Loads every stash with branch, merge-base, and file statistics. */
export async function loadStashSummaries(git: GitClient): Promise<StashSummary[]> {
  let stashes = await listStashes(git);
  stashes = await resolveBranches(git, stashes);
  stashes = await resolveMergeBases(git, stashes);
  return Promise.all(
    stashes.map(async (stash) => ({ stash, stats: await getStashStats(git, stash) })),
  );
}

export interface StashJson {
  index: number;
  ref: string;
  sha: string;
  message: string | null;
  subject: string;
  branch: string | null;
  branchExists: boolean | null;
  baseSha: string;
  baseIsMerge: boolean | null;
  createdAt: string;
  timestamp: number;
  relativeAge: string;
  fileCount: number;
  insertions: number;
  deletions: number;
  hasUntracked: boolean;
  untrackedCount: number;
  files: Pick<FileChange, 'path' | 'oldPath' | 'status' | 'insertions' | 'deletions' | 'binary'>[];
}

export function toJson({ stash, stats }: StashSummary, now = Date.now()): StashJson {
  return {
    index: stash.index,
    ref: stash.ref,
    sha: stash.sha,
    message: stash.message,
    subject: stash.subject,
    branch: stash.branch,
    branchExists: stash.branchExists,
    baseSha: stash.baseSha,
    baseIsMerge: stash.baseIsMerge,
    createdAt: new Date(stash.timestamp * 1000).toISOString(),
    timestamp: stash.timestamp,
    relativeAge: relativeTime(stash.timestamp, now),
    fileCount: stats.fileCount,
    insertions: stats.insertions,
    deletions: stats.deletions,
    hasUntracked: stash.hasUntracked,
    untrackedCount: stats.untrackedCount,
    files: stats.files.map(({ path, oldPath, status, insertions, deletions, binary }) => ({
      path,
      oldPath,
      status,
      insertions,
      deletions,
      binary,
    })),
  };
}

export function formatStashJson(summaries: StashSummary[], now = Date.now()): string {
  return `${JSON.stringify({ stashes: summaries.map((s) => toJson(s, now)) }, null, 2)}\n`;
}

function title(stash: StashEntry): string {
  if (stash.message) return stash.message;
  if (stash.baseSubject) return `WIP: ${stash.baseSubject}`;
  return stash.subject;
}

function branchLabel(stash: StashEntry): string {
  if (stash.branch === null) return '(detached)';
  return stash.branchExists === false ? `${stash.branch} (deleted)` : stash.branch;
}

export function formatStashTable(summaries: StashSummary[], now = Date.now()): string {
  if (summaries.length === 0) return 'No stashes.\n';
  const rows = summaries.map(({ stash, stats }) => [
    stash.ref,
    branchLabel(stash),
    relativeTime(stash.timestamp, now),
    `${stats.fileCount} ${stats.fileCount === 1 ? 'file' : 'files'}`,
    `+${stats.insertions} -${stats.deletions}`,
    stash.hasUntracked ? 'U' : '',
    title(stash),
  ]);
  const widths = rows[0]!.map((_, col) =>
    col === rows[0]!.length - 1 ? 0 : Math.max(...rows.map((r) => r[col]!.length)),
  );
  const lines = rows.map((r) =>
    r
      .map((cell, col) => (col === r.length - 1 ? cell : cell.padEnd(widths[col]!)))
      .join('  ')
      .trimEnd(),
  );
  return `${lines.join('\n')}\n`;
}
