"use client";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

// D284 — "Edit voice", beside the video heading: the same switch-in-a-label the Image Gen
// node uses for "Edit". On, the centre column holds the voice editor and this column shows
// the take being re-voiced.
export function VideoGenChangeVoiceToggle({
  id,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <Label
      htmlFor={id}
      className="flex shrink-0 cursor-pointer items-center gap-2.5 text-sm font-medium text-foreground"
    >
      Edit voice
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </Label>
  );
}
