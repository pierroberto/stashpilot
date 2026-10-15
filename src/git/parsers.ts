import type {
  DiffLine,
  DiffLineKind,
  FileChange,
  FileDiff,
  FileStatus,
  StashEntry,
  StashStats,
} from '../models/stash.js';
import { sanitizeLine } from '../utils/text.js';

export const FIELD_SEP = '\x1f';
export const RECORD_SEP = '\x1e';

/** `git stash list` pretty format producing one record per stash. */
export const STASH_LIST_FORMAT = ['%gd', '%H', '%P', '%ct', '%gs'].join('%x1f') + '%x1e';

interface ParsedSubject {
  branch: string | null;
  message: string | null;
  baseSubject: string | null;
}

/**
 * Parses a stash reflog subject:
 * - `WIP on <branch>: <sha> <commit subject>` (no custom message)
 * - `On <branch>: <message>` (created with `-m`)
 * - anything else (e.g. `git stash store -m`) is treated as a custom message.
 * Detached HEAD stashes report `(no branch)`, which maps to a null branch.
 */
export function parseStashSubject(subject: string): ParsedSubject {
  const wip = /^WIP on ([^:]+): [0-9a-f]+ ?(.*)$/.exec(subject);
  if (wip) {
    return { branch: normalizeBranch(wip[1]!), message: null, baseSubject: wip[2] || null };
  }
  const custom = /^On ([^:]+): (.*)$/.exec(subject);
  if (custom) {
    return { branch: normalizeBranch(custom[1]!), message: custom[2] ?? '', baseSubject: null };
  }
  return { branch: null, message: subject, baseSubject: null };
}

function normalizeBranch(name: string): string | null {
  return name === '(no branch)' ? null : name;
}

/** Parses output of `git stash list --format=<STASH_LIST_FORMAT>`. */
export function parseStashList(output: string): StashEntry[] {
  const entries: StashEntry[] = [];
  for (const raw of output.split(RECORD_SEP)) {
    const record = raw.replace(/^\n+/, '');
    if (!record.trim()) continue;
    const [ref = '', sha = '', parents = '', ct = '0', subject = ''] = record.split(FIELD_SEP);
    const match = /^stash@\{(\d+)\}$/.exec(ref);
    if (!match || !sha) continue;
    const [baseSha = '', indexSha = null, untrackedSha = null] = parents.trim().split(/\s+/);
    const parsed = parseStashSubject(subject);
    entries.push({
      index: Number(match[1]),
      ref,
      sha,
      baseSha,
      indexSha,
      untrackedSha,
      timestamp: Number(ct) || 0,
      subject,
      message: parsed.message,
      baseSubject: parsed.baseSubject,
      branch: parsed.branch,
      branchExists: null,
      baseIsMerge: null,
      hasUntracked: untrackedSha !== null,
    });
  }
  return entries;
}

const STATUS_CODES: Record<string, FileStatus> = {
  A: 'added',
  M: 'modified',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
  T: 'type-changed',
};

/**
 * Parses `git diff-tree -r -z --raw --numstat` output. Raw records come first
 * (`:mode mode sha sha STATUS\0path\0` or `...R100\0old\0new\0`), then numstat records
 * (`ins\tdel\tpath\0` or `ins\tdel\t\0old\0new\0` for renames).
 */
export function parseRawNumstat(output: string, untracked = false): FileChange[] {
  const tokens = output.split('\0');
  const byPath = new Map<string, FileChange>();
  const order: string[] = [];

  const upsert = (path: string): FileChange => {
    let change = byPath.get(path);
    if (!change) {
      change = {
        path,
        oldPath: null,
        status: untracked ? 'untracked' : 'unknown',
        insertions: 0,
        deletions: 0,
        binary: false,
        untracked,
      };
      byPath.set(path, change);
      order.push(path);
    }
    return change;
  };

  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i++]!;
    if (token === '') continue;
    if (token.startsWith(':')) {
      const code = token.split(' ').pop() ?? '';
      const letter = code.charAt(0);
      const status = untracked ? 'untracked' : (STATUS_CODES[letter] ?? 'unknown');
      if (letter === 'R' || letter === 'C') {
        const oldPath = tokens[i++] ?? '';
        const path = tokens[i++] ?? '';
        const change = upsert(path);
        change.status = status;
        change.oldPath = oldPath;
      } else {
        const change = upsert(tokens[i++] ?? '');
        change.status = status;
      }
      continue;
    }
    const parts = token.split('\t');
    if (parts.length < 3) continue;
    const [ins = '', del = '', inlinePath = ''] = parts;
    let path = inlinePath;
    if (inlinePath === '') {
      i++; // old path
      path = tokens[i++] ?? '';
    }
    const change = upsert(path);
    if (ins === '-' || del === '-') {
      change.binary = true;
      change.insertions = null;
      change.deletions = null;
    } else {
      change.insertions = Number(ins) || 0;
      change.deletions = Number(del) || 0;
    }
  }
  return order.map((p) => byPath.get(p)!);
}

export function summarizeChanges(files: FileChange[]): StashStats {
  let insertions = 0;
  let deletions = 0;
  let untrackedCount = 0;
  for (const f of files) {
    insertions += f.insertions ?? 0;
    deletions += f.deletions ?? 0;
    if (f.untracked) untrackedCount++;
  }
  return { files, fileCount: files.length, insertions, deletions, untrackedCount };
}

