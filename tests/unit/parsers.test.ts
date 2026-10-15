import { describe, expect, it } from 'vitest';
import {
  parseMergeCommits,
  parseMergeTreeConflicts,
  parsePatch,
  parsePorcelainStatus,
  parseRawNumstat,
  parseStashList,
  parseStashSubject,
  summarizeChanges,
  unquoteGitPath,
} from '../../src/git/parsers.js';

const SEP = '\x1f';
const REC = '\x1e';

describe('parseStashSubject', () => {
  it('parses custom messages', () => {
    expect(parseStashSubject('On main: fix login')).toEqual({
      branch: 'main',
      message: 'fix login',
      baseSubject: null,
    });
  });

  it('parses auto-generated WIP stashes', () => {
    expect(parseStashSubject('WIP on feature/x: abc1234 Add thing')).toEqual({
      branch: 'feature/x',
      message: null,
      baseSubject: 'Add thing',
    });
  });

  it('keeps colons inside messages', () => {
    expect(parseStashSubject('On main: note: remember this').message).toBe('note: remember this');
  });

  it('maps detached HEAD to a null branch', () => {
    expect(parseStashSubject('WIP on (no branch): abc1234 x').branch).toBeNull();
  });

  it('treats unrecognized subjects as messages', () => {
    expect(parseStashSubject('custom stored stash')).toEqual({
      branch: null,
      message: 'custom stored stash',
      baseSubject: null,
    });
  });
});

describe('parseStashList', () => {
  it('parses records with two and three parents', () => {
    const output =
      ['stash@{0}', 'aaa', 'p1 p2 p3', '1700000000', 'On main: with untracked'].join(SEP) +
      REC +
      '\n' +
      ['stash@{1}', 'bbb', 'q1 q2', '1690000000', 'WIP on dev: 1234567 base'].join(SEP) +
      REC +
      '\n';
    const [a, b] = parseStashList(output);
    expect(a).toMatchObject({
      index: 0,
      ref: 'stash@{0}',
      sha: 'aaa',
      baseSha: 'p1',
      untrackedSha: 'p3',
      hasUntracked: true,
      message: 'with untracked',
      branch: 'main',
      timestamp: 1700000000,
    });
    expect(b).toMatchObject({
      index: 1,
      hasUntracked: false,
      untrackedSha: null,
      message: null,
      baseSubject: 'base',
      branch: 'dev',
    });
  });

  it('returns an empty list for empty output', () => {
    expect(parseStashList('')).toEqual([]);
  });

  it('handles very long messages', () => {
    const msg = 'x'.repeat(5000);
    const [entry] = parseStashList(['stash@{0}', 'a', 'b c', '1', `On main: ${msg}`].join(SEP));
    expect(entry?.message).toHaveLength(5000);
  });
});

describe('parseRawNumstat', () => {
  it('combines raw status with numstat counts, including renames and binaries', () => {
    const output = [
      ':100644 100644 aaa bbb M',
      'a.txt',
      ':100644 100644 ccc ddd M',
      'bin.dat',
      ':100644 100644 eee eee R100',
      'old.txt',
      'new.txt',
      ':000000 100644 000 fff A',
      'sp ace.txt',
      '2\t1\ta.txt',
      '-\t-\tbin.dat',
      '0\t0\t',
      'old.txt',
      'new.txt',
      '3\t0\tsp ace.txt',
      '',
    ].join('\0');
    const files = parseRawNumstat(output);
    expect(files).toEqual([
      expect.objectContaining({ path: 'a.txt', status: 'modified', insertions: 2, deletions: 1 }),
      expect.objectContaining({ path: 'bin.dat', binary: true, insertions: null }),
      expect.objectContaining({ path: 'new.txt', oldPath: 'old.txt', status: 'renamed' }),
      expect.objectContaining({ path: 'sp ace.txt', status: 'added', insertions: 3 }),
    ]);
    expect(summarizeChanges(files)).toMatchObject({ fileCount: 4, insertions: 5, deletions: 1 });
  });

  it('marks untracked files', () => {
    const files = parseRawNumstat(':000000 100644 0 1 A\0u.txt\x001\t0\tu.txt\0', true);
    expect(files).toEqual([
      expect.objectContaining({ path: 'u.txt', status: 'untracked', untracked: true }),
    ]);
    expect(summarizeChanges(files).untrackedCount).toBe(1);
  });
});

