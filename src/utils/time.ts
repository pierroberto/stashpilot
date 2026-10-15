const UNITS: [unit: string, seconds: number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** Formats a unix timestamp (seconds) relative to `now` (ms), e.g. `2 hours ago`. */
export function relativeTime(timestampSeconds: number, now: number = Date.now()): string {
  const delta = Math.round(now / 1000 - timestampSeconds);
  if (delta < 0) return 'in the future';
  if (delta < 45) return 'just now';
  for (const [unit, seconds] of UNITS) {
    const value = Math.floor(delta / seconds);
    if (value >= 1) return `${value} ${unit}${value === 1 ? '' : 's'} ago`;
  }
  return '1 minute ago';
}

/** Compact form for narrow columns, e.g. `2h`, `3d`. */
export function shortRelativeTime(timestampSeconds: number, now: number = Date.now()): string {
  const delta = Math.max(0, Math.round(now / 1000 - timestampSeconds));
  if (delta < 60) return 'now';
  const short: Record<string, string> = {
    year: 'y',
    month: 'mo',
    week: 'w',
    day: 'd',
    hour: 'h',
    minute: 'm',
  };
  for (const [unit, seconds] of UNITS) {
    const value = Math.floor(delta / seconds);
    if (value >= 1) return `${value}${short[unit]}`;
  }
  return 'now';
}
