import { Box, Text } from 'ink';
import type { FileChange, StashEntry, StashStats } from '../../models/stash.js';
import type { PreviewState } from '../hooks/usePreview.js';
import type { Focus, PreviewMode } from '../../types/ui.js';
import { fileAtLine, type DiffView, type ViewLine } from '../diffView.js';
import { relativeTime } from '../../utils/time.js';
import { pluralize } from '../../utils/text.js';
import { theme } from '../theme.js';
import { DiffLines, FileBanner, STATUS_LETTER, changeLabel } from './DiffLines.js';
import { stashTitle, windowStart } from './StashList.js';

interface Props {
  stash: StashEntry;
  preview: PreviewState;
  mode: PreviewMode;
  focus: Focus;
  selectedFile: number;
  scroll: number;
  height: number;
  width: number;
  now: number;
  /** Full diff with file banners (diff mode). */
  fullView: DiffView | null;
  /** Body of the selected file's diff (summary mode). */
  fileLines: ViewLine[] | null;
}

const HEADER_HEIGHT = 4;

/** Rows available to the file list in summary mode. */
export function fileListHeight(bodyHeight: number, fileCount: number): number {
  return Math.max(1, Math.min(fileCount, Math.max(3, Math.floor(bodyHeight * 0.4))));
}

/**
 * Rows available to scrollable diff content. Both modes reserve one row: the selected file's
 * banner in summary mode, the scroll position indicator in diff mode.
 */
export function diffViewportHeight(height: number, mode: PreviewMode, fileCount: number): number {
  const body = Math.max(1, height - HEADER_HEIGHT);
  if (mode === 'diff') return Math.max(1, body - 1);
  return Math.max(1, body - fileListHeight(body, fileCount) - 1);
}

/** Describes the visible window, e.g. `lines 18–34 of 82 ↓`. */
export function lineRange(offset: number, height: number, total: number): string {
  if (total <= height) return `${pluralize(total, 'line')}`;
  const last = Math.min(total, offset + height);
  const arrows = `${offset > 0 ? '↑' : ''}${last < total ? '↓' : ''}`;
  return `lines ${offset + 1}–${last} of ${total} ${arrows}`;
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
      <Text> </Text>
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
  const highlight = selected && focused;
  const letterColor =
    file.status === 'deleted'
      ? theme.diffDel
      : file.status === 'untracked'
        ? theme.warning
        : file.status === 'added'
          ? theme.diffAdd
          : theme.actionPrimary;
  return (
    <Text wrap="truncate-start" inverse={highlight} bold={selected}>
      <Text color={highlight ? undefined : theme.focusRing}>{selected ? '›' : ' '}</Text>{' '}
      <Text color={highlight ? undefined : letterColor}>{STATUS_LETTER[file.status]}</Text>{' '}
      {file.binary ? (
        <Text color={highlight ? undefined : theme.textMuted}>bin </Text>
      ) : (
        <>
          <Text color={highlight ? undefined : theme.diffAdd}>+{file.insertions}</Text>{' '}
          <Text color={highlight ? undefined : theme.diffDel}>-{file.deletions}</Text>{' '}
        </>
      )}
      {changeLabel(file)}
    </Text>
  );
}

export function Preview({
  stash,
  preview,
  mode,
  focus,
  selectedFile,
  scroll,
  height,
  width,
  now,
  fullView,
  fileLines,
}: Props) {
  const ready = preview.sha === stash.sha;
  const stats = ready ? preview.stats : null;
  const body = Math.max(1, height - HEADER_HEIGHT);
  const fileCount = stats?.files.length ?? 0;
  const viewport = diffViewportHeight(height, mode, fileCount);

  let content;
  if (ready && preview.error) {
    content = (
      <Text color={theme.danger} wrap="wrap">
        ✖ {preview.error}
      </Text>
    );
  } else if (!stats || !fullView || !fileLines) {
    content = <Text color={theme.textMuted}>Loading preview…</Text>;
  } else if (stats.files.length === 0) {
    content = <Text color={theme.textMuted}>This stash contains no file changes.</Text>;
  } else if (mode === 'diff') {
    const current = stats.files[fileAtLine(fullView.fileOffsets, scroll)];
    content = (
      <>
        <DiffLines lines={fullView.lines} offset={scroll} height={viewport} width={width} />
        <Text wrap="truncate-end" color={focus === 'diff' ? theme.focusRing : theme.textMuted}>
          {current ? `${changeLabel(current)} · ` : ''}
          {lineRange(scroll, viewport, fullView.lines.length)}
        </Text>
      </>
    );
  } else {
    const listHeight = fileListHeight(body, stats.files.length);
    const start = windowStart(selectedFile, stats.files.length, listHeight);
    const file = stats.files[selectedFile];
    content = (
      <>
        <Box flexDirection="column" height={listHeight} overflow="hidden">
          {stats.files.slice(start, start + listHeight).map((f, i) => (
            <FileRow
              key={`${f.untracked ? 'u' : 't'}:${f.path}`}
              file={f}
              selected={start + i === selectedFile}
              focused={focus === 'files'}
            />
          ))}
        </Box>
        {file ? (
          <FileBanner
            change={file}
            width={width}
            active={focus === 'diff'}
            info={lineRange(scroll, viewport, fileLines.length)}
          />
        ) : null}
        <DiffLines lines={fileLines} offset={scroll} height={viewport} width={width} />
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
