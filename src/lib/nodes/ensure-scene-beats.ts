// D286 — client side of "turning multishot on cuts the scene at its beats". Split out of the
// component so the decision (fresh → nothing; stale → one split call; failure → one cut) is unit
// tested; the vitest env is node, so components cannot be rendered.
import type { ReelShot, SceneBeat } from "./reel-script";
import { beatsForScene, type SceneBeatCache } from "./scene-beats";

export type SplitResult = { beats: SceneBeat[]; beatsFor: string };

/** POST the stored row to the split-scene route. Throws on a non-2xx. */
export async function requestSceneSplit(
  scriptNodeId: string,
  scene: ReelShot,
  slices?: string[],
): Promise<SplitResult> {
  const res = await fetch(`/api/nodes/${scriptNodeId}/split-scene`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scene: {
        description: scene.description,
        duration_seconds: scene.duration_seconds,
        ...(scene.voiceover !== undefined ? { voiceover: scene.voiceover } : {}),
      },
      slices,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? "Split failed");
  return json as SplitResult;
}

export async function ensureSceneBeats(
  row: ReelShot,
  cache: SceneBeatCache | undefined,
  split: (row: ReelShot) => Promise<SplitResult>,
): Promise<
  | { status: "fresh" }
  | { status: "split"; fingerprint: string; beats: SceneBeat[] }
  | { status: "failed" }
> {
  if (beatsForScene(row, cache).fresh) return { status: "fresh" };
  try {
    const { beats, beatsFor } = await split(row);
    return { status: "split", fingerprint: beatsFor, beats };
  } catch {
    return { status: "failed" };
  }
}
