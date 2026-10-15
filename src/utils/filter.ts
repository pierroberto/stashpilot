import type { StashEntry, StashStats } from '../models/stash.js';

/**
 * Case-insensitive substring match against message, subject, branch, and changed filenames.
 * Filenames are matched only once stats for the stash have loaded.
 */
export function matchesFilter(
  stash: StashEntry,
  stats: StashStats | undefined,
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystacks = [stash.ref, stash.subject, stash.message ?? '', stash.branch ?? ''];
  if (haystacks.some((h) => h.toLowerCase().includes(needle))) return true;
  return stats?.files.some((f) => f.path.toLowerCase().includes(needle)) ?? false;
}