describe('parsePorcelainStatus', () => {
  it('parses modified, untracked, and renamed entries', () => {
    const output = ' M a.txt\0?? new file.txt\0R  b.txt\0a-old.txt\0';
    expect(parsePorcelainStatus(output)).toEqual([
      { path: 'a.txt', origPath: null, index: ' ', worktree: 'M' },
      { path: 'new file.txt', origPath: null, index: '?', worktree: '?' },
      { path: 'b.txt', origPath: 'a-old.txt', index: 'R', worktree: ' ' },
    ]);
  });
});

describe('unquoteGitPath', () => {
  it('returns unquoted paths unchanged', () => {
    expect(unquoteGitPath('plain.txt')).toBe('plain.txt');
  });
  it('decodes escapes and octal UTF-8 bytes', () => {
    expect(unquoteGitPath('"a\\"b\\tc"')).toBe('a"b\tc');
    expect(unquoteGitPath('"caf\\303\\251"')).toBe('café');
  });
});

describe('parsePatch', () => {
  const patch = [
    'diff --git a/a.txt b/a.txt',
    'index 1..2 100644',
    '--- a/a.txt',
    '+++ b/a.txt',
    '@@ -1,2 +1,2 @@',
    ' keep',
    '-old',
    '+new',
    '\\ No newline at end of file',
    'diff --git a/bin.dat b/bin.dat',
    'index 3..4 100644',
    'Binary files a/bin.dat and b/bin.dat differ',
    'diff --git a/old.txt b/new.txt',
    'similarity index 100%',
    'rename from old.txt',
    'rename to new.txt',
    'diff --git a/sp ace.txt b/sp ace.txt',
    '--- a/sp ace.txt\t',
    '+++ b/sp ace.txt\t',
    '@@ -1 +1 @@',
    '-x\ty',
    '+--- not a header',
    'diff --git a/gone.txt b/gone.txt',
    'deleted file mode 100644',
    '--- a/gone.txt',
    '+++ /dev/null',
    '@@ -1 +0,0 @@',
    '-bye',
    '',
  ].join('\n');

  it('splits files and resolves paths', () => {
    const files = parsePatch(patch);
    expect(files.map((f) => f.path)).toEqual([
      'a.txt',
      'bin.dat',
      'new.txt',
      'sp ace.txt',
      'gone.txt',
    ]);
  });

  it('classifies lines and expands tabs', () => {
    const [a, , , space] = parsePatch(patch);
    expect(a!.lines.map((l) => l.kind)).toEqual([
      'file-header',
      'meta',
      'meta',
      'meta',
      'hunk',
      'context',
      'del',
      'add',
      'note',
    ]);
    expect(space!.lines.find((l) => l.kind === 'del')?.text).toBe('-x    y');
    expect(space!.lines.at(-1)).toEqual({ kind: 'add', text: '+--- not a header' });
  });

  it('returns no files for an empty patch', () => {
    expect(parsePatch('')).toEqual([]);
  });
});

describe('merge helpers', () => {
  it('detects merge commits from rev-list --parents', () => {
    const merges = parseMergeCommits('m1 p1 p2\nc1 p1\n');
    expect([...merges]).toEqual(['m1']);
  });

  it('extracts conflicted paths from merge-tree output', () => {
    expect(parseMergeTreeConflicts('treeoid\na.txt\nb.txt\na.txt\n')).toEqual(['a.txt', 'b.txt']);
    expect(parseMergeTreeConflicts('treeoid\n')).toEqual([]);
  });
});
