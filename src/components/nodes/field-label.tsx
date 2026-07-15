import type { LucideIcon } from "lucide-react";

// A field header — a small muted icon beside the field name — used above chip
// groups in the image-gen output settings and the prompt node's shot controls.
export function FieldLabel({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
      <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
      {label}
    </span>
  );
}
