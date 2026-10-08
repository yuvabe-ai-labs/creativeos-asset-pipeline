// src/components/script-review/scope-note.tsx
import type { ShareScope } from "@/lib/script-review/constants";

// Spec 4 §12: a partial share must not read as the whole.
const NOTE: Record<ShareScope, string | null> = {
  script:
    "This share is the script, for your comments. The avatars and the storyboard come next; you approve the reel once you have seen them.",
  avatars: "This share is the script and the avatars, for your comments. The storyboard comes next; you approve the reel once you have seen it.",
  panels: null,
};

export function ScopeNote({ scope }: { scope: ShareScope }) {
  const text = NOTE[scope];
  if (!text) return null;
  return <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">{text}</p>;
}
