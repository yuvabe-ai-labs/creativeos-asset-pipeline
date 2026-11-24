import "server-only";
import { z } from "zod";
import { getClientById } from "@/lib/db/clients";
import { insertCopilotMessages, listCopilotMessages, type NewCopilotMessage } from "@/lib/db/copilot-messages";
import { listSignalNames } from "@/lib/db/signals";
import { getActiveKBVersion } from "@/lib/db/kb";
import { ensureSystemBoards, listItems, type MoodboardItem } from "@/lib/db/moodboards";
import { describeError } from "@/lib/describe-error";
import { generateStructured } from "@/lib/image-analysis/gemini";
import { failJob, getJob, setJobPhase, startJob, succeedJob } from "@/lib/jobs/db";
import { sayJobFailed } from "@/lib/journey/kb-copilot/job-failed";
import { ensureOpening } from "@/lib/journey/thread/opening";
import { ONBOARDING, type SignalDraftCard } from "@/lib/journey/thread/schema";
import type { TraceableBrandKB } from "@/lib/kb/schema";
import { renderKbText } from "@/lib/scripts/copilot/prompt-context";
import { marketGroupSystem, marketGroupUser } from "@/prompts/market-signals";
import { MARKET_ARCHIVE_WAIT_MS, MARKET_DRAFT_MAX_POSTS, MARKET_DRAFT_MIN_POSTS, MARKET_DRAFTS_MAX, MARKET_GROUP_MODEL } from "./constants";
import { readPost, type PostReading } from "./read-post";
import type { MarketDraftInput } from "./start";

// One market-draft run (D530 step 3): read every post in Direct and Adjacent not read yet, group all
// the readings into draft signals, and put each in the thread as a card to keep, edit or drop.
// Nothing is saved as a signal here: only a person keeping a card does that. Never retried.

export type Draft = { name: string; tags: string[]; description: string; itemIds: string[] };
type Reading = { itemId: string; reading: PostReading };

const groupSchema = z.object({
  signals: z.array(z.object({ name: z.string(), tags: z.array(z.string()), description: z.string(), itemIds: z.array(z.string()) })),
});

const ARCHIVE_POLL_MS = 30_000;
const NOTHING_FOUND = "I could not find a pattern shared by at least two posts. Ask me to look for something specific, or bring in more posts first.";
const NOTHING_TO_READ = "There are no posts in Direct or Adjacent to read yet.";
const STILL_ARCHIVING = new Set(["pending", "downloading"]);
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

function postLine(r: Reading): string {
  const x = r.reading;
  const parts = [
    x.hook && `hook: ${x.hook}`, x.format && `format: ${x.format}`, x.pacing && `pacing: ${x.pacing}`,
    x.onScreenText && `on screen: ${x.onScreenText}`, x.setting && `setting: ${x.setting}`,
    x.occasion && `occasion: ${x.occasion}`, x.summary && `summary: ${x.summary}`,
  ].filter(Boolean);
  return `${r.itemId} | @${x.handle || "unknown"} | ${parts.join("; ").replace(/\s+/g, " ")}`;
}

/** One call over every reading. Only ids it was given are kept, each once; a draft left with fewer
 *  than MARKET_DRAFT_MIN_POSTS posts is dropped; at most MARKET_DRAFTS_MAX drafts. */
export async function groupReadings(
  readings: Reading[], focus: string | null,
  deps: {
    generate?: typeof generateStructured; brandContext: string;
    /** Names of the client's signals and of drafts still waiting: never proposed again (review fix). */
    avoid?: string[];
  },
): Promise<Draft[]> {
  const generate = deps.generate ?? generateStructured;
  const given = new Set(readings.map((r) => r.itemId));
  const taken = new Set((deps.avoid ?? []).map((n) => n.trim().toLowerCase()));
  const answer = await generate({
    model: MARKET_GROUP_MODEL,
    system: marketGroupSystem(MARKET_DRAFTS_MAX, MARKET_DRAFT_MIN_POSTS),
    schema: groupSchema,
    parts: [{ text: marketGroupUser({ focus, brandContext: deps.brandContext, posts: readings.map(postLine).join("\n"), avoid: deps.avoid }) }],
  });
  return answer.signals
    .map((s) => ({
      name: s.name.trim(), tags: s.tags.map((t) => t.trim()).filter(Boolean), description: s.description.trim(),
      itemIds: [...new Set(s.itemIds.filter((id) => given.has(id)))],
    }))
    .filter((d) => d.name && !taken.has(d.name.toLowerCase()) && d.itemIds.length >= MARKET_DRAFT_MIN_POSTS)
    .slice(0, MARKET_DRAFTS_MAX);
}

