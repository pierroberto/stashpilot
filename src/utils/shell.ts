const SAFE = /^[A-Za-z0-9_@%+=:,./{}-]+$/;

/** Quotes an argument for display as a POSIX shell command. */
export function shellQuote(arg: string): string {
  if (arg.length > 0 && SAFE.test(arg)) return arg;
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

export function formatCommand(args: readonly string[]): string {
  return ['git', ...args].map(shellQuote).join(' ');
}
