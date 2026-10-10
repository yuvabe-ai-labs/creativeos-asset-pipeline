"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CastMember } from "@/lib/scripts/schema";
import type { CopilotAvatar } from "@/lib/scripts/copilot/schema";

const WORDS_ONLY = "words-only";

/** Swap a cast member's avatar, or unlink to words only so spec 3 makes a new one (spec 2 §4.4). */
export function CastAvatarLink({ member, avatars, pending, onChange }: {
  member: CastMember;
  avatars: CopilotAvatar[];
  pending: boolean;
  onChange: (avatarId: string | null) => void;
}) {
  const linked = avatars.find((a) => a.id === member.avatarId);
  const label = linked?.name ?? (member.avatarId ? "Avatar no longer available" : "Words only");
  return (
    <Select
      value={member.avatarId ?? WORDS_ONLY}
      disabled={pending}
      onValueChange={(v) => { if (typeof v === "string") onChange(v === WORDS_ONLY ? null : v); }}
    >
      <SelectTrigger size="sm" className="mt-1 w-fit min-w-40" aria-label={`Avatar for ${member.name}`}>
        <SelectValue>{label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={WORDS_ONLY}>Words only</SelectItem>
        {avatars.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
