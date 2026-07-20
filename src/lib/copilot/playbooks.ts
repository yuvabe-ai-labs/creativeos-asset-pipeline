import type { Edge } from "@xyflow/react";
import type { AppNode } from "@/lib/canvas-nodes";
import { nodeHandle } from "@/lib/nodes/describe-node";

// A playbook is a HARDCODED step list — the flowchart drawn in advance (runner spec
// §2.1). The model routes a sentence to one and extracts slot values; code owns
// everything after that. This file is pure data + pure functions, importable from
// BOTH the client runner and the server actions route (tool enum + descriptions).

export type CanvasSnapshot = { nodes: AppNode[]; edges: Edge[] };
export type SlotValue = string | string[];

export type SlotSpec = {
  key: string; // "shot", "refs"
  required: boolean;
  kind: "node-handle" | "node-handles";
  noneOk?: boolean; // "none"/"skip" is a valid answer → fills [] (refs-style slots)
  // The authored elicitation question (Dialogflow-style) — always names the expected
  // input format (@SHOT-…, @selected, "none"). Never model-generated (spec §8).
  ask: string;
  // Ask-when-Needed: auto-fill when the canvas makes the answer unambiguous
  // (one shot on canvas → it's the shot). Return null to keep asking.
  infer?: (snap: CanvasSnapshot) => SlotValue | null;
  // A required slot no answer can satisfy (no shots exist at all) → cancel the
  // elicitation up front with this message instead of asking a dead question.
  unanswerable?: (snap: CanvasSnapshot) => string | null;
};

export type RunRecipes = {
  // Create a node, return its id. Does NOT open it — opening is its own verb.
  createNode: (type: string, position: { x: number; y: number }, title?: string) => string;
  // Wire each source handle → the target handle (canConnect-validated by the recipe).
  connect: (
    fromHandles: string[],
    toHandle: string,
  ) => { wired: string[]; rejected: string[]; unknown: string[] };
  // Pan to the node and open its surface via the shared focusedNodeId signal.
  open: (id: string) => void;
};

// What a predicate may read: the run's filled slots + the ids earlier steps created.
export type RunSnapshot = {
  slots: Record<string, SlotValue>;
  created: Record<string, string>;
};

// What a copilot step's run() receives: the run snapshot plus injected effects.
// Steps never import the store — the runner hands them these capabilities.
export type RunContext = RunSnapshot & {
  remember: (key: string, id: string) => void; // write into created (read by later steps)
  resolve: (handle: string) => AppNode | null; // handle → live node
  node: (id: string) => AppNode | null; // id → live node
  recipes: RunRecipes;
};

export type PlaybookStep =
  | {
      actor: "copilot";
      label: string;
      // Executes the step via ctx.recipes and returns the past-tense "✓" line for the
      // run card (with real handles). Throwing aborts the run with the error message.
      run: (ctx: RunContext) => string;
    }
  | {
      actor: "human";
      label: string;
      instruction: string; // the "YOUR TURN — …" copy posted to chat + shown on the card
      // The "eyes" (P6): a PURE, CHEAP predicate over current store state — never
      // history. Runs on every store change while this step waits, so keep it O(nodes).
      done: (snap: CanvasSnapshot, run: RunSnapshot) => boolean;
      // The node id the predicate depends on; if it disappears mid-wait the runner
      // cancels the run (spec §4 "node deleted mid-run").
      watchId: (run: RunSnapshot) => string | undefined;
    };

export type Playbook = {
  name: string;
  description: string; // shown to the router model in the tool description
  title: (slots: Record<string, SlotValue>) => string; // run-card header
  slots: SlotSpec[];
  steps: PlaybookStep[];
};

// Slot-value accessors — slots arrive as string | string[] from the model.
const first = (v: SlotValue | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));
const many = (v: SlotValue | undefined): string[] => (Array.isArray(v) ? v : v ? [v] : []);

// "Has this node produced output?" — data.parsed is the active version's output
// (D19), so a non-empty parsed IS "the human generated" in store terms.
function hasOutput(node: AppNode | undefined): boolean {
  const parsed = (node?.data as { parsed?: unknown } | undefined)?.parsed;
  if (parsed == null) return false;
  return typeof parsed === "string" ? parsed.trim().length > 0 : true;
}

// Column offset between pipeline stages — matches fanOutShots' x + 360 rhythm,
// slightly wider so the new node never overlaps its source's card.
const STAGE_X = 380;

