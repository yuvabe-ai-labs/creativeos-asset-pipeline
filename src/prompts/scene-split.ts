// D286 — split ONE scene into its suggested cuts. Runs when the operator turns multishot on for a
// scene edited since the parse (or parsed before v10). The rules are the parse's own
// (SCENE_SPLIT_RULES), so a scene splits the same way whichever prompt ran.
import { SCENE_SPLIT_RULES, sceneBeatSchema } from "./script-parse";

const system = `You split ONE scene of a short-form video reel script into its beats and return them as JSON.

${SCENE_SPLIT_RULES}

Respect the client context when it is provided: keep the brand tone, and never introduce medical or claim words the client avoids or before/after promises.`;

export const sceneSplitPrompt = {
  id: "scene-split",
  version: 1,
  model: "gpt-5.4-mini",
  system,
  clientContextHeading: `Client context — the client's brand tone and compliance rules:`,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["beats"],
    properties: { beats: { type: "array", items: sceneBeatSchema } },
  },
};
