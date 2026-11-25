// The references that arrived since the Market page last loaded its boards (D530): what the
// copilot's fetch just brought in lands highlighted once. Pure, and empty on the first load, so
// opening the page never marks what was already there.

export function newItemIds(previous: Set<string> | null, current: string[]): Set<string> {
  if (previous === null) return new Set();
  return new Set(current.filter((id) => !previous.has(id)));
}
