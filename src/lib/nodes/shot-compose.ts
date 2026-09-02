// Pure logic for the Shot Composer (D28). No server-only imports — unit-testable.
import type { ShotRole } from "@/lib/nodes/shot-roles";
import type { UpstreamPreview } from "@/lib/nodes/resolve-inputs"; // type-only (erased) — safe
import type { ReelShot } from "@/lib/nodes/reel-script";
import { shotSeconds, OMNI_MIN_SECONDS, OMNI_MAX_SECONDS } from "@/lib/nodes/group-shots";

// One composed candidate. The Shot's output is still a description string; an idea is a
// labelled candidate description the designer can pick (-> setDescription) or promote.
export type ShotComposeIdea = {
  title: string;
  bestFor?: string;
  description: string;
};

/** One beat of a composed sequence: what happens, and how long it holds. */
export type ShotComposeBeat = { description: string; seconds: number };

/**
 * D201 — the multishot composer's unit: a whole CUT SEQUENCE.
 *
 * Four alternatives for "the shot" is meaningless when the shot is five cuts, and picking one
 * should write all five.
 *
 * The beat COUNT is the composer's to choose, not the shot's to dictate. A parsed "shot" is often
 * an act holding several cuts — "A man picks up his keys. A woman steps out of a cab. Someone
 * grabs a coffee." is one parsed beat and four real ones — so a composer forced to return exactly
 * as many beats as the shot has would be forced to write the wrong film. What is FIXED is the
 * total duration, because that is what the request bills and what the cut ladder must sum to.
 */
export type ShotComposeSequence = {
  title: string;
  bestFor?: string;
  beats: ShotComposeBeat[];
};

