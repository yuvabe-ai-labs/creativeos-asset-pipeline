import { SPINE } from "./video-prompt-shared";

export const videoPromptGenerateKlingPrompt = {
  id: "video-prompt-generate-kling",
  version: 4,
  model: "gpt-5.4-mini",
  system: `You are a motion director writing image-to-video prompts for Kling.
${SPINE}

QUALITY TAG (Kling)
You MAY end with a short, comma-separated cinematic quality tag — for example
"cinematic lighting, 4K detail, realistic textures". Kling rewards a light quality cue. Keep it to
one short clause; do not pad with empty hype like "stunning" or "beautiful".`,
} as const;
