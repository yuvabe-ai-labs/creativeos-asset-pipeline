import { z } from "zod";
import { AVATAR_ATTRIBUTES, AVATAR_DESCRIPTION_MAX, AVATAR_VIEW_DIRECTIONS } from "@/lib/avatars/constants";
import type { AvatarAttributes } from "@/lib/avatars/constants";

// D395 — the two prompts behind a character: the brief a face is drawn from, and the one
// turnaround sheet its four views are cut from. Pure (no "server-only"): the Studio prices the
// sheet from the same module the route sends.

// ── The character brief ───────────────────────────────────────────────────────

/** D459 — the brief's own age bands: the Studio's, plus one for a child, which the Studio's chips
 *  (adults only) cannot hold; a 9-year-old was briefed as a woman of 18–24. */
export const CHILD_AGE = "Under 18";
const BRIEF_AGES = [CHILD_AGE, ...AVATAR_ATTRIBUTES.age] as const;

/** A script describes a person the way a script does: relative to others ("her husband,
 *  behind her"), with voice and manner mixed in. An image model reads every pronoun as part of
 *  the picture, which is how a man was drawn as a woman (staging, 21 Oct 2026). The brief
 *  restates the person on their own, in visual terms only, with the operator's word final.
 *  D459 — and from the whole reel and the brand, not the cast line alone: on staging a Chupps
 *  lead came out Black and another White (no region, "medium brown skin"), a 9-year-old was
 *  briefed as a woman of 18–24, a cast line of "Children" became one teen, and every outfit was
 *  a "muted" placeholder while the shots named a claw clip, earphones or a heritage-weave saree. */
export const AVATAR_BRIEF_SYSTEM = `You turn a person from a video script into a character brief that an image model will draw a reference portrait from. That portrait becomes this person in every shot of the brand's video, so they must look like a real member of the brand's audience, living in this reel's world.

You receive the person's name, how the script describes them, the shots they appear in, the reel's place, where the script is set, the brand and who it casts, and the operator's instructions.

Rules, in order of priority:
1. The operator's instructions override the script. If they state a gender, age, ethnicity, outfit or any feature, use theirs, even when the script says otherwise.
2. Describe this one person on their own. The script may describe them relative to someone else ("her husband", "his daughter", "behind her", "next to the mother"). Never carry those words over: other people's pronouns and positions are not this person. Work out this person's own gender from their name, their role and their own pronouns, and state it plainly. When the entry is a group ("children", "friends"), describe one member of it: the one the shots show most, or the eldest.
3. Read the whole reel, not only the cast line. What the person wears and carries in their shots (a claw clip, earphones round the neck, a bronze heritage-weave saree) is part of them: keep it. When shots disagree, take their first shot's outfit.
4. Decide ethnicity and look from the reel's region and place, the person's name and the brand's audience and casting notes. A skin-tone word alone never decides ethnicity: "medium brown skin" is ordinary across South Asia.
5. A real person, never a model or a stock photo: everyday grooming, natural skin with its texture, real hair, a build that fits their age and life. Their personality shows only in what can be seen: their styling, grooming, how they wear their clothes, and a relaxed, natural expression with a hint of it.
6. Visual facts only: body, face, hair, skin, clothing, accessories, identity markers (a bindi, a pottu, sacred ash, a turban, a nose ring, glasses, a moustache). Leave out voice, accent, personality words, mood words, actions, dialogue and other people.
7. Keep every concrete detail the script or instructions give (a cream saree with a kasavu border, a mild olive-green shirt). Where something is not said, make a specific, believable choice for this person, place and audience, with real colours and fabrics, never a placeholder such as "simple", "muted", "neutral" or "everyday clothing".
8. When the brand sells something a person wears (footwear, clothing, eyewear, a watch), give the person a plain, unbranded item of that kind, so the brand's own can replace it in the video.
9. A child is a child: give their age in years and describe a child, never an adult.
10. Write in plain present-tense phrases. No names, no story, no camera or lighting words.

Fields:
- gender: one of ${AVATAR_ATTRIBUTES.gender.join(", ")}.
- age: one of ${BRIEF_AGES.join(", ")}, whichever holds the age given or implied ("${CHILD_AGE}" for anyone under 18).
- ageYears: the age in years as given or implied, as a number or a short range ("58", "45 to 50").
- ethnicity: one of ${AVATAR_ATTRIBUTES.ethnicity.join(", ")}.
- appearance: build, face, skin tone, hair, facial hair. One or two sentences.
- wardrobe: what they wear, top to shoes, with colours and fabrics. One or two sentences.
- markers: identity markers and accessories, or an empty string.`;

