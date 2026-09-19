/**
 * How long a posting may sit in `extracting` before the Inbox treats it as
 * failed. Comfortably longer than the route's maxDuration, so a slow-but-alive
 * extraction is never mistaken for a dead one.
 */
export const STUCK_AFTER_MS = 3 * 60 * 1000;
