"use client";

import { usePathname } from "next/navigation";
import type { FrameClient } from "@/lib/journey/load";
import { frameFor } from "@/lib/journey/frame";
import { guideFor } from "@/lib/journey/guide";
import { currentStage } from "@/lib/journey/stages";
import { JourneyPanel } from "./journey-panel";
import { KbCopilot } from "./kb-copilot";

/** Picks the copilot panel for the page being shown: the client copilot on Brand KB, and on Market
 *  research once the brand KB is approved (D530), the guide on
 *  the stages whose own copilot is a later piece, and on a page that is no stage's own (the home,
 *  Avatars, Brand assets) the panel of the stage the client is at. Nothing on a page with no panel. */
export function JourneyGuide({ client, state }: FrameClient) {
  const framed = frameFor(usePathname(), client.slug).panel;
  if (!framed) return null;
  const panel = framed === "current" ? currentStage(state) : framed;
  if (panel === "kb") return <KbCopilot clientId={client.id} slug={client.slug} />;
  // Market research is filled with the same copilot and thread, once the brand KB is approved (D530).
  if (panel === "market" && client.kbStatus === "ready") {
    return <KbCopilot clientId={client.id} slug={client.slug} placeholder="Ask me to research the market, or answer the copilot…" />;
  }
  return <JourneyPanel clientId={client.id} slug={client.slug} guide={guideFor({ section: panel, state, slug: client.slug })} />;
}
