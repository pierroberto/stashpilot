import { GitError } from '../git/client.js';

/** Produces a user-facing message, including the failing Git command when available. */
export function errorMessage(error: unknown): string {
  if (error instanceof GitError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}
