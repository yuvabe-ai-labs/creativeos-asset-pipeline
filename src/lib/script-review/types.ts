// src/lib/script-review/types.ts
// Pure types shared by the server, the routes and the browser.
import type { ScriptDoc } from "@/lib/scripts/schema";
import type { AvatarView, ScriptReviewEventKind, ShareScope } from "./constants";

/** Spec 4 §5: the whole parts a comment can be on. A comment never points inside an image. */
export type Part =
  | { kind: "context" }
  | { kind: "shot"; shotId: string }
  | { kind: "panel"; shotId: string }
  | { kind: "cast"; castId: string }
  | { kind: "view"; castId: string; view: AvatarView };

export type PartKind = Part["kind"];

/** One cast member's avatar as it was shared: "the avatar images" of spec 4 §3 step 3. */
export type AvatarSnapshot = {
  avatarId: string;
  name: string;
  views: Record<AvatarView, string | null>;
  voice: { name: string | null; sampleUrl: string | null } | null;
};

/** One shot's picked panel take as it was shared (spec 3 §6.6: the client only sees the picked take). */
export type PanelSnapshot = { takeId: string; url: string };

/** What a share froze besides the text. Keyed by cast member id and by shot id. */
export type VersionVisuals = {
  avatars: Record<string, AvatarSnapshot>;
  panels: Record<string, PanelSnapshot>;
};

/** A version's content: what the client sees, and what the next share is compared with. */
export type VersionContent = { scope: ShareScope; doc: ScriptDoc; visuals: VersionVisuals };

/** One line item of "S1, S4, S5 and Meenakshi revised", with the part it links to. */
export type ChangedPart = { part: Part; change: "revised" | "added" | "removed"; label: string };

export type CommentAuthorKind = "client" | "team";

/** A comment as it leaves the server. `versionNumber` is the version it was made on (spec 4 §5).
 *  No user ids: a team reply carries the name the client reads, copied when it was written. */
export type ScriptComment = {
  id: string;
  versionNumber: number;
  part: Part;
  parentId: string | null;
  authorKind: CommentAuthorKind;
  authorName: string;
  body: string;
  editedByName: string | null;
  resolvedAt: string | null;
  resolvedByName: string | null;
  createdAt: string;
  updatedAt: string;
};

/** One append-only line of the review's history (spec 4 §7). */
export type ScriptReviewEvent = {
  id: string;
  kind: ScriptReviewEventKind;
  versionNumber: number | null;
  actorKind: CommentAuthorKind;
  actorName: string;
  scope: ShareScope | null;
  changes: ChangedPart[];
  createdAt: string;
};

/** A client's comment with the team's replies under it. Only the first comment carries Resolved. */
export type Thread = { root: ScriptComment; replies: ScriptComment[]; resolved: boolean };

/** What "On a removed shot" quotes: the shot's number and visual in the last version that had it. */
export type RemovedShot = { label: string; text: string };

export type ActivityLine = { id: string; at: string; text: string; links: { label: string; part: Part }[] };
