import { Box, Text } from 'ink';
import type { Focus, Overlay, PreviewMode, StatusMessage } from '../../types/ui.js';
import { theme } from '../theme.js';

interface Props {
  overlay: Overlay;
  filter: string;
  status: StatusMessage;
  focus: Focus;
  mode: PreviewMode;
  statusLines: number;
}

/** Number of lines a status message occupies (errors may span up to 3). */
export function statusHeight(status: StatusMessage): number {
  if (!status) return 1;
  return Math.min(3, status.text.split('\n').length);
}

function hints(focus: Focus, mode: PreviewMode): string {
  const nav =
    focus === 'list' ? 'j/k stash' : mode === 'diff' ? 'j/k scroll' : 'j/k file · PgDn scroll';
  return `${nav} · Tab focus · Enter ${mode === 'summary' ? 'diff' : 'summary'} · / filter · a apply · p pop · d drop · b branch · r refresh · ? help · q quit`;
}

export function Footer({ overlay, filter, status, focus, mode, statusLines }: Props) {
  let statusLine;
  if (overlay.kind === 'filter') {
    statusLine = (
      <Text>
        <Text color={theme.actionPrimary}>/</Text>
        {filter}
        <Text inverse> </Text>
        <Text color={theme.textMuted}> Enter keep · Esc clear</Text>
      </Text>
    );
  } else if (overlay.kind === 'busy') {
    statusLine = <Text color={theme.warning}>⟳ {overlay.label}</Text>;
  } else if (status) {
    const color =
      status.kind === 'error'
        ? theme.danger
        : status.kind === 'success'
          ? theme.success
          : undefined;
    const icon = status.kind === 'error' ? '✖ ' : status.kind === 'success' ? '✔ ' : '';
    statusLine = (
      <Text color={color} wrap="truncate-end">
        {icon}
        {status.text.split('\n').slice(0, statusLines).join('\n')}
      </Text>
    );
  } else if (filter) {
    statusLine = (
      <Text color={theme.textMuted}>
        filter: <Text color={theme.textPrimary}>{filter}</Text> (Esc to clear)
      </Text>
    );
  } else {
    statusLine = <Text> </Text>;
  }
  return (
    <Box flexDirection="column">
      <Box height={statusLines} overflow="hidden">
        {statusLine}
      </Box>
      <Text color={theme.textMuted} wrap="truncate-end">
        {hints(focus, mode)}
      </Text>
    </Box>
  );
}
