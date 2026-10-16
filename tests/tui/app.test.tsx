import { render } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/app/App.js';
import { GitClient } from '../../src/git/client.js';
import { createRepo, type TestRepo } from '../helpers/repo.js';

let repo: TestRepo | undefined;
let unmount: (() => void) | undefined;
afterEach(() => {
  unmount?.();
  repo?.cleanup();
});

let lastFrame: () => string = () => '';

async function waitFor(check: () => boolean, label: string, timeout = 5000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout) {
      throw new Error(`Timed out waiting for: ${label}\nLast frame:\n${lastFrame()}`);
    }
    await new Promise((r) => setTimeout(r, 20));
  }
}

function renderApp(dir: string) {
  const git = new GitClient({ cwd: dir });
  const result = render(<App git={git} repoRoot={dir} />);
  unmount = result.unmount;
  lastFrame = () => result.lastFrame() ?? '';
  const frame = () => result.lastFrame() ?? '';
  const press = async (input: string) => {
    result.stdin.write(input);
    await new Promise((r) => setTimeout(r, 30));
  };
  const backspace = async (times: number) => {
    for (let i = 0; i < times; i++) await press('\x7f');
  };
  return { ...result, frame, press, backspace };
}

function stashCount(r: TestRepo) {
  return r.git('stash', 'list').split('\n').filter(Boolean).length;
}

