import { Box, Text } from 'ink';
import type { StashEntry, StashStats } from '../../models/stash.js';
import { shortRelativeTime } from '../../utils/time.js';
import { truncate } from '../../utils/text.js';
import { theme } from '../theme.js';

interface Props {
  stashes: StashEntry[];
  stats: ReadonlyMap<string, StashStats>;
  statsErrors: ReadonlyMap<string, string>;
  selectedIndex: number;
  focused: boolean;
  width: number;
  height: number;
  now: number;
}

const ROW_HEIGHT = 2;

/** Index of the first visible row so the selection stays roughly centered. */
export function windowStart(selected: number, total: number, visible: number): number {
  if (total <= visible) return 0;
  return Math.max(0, Math.min(selected - Math.floor(visible / 2), total - visible));
}

export function stashTitle(stash: StashEntry): string {
  if (stash.message !== null && stash.message !== '') return stash.message;
  if (stash.baseSubject) return `WIP: ${stash.baseSubject}`;
  return stash.subject || '(no message)';
}

function branchLabel(stash: StashEntry): string {
  if (stash.branch === null) return 'detached';
  if (stash.branchExists === false) return `${stash.branch} (deleted)`;
  return stash.branch;
}

/** Virtualized stash list: only rows inside the viewport are rendered. */
export function StashList({
  stashes,
  stats,
  statsErrors,
  selectedIndex,
  focused,
  width,
  height,
  now,
}: Props) {
  const visible = Math.max(1, Math.floor(height / ROW_HEIGHT));
  const start = windowStart(selectedIndex, stashes.length, visible);
  const rows = stashes.slice(start, start + visible);
  const inner = Math.max(4, width);

  return (
    <Box flexDirection="column" height={height} overflow="hidden">
      {rows.map((stash, i) => {
        const selected = start + i === selectedIndex;
        const s = stats.get(stash.sha);
        const statError = statsErrors.get(stash.sha);
        const marker = selected ? '›' : ' ';
        const title = truncate(stashTitle(stash), Math.max(1, inner - stash.ref.length - 3));
        const age = shortRelativeTime(stash.timestamp, now);
        const statText = s ? `${s.fileCount}f` : statError ? 'stats failed' : '…';
        return (
          <Box key={stash.sha} flexDirection="column" width={inner}>
            <Text wrap="truncate-end" inverse={selected && focused} bold={selected}>
              <Text color={selected && focused ? undefined : theme.focusRing}>{marker} </Text>
              <Text color={selected && focused ? undefined : theme.ref}>{stash.ref}</Text> {title}
            </Text>
            <Text wrap="truncate-end">
              {'  '}
              <Text
                color={
                  stash.branch && stash.branchExists !== false ? theme.branch : theme.textMuted
                }
              >
                {branchLabel(stash)}
              </Text>
              <Text color={theme.textMuted}> · {age} · </Text>
              <Text color={statError ? theme.danger : theme.textSecondary}>{statText}</Text>
              {s ? (
                <>
                  {' '}
                  <Text color={theme.diffAdd}>+{s.insertions}</Text>{' '}
                  <Text color={theme.diffDel}>-{s.deletions}</Text>
                </>
              ) : null}
              {stash.hasUntracked ? <Text color={theme.warning}> U</Text> : null}
              {stash.baseIsMerge ? <Text color={theme.textMuted}> merge</Text> : null}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
