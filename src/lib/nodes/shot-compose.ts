// Pure logic for the Shot Composer (D28). No server-only imports — unit-testable.
import type { ShotRole } from "@/lib/nodes/shot-roles";
import type { UpstreamPreview } from "@/lib/nodes/resolve-inputs"; // type-only (erased) — safe

// One composed candidate. The Shot's output is still a description string; an idea is a
// labelled candidate description the designer can pick (-> setDescription) or promote.
export type ShotComposeIdea = {
  title: string;
  bestFor?: string;
  description: string;
};

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
