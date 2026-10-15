import { Box, Text } from 'ink';
import type { DiffLine, DiffLineKind } from '../../models/stash.js';
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

interface Props {
  lines: DiffLine[];
  offset: number;
  height: number;
}

/** Renders only the visible window of a (possibly very large) diff. */
export function DiffLines({ lines, offset, height }: Props) {
  const visible = lines.slice(offset, offset + height);
  return (
    <Box flexDirection="column" height={height} overflow="hidden">
      {visible.map((line, i) => (
        <Text
          key={offset + i}
          wrap="truncate-end"
          color={theme[COLOR[line.kind]]}
          bold={line.kind === 'file-header'}
        >
          {line.text || ' '}
        </Text>
      ))}
    </Box>
  );
}