export const avatarBriefSchema = z.object({
  gender: z.enum(AVATAR_ATTRIBUTES.gender),
  age: z.enum(BRIEF_AGES),
  ageYears: z.string(),
  ethnicity: z.enum(AVATAR_ATTRIBUTES.ethnicity),
  appearance: z.string(),
  wardrobe: z.string(),
  markers: z.string(),
});
export type AvatarBrief = z.infer<typeof avatarBriefSchema>;

export type AvatarBriefInput = {
  name: string;
  description: string;
  /** Where the script is set (its region), which decides what "ordinary" looks like. */
  setting: string;
  instructions: string;
  /** D459 — the reel's place (its Setting & Camera line), for the person's world. */
  place?: string;
  /** D459 — what the shots they appear in show, in order: their outfit and what they carry. */
  shots?: string[];
  /** D459 — the brand's name and who it casts (the KB's casting and audience notes). */
  brand?: string;
};

export function buildAvatarBriefUser(input: AvatarBriefInput): string {
  const block = (title: string, body: string) => `## ${title}\n${body.trim() || "(none)"}`;
  return [
    block("Name", input.name),
    block("How the script describes them", input.description),
    block("The shots they appear in", (input.shots ?? []).map((s, i) => `${i + 1}. ${s.trim()}`).join("\n")),
    block("The reel's place", input.place ?? ""),
    block("Where the script is set", input.setting),
    block("The brand and who it casts", input.brand ?? ""),
    block("The operator's instructions (these win)", input.instructions),
  ].join("\n\n");
}

const PERSON_NOUN = { Female: "woman", Male: "man", "Non-binary": "person" } as const;
const CHILD_NOUN = { Female: "girl", Male: "boy", "Non-binary": "child" } as const;

/** The brief as the front route takes it: the attributes, which the front prompt states first,
 *  and one self-contained description of this person alone. */
export function briefToFront(brief: AvatarBrief): { description: string; attributes: AvatarAttributes } {
  const age = brief.ageYears.trim();
  const child = brief.age === CHILD_AGE;
  const noun = (child ? CHILD_NOUN : PERSON_NOUN)[brief.gender];
  const lead = `A ${age ? `${age}-year-old ` : ""}${brief.ethnicity} ${noun}.`;
  const description = [lead, brief.appearance, brief.wardrobe, brief.markers]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, AVATAR_DESCRIPTION_MAX);
  // The Studio's age chips start at 18: a child's age is said in the description only.
  return { description, attributes: { gender: brief.gender, ...(child ? {} : { age: brief.age }), ethnicity: brief.ethnicity } };
}

/** Without a brief (the call failed): the operator's words first, so they still win, then the
 *  script's. */
export function fallbackFront(input: AvatarBriefInput): { description: string; attributes: AvatarAttributes } {
  const description = [input.instructions.trim(), input.description.trim() || input.name.trim()]
    .filter(Boolean)
    .join(" ")
    .slice(0, AVATAR_DESCRIPTION_MAX);
  return { description, attributes: {} };
}

// ── The turnaround sheet ──────────────────────────────────────────────────────

/** The order the four figures stand in, left to right; the route cuts them in this order. */
export const SHEET_ORDER = ["front", "left", "right", "back"] as const;

/** D395 — one image holding all four views, as an animation turnaround sheet is drawn: one
 *  render, so the face, outfit and scale cannot drift between views the way four separate edits
 *  did. The layout rules are what let the server cut it into four views cleanly. */
export function buildAvatarSheetPrompt(): string {
  return [
    "A character turnaround sheet of the same person as the reference image: four full-body views " +
      "of this one person, standing side by side in a single row, in one wide image.",
    `From left to right: 1. ${AVATAR_VIEW_DIRECTIONS.front} 2. ${AVATAR_VIEW_DIRECTIONS.left} ` +
      `3. ${AVATAR_VIEW_DIRECTIONS.right} 4. ${AVATAR_VIEW_DIRECTIONS.back}`,
    "Layout: each figure is centred in its own quarter of the image, with clear empty background " +
      "between neighbours; no figure overlaps or touches another. All four are the same height " +
      "and scale, feet level, head to toe with the feet visible and a little space above the head " +
      "and below the feet.",
    "The reference image may be cropped at the waist: continue the same outfit down to the feet " +
      "with matching clothes and shoes.",
    "Same person in every view: same face, same hair, same skin tone, same build, same outfit, " +
      "and the same accessories and identity markers in the same colours and places.",
    "Arms relaxed at the sides, a little away from the body, neutral expression. Even, soft, " +
      "shadowless studio light on a plain light-grey seamless background, with no floor line and " +
      "no cast shadows. Drawn in exactly the style of the reference image.",
    "Exactly four figures and nothing else: no text, no labels, no numbers, no borders, no " +
      "dividing lines, no props.",
  ].join(" ");
}
