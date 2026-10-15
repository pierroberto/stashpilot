/** Truncates `text` to `width` columns, adding an ellipsis when cut. */
export function truncate(text: string, width: number): string {
  if (width <= 0) return '';
  if (text.length <= width) return text;
  if (width === 1) return '…';
  return `${text.slice(0, width - 1)}…`;
}

/** Expands tabs and strips control characters that would corrupt terminal rendering. */
export function sanitizeLine(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\t/g, '    ').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