export async function runMarketDraft(
  jobId: string,
  deps: {
    read?: (item: MoodboardItem) => Promise<PostReading>;
    group?: typeof groupReadings;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
  } = {},
): Promise<{ drafts: number }> {
  const read = deps.read ?? ((item: MoodboardItem) => readPost(item));
  const group = deps.group ?? groupReadings;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const job = await getJob<MarketDraftInput>(jobId);
  if (!job?.client_id) return { drafts: 0 };
  const clientId = job.client_id;
  const focus = job.input?.focus ?? null;

  const say = async (rows: NewCopilotMessage[]) => {
    const client = await getClientById(clientId);
    if (client) await ensureOpening(client);
    await insertCopilotMessages(clientId, ONBOARDING, null, rows);
  };

  try {
    await startJob(jobId, "Reading the posts…");
    // What the client already has or is reviewing, so a second run proposes something new.
    const [boards, signals, thread] = await Promise.all([ensureSystemBoards(clientId), listSignalNames(clientId), listCopilotMessages(clientId, ONBOARDING)]);
    const avoid = [
      ...signals.map((s) => s.name),
      ...thread.flatMap((m) => (m.card?.kind === "signal-draft" && m.card.status === "pending" ? [m.card.name] : [])),
    ];
    // The newest posts only, up to the cap: one run's cost is bounded however much is saved.
    const load = async () => (await Promise.all([listItems(boards.direct.id), listItems(boards.adjacent.id)]))
      .flat()
      .sort((a, b) => Date.parse(b.added_at) - Date.parse(a.added_at))
      .slice(0, MARKET_DRAFT_MAX_POSTS);
    let items = await load();
    // Posts just fetched are still archiving: wait a while so their video can be read, then read
    // what there is (a post without its media is read from its thumbnail).
    const began = now();
    while (items.some((i) => !i.reading && STILL_ARCHIVING.has(i.archive_status)) && now() - began < MARKET_ARCHIVE_WAIT_MS) {
      await setJobPhase(jobId, "Waiting for the posts' videos to finish saving…");
      await sleep(ARCHIVE_POLL_MS);
      items = await load();
    }
    if (items.length === 0) {
      await say([{ role: "assistant", content: NOTHING_TO_READ, suggestions: [] }]);
      await succeedJob(jobId, { drafts: 0 });
      return { drafts: 0 };
    }

    await setJobPhase(jobId, `Reading ${plural(items.length, "post")}…`);
    const readings: Reading[] = [];
    // One at a time: each read is a paid call, and one post that cannot be read never stops the rest.
    for (const item of items) {
      try {
        readings.push({ itemId: item.id, reading: item.reading ?? (await read(item)) });
      } catch (e) {
        console.error("[market-draft] could not read a post", { jobId, itemId: item.id, error: describeError(e) });
      }
    }
    if (readings.length < MARKET_DRAFT_MIN_POSTS) throw new Error("Too few posts could be read.");

    await setJobPhase(jobId, `Drafting signals from ${plural(readings.length, "post")}…`);
    // The client's own brand, as its KB describes it: context only, never cited by a signal.
    const version = await getActiveKBVersion(clientId);
    const brandContext = version ? renderKbText(version.output as unknown as TraceableBrandKB) : "";
    const drafts = await group(readings, focus, { brandContext, avoid });

    if (drafts.length === 0) {
      await say([{ role: "assistant", content: NOTHING_FOUND, suggestions: [] }]);
      await succeedJob(jobId, { drafts: 0 });
      return { drafts: 0 };
    }
    const byId = new Map(items.map((i) => [i.id, i]));
    const handleOf = new Map(readings.map((r) => [r.itemId, r.reading.handle]));
    const cards: NewCopilotMessage[] = drafts.map((d) => {
      const card: SignalDraftCard = {
        kind: "signal-draft", status: "pending", name: d.name, tags: d.tags, description: d.description, itemIds: d.itemIds,
        thumbs: d.itemIds.map((id) => ({ itemId: id, url: byId.get(id)?.thumbnail_url ?? null, handle: handleOf.get(id) ?? "" })),
        signalId: null,
      };
      return { role: "assistant", content: "", card, suggestions: [] };
    });
    await say([
      ...cards,
      { role: "assistant", content: `Here are ${plural(drafts.length, "signal")} from ${plural(readings.length, "post")}. Keep, edit or drop each one.`, suggestions: [] },
    ]);
    await succeedJob(jobId, { drafts: drafts.length });
    return { drafts: drafts.length };
  } catch (e) {
    console.error("[market-draft] failed", { jobId, error: describeError(e) });
    await failJob(jobId, e instanceof Error ? e.message : String(e));
    await sayJobFailed({ client_id: clientId, kind: "market-draft", input: job.input });
    return { drafts: 0 };
  }
}
