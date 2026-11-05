// What Video Gen says when it has no prompt to send: one message per case, in the operator's
// words, shared by the money path (resolve-prompt.ts) and the focus view that blocks Generate.
// "No node with output found" read as a broken wire when the prompt was simply not written yet.

export const NO_PROMPT_NODE_MESSAGE = "Connect a Motion prompt or a Multishot prompt to this Video Gen.";

export const UNWRITTEN_PROMPT_MESSAGE = {
  "video-prompt": "The motion prompt isn't written yet. Open it and press Generate first.",
  "multishot-prompt": "The multishot prompt isn't written yet. Open it and press Generate first.",
} as const;
