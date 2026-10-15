/**
 * Design tokens for the terminal UI.
 *
 * Primitives hold raw values (ANSI color names, so the user's terminal palette decides the
 * exact shade and both light and dark terminal themes stay legible). Components use only
 * the semantic tokens. Setting NO_COLOR (https://no-color.org) disables all colors.
 */
const primitives = {
  ansiDefault: undefined,
  ansiGreen: 'green',
  ansiRed: 'red',
  ansiYellow: 'yellow',
  ansiCyan: 'cyan',
  ansiMagenta: 'magenta',
  ansiBlue: 'blue',
  ansiGray: 'gray',
} as const;

type Color = string | undefined;

export interface Theme {
  textPrimary: Color;
  textSecondary: Color;
  textMuted: Color;
  actionPrimary: Color;
  borderSubtle: Color;
  borderStrong: Color;
  focusRing: Color;
  success: Color;
  danger: Color;
  warning: Color;
  diffAdd: Color;
  diffDel: Color;
  diffHunk: Color;
  diffHeader: Color;
  diffMeta: Color;
  branch: Color;
  ref: Color;
}

const semantic: Theme = {
  textPrimary: primitives.ansiDefault,
  textSecondary: primitives.ansiDefault,
  textMuted: primitives.ansiGray,
  actionPrimary: primitives.ansiCyan,
  borderSubtle: primitives.ansiGray,
  borderStrong: primitives.ansiCyan,
  focusRing: primitives.ansiCyan,
  success: primitives.ansiGreen,
  danger: primitives.ansiRed,
  warning: primitives.ansiYellow,
  diffAdd: primitives.ansiGreen,
  diffDel: primitives.ansiRed,
  diffHunk: primitives.ansiCyan,
  diffHeader: primitives.ansiYellow,
  diffMeta: primitives.ansiGray,
  branch: primitives.ansiMagenta,
  ref: primitives.ansiBlue,
};

const monochrome: Theme = Object.fromEntries(
  Object.keys(semantic).map((key) => [key, undefined]),
) as unknown as Theme;

export function createTheme(env: NodeJS.ProcessEnv = process.env): Theme {
  return env.NO_COLOR !== undefined && env.NO_COLOR !== '' ? monochrome : semantic;
}

export const theme: Theme = createTheme();
