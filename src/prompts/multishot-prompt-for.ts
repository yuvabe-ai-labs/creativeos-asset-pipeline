// Which writer a Multishot node's target model gets (D236).
//
// Its own file so the two prompt modules stay a clean DAG: generate.ts is canonical and imports
// neither, kling.ts imports generate.ts, and only this file imports both. Putting the router in
// generate.ts would make the two import each other.
import { multishotCapabilityFor } from "@/lib/nodes/multishot-models";
import { KLING_OMNI_MODEL_ID } from "@/lib/video-gen/client-models";
import {
  multishotPromptGenerate,
  type MultishotPromptSpec,
} from "./multishot-prompt-generate";
import { multishotPromptKling } from "./multishot-prompt-kling";

/**
 * Routes on the CAPABILITY's id, not on the raw string, so an unknown or absent `targetModel`
 * lands on the same default the ladder's ceiling already used. A node cannot end up with Omni's
 * limits and Kling's prompt.
 */
export function multishotPromptFor(
  targetModel: string | undefined | null,
): MultishotPromptSpec {
  const cap = multishotCapabilityFor(targetModel);
  return cap.id === KLING_OMNI_MODEL_ID ? multishotPromptKling() : multishotPromptGenerate();
}
