// Shared by any table row that shows a fallback avatar when there's no logo — first
// letter of up to the first two words, uppercased.
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}