// v1's ONE playbook — the §8.4 lane slice: shot → prompt → (human generates prompt)
// → image node → (human generates image). Generation steps are HUMAN steps — the
// L6 HITL gate lands as a pause, never an auto-fire (spec §2.5).
export const imageForShot: Playbook = {
  name: "image-for-shot",
  description:
    "Produce an image reference for one shot: adds a prompt node wired from the shot " +
    "(plus any reference images), waits for the human to write + generate the prompt, " +
    "then adds an image node wired from the prompt and waits for the human to generate.",
  title: (slots) => `Image for ${first(slots.shot) || "a shot"}`,
  slots: [
    {
      key: "shot",
      required: true,
      kind: "node-handle",
      ask: "Which shot? Mention it like @SHOT-1A2B — or select it on the canvas and say @selected.",
      infer: (snap) => {
        const shots = snap.nodes.filter((n) => n.type === "shot");
        return shots.length === 1 ? nodeHandle(shots[0]) : null;
      },
      unanswerable: (snap) =>
        snap.nodes.some((n) => n.type === "shot")
          ? null
          : "There are no shots on this canvas yet — parse a script first, then ask me again.",
    },
    {
      key: "refs",
      required: true,
      kind: "node-handles",
      noneOk: true,
      ask:
        "Any reference images to attach? Mention File or Draw nodes like @FILE-08F1, " +
        'select them and say @selected — or say "none".',
    },
  ],
  steps: [
    {
      actor: "copilot",
      label: "Add the prompt node",
      run: (ctx) => {
        const shotHandle = first(ctx.slots.shot);
        const shot = ctx.resolve(shotHandle);
        if (!shot) throw new Error(`I can't find ${shotHandle} anymore.`);
        const id = ctx.recipes.createNode("prompt", {
          x: shot.position.x + STAGE_X,
          y: shot.position.y,
        });
        ctx.remember("promptNodeId", id);
        return `Added prompt node ${nodeHandle({ id, type: "prompt" })}`;
      },
    },
    {
      actor: "copilot",
      label: "Connect the shot and references",
      run: (ctx) => {
        const promptHandle = nodeHandle({ id: ctx.created.promptNodeId, type: "prompt" });
        const sources = [first(ctx.slots.shot), ...many(ctx.slots.refs)];
        const plan = ctx.recipes.connect(sources, promptHandle);
        if (plan.wired.length === 0)
          throw new Error(`I couldn't connect anything to ${promptHandle}.`);
        return `Connected ${plan.wired.join(", ")} → ${promptHandle}`;
      },
    },
    {
      actor: "copilot",
      label: "Open the prompt editor",
      run: (ctx) => {
        ctx.recipes.open(ctx.created.promptNodeId);
        return "Opened the prompt editor";
      },
    },
    {
      actor: "human",
      label: "Prompt generated",
      instruction:
        "YOUR TURN — write the instruction in the prompt editor and hit Generate. " +
        "I'll continue when the prompt is ready.",
      done: (snap, run) => hasOutput(snap.nodes.find((n) => n.id === run.created.promptNodeId)),
      watchId: (run) => run.created.promptNodeId,
    },
    {
      actor: "copilot",
      label: "Create the image node",
      run: (ctx) => {
        const prompt = ctx.node(ctx.created.promptNodeId);
        if (!prompt) throw new Error("The prompt node disappeared mid-run.");
        const id = ctx.recipes.createNode("image-gen", {
          x: prompt.position.x + STAGE_X,
          y: prompt.position.y,
        });
        ctx.remember("imageNodeId", id);
        const imgHandle = nodeHandle({ id, type: "image-gen" });
        const promptHandle = nodeHandle({ id: prompt.id, type: "prompt" });
        const plan = ctx.recipes.connect([promptHandle, ...many(ctx.slots.refs)], imgHandle);
        ctx.recipes.open(id);
        return `Created image node ${imgHandle} and wired ${plan.wired.join(", ")}`;
      },
    },
    {
      actor: "human",
      label: "Image generated",
      instruction:
        "YOUR TURN — review the prompt and hit Generate when you're ready. " +
        "Generation costs money, so this step is yours.",
      done: (snap, run) => hasOutput(snap.nodes.find((n) => n.id === run.created.imageNodeId)),
      watchId: (run) => run.created.imageNodeId,
    },
  ],
};

// The registry the router + runner share. More playbooks are DATA additions here —
// no router/frame/runner changes (spec §2.1).
export const PLAYBOOKS: Record<string, Playbook> = {
  [imageForShot.name]: imageForShot,
};

export const PLAYBOOK_NAMES = Object.keys(PLAYBOOKS);
