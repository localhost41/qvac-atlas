import {
  createAnonymousSubmissionClient,
  type AnonymousSubmissionClient,
} from "@qvac-atlas/submission";

/**
 * Release activation seam. Keep null until the exact HTTPS deployment passes
 * ATLAS-036 privacy, operations, and independent deployment review.
 */
export const REVIEWED_ANONYMOUS_RELAY_ORIGIN: string | null = null;

export function configuredAnonymousSubmissionClient(): AnonymousSubmissionClient | null {
  return REVIEWED_ANONYMOUS_RELAY_ORIGIN === null
    ? null
    : createAnonymousSubmissionClient(REVIEWED_ANONYMOUS_RELAY_ORIGIN);
}
