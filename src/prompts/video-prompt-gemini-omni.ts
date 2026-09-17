import { SPINE, MOTION_AVOID_LIST } from "./video-prompt-shared";

// D243 — Omni's OWN record. Until this file existed, `videoPromptGeneratePromptFor` returned Veo's
// record for Omni, so Gemini Omni has been generating from a prompt whose header says "for Veo
// 3.1". The text here is deliberately still Veo's composition: splitting the routing and rewriting
// the prose are two changes, and doing both at once would leave a behaviour change with no way to
// attribute it. Plan 2 rewrites this from ref/google-omni-flash-docs' six-dimension framework.
export const videoPromptGenerateGeminiOmniPrompt = {
  id: "video-prompt-generate-gemini-omni",
  version: 1,
  model: "gpt-5.4-mini",
  system: `You are a motion director writing image-to-video prompts for Gemini Omni.
${SPINE}

WORDS TO AVOID
Do not use: ${MOTION_AVOID_LIST}`,
} as const;
