import { Box, Text } from 'ink';
import type { PendingAction } from '../../types/ui.js';
import { formatCommand } from '../../utils/shell.js';
import { theme } from '../theme.js';

const TITLES = {
  apply: 'Apply stash',
  pop: 'Pop stash',
  drop: 'Drop stash',
  branch: 'Create branch from stash',
} as const;

function notes(pending: PendingAction): string[] {
  const { action, stash, branch } = pending;
  switch (action) {
    case 'apply':
      return ['Applies the changes to your working tree. The stash is kept.'];
    case 'pop':
      return [
        'Applies the changes and removes the stash on success.',
        'If applying conflicts, Git keeps the stash.',
      ];
    case 'drop':
      return [
        'Permanently removes the stash from the stash list.',
        `Recovery is only possible via its commit SHA: ${stash.sha}`,
      ];
    case 'branch':
      return [
        `Creates and checks out "${branch ?? ''}" at ${stash.baseSha.slice(0, 7)}, applies the stash, and drops it on success.`,
        'Your current branch will change.',
      ];
  }
}

export function ConfirmDialog({ pending, width }: { pending: PendingAction; width: number }) {
  const destructive = pending.action === 'drop' || pending.assessment?.conflictLikely === true;
  const warnings = pending.assessment?.warnings ?? [];
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={destructive ? theme.danger : theme.warning}
      paddingX={1}
      width={Math.min(width, 100)}
    >
      <Text bold color={destructive ? theme.danger : theme.warning}>
        {TITLES[pending.action]} {pending.stash.ref}?
      </Text>
      <Text> </Text>
      <Text>This will run:</Text>
      <Text bold color={theme.actionPrimary}>
        {'  $ '}
        {formatCommand(pending.args)}
      </Text>
      <Text> </Text>
      {notes(pending).map((n) => (
        <Text key={n} color={theme.textSecondary} wrap="wrap">
          {n}
        </Text>
      ))}
      {warnings.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          {warnings.map((w) => (
            <Text key={w} color={theme.warning} wrap="wrap">
              ⚠ {w}
            </Text>
          ))}
        </Box>
      ) : null}
      {pending.assessment?.conflictLikely ? (
        <Box marginTop={1}>
          <Text color={theme.danger} bold wrap="wrap">
            Conflicts are likely. Git will not discard your changes, but you may need to resolve
            conflicts manually.
          </Text>
        </Box>
      ) : null}
      <Box marginTop={1}>
        <Text>
          Press{' '}
          <Text bold color={theme.actionPrimary}>
            y
          </Text>{' '}
          to confirm,{' '}
          <Text bold color={theme.actionPrimary}>
            n
          </Text>{' '}
          or{' '}
          <Text bold color={theme.actionPrimary}>
            Esc
          </Text>{' '}
          to cancel.
        </Text>
      </Box>
    </Box>
  );
}
