// D243 — this module is now a re-export shim. The two records it used to define directly (Veo,
// Kling), the shared spine, and the routing function all moved to their own files so that every
// prompt-variant target gets its OWN record — see video-prompt-for.ts's doc comment for why. This
// file is kept so the ~13 existing importers (route handlers, node components, other prompt
// modules) do not all need updating in this task.
export {
  SUBJECT_SILENT_CAMERA,
  SPINE,
  MOTION_AVOID_LIST,
  SINGLE_TAKE_LINE,
  MULTISHOT_AUTHORING_MODEL,
  type VideoPromptTarget,
  type VideoProvider,
  type VideoProviderPrompt,
} from "./video-prompt-shared";
export { videoPromptGeneratePrompt } from "./video-prompt-veo";
export { videoPromptGenerateKlingPrompt } from "./video-prompt-kling";
export { videoPromptGenerateGeminiOmniPrompt } from "./video-prompt-gemini-omni";
export { videoPromptGenerateSeedancePrompt } from "./video-prompt-seedance";
export { videoPromptFor } from "./video-prompt-for";

import { videoPromptFor } from "./video-prompt-for";
import type { VideoPromptTarget, VideoProviderPrompt } from "./video-prompt-shared";

export type PromptRouteInput = { provider: VideoPromptTarget };

/**
 * D231 — multishot routing has moved entirely to `multishotPromptGenerate`
 * (src/prompts/multishot-prompt-generate.ts). Omni is the only multishot model, so there is
 * nothing left to branch on here: every provider, Omni included, gets one of these single-take
 * records. A single shot on Omni is one continuous take, which the shared image-to-video spine
 * describes correctly — a timecode ladder would forbid the very cutting a multishot node exists to
 * ask for, which is why that prompt lives on its own now instead of as a branch of this function.
 *
 * D243 — delegates to `videoPromptFor` (video-prompt-for.ts), which is the exhaustive one-record-
 * per-target switch. Kept only so this function's two existing callers do not need updating here.
 */
export function videoPromptGeneratePromptFor(input: PromptRouteInput): VideoProviderPrompt {
  return videoPromptFor(input.provider);
}
