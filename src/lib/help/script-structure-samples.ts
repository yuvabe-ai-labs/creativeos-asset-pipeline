// The copyable prompts behind the "How do I structure a script?" help chapter — one per
// scenario, each pasted into ChatGPT or Claude along with the creator's script.
//
// There is no merge or split for shots on the canvas: the script is the only place a creator
// shapes how a reel breaks into shots and clips. Each prompt restructures a script into the
// shape one scenario needs.
//
// Every limit is interpolated from the code rather than written into the copy. The chapter exists
// to tell creators how long to write things, so a limit that moves in group-shots.ts or the
// multishot table and not here would teach them to write to the wrong length.
import { ASSUMED_SHOT_SECONDS, PACK_CEILING_SECONDS } from "@/lib/nodes/group-shots";
import { MULTISHOT_MODELS } from "@/lib/nodes/multishot-models";

const CEILING = PACK_CEILING_SECONDS;

/** "Gemini Omni 1.1 up to 10s, Kling 3.0 Omni up to 15s (max 6 shots), Seedance 2.5 up to 30s" */
export const MULTISHOT_MODEL_RANGES = MULTISHOT_MODELS.map(
  (m) => `${m.label} up to ${m.maxTotalSeconds}s${m.maxCuts !== null ? ` (max ${m.maxCuts} shots)` : ""}`,
).join(", ");

/**
 * One scenario's prompt. The format and the rules every scenario shares are written once here;
 * a scenario adds only its goal and its own rules.
 */
function restructurePrompt(goal: string, scenarioRules: string[]): string {
  const rules = [
    "Timecodes are whole seconds. They start at 0 and run on with no gaps or overlaps: 0–3, 3–8, 8–14. A block's length is its end minus its start, and Duration is the last block's end.",
    `Every block has a start and an end. If the script gives no timing for a shot, propose one and add "(timing proposed)" to the beat name — an untimed shot is otherwise counted as ${ASSUMED_SHOT_SECONDS} seconds.`,
    `No block longer than ${CEILING} seconds — nothing can generate a take longer than that.`,
    ...scenarioRules,
    "After the last block, keep the caption, hashtags, product links and QC or compliance notes exactly as written.",
    "Reply with the restructured script only — no commentary.",
  ];

  return `Restructure the reel script at the end of this message for CreativeOS. ${goal}

Keep the creative as written — do not add, remove or reword any shot, line of dialogue, on-screen text, call to action or compliance note unless a rule below says so.

FORMAT

Title: …
Product: …
Objective: …
Duration: <total> seconds
Platform: …
Language: …

<start>–<end> SEC — <SHORT BEAT NAME>
Visual:
<what the camera sees in this shot>
Creator:
<spoken line or voiceover, or "(No dialogue)">
On-screen text:
<text on screen, or "(None)">

RULES
${rules.map((rule, i) => `${i + 1}. ${rule}`).join("\n")}

SCRIPT
`;
}

export const SINGLE_TAKE_PROMPT = restructurePrompt(
  "I want it as ONE CONTINUOUS TAKE — a single unbroken shot with no cuts.",
  [
    `Write exactly one block: "0–<end> SEC — ONE CONTINUOUS TAKE (NO CUTS)". The take is ${CEILING} seconds or less.`,
    "Describe the action and the camera movement in prose, in the order they happen. No timecodes inside the block.",
    "No cut words anywhere: cut to, B-roll, insert, match cut, transition. This is the one change to the wording you may make — rewrite each cut in the script as a camera move within the take.",
  ],
);

export const CUTS_IN_ONE_CLIP_PROMPT = restructurePrompt(
  `I want it as ONE CLIP WITH CUTS — several shots, ${CEILING} seconds or less in total.`,
  [
    "One block per camera shot. A block never contains a cut — if a shot cuts to something else, split it into two blocks.",
    `Each block is at least 1 second long, and the whole reel is ${CEILING} seconds or less.`,
    "Keep the blocks in the order they play.",
  ],
);

export const SHORT_HOOK_PROMPT = restructurePrompt(
  "I want a SHORT HOOK OR TEASER of 3 to 10 seconds.",
  [
    "One block per camera shot, at most 3 blocks.",
    "The whole thing is between 3 and 10 seconds.",
    "If the script runs longer, keep the opening hook and the call to action and drop the rest. This is the one exception to keeping everything — list what you dropped under a final line reading DROPPED:.",
  ],
);

export const LONG_REEL_PROMPT = restructurePrompt(
  `The reel runs past ${CEILING} seconds, and I want to choose where it breaks into clips.`,
  [
    "One block per camera shot.",
    `Split the reel into separate scripts at natural breaks — a change of scene, location or beat — so each script is ${CEILING} seconds or less.`,
    "Every script repeats the header, with the part number in its Title, and its timecodes start again at 0.",
    "Separate the scripts with a line containing only -----.",
  ],
);

export const CLIP_PER_SHOT_PROMPT = restructurePrompt(
  "I want EVERY SHOT AS ITS OWN CLIP, so each can be generated and approved on its own.",
  [
    "Split the script into one separate script per shot. Each has exactly one block, starting at 0.",
    "Every script repeats the header, with the shot number in its Title.",
    "Separate the scripts with a line containing only -----.",
  ],
);
