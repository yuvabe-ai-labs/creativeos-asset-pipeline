// Pure slug helpers — shared by client and server (no secrets, no imports).

// "Acme Co." -> "acme-co"
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Ensure the slug is unique within a scope, suffixing -2, -3… on collision.
export function uniqueSlug(name: string, taken: Iterable<string>): string {
  const base = slugify(name) || "item";
  const used = new Set(taken);
  let slug = base;
  let n = 2;
  while (used.has(slug)) slug = `${base}-${n++}`;
  return slug;
}
