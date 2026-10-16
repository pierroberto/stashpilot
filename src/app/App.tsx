import { Box, Text, useApp, useInput, type Key } from 'ink';
import { basename } from 'node:path';
import { useCallback, useMemo, useState } from 'react';
import { GitError, type GitClient } from '../git/client.js';
import {
  actionArgs,
  assessApply,
  getStashStats,
  getWorkingTreeStatus,
  runAction,
  validateBranchName,
} from '../git/stash.js';
import type { MutatingAction, StashEntry } from '../models/stash.js';
import type { Focus, Overlay, PendingAction, PreviewMode, StatusMessage } from '../types/ui.js';
import { errorMessage } from '../utils/errors.js';
import { matchesFilter } from '../utils/filter.js';
import { formatCommand } from '../utils/shell.js';
import { BranchPrompt } from './components/BranchPrompt.js';
import { ConfirmDialog } from './components/ConfirmDialog.js';
import { EmptyState } from './components/EmptyState.js';
import { Footer, statusHeight } from './components/Footer.js';
import { HelpOverlay } from './components/HelpOverlay.js';
import { Preview, diffViewportHeight } from './components/Preview.js';
import { StashList } from './components/StashList.js';
import { usePreview } from './hooks/usePreview.js';
import { useStashes } from './hooks/useStashes.js';
import { useTerminalSize } from './hooks/useTerminalSize.js';
import { buildFullView, fileAtLine, fileBody, findFileDiff } from './diffView.js';
import { theme } from './theme.js';

export interface AppProps {
  git: GitClient;
  repoRoot: string;
  /** Injectable clock for deterministic tests. */
  now?: () => number;
}

interface Selection {
  sha: string | null;
  index: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, Math.max(min, max)));

/**
 * Applies a keypress to a single-line text field. Backspace (`\b`) and Delete (`\x7f`, sent by
 * most terminals for Backspace) remove the last character; Ctrl+U clears the field.
 */
function editText(value: string, input: string, key: Key): string | null {
  if (key.backspace || key.delete) return value.slice(0, -1);
  if (key.ctrl && input === 'u') return '';
  if (key.ctrl || key.meta || key.tab || key.return || key.escape) return null;
  if (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) return null;
  // eslint-disable-next-line no-control-regex
  const printable = input.replace(/[\u0000-\u001f\u007f]/g, '');
  return printable ? value + printable : null;
}

