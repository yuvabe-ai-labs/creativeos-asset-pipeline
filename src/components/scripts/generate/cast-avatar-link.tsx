"use client";

import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { avatarLabel } from "@/lib/scripts/copilot/avatar-label";
import type { CastMember } from "@/lib/scripts/schema";
import type { CopilotAvatar } from "@/lib/scripts/copilot/schema";

// Unlinked: the cast member is only their description, and Visualise makes a new avatar from it.
const NO_AVATAR = "no-avatar";

/** Swap a cast member's avatar, or unlink it so Visualise makes a new one (spec 2 §4.4). A client
 *  with no avatars has nothing to choose, so the cast member shows its status as plain text. */
export function CastAvatarLink({ member, avatars, pending, onChange }: {
  member: CastMember;
  avatars: CopilotAvatar[];
  pending: boolean;
  onChange: (avatarId: string | null) => void;
}) {
  const linked = avatars.find((a) => a.id === member.avatarId);
  const missing = member.avatarId !== null && !linked;

  if (avatars.length === 0) {
    return <span className="text-xs text-muted-foreground">{missing ? "Avatar no longer available" : "No avatar yet"}</span>;
  }

  const label = linked ? avatarLabel(linked, avatars) : missing ? "Avatar no longer available" : "Choose an avatar";
  return (
    <Select
      value={member.avatarId ?? NO_AVATAR}
      disabled={pending}
      onValueChange={(v) => { if (typeof v === "string") onChange(v === NO_AVATAR ? null : v); }}
    >
      <SelectTrigger size="sm" className="mt-1 w-fit min-w-40" aria-label={`Avatar for ${member.name}`}>
        <SelectValue>{label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {avatars.map((a) => <SelectItem key={a.id} value={a.id}>{avatarLabel(a, avatars)}</SelectItem>)}
        {member.avatarId !== null && (
          <>
            <SelectSeparator />
            <SelectItem value={NO_AVATAR}>No avatar</SelectItem>
          </>
        )}
      </SelectContent>
    </Select>
  );
}
