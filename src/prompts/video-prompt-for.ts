import { videoPromptGeneratePrompt } from "./video-prompt-veo";
import { videoPromptGenerateKlingPrompt } from "./video-prompt-kling";
import { videoPromptGenerateGeminiOmniPrompt } from "./video-prompt-gemini-omni";
import { videoPromptGenerateSeedancePrompt } from "./video-prompt-seedance";
import type { VideoPromptTarget, VideoProviderPrompt } from "./video-prompt-shared";

/**
 * D243 — one record per model, exhaustively.
 *
 * A `switch` with no `default`, so adding a member to `VideoPromptTarget` is a COMPILE error here
 * rather than a silent fallthrough. The bug this replaces was exactly a silent fallthrough: the
 * old `provider === "kling" ? kling : veo` handed Gemini Omni a prompt headed "for Veo 3.1".
 */
export function videoPromptFor(target: VideoPromptTarget): VideoProviderPrompt {
  switch (target) {
    case "kling": return videoPromptGenerateKlingPrompt;
    case "gemini-omni": return videoPromptGenerateGeminiOmniPrompt;
    case "seedance": return videoPromptGenerateSeedancePrompt;
    case "veo": return videoPromptGeneratePrompt;
  }
}
