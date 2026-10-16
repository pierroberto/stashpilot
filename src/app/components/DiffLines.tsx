import { Box, Text } from 'ink';
import type { DiffLineKind, FileChange } from '../../models/stash.js';
import type { ViewLine } from '../diffView.js';
import { truncate } from '../../utils/text.js';
import { theme, type Theme } from '../theme.js';

const COLOR: Record<DiffLineKind, keyof Theme> = {
  'file-header': 'diffHeader',
  meta: 'diffMeta',
  hunk: 'diffHunk',
  add: 'diffAdd',
  del: 'diffDel',
  context: 'textPrimary',
  note: 'textMuted',
};

export const STATUS_LETTER: Record<FileChange['status'], string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  'type-changed': 'T',
  untracked: 'U',
  unknown: '?',
};

export function changeLabel(change: FileChange): string {
  return change.oldPath ? `${change.oldPath} → ${change.path}` : change.path;
}

function changeCounts(change: FileChange): string {
  return change.binary ? 'binary' : `+${change.insertions} -${change.deletions}`;
}

interface BannerProps {
  change: FileChange;
  width: number;
  /** Extra right-aligned text, e.g. the file position or visible line range. */
  info?: string;
  active?: boolean;
}

/** Full-width bar that introduces a file in the diff pane. */
export function FileBanner({ change, width, info, active = false }: BannerProps) {
  const right = ` ${[changeCounts(change), info].filter(Boolean).join(' · ')} `;
  const leftWidth = Math.max(1, width - right.length);
  const left = truncate(` ${STATUS_LETTER[change.status]}  ${changeLabel(change)}`, leftWidth);
  return (
    <Text inverse bold color={active ? theme.focusRing : theme.diffHeader} wrap="truncate-end">
      {left.padEnd(leftWidth)}
      {right.length < width ? right : ''}
    </Text>
  );
}

interface Props {
  lines: ViewLine[];
  offset: number;
  height: number;
  width: number;
}

/** Renders only the visible window of a (possibly very large) diff. */
export function DiffLines({ lines, offset, height, width }: Props) {
  const visible = lines.slice(offset, offset + height);
  return (
    <Box flexDirection="column" height={height} overflow="hidden">
      {visible.map((line, i) => {
        const key = offset + i;
        if (line.kind === 'spacer') return <Text key={key}> </Text>;
        if (line.kind === 'banner') {
          return (
            <FileBanner
              key={key}
              change={line.change}
              width={width}
              info={`${line.position}/${line.total}`}
            />
          );
        }
        return (
          <Text key={key} wrap="truncate-end" color={theme[COLOR[line.kind]]}>
            {line.text || ' '}
          </Text>
        );
      })}
    </Box>
  );
}
