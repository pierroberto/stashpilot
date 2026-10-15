import { useCallback, useEffect, useRef, useState } from 'react';
import type { GitClient } from '../../git/client.js';
import { getStashStats, listStashes, resolveBranches, resolveMergeBases } from '../../git/stash.js';
import type { StashEntry, StashStats } from '../../models/stash.js';
import { errorMessage } from '../../utils/errors.js';

export interface StashesState {
  loading: boolean;
  stashes: StashEntry[];
  stats: ReadonlyMap<string, StashStats>;
  statsErrors: ReadonlyMap<string, string>;
  error: string | null;
}

const EMPTY: StashesState = {
  loading: true,
  stashes: [],
  stats: new Map(),
  statsErrors: new Map(),
  error: null,
};

/**
 * Loads the stash list with a single Git call so it renders immediately, then enriches
 * rows progressively (branch existence, merge bases, per-stash file stats). Concurrency
 * is bounded by the GitClient; results are cached until `reload()`.
 */
export function useStashes(git: GitClient) {
  const [state, setState] = useState<StashesState>(EMPTY);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const gen = ++generation.current;
    const current = () => gen === generation.current;
    setState((s) => ({ ...s, loading: true, error: null }));

    let stashes: StashEntry[];
    try {
      stashes = await listStashes(git);
    } catch (error) {
      if (current()) setState((s) => ({ ...s, loading: false, error: errorMessage(error) }));
      return;
    }
    if (!current()) return;
    setState({ loading: false, stashes, stats: new Map(), statsErrors: new Map(), error: null });
    if (stashes.length === 0) return;

    const enrich = async (fn: (s: StashEntry[]) => Promise<StashEntry[]>) => {
      try {
        const enriched = await fn(stashes);
        if (!current()) return;
        const bySha = new Map(enriched.map((e) => [e.sha, e]));
        setState((s) => ({
          ...s,
          stashes: s.stashes.map((old) => {
            const next = bySha.get(old.sha);
            return next
              ? {
                  ...old,
                  branchExists: next.branchExists ?? old.branchExists,
                  baseIsMerge: next.baseIsMerge ?? old.baseIsMerge,
                }
              : old;
          }),
        }));
      } catch (error) {
        if (current()) setState((s) => ({ ...s, error: errorMessage(error) }));
      }
    };
    void enrich((s) => resolveBranches(git, s));
    void enrich((s) => resolveMergeBases(git, s));

    // Batch stat updates so many fast completions cause few renders.
    const pendingStats = new Map<string, StashStats>();
    const pendingErrors = new Map<string, string>();
    let timer: NodeJS.Timeout | null = null;
    const flush = () => {
      timer = null;
      if (!current()) return;
      const stats = new Map(pendingStats);
      const errors = new Map(pendingErrors);
      pendingStats.clear();
      pendingErrors.clear();
      setState((s) => ({
        ...s,
        stats: new Map([...s.stats, ...stats]),
        statsErrors: new Map([...s.statsErrors, ...errors]),
      }));
    };
    const schedule = () => {
      timer ??= setTimeout(flush, 30);
    };
    await Promise.all(
      stashes.map(async (stash) => {
        try {
          pendingStats.set(stash.sha, await getStashStats(git, stash));
        } catch (error) {
          pendingErrors.set(stash.sha, errorMessage(error));
        }
        if (current()) schedule();
      }),
    );
  }, [git]);

  useEffect(() => {
    void load();
    const gen = generation;
    return () => {
      // Invalidate in-flight loads so they never update an unmounted component.
      gen.current++;
    };
  }, [load]);

  const reload = useCallback(() => {
    git.invalidate();
    return load();
  }, [git, load]);

  return { ...state, reload };
}
