import { describe, expect, it } from 'vitest';
import { createLimiter } from '../../src/utils/limit.js';
import { relativeTime, shortRelativeTime } from '../../src/utils/time.js';
import { formatCommand, shellQuote } from '../../src/utils/shell.js';
import { matchesFilter } from '../../src/utils/filter.js';
import { truncate, sanitizeLine } from '../../src/utils/text.js';
import type { StashEntry, StashStats } from '../../src/models/stash.js';

describe('relativeTime', () => {
  const now = 1_700_000_000_000;
  const at = (secondsAgo: number) => now / 1000 - secondsAgo;
  it.each([
    [10, 'just now'],
    [60, '1 minute ago'],
    [2 * 3600, '2 hours ago'],
    [86400, '1 day ago'],
    [14 * 86400, '2 weeks ago'],
    [400 * 86400, '1 year ago'],
  ])('%i seconds → %s', (secs, expected) => {
    expect(relativeTime(at(secs), now)).toBe(expected);
  });
  it('formats short form', () => {
    expect(shortRelativeTime(at(3 * 3600), now)).toBe('3h');
    expect(shortRelativeTime(at(5), now)).toBe('now');
  });
});

describe('shellQuote', () => {
  it('leaves safe args alone and quotes others', () => {
    expect(shellQuote('stash@{0}')).toBe('stash@{0}');
    expect(shellQuote('feature/new-thing')).toBe('feature/new-thing');
    expect(shellQuote("it's")).toBe(`'it'\\''s'`);
    expect(shellQuote('a b')).toBe(`'a b'`);
    expect(formatCommand(['stash', 'drop', 'stash@{2}'])).toBe('git stash drop stash@{2}');
  });
});

describe('createLimiter', () => {
  it('never exceeds the concurrency limit', async () => {
    const limit = createLimiter(2);
    let active = 0;
    let peak = 0;
    const task = () =>
      limit(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
      });
    await Promise.all(Array.from({ length: 10 }, task));
    expect(peak).toBe(2);
  });

  it('runs urgent tasks before queued ones', async () => {
    const limit = createLimiter(1);
    const order: string[] = [];
    const run = (name: string, urgent = false) =>
      limit(async () => {
        order.push(name);
        await new Promise((r) => setTimeout(r, 1));
      }, urgent);
    await Promise.all([run('first'), run('second'), run('third'), run('urgent', true)]);
    expect(order).toEqual(['first', 'urgent', 'second', 'third']);
  });

  it('propagates rejections and keeps going', async () => {
    const limit = createLimiter(1);
    await expect(limit(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(limit(() => Promise.resolve(1))).resolves.toBe(1);
  });
});

describe('matchesFilter', () => {
  const stash = {
    ref: 'stash@{0}',
    subject: 'On feature/login: fix redirect',
    message: 'fix redirect',
    branch: 'feature/login',
  } as StashEntry;
  const stats = { files: [{ path: 'src/auth/session.ts' }] } as StashStats;

  it('matches message, branch, and filename case-insensitively', () => {
    expect(matchesFilter(stash, stats, 'REDIRECT')).toBe(true);
    expect(matchesFilter(stash, stats, 'login')).toBe(true);
    expect(matchesFilter(stash, stats, 'session.ts')).toBe(true);
    expect(matchesFilter(stash, stats, 'nothing')).toBe(false);
    expect(matchesFilter(stash, undefined, 'session')).toBe(false);
    expect(matchesFilter(stash, undefined, '  ')).toBe(true);
  });
});

describe('text helpers', () => {
  it('truncates with an ellipsis', () => {
    expect(truncate('abcdef', 4)).toBe('abc…');
    expect(truncate('abc', 4)).toBe('abc');
    expect(truncate('abc', 0)).toBe('');
  });
  it('sanitizes control characters', () => {
    expect(sanitizeLine('a\tb\x1b[31mc\r')).toBe('a    b[31mc');
  });
});
