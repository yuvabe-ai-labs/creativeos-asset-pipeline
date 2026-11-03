import { SPINE, VO_PERFORMANCE_RULES } from "./video-prompt-shared";

export const videoPromptGenerateKlingPrompt = {
  id: "video-prompt-generate-kling",
  // 5 (D441): preservation pins the product to its picture instead of describing it.
  // 6 (D478): told a shot's spoken lines are coming (VO_PERFORMANCE_RULES), never their words.
  version: 6,
  model: "gpt-5.4-mini",
  system: `You are a motion director writing image-to-video prompts for Kling.
${SPINE}

${VO_PERFORMANCE_RULES}

QUALITY TAG (Kling)
You MAY end with a short, comma-separated cinematic quality tag — for example
"cinematic lighting, 4K detail, realistic textures". Kling rewards a light quality cue. Keep it to
one short clause; do not pad with empty hype like "stunning" or "beautiful".`,
} as const;
