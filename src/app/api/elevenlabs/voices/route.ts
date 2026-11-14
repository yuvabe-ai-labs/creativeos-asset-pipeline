import { apiError, apiOk, withAccess } from "@/lib/api/route-helpers";
import { getAccountVoicesCached, getLibraryPageCached } from "@/lib/elevenlabs/voices-cache";
import { elevenLabsRouteError } from "@/lib/elevenlabs/route-errors";
import type { LibraryQuery } from "@/lib/elevenlabs/voice-catalog";
import { clientPickerVoices } from "@/lib/elevenlabs/client-voices";
import { agencyVoiceIds } from "@/lib/elevenlabs/agency-voices";

export const dynamic = "force-dynamic";

const LIBRARY_FILTERS = ["search", "gender", "age", "accent", "language", "useCase", "sort"] as const;

// D283 — the voice picker's two tabs. `account`: the account list (the browser filters it), kept
// to stock voices and the voices of clients the caller can see: one account serves every agency,
// and a clone is named after its client. `library`: one page of the Voice Library.
export async function GET(req: Request) {
  return withAccess(req, { need: "view" }, async (caller, orgId) => {
    const url = new URL(req.url);
    const source = url.searchParams.get("source") ?? "account";
    if (source !== "account" && source !== "library") return apiError("Unknown voice source.", 400);

    try {
      if (source === "account") {
        const [account, voiceIds] = await Promise.all([getAccountVoicesCached(), agencyVoiceIds(caller, orgId)]);
        return apiOk({ voices: clientPickerVoices(account, voiceIds), nextCursor: null });
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
  });
}
