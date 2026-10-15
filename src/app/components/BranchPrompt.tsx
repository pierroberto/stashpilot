import { Box, Text } from 'ink';
import type { StashEntry } from '../../models/stash.js';
import { theme } from '../theme.js';

interface Props {
  stash: StashEntry;
  value: string;
  error: string | null;
  width: number;
}

export function BranchPrompt({ stash, value, error, width }: Props) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.focusRing}
      paddingX={1}
      width={Math.min(width, 80)}
    >
      <Text bold>New branch from {stash.ref}</Text>
      <Text color={theme.textMuted}>
        Branch is created at the stash's base commit {stash.baseSha.slice(0, 7)}.
      </Text>
      <Text> </Text>
      <Text>
        <Text color={theme.actionPrimary}>name › </Text>
        {value}
        <Text inverse> </Text>
      </Text>
      {error ? <Text color={theme.danger}>✖ {error}</Text> : null}
      <Text> </Text>
      <Text color={theme.textMuted}>Enter to continue · Esc to cancel</Text>
    </Box>
  );
}
