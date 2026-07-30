import type { AppNode } from "@/lib/canvas-nodes";
import { nodeHandle, resolveMentions } from "@/lib/nodes/describe-node";
import type { CanvasSnapshot, Playbook, PlaybookStep, SlotSpec, SlotValue } from "./playbooks";

// The pure half of the playbook runner (spec §2.3, §5): frame completeness,
// slot inference, elicitation-reply resolution, and the advance decision — all
// functions of their inputs, unit-tested, no store/fetch/React anywhere.

// The checkpoint (P5): a small object in the canvas store. "Pause" is the cursor
// (stepIndex) not advancing; "resume" is a subscription firing.
export type PlaybookRun = {
  playbook: string;
  title: string; // card header, e.g. "Image for SHOT-557C"
  slots: Record<string, SlotValue>;
  created: Record<string, string>; // ids the run created ("promptNodeId", …)
  stepIndex: number;
  status: "eliciting" | "running" | "waiting-human" | "done" | "cancelled";
  askingSlot?: string; // slot key currently being elicited
  reasked?: boolean; // the one re-ask-with-format-hint already happened (spec §4)
  log: string[]; // past-tense "✓" lines for completed steps (with handles)
};

// Frame completeness is checked by CODE, not the model (spec §2.2). An empty
// array counts as filled — "none" was a real answer, not a missing one.
export function missingSlots(
  playbook: Playbook,
  slots: Record<string, SlotValue>,
): SlotSpec[] {
  return playbook.slots.filter((s) => s.required && slots[s.key] === undefined);
}

// Ask-when-Needed: fill what the canvas makes unambiguous; never override a
// value the user/model already provided.
export function applyInference(
  playbook: Playbook,
  slots: Record<string, SlotValue>,
  snap: CanvasSnapshot,
): Record<string, SlotValue> {
  const out = { ...slots };
  for (const spec of playbook.slots) {
    if (out[spec.key] === undefined && spec.infer) {
      const v = spec.infer(snap);
      if (v !== null) out[spec.key] = v;
    }
  }
  return out;
}

const NONE_RE = /^\s*(none|skip|nothing)\s*[.!]?\s*$/i;

// Client-first elicitation resolution (spec §2.2): @-mentions and "none" fill the
// slot with ZERO model calls; anything else defers to the actions-route fallback.
export function resolveSlotReply(
  text: string,
  slot: SlotSpec,
  nodes: AppNode[],
): { kind: "filled"; value: SlotValue } | { kind: "model" } {
  if (slot.noneOk && NONE_RE.test(text)) {
    return { kind: "filled", value: slot.kind === "node-handles" ? [] : "" };
  }
  const ids = resolveMentions(text, nodes);
  if (ids.length > 0) {
    const handles = ids.map((id) => nodeHandle(nodes.find((x) => x.id === id)!));
    return { kind: "filled", value: slot.kind === "node-handles" ? handles : handles[0] };
  }
  return { kind: "model" };
}

export type RunnerAction =
  | { kind: "run-step"; step: Extract<PlaybookStep, { actor: "copilot" }> }
  | { kind: "wait-human"; step: Extract<PlaybookStep, { actor: "human" }> }
  | { kind: "done" };

// The advance decision — what the cursor position means. The loop that ACTS on
// this (recipes, store writes) lives in use-playbook-runner.ts; this stays pure.
export function nextAction(playbook: Playbook, run: PlaybookRun): RunnerAction {
  const step = playbook.steps[run.stepIndex];
  if (!step) return { kind: "done" };
  return step.actor === "copilot"
    ? { kind: "run-step", step }
    : { kind: "wait-human", step };
}

// Defensive parse of model-written slot args (mirrors the route's arg guarding):
// keep non-empty trimmed strings and string arrays, drop everything else.
export function normalizeSlots(raw: unknown): Record<string, SlotValue> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, SlotValue> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") {
      if (v.trim()) out[k] = v.trim();
    } else if (Array.isArray(v)) {
      const arr = v
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .map((x) => x.trim());
      if (arr.length) out[k] = arr;
    }
  }
  return out;
}
