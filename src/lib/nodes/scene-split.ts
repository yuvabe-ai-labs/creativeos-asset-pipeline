// D286 — the split-scene route's pure parts: validate the scene the client sent, and compose the
// two messages. Kept out of the route so both are unit tested without mocking the request path.
import type { ReelShot, VoLine } from "./reel-script";
import { sceneSplitPrompt } from "@/prompts/scene-split";

function isVoLine(v: unknown): v is VoLine {
  const l = v as VoLine | null;
  return !!l && typeof l.text === "string" && typeof l.speaker === "string";
}

/** The scene row from a request body, or null when it cannot be split. */
export function parseSceneBody(input: unknown): ReelShot | null {
  const s = input as { description?: unknown; duration_seconds?: unknown; voiceover?: unknown } | null;
  if (!s || typeof s.description !== "string" || !s.description.trim()) return null;
  if (typeof s.duration_seconds !== "number" || !(s.duration_seconds > 0)) return null;
  if (s.voiceover !== undefined && !(Array.isArray(s.voiceover) && s.voiceover.every(isVoLine))) {
    return null;
  }
  return {
    description: s.description,
    duration_seconds: s.duration_seconds,
    ...(s.voiceover !== undefined ? { voiceover: s.voiceover as VoLine[] } : {}),
  };
}

export function compileSceneSplit(scene: ReelShot, clientContext: string) {
  const ctx = clientContext.trim();
  const system = [
    sceneSplitPrompt.system,
    ctx ? `${sceneSplitPrompt.clientContextHeading}\n${ctx}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  // No voiceover: beats are visual only, and a split scene's lines play over the whole sequence.
  const user = `Scene to split:\n${(scene.description ?? "").trim()}\n\nLength: ${scene.duration_seconds} seconds`;
  return { system, user };
}