/** A beat's length, defaulting the way `shotSeconds` does for anything unusable. */
function beatSeconds(beat: ShotComposeBeat): number {
  const n = Number(beat?.seconds);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function sequenceSeconds(sequence: ShotComposeSequence): number {
  return (sequence.beats ?? []).reduce((sum, b) => sum + beatSeconds(b), 0);
}

/** The shot's own total, which is what a composed sequence is re-timed to by default. */
export function shotsTotalSeconds(shots: ReelShot[]): number {
  return shots.reduce((sum, s) => sum + shotSeconds(s), 0);
}

/** The usable duration budget for one Omni generation — the shot's own total, held to the caps. */
export function clampToOmniBudget(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return OMNI_MAX_SECONDS;
  return Math.min(OMNI_MAX_SECONDS, Math.max(OMNI_MIN_SECONDS, Math.round(seconds)));
}

/**
 * Re-time a composed sequence onto a fixed total, preserving its RHYTHM.
 *
 * The composer chooses how many beats the sequence needs; the operator chooses how long the whole
 * clip runs. Those two have to be reconciled at apply time, and scaling proportionally is what
 * keeps the director's intent: a sequence written as 1s/1s/1s/3s is three quick cuts and a hold,
 * and it should stay three quick cuts and a hold at any total.
 *
 * Every beat floors at 1 second — below that Omni has nothing to render and the beat is a wasted
 * line in the ladder. When the floors alone exceed the budget the extra beats are DROPPED from the
 * tail rather than shrunk into nothing, because a 12-beat sequence in 5 seconds is not a shorter
 * film, it is a broken one.
 *
 * Rounding drift is settled on the LONGEST beat, not the last: taking a second off a 4s hold is
 * invisible, taking one off a 1s cut deletes it.
 */
export function retimeSequence(
  sequence: ShotComposeSequence,
  totalSeconds: number,
): ShotComposeBeat[] {
  const budget = clampToOmniBudget(totalSeconds);
  const beats = (sequence.beats ?? []).filter((b) => (b?.description ?? "").trim() !== "");
  if (beats.length === 0) return [];

  // More beats than seconds — keep the ones that fit at the 1s floor.
  const kept = beats.length > budget ? beats.slice(0, budget) : beats;
  const source = kept.map(beatSeconds);
  const sourceTotal = source.reduce((a, b) => a + b, 0);

  const scaled = source.map((s) => Math.max(1, Math.round((s / sourceTotal) * budget)));

  // Settle the rounding remainder on the longest beat, one second at a time, never below the floor.
  let drift = budget - scaled.reduce((a, b) => a + b, 0);
  while (drift !== 0) {
    const i = scaled.indexOf(drift > 0 ? Math.max(...scaled) : Math.max(...scaled));
    if (drift > 0) {
      scaled[i] += 1;
      drift -= 1;
    } else {
      if (scaled[i] <= 1) break; // cannot shrink further without deleting a beat
      scaled[i] -= 1;
      drift += 1;
    }
  }

  return kept.map((beat, i) => ({
    description: beat.description.trim(),
    seconds: scaled[i],
  }));
}

// The shape getUpstreamOutputs returns (mirrored here to avoid a server-only import).
export type ComposeUpstream = {
  nodeId: string;
  type: string;
  data: Record<string, unknown>;
  activeOutput: unknown;
  versionId: string | null;
};

// Build the composer's user-turn text: trimmed seed + the role's slots/avoid + KB context.
// Reuses the D23 trim upstream (the caller passes renderShotForImage(script) as seedText), so
// ideation sees exactly what the image prompt later sees.
export function renderComposeContext(args: {
  seedText: string;
  role: ShotRole;
  clientContext: string;
}): string {
  const { seedText, role, clientContext } = args;
  const blocks: string[] = [];
  blocks.push(`Shot seed:\n${seedText.trim() || "(none provided)"}`);
  blocks.push(
    `Role: ${role.label}\n` +
      `This role must include: ${role.slots.join(", ")}\n` +
      `Avoid for this role: ${role.avoid.join(", ")}`,
  );
  if (clientContext.trim()) blocks.push(`Brand context:\n${clientContext.trim()}`);
  return blocks.join("\n\n");
}

/**
 * D201 — the MULTISHOT composer's user turn: the beat ladder with its timings, then the role and
 * brand context.
 *
 * The ladder rather than `renderShotForImage`'s trim, because the unit being composed is the
 * sequence. Each beat's length is stated for the same reason the motion ladder states it: a
 * one-second beat is a single gesture, not a scene, and the model writes to the wrong scale
 * without it.
 *
 * Timings are cumulative and derived from each beat's own length, matching `renderShotLadder` — so
 * a composed sequence is described against the same timeline the motion prompt will later use.
 */
export function renderMultishotComposeContext(args: {
  shots: ReelShot[];
  role: ShotRole;
  clientContext: string;
  objective?: string;
  /** The clip's total length. The composer's beats must sum to this; the COUNT is its own call. */
  budgetSeconds: number;
}): string {
  const { shots, role, clientContext, objective, budgetSeconds } = args;
  const blocks: string[] = [];

  const current = shots.map(
    (shot, i) => `${i + 1}. (${shotSeconds(shot)}s) ${(shot.description ?? "").trim() || "(no description yet)"}`,
  );
  // Deliberately NOT framed as a ladder to preserve. A parsed beat is frequently an act holding
  // several real cuts, and presenting it as fixed timings taught the composer to return one beat
  // per parsed line — which is how a two-line act came back as a two-beat film.
  blocks.push(
    `Current content (${shots.length} line${shots.length === 1 ? "" : "s"} — split any line that holds several cuts):\n${current.join("\n")}`,
  );
  blocks.push(
    `TOTAL DURATION BUDGET: ${budgetSeconds}s. Every sequence's beat lengths must sum to exactly ${budgetSeconds}. ` +
      `No beat under 1s, so at most ${budgetSeconds} beats.`,
  );

  if (objective?.trim()) blocks.push(`Objective: ${objective.trim()}`);

  blocks.push(
    `Role: ${role.label}\n` +
      `This role must include: ${role.slots.join(", ")}\n` +
      `Avoid for this role: ${role.avoid.join(", ")}`,
  );
  if (clientContext.trim()) blocks.push(`Brand context:\n${clientContext.trim()}`);

  return blocks.join("\n\n");
}

// Pick the upstreams that should ground ideation as VISION images, mapped to the
// UpstreamPreview shape buildUserContent expects. Critically: a `script` upstream (the dashed
// Script->Shot lineage edge, D21) is NOT an image type, so it is ignored — resolution never
// re-imports the whole reel. Mirrors the image-attachment rules in compose-message.ts.
export function selectImageUpstreams(ups: ComposeUpstream[]): UpstreamPreview[] {
  const out: UpstreamPreview[] = [];
  for (const u of ups) {
    if (u.type === "image-gen") {
      const url = typeof u.activeOutput === "string" ? u.activeOutput : undefined;
      if (url) {
        out.push({ nodeId: u.nodeId, versionId: u.versionId, label: "Image", type: "image-gen", text: "", fileUrl: url, fileKind: "image" });
      }
      continue;
    }
    if (u.type === "file" || u.type === "draw") {
      const fileUrl = typeof u.data.fileUrl === "string" ? u.data.fileUrl : undefined;
      const fileKind = typeof u.data.fileKind === "string" ? u.data.fileKind : undefined;
      const useLlm = u.data.useLlm === true;
      if (fileUrl && fileKind === "image" && !useLlm) {
        out.push({
          nodeId: u.nodeId, versionId: u.versionId,
          label: u.type === "draw" ? "Sketch" : "File", type: u.type,
          text: "", fileUrl, fileKind, useLlm,
        });
      }
    }
    // script / text / prompt / video-* → not image grounding; ignored.
  }
  return out;
}
