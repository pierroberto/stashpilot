import { useEffect, useState } from 'react';
import type { GitClient } from '../../git/client.js';
import { getStashDiff } from '../../git/diff.js';
import { getStashStats } from '../../git/stash.js';
import type { StashDiff, StashEntry, StashStats } from '../../models/stash.js';
import { errorMessage } from '../../utils/errors.js';

export interface PreviewState {
  sha: string | null;
  stats: StashStats | null;
  diff: StashDiff | null;
  loading: boolean;
  error: string | null;
}

interface Loaded {
  sha: string;
  version: number;
  stats: StashStats | null;
  diff: StashDiff | null;
  error: string | null;
}

/**
 * Loads file stats and the unified diff for the selected stash. Read-only; results are
 * cached by the GitClient so moving back to a stash is instant. `version` forces a reload
 * after the cache is invalidated.
 */
export function usePreview(
  git: GitClient,
  stash: StashEntry | null,
  version: number,
): PreviewState {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  // Depend on commit identity only: enrichment replaces stash objects without changing content.
  const sha = stash?.sha ?? null;
  const baseSha = stash?.baseSha ?? '';
  const untrackedSha = stash?.untrackedSha ?? null;

  useEffect(() => {
    if (!sha) return;
    const target = { sha, baseSha, untrackedSha };
    let cancelled = false;
    // Small delay so holding j/k does not spawn Git for every stash scrolled past.
    const timer = setTimeout(() => {
      Promise.all([getStashStats(git, target, true), getStashDiff(git, target)]).then(
        ([stats, diff]) => {
          if (!cancelled) setLoaded({ sha, version, stats, diff, error: null });
        },
        (error: unknown) => {
          if (!cancelled) {
            setLoaded({ sha, version, stats: null, diff: null, error: errorMessage(error) });
          }
        },
      );
    }, 40);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [git, sha, baseSha, untrackedSha, version]);

  if (!sha) return { sha: null, stats: null, diff: null, loading: false, error: null };
  if (!loaded || loaded.sha !== sha) {
    return { sha, stats: null, diff: null, loading: true, error: null };
  }
  // After a refresh keep showing the previous content while reloading.
  return {
    sha,
    stats: loaded.stats,
    diff: loaded.diff,
    loading: loaded.version !== version,
    error: loaded.error,
  };
}
