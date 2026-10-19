// src/components/script-review/scope-note.tsx
import type { ShareScope } from "@/lib/script-review/constants";

// Spec 4 §12: a partial share must not read as the whole. It can still be approved (D385), so the
// note says only what the share holds.
const NOTE: Record<ShareScope, string | null> = {
  script: "This share is the script only. The avatars and the storyboard are not part of it.",
  avatars: "This share is the script and the avatars. The storyboard is not part of it.",
  panels: null,
};

export function ScopeNote({ scope }: { scope: ShareScope }) {
  const text = NOTE[scope];
  if (!text) return null;
  return <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">{text}</p>;
}
