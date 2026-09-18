/**
 * Deleting a shared opportunity cascades into every user's tracking rows, so
 * only its creator may do it. Rows logged before `createdBy` existed have no
 * owner; those can be deleted as long as nobody else has started tracking them.
 */
export function canDeleteOpportunity(
  createdBy: string | null,
  userId: string,
  trackedByOthers: boolean,
): boolean {
  if (createdBy) return createdBy === userId;
  return !trackedByOthers;
}
