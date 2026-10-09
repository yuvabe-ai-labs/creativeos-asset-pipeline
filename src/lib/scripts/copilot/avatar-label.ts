import type { CopilotAvatar } from "./schema";

/** An avatar's name as the person sees it on a chip or the card. Two avatars can share a name (a
 *  founder's photo avatar and an AI one), so a shared name gains its kind: "James · Specific". */
export function avatarLabel(avatar: CopilotAvatar, all: readonly CopilotAvatar[]): string {
  const name = avatar.name.trim();
  const shared = all.some((a) => a.id !== avatar.id && a.name.trim().toLowerCase() === name.toLowerCase());
  return shared ? `${name} · ${avatar.specific ? "Specific" : "AI"}` : name;
}
