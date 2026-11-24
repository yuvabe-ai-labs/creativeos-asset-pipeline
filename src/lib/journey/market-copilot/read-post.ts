import "server-only";
import { z } from "zod";
import { setItemReading, type MoodboardItem } from "@/lib/db/moodboards";
import { describeError } from "@/lib/describe-error";
import { generateStructured, type GeminiPart } from "@/lib/image-analysis/gemini";
import { MARKET_READ_SYSTEM } from "@/prompts/market-signals";
import { MARKET_READ_MAX_BYTES, MARKET_READ_MODEL } from "./constants";

// One market reference read by the agent (D530): what the post does, in the words a signal is
// drafted from. Kept on the item (`moodboard_items.reading`, 0067) so a post is read once.

export type PostReading = {
  handle: string;
  caption: string;
  /** How the post opens: the first second or line. */
  hook: string;
  format: string;
  pacing: string;
  onScreenText: string;
  setting: string;
  occasion: string;
  summary: string;
  /** Read from the archived media itself, or only from its thumbnail and caption. */
  from: "media" | "thumbnail";
};

const readingSchema = z.object({
  hook: z.string(), format: z.string(), pacing: z.string(), onScreenText: z.string(),
  setting: z.string(), occasion: z.string(), summary: z.string(),
});

/** "@handle · caption" is how the fetch writes a reference's note; a note made by hand is the
 *  caption alone. */
function fromNote(note: string | null): { handle: string; caption: string } {
  const m = (note ?? "").match(/^@([a-z0-9._]{1,30})(?:\s·\s([\s\S]*))?$/i);
  return m ? { handle: m[1].toLowerCase(), caption: (m[2] ?? "").trim() } : { handle: "", caption: (note ?? "").trim() };
}

/** The bytes of one picture or video as an inline part; null when it cannot be had or is too big. */
async function inline(url: string, fallbackType: string | null, fetchImpl: typeof fetch): Promise<GeminiPart | null> {
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > MARKET_READ_MAX_BYTES) return null;
    const mimeType = res.headers.get("content-type")?.split(";")[0].trim() || fallbackType || "image/jpeg";
    return { inlineData: { mimeType, data: buffer.toString("base64") } };
  } catch (e) {
    console.error("[market-read] could not fetch media", { url, error: describeError(e) });
    return null;
  }
}

export async function readPost(
  item: MoodboardItem,
  deps: { generate?: typeof generateStructured; fetchImpl?: typeof fetch } = {},
): Promise<PostReading> {
  if (item.reading) return item.reading;
  const generate = deps.generate ?? generateStructured;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const { handle, caption } = fromNote(item.note);

  // The archived video or picture when it is there and small enough to send; else the thumbnail.
  const archived = item.archive_status === "ready" && item.media_url && (item.media_bytes ?? 0) <= MARKET_READ_MAX_BYTES;
  let media: GeminiPart | null = archived ? await inline(item.media_url as string, item.media_type, fetchImpl) : null;
  const from: PostReading["from"] = media ? "media" : "thumbnail";
  if (!media && item.thumbnail_url) media = await inline(item.thumbnail_url, "image/jpeg", fetchImpl);

  const text = [`Post by @${handle || "unknown"} (${item.image_url}).`, `Caption: ${caption || "(none)"}`].join("\n");
  const answer = await generate({
    model: MARKET_READ_MODEL, system: MARKET_READ_SYSTEM, schema: readingSchema,
    parts: media ? [{ text }, media] : [{ text }],
  });
  const reading: PostReading = { handle, caption, ...answer, from };
  // The reading is paid for and in hand: a failure to keep it (0067 not applied yet, a blip) must
  // not throw it away. It is simply read again next time (review fix).
  try {
    await setItemReading(item.id, reading);
  } catch (e) {
    console.error("[market-read] could not keep the reading", { itemId: item.id, error: describeError(e) });
  }
  return reading;
}
