// "" / whitespace → null (unlimited). "0" is a valid (very restrictive) limit, not
// unlimited — only blank means unlimited. Otherwise a non-negative finite number, or throw.
export function parseCreditLimit(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("Credit limit must be a non-negative number, or blank for unlimited.");
  }
  return n;
}

// "" / whitespace → null (auto-generate). Otherwise the trimmed value, which must be
// >= 8 characters, else throw. Mirrors parseCreditLimit's blank-means-default shape.
export function parseResetPassword(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (trimmed.length < 8) {
    throw new Error("Password must be at least 8 characters, or blank to auto-generate.");
  }
  return trimmed;
}
