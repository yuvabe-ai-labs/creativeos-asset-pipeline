import { imageGenClientModelMap } from "@/lib/image-gen/client-models";
import { AVATAR_VIEWS } from "@/lib/avatars/constants";
import { estimateAvatarImageCredits } from "@/lib/avatars/generation";
import { hasFourViews } from "@/lib/avatars/utils";
import type { Avatar } from "@/lib/avatars/schema";
import type { CastMember, ScriptDoc, Shot } from "@/lib/scripts/schema";
import { PANEL_MODEL_ID } from "./constants";
import { faceKey, shotKey } from "./keys";
import { pickKit, type RegionalKit } from "./kits";
import { buildPanelPrompt, type PanelPerson, type PanelReference } from "./panel-prompt";
import type { PanelFaces } from "./schema";

// D341, D342 — everything one panel is drawn from, in one pure function. The browser runs it to
// show state, prompt and cost; the draw route runs the same function to draw.

/** D341 — a cast member can be drawn once their avatar is saved, live and has its four views. */
export function castReadyForPanels(avatar: Avatar | null | undefined): avatar is Avatar {
  return Boolean(avatar && !avatar.archivedAt && avatar.status === "ready" && hasFourViews(avatar));
}

/** The model's reference limit, less the one slot the house style image takes. */
export function panelReferenceCap(modelId: string = PANEL_MODEL_ID): number {
  return Math.max(0, (imageGenClientModelMap[modelId]?.maxReferenceImages ?? 0) - 1);
}

/** Every person's Front first, then the other views person by person, cut at the model's cap:
 *  if four views per person are too many, the fronts are what is kept (spec §13 risk 4). */
export function selectPanelReferences(people: PanelPerson[], cap: number): PanelReference[] {
  const refs = (p: PanelPerson, front: boolean) =>
    p.views.filter((v) => (v.view === "front") === front).map((v) => ({ url: v.url, castId: p.castId, view: v.view }));
  return [...people.flatMap((p) => refs(p, true)), ...people.flatMap((p) => refs(p, false))].slice(0, Math.max(0, cap));
}

export type PanelInputs = {
  people: PanelPerson[];
  references: PanelReference[];
  kit: RegionalKit | null;
  /** The prompt built from the script — what a reset goes back to. */
  prompt: string;
  /** Names of on-screen people whose avatar is not ready yet. */
  waitingFor: string[];
  faces: PanelFaces;
  shotKey: string;
};

export function panelInputs(input: {
  doc: ScriptDoc;
  shot: Shot;
  avatars: ReadonlyMap<string, Avatar>;
  kits: RegionalKit[];
  cap: number;
}): PanelInputs {
  const { doc, shot, avatars, kits, cap } = input;
  const members = shot.onScreen
    .map((id) => doc.cast.find((c) => c.id === id))
    .filter((c): c is CastMember => Boolean(c));
  const avatarOf = (m: CastMember) => (m.avatarId ? avatars.get(m.avatarId) : undefined);

  const people: PanelPerson[] = members.map((m) => {
    const avatar = avatarOf(m);
    const views = castReadyForPanels(avatar)
      ? AVATAR_VIEWS.map((view) => ({ view, url: avatar.sheetViews![view]!.url }))
      : [];
    return { castId: m.id, name: m.name, description: m.description, views };
  });
  const faces: PanelFaces = {};
  for (const m of members) {
    const avatar = avatarOf(m);
    if (avatar) faces[m.id] = { avatarId: avatar.id, faceKey: faceKey(avatar) };
  }
  const references = selectPanelReferences(people, cap);
  const kit = pickKit(kits, doc, shot);
  return {
    people,
    references,
    kit,
    waitingFor: members.filter((m) => !castReadyForPanels(avatarOf(m))).map((m) => m.name),
    faces,
    shotKey: shotKey(doc, shot),
    prompt: buildPanelPrompt({ doc, shot, kit, people, references }),
  };
}

/** D346 — a panel bills like any image: the same estimate the draw reserves. `referenceCount`
 *  is the people's views; the house style image the draw adds is counted here too. */
export function estimatePanelCredits(referenceCount: number, aspect: string, modelId: string = PANEL_MODEL_ID): number | null {
  return estimateAvatarImageCredits({ modelId, aspect, referenceCount: referenceCount + 1 });
}
