// Canonical list of user-addable node types + the keyboard mnemonics for the
// quick-add palette. PURE (no React/lucide) so it can be unit-tested in the
// node-env Vitest setup and imported anywhere. `kb` is intentionally excluded
// — it is not user-addable. The QuickAddMenu component maps each `type` to a
// Lucide icon via a TypeScript-enforced Record, so icon coverage is checked by
// the compiler while mnemonic/type integrity is checked by tests.

export type AddNodeType =
  | "script"
  | "file"
  | "text"
  | "prompt"
  | "draw"
  | "image-gen"
  | "video-prompt"
  | "video-gen"
  | "post";

export interface AddNodeOption {
  type: AddNodeType;
  label: string;
  mnemonic: string; // single character; shown as a badge and usable as a shortcut
}

export const ADD_NODE_OPTIONS: readonly AddNodeOption[] = [
  { type: "script", label: "Script", mnemonic: "S" },
  { type: "file", label: "File", mnemonic: "F" },
  { type: "text", label: "Note", mnemonic: "N" },
  { type: "prompt", label: "Prompt", mnemonic: "P" },
  { type: "draw", label: "Draw", mnemonic: "D" },
  { type: "image-gen", label: "Image Gen", mnemonic: "I" },
  // "M" for Motion Prompt, freeing "V" for Video Gen and "G" for the Gallery drawer,
  // which owns bare "g" through its own document listener (D137).
  { type: "video-prompt", label: "Motion Prompt", mnemonic: "M" },
  { type: "video-gen", label: "Video Gen", mnemonic: "V" },
  { type: "post", label: "Post", mnemonic: "O" },
];

const BY_MNEMONIC = new Map<string, AddNodeType>(
  ADD_NODE_OPTIONS.map((o) => [o.mnemonic.toLowerCase(), o.type]),
);

/** Resolve a single keyboard character to a node type, or null if unmapped. */
export function mnemonicToType(key: string): AddNodeType | null {
  if (key.length !== 1) return null;
  return BY_MNEMONIC.get(key.toLowerCase()) ?? null;
}

/** True when focus is in a field the user is typing into — shortcuts must defer. */
export function isEditableTarget(
  el: { tagName?: string; isContentEditable?: boolean } | null | undefined,
): boolean {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName?.toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
