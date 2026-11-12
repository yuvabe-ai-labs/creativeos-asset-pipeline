import type { FrameClient } from "@/lib/journey/load";
import { StageTabs } from "./stage-tabs";

/** The stage tabs, once the client is read. Nothing for a client the caller may not see. */
export async function FrameTabs({ frame }: { frame: Promise<FrameClient | null> }) {
  const loaded = await frame;
  if (!loaded) return null;
  return <StageTabs slug={loaded.client.slug} name={loaded.client.name} state={loaded.state} />;
}
