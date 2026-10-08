import { AVATAR_VIEWS } from "@/lib/avatars/constants";
import type { Avatar } from "@/lib/avatars/schema";
import type { ScriptDoc, Shot } from "@/lib/scripts/schema";

// D343 — what a panel was drawn from, as short fingerprints stored on each take. Today's values
// differing from a take's means the take is out of date. Run identically in the browser and on
// the server.

/** FNV-1a, 32-bit, as 8 hex characters. Stable and dependency-free; not for security. */
export function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Everything in the script a panel is drawn from: the shot's visual and on-screen text (its
 *  blank areas), who is on screen and how they are described, the setting, aspect and region.
 *  Never the VO or the length, which are not drawn. */
export function shotKey(doc: ScriptDoc, shot: Shot): string {
  const people = shot.onScreen.map((id) => {
    const c = doc.cast.find((m) => m.id === id);
    return c ? [c.id, c.name, c.description] : [id];
  });
  return fingerprint(JSON.stringify({
    visual: shot.visual, text: shot.onScreenText, onScreen: shot.onScreen, people,
    setting: doc.context.settingAndCamera, aspect: doc.header.aspect, region: doc.header.region,
  }));
}

/** An avatar's face as panels see it: the front image and the four views. A rename or a voice
 *  change does not change it. */
export function faceKey(avatar: Pick<Avatar, "front" | "sheetViews">): string {
  return fingerprint([avatar.front?.url ?? "", ...AVATAR_VIEWS.map((v) => avatar.sheetViews?.[v]?.url ?? "")].join("|"));
}
