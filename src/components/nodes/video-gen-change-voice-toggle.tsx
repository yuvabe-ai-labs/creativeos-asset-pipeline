"use client";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

// D284 / D483 — "Edit voice" and "Edit", beside the video heading. On, the centre column holds
// the matching editor and this column shows the take being edited.
export function VideoGenChangeVoiceToggle({
  id,
  label = "Edit voice",
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string;
  label?: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <Label
      htmlFor={id}
      className="flex shrink-0 cursor-pointer items-center gap-2.5 text-sm font-medium text-foreground"
    >
      {label}
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </Label>
  );
}
