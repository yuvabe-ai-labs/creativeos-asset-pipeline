import "server-only";
import type OpenAI from "openai";
import { z } from "zod";
import { createOpenAI } from "@/lib/openai/server";
import { openAiCost, recordAfterResponse, type RecordFor } from "@/lib/generations/record-for";
import type { MarketBrand } from "@/lib/journey/thread/schema";
import { marketBrandsSystem, marketBrandsUser } from "@/prompts/market-brands";
import { MARKET_BRANDS_MODEL, MARKET_BRANDS_PER_GROUP } from "./constants";

// D530 step 1: brands to look at, found by web search, as Instagram handles with a reason. The
// person reviews the list on a brands card before anything is fetched.

const HANDLE = /^[a-z0-9._]{1,30}$/;
/** Instagram paths that are a post or a page of the site, never a profile. */
const NOT_A_PROFILE = new Set(["p", "reel", "reels", "tv", "stories", "explore", "accounts"]);

/** A handle as Instagram spells it, from "@x", "x", "instagram.com/x/" or a full profile url; null
 *  for anything else. */
export function normalizeHandle(raw: string): string | null {
  let s = raw.trim();
  const url = s.match(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([^/?#]+)/i);
  if (url) {
    if (NOT_A_PROFILE.has(url[1].toLowerCase())) return null;
    s = url[1];
  }
  s = s.replace(/^@/, "").toLowerCase();
  return HANDLE.test(s) ? s : null;
}

/** The model's list as card rows: normalised, each handle once, none excluded, at most
 *  MARKET_BRANDS_PER_GROUP per group, all kept until the person says otherwise. */
export function toBrands(raw: { handle: string; name: string; why: string; group: string }[], exclude: Set<string>): MarketBrand[] {
  const seen = new Set(exclude);
  const count = { direct: 0, adjacent: 0 };
  const out: MarketBrand[] = [];
  for (const r of raw) {
    const handle = normalizeHandle(r.handle);
    if (!handle || seen.has(handle)) continue;
    if (r.group !== "direct" && r.group !== "adjacent") continue;
    if (count[r.group] >= MARKET_BRANDS_PER_GROUP) continue;
    seen.add(handle);
    count[r.group] += 1;
    out.push({ handle, name: r.name.trim() || handle, why: r.why.trim(), group: r.group, keep: true });
  }
  return out;
}

const answerSchema = z.object({
  brands: z.array(z.object({ handle: z.string(), name: z.string().default(""), why: z.string().default(""), group: z.string() })),
});

/** The JSON object in a model's answer, fenced or not. Throws when there is none. */
function parseAnswer(text: string): z.infer<typeof answerSchema> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return answerSchema.parse(JSON.parse(body));
}

export async function findBrands(
  input: { clientName: string; kbText: string; ownHandle: string | null; focus: string | null; known: string[] },
  deps: { openai?: Pick<OpenAI, "responses">; recordFor?: RecordFor } = {},
): Promise<MarketBrand[]> {
  const openai = deps.openai ?? createOpenAI();
  const res = await openai.responses.create({
    model: MARKET_BRANDS_MODEL,
    input: [
      { role: "system", content: marketBrandsSystem(MARKET_BRANDS_PER_GROUP) },
      { role: "user", content: marketBrandsUser(input) },
    ],
    tools: [{ type: "web_search" }],
  });
  // D560: paid once it answered, whatever the answer turns out to be.
  recordAfterResponse(openAiCost(deps.recordFor, "copilot", MARKET_BRANDS_MODEL, res.usage, "responses"));
  const exclude = new Set([input.ownHandle, ...input.known].flatMap((h) => (h ? [normalizeHandle(h) ?? h] : [])));
  return toBrands(parseAnswer(res.output_text ?? "").brands, exclude);
}
