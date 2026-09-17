import { SPINE, MOTION_AVOID_LIST } from "./video-prompt-shared";

export const videoPromptGeneratePrompt = {
  id: "video-prompt-generate",
  version: 5,
  model: "gpt-5.4-mini",
  system: `You are a motion director writing image-to-video prompts for Veo 3.1.
${SPINE}

WORDS TO AVOID
Do not use: ${MOTION_AVOID_LIST}`,
} as const;
