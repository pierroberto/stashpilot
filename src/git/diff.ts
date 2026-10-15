import type { DiffLine, StashDiff, StashRevisions } from '../models/stash.js';
import type { GitClient } from './client.js';
import { parsePatch } from './parsers.js';

/**
 * Full unified diff for a stash: tracked changes (base → stash commit) followed by
 * untracked files from the third parent. Read-only and cached by commit SHA.
 */
export async function getStashDiff(git: GitClient, stash: StashRevisions): Promise<StashDiff> {
  const tracked = git.read(
    ['diff-tree', '-r', '-p', '-M', '--no-commit-id', stash.baseSha, stash.sha],
    { urgent: true },
  );
  const untracked = stash.untrackedSha
    ? git.read(['diff-tree', '-r', '-p', '--root', '--no-commit-id', stash.untrackedSha], {
        urgent: true,
      })
    : null;
  const files = parsePatch((await tracked).stdout);
  if (untracked) files.push(...parsePatch((await untracked).stdout, true));
  const lines: DiffLine[] = files.flatMap((f) => f.lines);
  return { files, lines };
}
