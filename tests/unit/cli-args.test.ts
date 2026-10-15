import { describe, expect, it } from 'vitest';
import { parseArgs } from '../../src/program.js';

describe('parseArgs', () => {
  it.each([
    [[], { command: 'tui' }],
    [['list'], { command: 'list', json: false }],
    [['list', '--json'], { command: 'list', json: true }],
    [['--help'], { command: 'help' }],
    [['-h'], { command: 'help' }],
    [['--version'], { command: 'version' }],
    [['-v'], { command: 'version' }],
  ])('%j', (argv, expected) => {
    expect(parseArgs(argv)).toEqual(expected);
  });

  it('rejects unknown commands and options', () => {
    expect(parseArgs(['push'])).toEqual({ command: 'error', message: 'Unknown command: push' });
    expect(parseArgs(['list', '--yaml'])).toEqual({
      command: 'error',
      message: 'Unknown option: --yaml',
    });
  });
});
