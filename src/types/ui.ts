import type { ApplyAssessment, MutatingAction, StashEntry } from '../models/stash.js';

export type Focus = 'list' | 'preview';

export type PreviewMode = 'summary' | 'diff';

export interface PendingAction {
  action: MutatingAction;
  stash: StashEntry;
  /** Exact command shown to the user and executed on confirmation. */
  args: string[];
  branch?: string;
  assessment: ApplyAssessment | null;
}

export type Overlay =
  | { kind: 'none' }
  | { kind: 'help' }
  | { kind: 'filter' }
  | { kind: 'branch-input'; stash: StashEntry; value: string; error: string | null }
  | { kind: 'confirm'; pending: PendingAction }
  | { kind: 'busy'; label: string };

export type StatusMessage = { kind: 'info' | 'success' | 'error'; text: string } | null;
