import type { FrameClient } from "@/lib/journey/load";
import { JourneyGuide } from "./journey-guide";

/** The copilot's guide, once the client is read. Nothing for a client the caller may not see. */
export async function FrameGuide({ frame }: { frame: Promise<FrameClient | null> }) {
  const loaded = await frame;
  if (!loaded) return null;
  return <JourneyGuide client={loaded.client} state={loaded.state} />;
}