describe('TUI', () => {
  it('shows a helpful empty state', async () => {
    repo = createRepo();
    const { frame } = renderApp(repo.dir);
    await waitFor(() => frame().includes('No stashes in this repository'), 'empty state');
    expect(frame()).toContain('git stash push');
  });

  it('renders stashes with metadata and a file summary preview', async () => {
    repo = createRepo({ 'a.txt': '1\n' });
    repo.write('a.txt', '2\n');
    repo.write('u.txt', 'u\n');
    repo.git('stash', 'push', '-q', '-u', '-m', 'my change');
    const { frame } = renderApp(repo.dir);
    await waitFor(() => frame().includes('2f +2 -1'), 'stats');
    expect(frame()).toContain('stash@{0} my change');
    expect(frame()).toContain('main');
    await waitFor(() => frame().includes('U +1 -0 u.txt'), 'file summary');
    expect(frame()).toContain('1 untracked');
  });

  it('requires explicit confirmation before dropping', async () => {
    repo = createRepo({ 'a.txt': '1\n' });
    repo.write('a.txt', '2\n');
    repo.git('stash', 'push', '-q', '-m', 'keep me safe');
    const { frame, press } = renderApp(repo.dir);
    await waitFor(() => frame().includes('keep me safe'), 'list');

    await press('d');
    await waitFor(() => frame().includes('$ git stash drop stash@{0}'), 'confirm modal');
    expect(stashCount(repo)).toBe(1);

    await press('x'); // unrelated keys do not confirm
    await press('\r');
    expect(stashCount(repo)).toBe(1);

    await press('n');
    await waitFor(() => frame().includes('Cancelled'), 'cancelled');
    expect(stashCount(repo)).toBe(1);

    await press('d');
    await waitFor(() => frame().includes('$ git stash drop stash@{0}'), 'confirm modal');
    await press('y');
    await waitFor(() => stashCount(repo!) === 0, 'stash dropped');
    await waitFor(() => frame().includes('No stashes in this repository'), 'empty after drop');
  });

  it('warns about likely conflicts before applying', async () => {
    repo = createRepo({ 'a.txt': '1\n' });
    repo.write('a.txt', '2\n');
    repo.git('stash', 'push', '-q');
    repo.write('a.txt', 'local\n');
    const { frame, press } = renderApp(repo.dir);
    await waitFor(() => frame().includes('stash@{0}'), 'list');
    await press('a');
    await waitFor(() => frame().includes('$ git stash apply stash@{0}'), 'confirm');
    expect(frame()).toContain('Conflicts are likely');
    expect(frame()).toContain('a.txt');
    await press('n');
  });

  it('shows Git errors when an action fails', async () => {
    repo = createRepo({ 'a.txt': '1\n' });
    repo.write('a.txt', '2\n');
    repo.git('stash', 'push', '-q');
    repo.write('a.txt', 'local\n');
    const { frame, press } = renderApp(repo.dir);
    await waitFor(() => frame().includes('stash@{0}'), 'list');
    await press('p');
    await waitFor(() => frame().includes('$ git stash pop stash@{0}'), 'confirm');
    await press('y');
    await waitFor(() => frame().includes('git stash pop stash@{0} failed'), 'error shown');
    expect(frame()).toMatch(/would be overwritten/);
    expect(stashCount(repo)).toBe(1);
  });

  it('filters stashes live by message and filename', async () => {
    repo = createRepo({ 'a.txt': '1\n', 'b.txt': '1\n' });
    repo.write('a.txt', '2\n');
    repo.git('stash', 'push', '-q', '-m', 'alpha work');
    repo.write('b.txt', '2\n');
    repo.git('stash', 'push', '-q', '-m', 'beta work');
    const { frame, press, backspace } = renderApp(repo.dir);
    await waitFor(() => frame().includes('1f +1 -1'), 'stats');
    await press('/');
    await press('alp');
    await waitFor(() => frame().includes('1/2 stashes'), 'filtered by message');
    expect(frame()).toContain('alpha work');
    expect(frame()).not.toContain('beta work');
    await backspace(3);
    await press('b.txt');
    await waitFor(() => frame().includes('beta work') && !frame().includes('alpha work'), 'file');
  });

  it('creates a branch after prompting for a name', async () => {
    repo = createRepo({ 'a.txt': '1\n' });
    repo.write('a.txt', '2\n');
    repo.git('stash', 'push', '-q');
    const { frame, press, backspace } = renderApp(repo.dir);
    await waitFor(() => frame().includes('stash@{0}'), 'list');
    await press('b');
    await waitFor(() => frame().includes('New branch from stash@{0}'), 'prompt');
    await press('main');
    await press('\r');
    await waitFor(() => frame().includes('already exists'), 'validation');
    await backspace(2);
    await press('\x15'); // Ctrl+U clears the field
    await press('rescued');
    await press('\r');
    await waitFor(() => frame().includes('$ git stash branch rescued stash@{0}'), 'confirm');
    await press('y');
    await waitFor(() => stashCount(repo!) === 0, 'branch created');
    expect(repo.git('rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('rescued');
  });

  it('toggles the full diff and help overlay', async () => {
    repo = createRepo({ 'a.txt': '1\n' });
    repo.write('a.txt', '2\n');
    repo.git('stash', 'push', '-q');
    const { frame, press } = renderApp(repo.dir);
    await waitFor(() => frame().includes('+2'), 'preview');
    await press('\r');
    await waitFor(() => frame().includes('Enter summary'), 'diff mode');
    expect(frame()).toMatch(/M {2}a\.txt +\+1 -1 · 1\/1/);
    expect(frame()).not.toContain('diff --git');
    await press('?');
    await waitFor(() => frame().includes('Keyboard shortcuts'), 'help');
    await press('?');
    await waitFor(() => !frame().includes('Keyboard shortcuts'), 'help closed');
  });

  it('scrolls the diff when it is focused and separates files with banners', async () => {
    const lines = (suffix = '') =>
      Array.from({ length: 60 }, (_, i) => `${i + 1}${suffix}`).join('\n') + '\n';
    repo = createRepo({ 'one.txt': lines(), 'two.txt': lines() });
    repo.write('one.txt', lines(' changed'));
    repo.write('two.txt', lines(' changed'));
    repo.git('stash', 'push', '-q', '-m', 'long');
    const { frame, press } = renderApp(repo.dir);
    await waitFor(() => /lines 1–\d+ of 121 ↓/.test(frame()), 'file diff with range');

    // j/k on the stash list must not scroll the diff.
    await press('j');
    expect(frame()).toMatch(/lines 1–\d+ of 121 ↓/);

    await press('\t');
    await press('\t');
    await waitFor(() => frame().includes('j/k scroll'), 'diff focused');
    await press('j');
    await press('\u001B[B'); // the mouse wheel arrives as arrow keys
    await waitFor(() => /lines 3–\d+ of 121 ↑↓/.test(frame()), 'scrolled two lines');

    await press(' ');
    await waitFor(() => !/lines 3–/.test(frame()), 'paged');

    // Enter opens the full diff on the current file; ] jumps to the next file's banner.
    await press('\r');
    await waitFor(() => frame().includes('Enter summary'), 'full diff');
    expect(frame()).toMatch(/M {2}one\.txt +\+60 -60 · 1\/2/);
    await press(']');
    await waitFor(() => /M {2}two\.txt +\+60 -60 · 2\/2/.test(frame()), 'next file banner');
    expect(frame()).toMatch(/two\.txt · lines \d+–\d+ of 245/);

    // Returning to the summary keeps the file that was being read.
    await press('\r');
    await waitFor(() => frame().includes('› M +60 -60 two.txt'), 'summary on second file');
  });
});
