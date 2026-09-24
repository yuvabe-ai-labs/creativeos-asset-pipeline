import { apiError, apiOk } from "@/lib/api/route-helpers";
import { resolveCallerContextOrNull } from "@/lib/dal";
import { getAccountVoicesCached, getLibraryPageCached } from "@/lib/elevenlabs/voices-cache";
import { elevenLabsRouteError } from "@/lib/elevenlabs/route-errors";
import type { LibraryQuery } from "@/lib/elevenlabs/voice-catalog";

export const dynamic = "force-dynamic";

const LIBRARY_FILTERS = ["search", "gender", "age", "accent", "language", "useCase", "sort"] as const;

// D283 — the voice picker's two tabs. `account`: the whole account list (the browser filters it).
// `library`: one page of the ElevenLabs Voice Library, filtered by ElevenLabs.
export async function GET(req: Request) {
  const caller = await resolveCallerContextOrNull();
  if (!caller) return apiError("Unauthorized.", 401);

  const url = new URL(req.url);
  const source = url.searchParams.get("source") ?? "account";
  if (source !== "account" && source !== "library") return apiError("Unknown voice source.", 400);

  try {
    if (source === "account") {
      return apiOk({ voices: await getAccountVoicesCached(), nextCursor: null });
    }
    const cursor = url.searchParams.get("cursor");
    const page = cursor === null ? 0 : Number(cursor);
    if (!Number.isInteger(page) || page < 0) return apiError("Invalid cursor.", 400);
    const q: LibraryQuery = { page };
    for (const key of LIBRARY_FILTERS) {
      const value = url.searchParams.get(key);
      if (value) q[key] = value;
    }
    const { voices, hasMore } = await getLibraryPageCached(q);
    return apiOk({ voices, nextCursor: hasMore ? String(page + 1) : null });
  } catch (e) {
    return elevenLabsRouteError(e);
  }
}
