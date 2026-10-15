import { runCli } from './program.js';
import { errorMessage } from './utils/errors.js';

runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  isTTY: Boolean(process.stdin.isTTY && process.stdout.isTTY),
}).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`spilot: ${errorMessage(error)}\n`);
    process.exitCode = 1;
  },
);
