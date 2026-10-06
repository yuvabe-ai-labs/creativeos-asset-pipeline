// D309 — node types whose output IS an image: a URL in the active version (hydrated into
// `data.parsed` in the browser, D19). Every reader asking "is this upstream a generated image?"
// imports this instead of comparing against "image-gen", so a new image-producing node is one
// entry here rather than twenty call sites — the composite was nearly ignored by all of them.
export const GENERATED_IMAGE_TYPES: readonly string[] = ["image-gen", "composite"];

export function isGeneratedImageType(type: string | null | undefined): boolean {
  return typeof type === "string" && GENERATED_IMAGE_TYPES.includes(type);
}
