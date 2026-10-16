import { describe, expect, it } from 'vitest';
import { buildFullView, fileAtLine, fileBody } from '../../src/app/diffView.js';
import { lineRange } from '../../src/app/components/Preview.js';
import { parsePatch } from '../../src/git/parsers.js';
import type { FileChange } from '../../src/models/stash.js';

const patch = [
  'diff --git a/a.txt b/a.txt',
  'index 1..2 100644',
  '--- a/a.txt',
  '+++ b/a.txt',
  '@@ -1 +1 @@',
  '-old',
  '+new',
  'diff --git a/n.txt b/n.txt',
  'new file mode 100644',
  'index 0..3',
  '--- /dev/null',
  '+++ b/n.txt',
  '@@ -0,0 +1 @@',
  '+hi',
  'diff --git a/bin.dat b/bin.dat',
  'index 4..5 100644',
  'Binary files a/bin.dat and b/bin.dat differ',
  '',
].join('\n');

const change = (path: string, extra: Partial<FileChange> = {}): FileChange => ({
  path,
  oldPath: null,
  status: 'modified',
  insertions: 1,
  deletions: 1,
  binary: false,
  untracked: false,
  ...extra,
});

describe('diff view', () => {
  const files = parsePatch(patch);
  const diff = { files, lines: files.flatMap((f) => f.lines) };
  const changes = [change('a.txt'), change('n.txt', { status: 'added' }), change('bin.dat')];

  it('drops headers the banner replaces but keeps informative ones', () => {
    expect(fileBody(files[0]).map((l) => l.text)).toEqual(['@@ -1 +1 @@', '-old', '+new']);
    expect(fileBody(files[1]).map((l) => l.text)).toEqual([
      'new file mode 100644',
      '@@ -0,0 +1 @@',
      '+hi',
    ]);
    expect(fileBody(files[2]).map((l) => l.text)).toEqual([
      'Binary files a/bin.dat and b/bin.dat differ',
    ]);
    expect(fileBody(undefined)).toEqual([{ kind: 'note', text: 'No textual changes.' }]);
  });

  it('introduces each file with a banner and separates files with a spacer', () => {
    const view = buildFullView(changes, diff);
    expect(view.lines.map((l) => l.kind)).toEqual([
      'banner',
      'hunk',
      'del',
      'add',
      'spacer',
      'banner',
      'meta',
      'hunk',
      'add',
      'spacer',
      'banner',
      'meta',
    ]);
    expect(view.fileOffsets).toEqual([0, 5, 10]);
    expect(view.lines[5]).toMatchObject({ kind: 'banner', position: 2, total: 3 });
  });

  it('maps a scroll position to the file being read', () => {
    expect(fileAtLine([0, 5, 10], 0)).toBe(0);
    expect(fileAtLine([0, 5, 10], 4)).toBe(0);
    expect(fileAtLine([0, 5, 10], 5)).toBe(1);
    expect(fileAtLine([0, 5, 10], 99)).toBe(2);
  });

  it('describes the visible line range', () => {
    expect(lineRange(0, 10, 4)).toBe('4 lines');
    expect(lineRange(0, 10, 30)).toBe('lines 1–10 of 30 ↓');
    expect(lineRange(5, 10, 30)).toBe('lines 6–15 of 30 ↑↓');
    expect(lineRange(20, 10, 30)).toBe('lines 21–30 of 30 ↑');
  });
});
