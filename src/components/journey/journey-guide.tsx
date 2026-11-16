"use client";

import { usePathname } from "next/navigation";
import type { FrameClient } from "@/lib/journey/load";
import { frameFor } from "@/lib/journey/frame";
import { guideFor } from "@/lib/journey/guide";
import { currentStage } from "@/lib/journey/stages";
import { JourneyPanel } from "./journey-panel";
import { KbCopilot } from "./kb-copilot";

/** Picks the copilot panel for the page being shown: the brand KB copilot on Brand KB, the guide on
 *  the stages whose own copilot is a later piece, and on a page that is no stage's own (the home,
 *  Avatars, Brand assets) the panel of the stage the client is at. Nothing on a page with no panel. */
export function JourneyGuide({ client, state }: FrameClient) {
  const framed = frameFor(usePathname(), client.slug).panel;
  if (!framed) return null;
  const panel = framed === "current" ? currentStage(state) : framed;
  if (panel === "kb") return <KbCopilot clientId={client.id} slug={client.slug} />;
  return <JourneyPanel slug={client.slug} guide={guideFor({ section: panel, state, slug: client.slug })} />;
}
