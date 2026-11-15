"use client";

import { usePathname } from "next/navigation";
import type { FrameClient } from "@/lib/journey/load";
import { frameFor } from "@/lib/journey/frame";
import { guideFor } from "@/lib/journey/guide";
import { JourneyPanel } from "./journey-panel";
import { KbCopilot } from "./kb-copilot";

/** Picks the copilot panel for the stage page being shown: the brand KB copilot on Brand KB, the
 *  guide on the stages whose own copilot is a later piece. Nothing on a page that has no panel. */
export function JourneyGuide({ client, state }: FrameClient) {
  const { panel } = frameFor(usePathname(), client.slug);
  if (!panel) return null;
  if (panel === "kb") return <KbCopilot clientId={client.id} slug={client.slug} />;
  return <JourneyPanel slug={client.slug} guide={guideFor({ section: panel, state, slug: client.slug })} />;
}
