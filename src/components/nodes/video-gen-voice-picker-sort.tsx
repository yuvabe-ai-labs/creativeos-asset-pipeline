"use client";

import { ArrowUpDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LIBRARY_SORTS } from "@/lib/elevenlabs/constants";
import { ACCOUNT_SORTS } from "@/lib/elevenlabs/voice-filters";
import type { VoiceTab } from "@/hooks/use-voice-browser";

// D284 — the voice list's sort, top right beside the search (like ElevenLabs' voice library).
// Each tab has its own orders: My voices Name / Newest, Voice Library Trending / Most used / Newest.
export function VideoGenVoicePickerSort({ tab, value, onChange }: { tab: VoiceTab; value: string; onChange: (v: string) => void }) {
  const sorts = tab === "library" ? LIBRARY_SORTS : ACCOUNT_SORTS;
  const current = sorts.find((s) => s.value === value) ?? sorts[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button type="button" variant="outline" className="nodrag shrink-0 gap-1.5" aria-label={`Sort: ${current.label}`} />}
      >
        <ArrowUpDown className="size-4" strokeWidth={1.5} />
        {current.label}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        {sorts.map((s) => (
          <DropdownMenuItem key={s.value} onClick={() => onChange(s.value)} className="justify-between">
            {s.label}
            {s.value === current.value && <Check className="size-4 text-primary" strokeWidth={1.5} />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
