// End-to-end check for the market media archive (D257-D265), against REAL services.
//
// Unit tests prove our logic; this proves the ENVIRONMENT — that the staging Apify
// token works for the per-post call, that the staging GCS credentials can write to
// the bucket, and that the row actually lands in `ready` with a URL we own. Those are
// the failures that unit tests cannot see and that would otherwise only appear the
// first time someone clips a reel.
//
// It picks one real pending item per kind, archives it for real, and leaves it
// archived — which is the desired end state, not a side effect to clean up.
//
//   npx vitest run --config vitest.integration.config.ts
//
// Costs roughly one Apify result-charge per provider-backed kind (~$0.003 each).
import { describe, it, expect, beforeAll } from "vitest";

// Vitest does not read .env; load the file `npm run env:staging` writes, so this
// always targets whatever project the worktree is currently pointed at.
beforeAll(() => {
  process.loadEnvFile(".env");
});

async function pendingItemOfKind(kind: string) {
  const { createServerSupabase } = await import("@/lib/supabase/server");
  const sb = createServerSupabase();
  const { data, error } = await sb
    .from("moodboard_items")
    .select("id, kind, image_url, moodboard_id, archive_status, thumbnail_url")
    .eq("kind", kind)
    .in("archive_status", ["pending", "failed"])
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { data: board } = await sb
    .from("moodboards")
    .select("client_id")
    .eq("id", data.moodboard_id)
    .maybeSingle();
  return { ...data, clientId: (board as { client_id: string }).client_id };
}

describe("archive end-to-end", () => {
  it("reports which project it is pointed at", () => {
    const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname;
    console.log(`\n  project: ${host}`);
    expect(process.env.APIFY_TOKEN, "APIFY_TOKEN must be set").toBeTruthy();
    expect(process.env.GCS_BUCKET, "GCS_BUCKET must be set").toBeTruthy();
  });

  for (const kind of ["instagram", "youtube", "pinterest", "link"]) {
    it(`archives a real ${kind} item`, async () => {
      const item = await pendingItemOfKind(kind);
      if (!item) {
        console.log(`  (no pending ${kind} item on this project — skipped)`);
        return;
      }

      const { archiveItem } = await import("@/lib/market/archive");
      const { getItem } = await import("@/lib/db/moodboards");

      console.log(`  ${kind}: ${item.image_url}`);
      const started = Date.now();
      const result = await archiveItem(item.id, item.clientId);
      const secs = ((Date.now() - started) / 1000).toFixed(1);

      const after = await getItem(item.id);
      console.log(`  -> ${JSON.stringify(result)} in ${secs}s`);
      console.log(`  -> status=${after?.archive_status} media=${after?.media_url ?? "none"}`);
      if (after?.archive_error) console.log(`  -> error: ${after.archive_error}`);

      // `link` has no media of ours to own, so `skipped` is the correct outcome.
      if (kind === "link") {
        expect(after?.archive_status).toBe("skipped");
        return;
      }

      expect(result.ok, `archive failed: ${JSON.stringify(result)}`).toBe(true);
      expect(after?.archive_status).toBe("ready");
      // The whole point: the URL must be OURS, not the platform's.
      expect(after?.media_url).toContain("storage.googleapis.com");
      expect(after?.media_bytes).toBeGreaterThan(0);
      console.log(`  -> ${((after!.media_bytes ?? 0) / 1024 / 1024).toFixed(2)} MB, ${after?.media_type}`);

      // D265 — an item that had no preview should now have one.
      if (!item.thumbnail_url && after?.thumbnail_url) {
        console.log(`  -> thumbnail repaired: ${after.thumbnail_url}`);
      }
    });
  }
});
