import type { DiffLine, FileChange, FileDiff, StashDiff } from '../models/stash.js';

/** A rendered row of the diff pane: a diff line, a file banner, or a blank separator. */
export type ViewLine =
  | DiffLine
  | { kind: 'spacer' }
  | { kind: 'banner'; change: FileChange; position: number; total: number };

export interface DiffView {
  lines: ViewLine[];
  /** Index of each file's banner in `lines`, in file order. */
  fileOffsets: number[];
}

/**
 * Git header lines that the file banner already conveys. Informative headers such as
 * `new file mode`, `rename from`, or `Binary files … differ` are kept.
 */
const REDUNDANT_META = /^(index |--- |\+\+\+ )/;

export function findFileDiff(diff: StashDiff, change: FileChange): FileDiff | undefined {
  return diff.files.find((d) => d.path === change.path && d.untracked === change.untracked);
}

/** Body of one file's diff, without the raw headers replaced by the banner. */
export function fileBody(fileDiff: FileDiff | undefined): DiffLine[] {
  const lines = (fileDiff?.lines ?? []).filter(
    (l) => l.kind !== 'file-header' && !(l.kind === 'meta' && REDUNDANT_META.test(l.text)),
  );
  return lines.length > 0 ? lines : [{ kind: 'note', text: 'No textual changes.' }];
}

/** Full diff of a stash: each file introduced by a banner, files separated by a blank row. */
export function buildFullView(changes: FileChange[], diff: StashDiff): DiffView {
  const lines: ViewLine[] = [];
  const fileOffsets: number[] = [];
  changes.forEach((change, i) => {
    if (i > 0) lines.push({ kind: 'spacer' });
    fileOffsets.push(lines.length);
    lines.push({ kind: 'banner', change, position: i + 1, total: changes.length });
    lines.push(...fileBody(findFileDiff(diff, change)));
  });
  return { lines, fileOffsets };
}

/** Index of the file whose section contains `line`. */
export function fileAtLine(fileOffsets: number[], line: number): number {
  let index = 0;
  for (let i = 0; i < fileOffsets.length; i++) {
    if (fileOffsets[i]! <= line) index = i;
    else break;
  }
  return index;
}
