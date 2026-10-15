import { Box, Text } from 'ink';
import { theme } from '../theme.js';

export const KEY_BINDINGS: [keys: string, description: string][] = [
  ['j / k, ↓ / ↑', 'Move between stashes (or files / diff lines in the preview)'],
  ['h / l, Tab', 'Switch focus between stash list and preview'],
  ['Enter', 'Toggle file summary / full diff'],
  ['PgDn / PgUp, Space', 'Scroll the diff by a page'],
  ['g / G', 'Jump to top / bottom'],
  ['/', 'Filter by message, branch, or changed filename'],
  ['a', 'Apply selected stash (keeps it)'],
  ['p', 'Pop selected stash (apply, then drop on success)'],
  ['d', 'Drop selected stash'],
  ['b', 'Create a branch from selected stash'],
  ['r', 'Refresh stash data'],
  ['?', 'Toggle this help'],
  ['q / Esc', 'Quit (Esc clears an active filter first)'],
];

export function HelpOverlay({ width }: { width: number }) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.focusRing}
      paddingX={1}
      width={Math.min(width, 84)}
    >
      <Text bold>Keyboard shortcuts</Text>
      <Text> </Text>
      {KEY_BINDINGS.map(([keys, description]) => (
        <Text key={keys} wrap="truncate-end">
          <Text color={theme.actionPrimary}>{keys.padEnd(20)}</Text>
          {description}
        </Text>
      ))}
      <Text> </Text>
      <Text color={theme.textMuted}>
        Every action that changes your repository asks for confirmation first.
      </Text>
      <Text color={theme.textMuted}>Press ? or Esc to close.</Text>
    </Box>
  );
}
