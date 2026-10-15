import { render } from 'ink';
import { GitClient } from '../git/client.js';
import { App } from './App.js';

const ENTER_ALT_SCREEN = '\x1b[?1049h\x1b[H';
const LEAVE_ALT_SCREEN = '\x1b[?1049l';

/** Renders the full-screen TUI and resolves when the user quits. */
export async function runTui(repoRoot: string): Promise<void> {
  const git = new GitClient({ cwd: repoRoot, concurrency: 4 });
  const stdout = process.stdout;
  stdout.write(ENTER_ALT_SCREEN);
  const restore = () => stdout.write(LEAVE_ALT_SCREEN);
  process.once('exit', restore);
  try {
    const instance = render(<App git={git} repoRoot={repoRoot} />, { exitOnCtrlC: true });
    await instance.waitUntilExit();
  } finally {
    process.off('exit', restore);
    restore();
  }
}
