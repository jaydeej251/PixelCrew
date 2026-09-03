/** New runs must never inherit a previous chat's workspace goal. */
export function normalizeNewRunGoal(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const goal = value.trim();
  return goal.length > 0 ? goal : null;
}
