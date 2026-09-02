// Pure logic for the Shot Composer (D28). No server-only imports — unit-testable.
import type { ShotRole } from "@/lib/nodes/shot-roles";
import type { UpstreamPreview } from "@/lib/nodes/resolve-inputs"; // type-only (erased) — safe
import type { ReelShot } from "@/lib/nodes/reel-script";
import { shotSeconds } from "@/lib/nodes/group-shots";

// One composed candidate. The Shot's output is still a description string; an idea is a
// labelled candidate description the designer can pick (-> setDescription) or promote.
export type ShotComposeIdea = {
  title: string;
  bestFor?: string;
  description: string;
};

/**
 * D201 — the multishot composer's unit: a whole CUT SEQUENCE, one beat per beat of the shot.
 *
 * Four alternatives for "the shot" is meaningless when the shot is five cuts, and picking one
 * should write all five. `beats` is index-aligned with the shot's own beats.
 */
export type ShotComposeSequence = {
  title: string;
  bestFor?: string;
  beats: string[];
};

/**
 * Whether a composed sequence can be applied to a shot with `beatCount` beats.
 *
 * Checked on the CLIENT before applying, not only trusted from the model. A sequence one beat
 * short would leave the last beat holding its old description — silently mixing two directions
 * inside one clip, which is exactly the incoherence the LOOK contract exists to prevent. Better
 * to refuse the card and say why.
 */
export function sequenceFits(
  sequence: ShotComposeSequence,
  beatCount: number,
): { ok: true } | { ok: false; reason: string } {
  const got = sequence.beats?.length ?? 0;
  if (got === beatCount) return { ok: true };
  return {
    ok: false,
    reason: `This direction has ${got} beat${got === 1 ? "" : "s"} but the shot has ${beatCount}.`,
  };
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
}): string {
  const { shots, role, clientContext, objective } = args;
  const blocks: string[] = [];

  let at = 0;
  const ladder = shots.map((shot, i) => {
    const from = at;
    at += shotSeconds(shot);
    return `${i + 1}. [${from}-${at}s] ${(shot.description ?? "").trim() || "(no description yet)"}`;
  });
  blocks.push(
    `Shot sequence — ${shots.length} beats, ${at}s total (keep these timings):\n${ladder.join("\n")}`,
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