export interface StatusEntry {
  path: string;
  origPath: string | null;
  index: string;
  worktree: string;
}

/** Parses `git status --porcelain=v1 -z`. */
export function parsePorcelainStatus(output: string): StatusEntry[] {
  const tokens = output.split('\0');
  const entries: StatusEntry[] = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i++]!;
    if (token.length < 4) continue;
    const index = token.charAt(0);
    const worktree = token.charAt(1);
    const path = token.slice(3);
    let origPath: string | null = null;
    if (index === 'R' || index === 'C') origPath = tokens[i++] ?? null;
    entries.push({ path, origPath, index, worktree });
  }
  return entries;
}

/** Undoes Git's C-style path quoting (`"dir/a\"b\303\251"`). Unquoted input is returned as-is. */
export function unquoteGitPath(value: string): string {
  if (!value.startsWith('"') || !value.endsWith('"') || value.length < 2) return value;
  const body = value.slice(1, -1);
  const bytes: number[] = [];
  const escapes: Record<string, number> = {
    a: 7,
    b: 8,
    t: 9,
    n: 10,
    v: 11,
    f: 12,
    r: 13,
    '"': 34,
    '\\': 92,
  };
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (ch !== '\\') {
      bytes.push(...Buffer.from(ch, 'utf8'));
      continue;
    }
    const next = body[i + 1] ?? '';
    if (/[0-7]/.test(next)) {
      bytes.push(parseInt(body.slice(i + 1, i + 4), 8));
      i += 3;
    } else {
      bytes.push(escapes[next] ?? next.charCodeAt(0));
      i += 1;
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

function stripPrefix(raw: string, prefix: 'a/' | 'b/'): string | null {
  const value = unquoteGitPath(raw.replace(/\t$/, ''));
  if (value === '/dev/null') return null;
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

/** Extracts the post-image path from a `diff --git` block. */
export function pathFromDiffBlock(lines: string[]): string {
  let minus: string | null = null;
  for (const line of lines) {
    if (line.startsWith('rename to ')) return unquoteGitPath(line.slice('rename to '.length));
    if (line.startsWith('copy to ')) return unquoteGitPath(line.slice('copy to '.length));
    if (line.startsWith('+++ ')) {
      const plus = stripPrefix(line.slice(4), 'b/');
      if (plus !== null) return plus;
    }
    if (line.startsWith('--- ')) minus = stripPrefix(line.slice(4), 'a/');
    if (line.startsWith('@@')) break;
  }
  if (minus !== null) return minus;
  // Binary or mode-only change: header is `diff --git a/<p> b/<p>` with identical paths.
  const header = (lines[0] ?? '').slice('diff --git '.length);
  if (header.startsWith('"')) {
    const end = header.indexOf('" ');
    if (end > 0) return stripPrefix(header.slice(0, end + 1), 'a/') ?? header;
  }
  const len = (header.length - 5) / 2;
  if (Number.isInteger(len) && len > 0) return header.slice(2, 2 + len);
  return header;
}

function classify(line: string, inHunk: boolean): DiffLineKind {
  if (line.startsWith('diff --git ')) return 'file-header';
  if (inHunk) {
    if (line.startsWith('@@')) return 'hunk';
    if (line.startsWith('+')) return 'add';
    if (line.startsWith('-')) return 'del';
    if (line.startsWith('\\')) return 'note';
    return 'context';
  }
  if (line.startsWith('@@')) return 'hunk';
  return 'meta';
}

/** Splits a unified patch into per-file blocks with classified lines. */
export function parsePatch(patch: string, untracked = false): FileDiff[] {
  const files: FileDiff[] = [];
  let current: string[] | null = null;
  const blocks: string[][] = [];
  const raw = patch.endsWith('\n') ? patch.slice(0, -1) : patch;
  if (!raw) return files;
  for (const line of raw.split('\n')) {
    if (line.startsWith('diff --git ')) {
      current = [line];
      blocks.push(current);
    } else if (current) {
      current.push(line);
    }
  }
  for (const block of blocks) {
    let inHunk = false;
    const lines: DiffLine[] = block.map((text) => {
      if (text.startsWith('diff --git ')) inHunk = false;
      else if (text.startsWith('@@')) inHunk = true;
      return { kind: classify(text, inHunk), text: sanitizeLine(text) };
    });
    files.push({ path: pathFromDiffBlock(block), untracked, lines });
  }
  return files;
}

/** Parses `git rev-list --no-walk --parents <sha>...` into a set of SHAs that are merges. */
export function parseMergeCommits(output: string): Set<string> {
  const merges = new Set<string>();
  for (const line of output.split('\n')) {
    const [sha, ...parents] = line.trim().split(/\s+/);
    if (sha && parents.length > 1) merges.add(sha);
  }
  return merges;
}

/** Parses `git merge-tree --write-tree --name-only --no-messages` output into conflicted paths. */
export function parseMergeTreeConflicts(output: string): string[] {
  const lines = output.split('\n');
  const conflicts: string[] = [];
  for (const line of lines.slice(1)) {
    if (line === '') break;
    conflicts.push(line);
  }
  return [...new Set(conflicts)];
}
