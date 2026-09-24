import { cn } from "@/lib/utils";
import { voiceMetaChips, type VoiceMetaField } from "@/lib/elevenlabs/voice-labels";
import type { VoiceLabels } from "@/lib/elevenlabs/voice-catalog";

type Props = {
  labels: VoiceLabels;
  /** Which fields to show, in order. Defaults to every field present (the row's use). */
  fields?: VoiceMetaField[];
  className?: string;
};

// D283 — small icon + text chips (gender, age, language, accent, use case), only the ones present.
export function VideoGenVoicePickerMeta({ labels, fields, className }: Props) {
  const chips = voiceMetaChips(labels, fields);
  if (chips.length === 0) return null;
  return (
    <span className={cn("flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground", className)}>
      {chips.map((chip) => (
        <span key={chip.key} className="inline-flex items-center gap-1">
          <chip.icon className="size-3" strokeWidth={1.5} />
          {chip.text}
        </span>
      ))}
    </span>
  );
}
