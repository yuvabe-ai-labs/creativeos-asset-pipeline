import type { ReelScript } from "./reel-script";

// POST a Script node's text to the existing parse route. A brand-new node 404s until its first
// autosave lands, so a 404 waits past the autosave debounce and tries again. Shared by the canvas
// copilot's parse recipe and the script drop from the gallery's Scripts tab (spec 1 §5.2).

export type ParseResult =
  | { ok: true; output: ReelScript }
  | { ok: false; reason: "saving" | "failed"; error: string };

export type ParseOptions = {
  attempts?: number;
  waitMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const STILL_SAVING = "The script is still saving. Open it and parse it from the node.";

export async function parseScriptNode(nodeId: string, source: string, opts: ParseOptions = {}): Promise<ParseResult> {
  const { attempts = 3, waitMs = 900, fetchImpl = fetch, sleep = defaultSleep } = opts;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const res = await fetchImpl(`/api/nodes/${nodeId}/parse`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source }),
    });
    if (res.ok) return { ok: true, output: ((await res.json()) as { output: ReelScript }).output };
    if (res.status === 404) {
      if (attempt < attempts - 1) {
        await sleep(waitMs);
        continue;
      }
      return { ok: false, reason: "saving", error: STILL_SAVING };
    }
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, reason: "failed", error: err.error ?? "Parsing failed." };
  }
  return { ok: false, reason: "saving", error: STILL_SAVING };
}