export function App({ git, repoRoot, now = Date.now }: AppProps) {
  const { exit } = useApp();
  const { columns, rows } = useTerminalSize();
  const { stashes, stats, statsErrors, loading, error, reload } = useStashes(git);

  const [selection, setSelection] = useState<Selection>({ sha: null, index: 0 });
  const [focus, setFocus] = useState<Focus>('list');
  const [mode, setMode] = useState<PreviewMode>('summary');
  const [overlay, setOverlay] = useState<Overlay>({ kind: 'none' });
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState<StatusMessage>(null);
  // Preview navigation belongs to one stash; it resets when the selection changes.
  const [nav, setNav] = useState<{ sha: string | null; file: number; scroll: number }>({
    sha: null,
    file: 0,
    scroll: 0,
  });
  const [previewVersion, setPreviewVersion] = useState(0);

  const visible = useMemo(
    () => stashes.filter((s) => matchesFilter(s, stats.get(s.sha), filter)),
    [stashes, stats, filter],
  );

  // Resolve the selection by commit SHA so it survives filtering and refreshes.
  const selectedIndex = useMemo(() => {
    const bySha = selection.sha ? visible.findIndex((s) => s.sha === selection.sha) : -1;
    return bySha >= 0 ? bySha : clamp(selection.index, 0, visible.length - 1);
  }, [visible, selection]);
  const selected: StashEntry | null = visible[selectedIndex] ?? null;

  const preview = usePreview(git, selected, previewVersion);
  const previewReady = preview.sha === selected?.sha;
  const fileCount = previewReady ? (preview.stats?.files.length ?? 0) : 0;

  const selectedSha = selected?.sha ?? null;
  const selectedFile = nav.sha === selectedSha ? nav.file : 0;
  const scroll = nav.sha === selectedSha ? nav.scroll : 0;
  const setSelectedFile = (update: number | ((file: number) => number)) =>
    setNav((n) => {
      const current = n.sha === selectedSha ? n.file : 0;
      const file = typeof update === 'function' ? update(current) : update;
      return { sha: selectedSha, file, scroll: 0 };
    });
  const setScroll = (update: number | ((scroll: number) => number)) =>
    setNav((n) => {
      const same = n.sha === selectedSha;
      const current = same ? n.scroll : 0;
      const next = typeof update === 'function' ? update(current) : update;
      return { sha: selectedSha, file: same ? n.file : 0, scroll: next };
    });

  // Diff rows for both preview modes; memoized because large diffs are expensive to rebuild.
  const previewStats = previewReady ? preview.stats : null;
  const previewDiff = previewReady ? preview.diff : null;
  const fullView = useMemo(
    () => (previewStats && previewDiff ? buildFullView(previewStats.files, previewDiff) : null),
    [previewStats, previewDiff],
  );
  const selectedChange = previewStats?.files[selectedFile];
  const fileLines = useMemo(
    () =>
      previewDiff && selectedChange ? fileBody(findFileDiff(previewDiff, selectedChange)) : null,
    [previewDiff, selectedChange],
  );

  // Focus zones depend on the mode: the file list exists only in summary mode.
  const zones: Focus[] = mode === 'summary' ? ['list', 'files', 'diff'] : ['list', 'diff'];
  const activeFocus: Focus = zones.includes(focus) ? focus : 'diff';

  // Layout.
  const statusLines = statusHeight(status);
  const bodyHeight = Math.max(4, rows - 2 - statusLines);
  const paneHeight = bodyHeight - 2;
  const listWidth = clamp(Math.round(columns * 0.4), 30, 64);
  const previewWidth = Math.max(20, columns - listWidth);
  const diffHeight = diffViewportHeight(paneHeight, mode, fileCount);
  const currentDiffLength = (mode === 'diff' ? fullView?.lines.length : fileLines?.length) ?? 0;
  const maxScroll = Math.max(0, currentDiffLength - diffHeight);
  const maxFullScroll = Math.max(
    0,
    (fullView?.lines.length ?? 0) - diffViewportHeight(paneHeight, 'diff', fileCount),
  );

  const select = useCallback(
    (index: number) => {
      const next = clamp(index, 0, visible.length - 1);
      setSelection({ sha: visible[next]?.sha ?? null, index: next });
    },
    [visible],
  );

  const refresh = useCallback(
    async (message?: StatusMessage) => {
      await reload();
      setPreviewVersion((v) => v + 1);
      setStatus(message ?? { kind: 'info', text: 'Refreshed.' });
    },
    [reload],
  );

  const prepareAction = useCallback(
    async (action: MutatingAction, stash: StashEntry, branch?: string) => {
      const args = actionArgs(action, stash, branch);
      if (action === 'drop') {
        setOverlay({ kind: 'confirm', pending: { action, stash, args, assessment: null } });
        return;
      }
      setOverlay({ kind: 'busy', label: 'Checking working tree…' });
      try {
        let pending: PendingAction;
        if (action === 'branch') {
          const dirty = await getWorkingTreeStatus(git);
          const warnings = dirty.length
            ? [
                `Working tree has ${dirty.length} uncommitted change(s); Git may refuse to switch branches.`,
              ]
            : [];
          pending = {
            action,
            stash,
            args,
            branch,
            assessment: {
              dirtyPaths: dirty.map((d) => d.path),
              overlappingPaths: [],
              untrackedCollisions: [],
              mergeConflicts: [],
              warnings,
              conflictLikely: false,
            },
          };
        } else {
          const stashStats = await getStashStats(git, stash, true);
          pending = { action, stash, args, assessment: await assessApply(git, stash, stashStats) };
        }
        setOverlay({ kind: 'confirm', pending });
      } catch (err) {
        setOverlay({ kind: 'none' });
        setStatus({ kind: 'error', text: errorMessage(err) });
      }
    },
    [git],
  );

  const execute = useCallback(
    async (pending: PendingAction) => {
      const command = formatCommand(pending.args);
      setOverlay({ kind: 'busy', label: `Running ${command}…` });
      let message: StatusMessage;
      try {
        const result = await runAction(git, pending.action, pending.stash, pending.branch);
        const output = (result.stdout.trim() || result.stderr.trim()).split('\n')[0] ?? '';
        message = {
          kind: 'success',
          text: `${command} succeeded${output ? `: ${output.trim()}` : ''}`,
        };
      } catch (err) {
        const detail = err instanceof GitError ? err.detail : errorMessage(err);
        message = { kind: 'error', text: `${command} failed:\n${detail}` };
      }
      setOverlay({ kind: 'none' });
      // Refresh after every attempt: a failed pop may still have modified the working tree.
      await refresh(message);
    },
    [git, refresh],
  );

  const submitBranch = useCallback(
    async (stash: StashEntry, value: string) => {
      try {
        const problem = await validateBranchName(git, value);
        if (problem) {
          setOverlay({ kind: 'branch-input', stash, value, error: problem });
          return;
        }
        await prepareAction('branch', stash, value.trim());
      } catch (err) {
        setOverlay({ kind: 'branch-input', stash, value, error: errorMessage(err) });
      }
    },
    [git, prepareAction],
  );

  useInput((input, key) => {
    switch (overlay.kind) {
      case 'busy':
        return;
      case 'help':
        if (input === '?' || input === 'q' || key.escape || key.return) {
          setOverlay({ kind: 'none' });
        }
        return;
      case 'confirm':
        if (input === 'y' || input === 'Y') {
          void execute(overlay.pending);
        } else if (input === 'n' || input === 'N' || input === 'q' || key.escape) {
          setOverlay({ kind: 'none' });
          setStatus({ kind: 'info', text: 'Cancelled.' });
        }
        return;
      case 'branch-input': {
        if (key.escape) {
          setOverlay({ kind: 'none' });
          return;
        }
        if (key.return) {
          void submitBranch(overlay.stash, overlay.value);
          return;
        }
        const value = editText(overlay.value, input, key);
        if (value !== null) setOverlay({ ...overlay, value, error: null });
        return;
      }
      case 'filter': {
        if (key.escape) {
          setFilter('');
          setOverlay({ kind: 'none' });
          return;
        }
        if (key.return || key.downArrow || key.upArrow) {
          setOverlay({ kind: 'none' });
          if (key.downArrow || key.upArrow) select(selectedIndex + (key.downArrow ? 1 : -1));
          return;
        }
        const value = editText(filter, input, key);
        if (value !== null) setFilter(value);
        return;
      }
      case 'none':
        break;
    }

    if (input === 'q') return exit();
    if (key.escape) {
      if (filter) {
        setFilter('');
        return;
      }
      return exit();
    }
    if (input === '?') return setOverlay({ kind: 'help' });
    if (input === '/') {
      setStatus(null);
      return setOverlay({ kind: 'filter' });
    }
    if (input === 'r') {
      setStatus({ kind: 'info', text: 'Refreshing…' });
      void refresh();
      return;
    }
    if (key.tab || input === 'h' || input === 'l') {
      const index = zones.indexOf(activeFocus);
      const next = key.tab
        ? (index + (key.shift ? zones.length - 1 : 1)) % zones.length
        : clamp(index + (input === 'l' ? 1 : -1), 0, zones.length - 1);
      setFocus(zones[next]!);
      return;
    }
    if (key.return) {
      if (mode === 'summary') {
        // Open the full diff at the selected file, ready to scroll.
        const offset = fullView?.fileOffsets[selectedFile] ?? 0;
        setMode('diff');
        setFocus('diff');
        setNav({ sha: selectedSha, file: selectedFile, scroll: clamp(offset, 0, maxFullScroll) });
      } else {
        // Back to the summary, selecting the file that was being read.
        const file = fullView ? fileAtLine(fullView.fileOffsets, scroll) : 0;
        setMode('summary');
        setNav({ sha: selectedSha, file, scroll: 0 });
      }
      return;
    }
    if (input === ']' || input === '[') {
      const step = input === ']' ? 1 : -1;
      if (mode === 'summary') {
        setSelectedFile((f) => clamp(f + step, 0, fileCount - 1));
      } else if (fullView) {
        const current = fileAtLine(fullView.fileOffsets, scroll);
        const target = clamp(current + step, 0, fullView.fileOffsets.length - 1);
        setScroll(clamp(fullView.fileOffsets[target] ?? 0, 0, maxScroll));
      }
      return;
    }

    // Fast key repeat can deliver several identical keys in one chunk (e.g. "jjj").
    const repeat = /^(j+|k+)$/.test(input) ? input.length : 1;
    const down = /^j+$/.test(input) || key.downArrow;
    const up = /^k+$/.test(input) || key.upArrow;
    const page = Math.max(1, diffHeight - 1);
    if (key.pageDown || input === ' ') return setScroll((s) => clamp(s + page, 0, maxScroll));
    if (key.pageUp) return setScroll((s) => clamp(s - page, 0, maxScroll));

    if (activeFocus === 'list') {
      if (down) return select(selectedIndex + repeat);
      if (up) return select(selectedIndex - repeat);
      if (input === 'g') return select(0);
      if (input === 'G') return select(visible.length - 1);
    } else if (activeFocus === 'files') {
      if (down || up) {
        setSelectedFile((f) => clamp(f + (down ? repeat : -repeat), 0, fileCount - 1));
        return;
      }
      if (input === 'g') return setSelectedFile(0);
      if (input === 'G') return setSelectedFile(Math.max(0, fileCount - 1));
    } else {
      if (down) return setScroll((s) => clamp(s + repeat, 0, maxScroll));
      if (up) return setScroll((s) => clamp(s - repeat, 0, maxScroll));
      if (input === 'g') return setScroll(0);
      if (input === 'G') return setScroll(maxScroll);
    }

    if (!selected) {
      if ('apdb'.includes(input) && input) setStatus({ kind: 'error', text: 'No stash selected.' });
      return;
    }
    if (input === 'a') return void prepareAction('apply', selected);
    if (input === 'p') return void prepareAction('pop', selected);
    if (input === 'd') return void prepareAction('drop', selected);
    if (input === 'b') {
      return setOverlay({ kind: 'branch-input', stash: selected, value: '', error: null });
    }
  });

  const header = (
    <Box height={1}>
      <Text wrap="truncate-end">
        <Text bold color={theme.actionPrimary}>
          Stashpilot
        </Text>
        <Text color={theme.textMuted}> · {basename(repoRoot)} · </Text>
        {loading && stashes.length === 0
          ? 'loading…'
          : filter
            ? `${visible.length}/${stashes.length} stashes`
            : `${stashes.length} ${stashes.length === 1 ? 'stash' : 'stashes'}`}
        {error ? <Text color={theme.danger}> · {error}</Text> : null}
      </Text>
    </Box>
  );

  let body;
  if (overlay.kind === 'help') {
    body = <HelpOverlay width={columns} />;
  } else if (overlay.kind === 'confirm') {
    body = <ConfirmDialog pending={overlay.pending} width={columns} />;
  } else if (overlay.kind === 'branch-input') {
    body = (
      <BranchPrompt
        stash={overlay.stash}
        value={overlay.value}
        error={overlay.error}
        width={columns}
      />
    );
  } else if (!loading && visible.length === 0) {
    body = <EmptyState filter={filter} />;
  } else {
    const now_ = now();
    body = (
      <Box flexDirection="row" height={bodyHeight}>
        <Box
          borderStyle="round"
          borderColor={activeFocus === 'list' ? theme.borderStrong : theme.borderSubtle}
          width={listWidth}
          height={bodyHeight}
          paddingX={1}
          flexShrink={0}
        >
          <StashList
            stashes={visible}
            stats={stats}
            statsErrors={statsErrors}
            selectedIndex={selectedIndex}
            focused={activeFocus === 'list'}
            width={listWidth - 4}
            height={paneHeight}
            now={now_}
          />
        </Box>
        <Box
          borderStyle="round"
          borderColor={activeFocus === 'list' ? theme.borderSubtle : theme.borderStrong}
          width={previewWidth}
          height={bodyHeight}
          paddingX={1}
        >
          {selected ? (
            <Preview
              stash={selected}
              preview={preview}
              mode={mode}
              focus={activeFocus}
              selectedFile={selectedFile}
              scroll={scroll}
              height={paneHeight}
              width={previewWidth - 4}
              now={now_}
              fullView={fullView}
              fileLines={fileLines}
            />
          ) : (
            <Text color={theme.textMuted}>Loading…</Text>
          )}
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      {header}
      <Box flexDirection="column" height={bodyHeight} overflow="hidden">
        {body}
      </Box>
      <Footer
        overlay={overlay}
        filter={filter}
        status={status}
        focus={activeFocus}
        mode={mode}
        statusLines={statusLines}
      />
    </Box>
  );
}
