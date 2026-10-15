import { Box, Text } from 'ink';
import { theme } from '../theme.js';

export function EmptyState({ filter }: { filter: string }) {
  if (filter) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text>No stashes match "{filter}".</Text>
        <Text color={theme.textMuted}>Press / to edit the filter or Esc to clear it.</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>No stashes in this repository.</Text>
      <Text> </Text>
      <Text color={theme.textSecondary}>Save work in progress with:</Text>
      <Text color={theme.actionPrimary}> git stash push -m "describe your change"</Text>
      <Text color={theme.textSecondary}>
        Include untracked files with -u. Press r to refresh, q to quit.
      </Text>
    </Box>
  );
}
