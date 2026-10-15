import { Box, Text } from 'ink';
import type { FileChange, StashEntry, StashStats } from '../../models/stash.js';
import type { PreviewState } from '../hooks/usePreview.js';
import type { PreviewMode } from '../../types/ui.js';
import { relativeTime } from '../../utils/time.js';
import { pluralize } from '../../utils/text.js';
import { theme } from '../theme.js';
import { DiffLines } from './DiffLines.js';
import { stashTitle, windowStart } from './StashList.js';

interface Props {
  stash: StashEntry;
  preview: PreviewState;
  mode: PreviewMode;
  focused: boolean;
  selectedFile: number;
  scroll: number;
  height: number;
  now: number;
}

const HEADER_HEIGHT = 4;

const STATUS_LETTER: Record<FileChange['status'], string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  'type-changed': 'T',
  untracked: 'U',
  unknown: '?',
};

/** Rows available to the file list in summary mode. */
export function fileListHeight(bodyHeight: number, fileCount: number): number {
  return Math.max(1, Math.min(fileCount, Math.max(3, Math.floor(bodyHeight * 0.4))));
}

/** Rows available to scrollable diff content for a given pane height and mode. */
export function diffViewportHeight(height: number, mode: PreviewMode, fileCount: number): number {
  const body = Math.max(1, height - HEADER_HEIGHT);
  if (mode === 'diff') return body;
  return Math.max(1, body - fileListHeight(body, fileCount) - 1);
}

function StashHeader({
  stash,
  stats,
  now,
}: {
  stash: StashEntry;
  stats: StashStats | null;
  now: number;
}) {
  const date = new Date(stash.timestamp * 1000);
  return (
    <Box flexDirection="column" height={HEADER_HEIGHT}>
      <Text wrap="truncate-end" bold>
        <Text color={theme.ref}>{stash.ref}</Text> {stashTitle(stash)}
      </Text>
      <Text wrap="truncate-end" color={theme.textMuted}>
        <Text color={theme.branch}>
          {stash.branch === null
            ? 'detached HEAD'
            : stash.branchExists === false
              ? `${stash.branch} (branch no longer exists)`
              : stash.branch}
        </Text>
        {' · '}
        {relativeTime(stash.timestamp, now)} ({date.toLocaleString()}) · base{' '}
        {stash.baseSha.slice(0, 7)}
        {stash.baseIsMerge ? ' (merge commit)' : ''}
      </Text>
      <Text wrap="truncate-end">
        {stats ? (
          <>
            {pluralize(stats.fileCount, 'file')}{' '}
            <Text color={theme.diffAdd}>+{stats.insertions}</Text>{' '}
            <Text color={theme.diffDel}>-{stats.deletions}</Text>
            {stats.untrackedCount > 0 ? (
              <Text color={theme.warning}> · {stats.untrackedCount} untracked</Text>
            ) : null}
          </>
        ) : (
          <Text color={theme.textMuted}>Loading…</Text>
        )}
      </Text>
      <Text color={theme.borderSubtle}> </Text>
    </Box>
  );
}

function FileRow({
  file,
  selected,
  focused,
}: {
  file: FileChange;
  selected: boolean;
  focused: boolean;
}) {
  const letter = STATUS_LETTER[file.status];
  const letterColor =
    file.status === 'deleted'
      ? theme.diffDel
      : file.status === 'untracked'
        ? theme.warning
        : file.status === 'added'
          ? theme.diffAdd
          : theme.actionPrimary;
  return (
    <Text wrap="truncate-start" inverse={selected && focused} bold={selected}>
      <Text color={selected && focused ? undefined : letterColor}>{letter}</Text>{' '}
      {file.binary ? (
        <Text color={theme.textMuted}>bin </Text>
      ) : (
        <>
          <Text color={selected && focused ? undefined : theme.diffAdd}>+{file.insertions}</Text>{' '}
          <Text color={selected && focused ? undefined : theme.diffDel}>
            -{file.deletions}
          </Text>{' '}
        </>
      )}
      {file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
    </Text>
  );
}

export function Preview({
  stash,
  preview,
  mode,
  focused,
  selectedFile,
  scroll,
  height,
  now,
}: Props) {
  const ready = preview.sha === stash.sha;
  const stats = ready ? preview.stats : null;
  const diff = ready ? preview.diff : null;
  const body = Math.max(1, height - HEADER_HEIGHT);

  let content;
  if (ready && preview.error) {
    content = (
      <Text color={theme.danger} wrap="wrap">
        ✖ {preview.error}
      </Text>
    );
  } else if (!stats || !diff) {
    content = <Text color={theme.textMuted}>Loading preview…</Text>;
  } else if (stats.files.length === 0) {
    content = <Text color={theme.textMuted}>This stash contains no file changes.</Text>;
  } else if (mode === 'diff') {
    content = <DiffLines lines={diff.lines} offset={scroll} height={body} />;
  } else {
    const listHeight = fileListHeight(body, stats.files.length);
    const start = windowStart(selectedFile, stats.files.length, listHeight);
    const file = stats.files[selectedFile];
    const fileDiff = file
      ? diff.files.find((d) => d.path === file.path && d.untracked === file.untracked)
      : undefined;
    const diffHeight = diffViewportHeight(height, mode, stats.files.length);
    content = (
      <>
        <Box flexDirection="column" height={listHeight} overflow="hidden">
          {stats.files.slice(start, start + listHeight).map((f, i) => (
            <FileRow
              key={`${f.untracked ? 'u' : 't'}:${f.path}`}
              file={f}
              selected={start + i === selectedFile}
              focused={focused}
            />
          ))}
        </Box>
        <Text color={theme.borderSubtle} wrap="truncate-end">
          {'─'.repeat(200)}
        </Text>
        {fileDiff ? (
          <DiffLines lines={fileDiff.lines} offset={scroll} height={diffHeight} />
        ) : (
          <Text color={theme.textMuted}>No textual diff for this file.</Text>
        )}
      </>
    );
  }

  return (
    <Box flexDirection="column" height={height} overflow="hidden">
      <StashHeader stash={stash} stats={stats} now={now} />
      <Box flexDirection="column" height={body} overflow="hidden">
        {content}
      </Box>
    </Box>
  );
}
