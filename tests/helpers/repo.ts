import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export interface TestRepo {
  dir: string;
  git: (...args: string[]) => string;
  write: (path: string, content: string) => void;
  cleanup: () => void;
}

/** Creates an isolated temporary repository with one initial commit on `main`. */
export function createRepo(files: Record<string, string> = { 'README.md': 'hello\n' }): TestRepo {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'spilot-test-')));
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const write = (path: string, content: string) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  };
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  git('config', 'commit.gpgsign', 'false');
  for (const [path, content] of Object.entries(files)) write(path, content);
  git('add', '.');
  git('commit', '-q', '-m', 'initial');
  return { dir, git, write, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export function createTempDir(): { dir: string; cleanup: () => void } {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'spilot-nogit-')));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
