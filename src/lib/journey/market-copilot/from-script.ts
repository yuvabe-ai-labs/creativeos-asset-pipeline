import "server-only";
import { getBrandDetails } from "@/lib/db/brand-kit";
import { claimCopilotCard, insertCopilotMessages, listCopilotMessages } from "@/lib/db/copilot-messages";
import { getActiveKBVersion } from "@/lib/db/kb";
import type { ClientRow } from "@/lib/db/types";
import { ensureOpening } from "@/lib/journey/thread/opening";
import { ONBOARDING, type BrandsCard } from "@/lib/journey/thread/schema";
import type { TraceableBrandKB } from "@/lib/kb/schema";
import { renderKbText } from "@/lib/scripts/copilot/prompt-context";
import { findBrands as webFindBrands, normalizeHandle } from "./brands";
import { knownHandles, pendingBrands } from "./context";

// D532 — research asked for inside a script goes to the market research agent: into the client's
// onboarding thread, as the person's question and a list of brands focused on it, reviewed on the
// Market research tab like any other. A script keeps no research of its own. Run after the script's
// reply has gone (the web search is slow); never throws into the script turn.

const NONE_FOUND = "I could not find brands with Instagram handles I could confirm for that. Tell me which brands to look at.";

export async function askMarketResearch(
  input: { client: Pick<ClientRow, "id" | "name" | "slug" | "org_id" | "kb_status">; userId: string | null; scriptTitle: string; question: string },
  deps: { findBrands?: typeof webFindBrands } = {},
): Promise<void> {
  const find = deps.findBrands ?? webFindBrands;
  const { client, question } = input;
  const [stored, version, details] = await Promise.all([
    listCopilotMessages(client.id, ONBOARDING),
    getActiveKBVersion(client.id),
    getBrandDetails(client.id),
  ]);
  await ensureOpening(client as ClientRow);
  // The question first, so the thread shows what was asked while the search runs.
  await insertCopilotMessages(client.id, ONBOARDING, input.userId, [{ role: "user", content: `From ${input.scriptTitle}: ${question}` }]);

  const ownHandle = details.instagram ? normalizeHandle(details.instagram) : null;
  const brands = await find({
    clientName: client.name,
    kbText: version ? renderKbText(version.output as unknown as TraceableBrandKB) : "",
    ownHandle, focus: question, known: knownHandles(stored),
  });
  if (brands.length === 0) {
    await insertCopilotMessages(client.id, ONBOARDING, null, [{ role: "assistant", content: NONE_FOUND, suggestions: [] }]);
    return;
  }
  const card: BrandsCard = { kind: "brands", status: "pending", focus: question, brands, jobId: null };
  await insertCopilotMessages(client.id, ONBOARDING, null, [
    { role: "assistant", content: "Here are brands to look at for that. Switch off any you don't want, then fetch their posts.", suggestions: [] },
    { role: "assistant", content: "", card, suggestions: [] },
  ]);
  // A new list replaces the one still waiting, as in the chat.
  const replaced = pendingBrands(stored);
  if (replaced) await claimCopilotCard(client.id, replaced.messageId, "brands", "pending", { ...replaced.card, status: "stale" });
}
