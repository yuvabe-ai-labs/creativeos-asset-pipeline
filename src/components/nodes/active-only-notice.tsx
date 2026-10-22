// src/components/nodes/active-only-notice.tsx
/** D383 — sits above controls that act on the active version while another is on screen. */
export function ActiveOnlyNotice({ label }: { label: string }) {
  return <p className="text-xs text-muted-foreground">{`You're viewing ${label}. Restore it to review or change it.`}</p>;
}
