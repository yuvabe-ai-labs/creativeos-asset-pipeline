"use client";

import { usePathname } from "next/navigation";
import type { FrameClient } from "@/lib/journey/load";
import { frameFor } from "@/lib/journey/frame";
import { guideFor } from "@/lib/journey/guide";
import { JourneyPanel } from "./journey-panel";

/** Picks the guide for the stage page being shown. Nothing on a page that has no guide. */
export function JourneyGuide({ client, state }: FrameClient) {
  const { panel } = frameFor(usePathname(), client.slug);
  if (!panel) return null;
  return (
    <JourneyPanel
      slug={client.slug}
      guide={guideFor({ section: panel, state, kbStatus: client.kbStatus, slug: client.slug })}
    />
  );
}
