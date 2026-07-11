import type { XYPosition } from "@xyflow/react";
import type { AppNode } from "@/lib/canvas-nodes";
import { nodeHandle } from "@/lib/nodes/describe-node";

// The action the copilot's `/api/copilot/actions` call may return — a DECISION the
// model made, NOT the work itself. Each variant is one tool the model could call;
// code (not the model) owns the recipe that running each decision executes.
//
// - add_node          → "drop a bare node of this type" (Lesson 5)
// - create_script_node → "turn the reel script the user pasted into a Script node"
export type CopilotAction =
  | { name: "add_node"; args: { type: string; title?: string } }
  | { name: "create_script_node"; args: { title?: string } }
  | { name: "parse_script"; args: { handle?: string } };

// Where a copilot-created node lands: just right of the rightmost node (same row),
// or a sensible spot on an empty canvas. Pure + deterministic — the caller can pan
// to this exact point without waiting for React Flow to re-measure the new node.
export function placeNewNode(nodes: AppNode[]): XYPosition {
  if (nodes.length === 0) return { x: 240, y: 200 };
  const rightmost = nodes.reduce((a, b) => (b.position.x > a.position.x ? b : a));
  return { x: rightmost.position.x + 360, y: rightmost.position.y };
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

// The conversation window sent to the model: prior turns + the new user message, as plain
// {role, content} pairs. Drops empty-content turns (e.g. the streaming placeholder) and any
// UI-only fields a panel message carries. The MODEL — not client code — interprets "yes".
export function buildHistory(
  prior: ReadonlyArray<{ role: "user" | "assistant"; content: string }>,
  text: string,
): ChatTurn[] {
  const turns = prior
    .filter((m) => m.content.trim().length > 0)
    .map((m) => ({ role: m.role, content: m.content }));
  return [...turns, { role: "user", content: text }];
}

// Pick the Script node a parse_script action targets: the one whose handle the model named,
// else the most-recently-added Script node on the canvas, else null.
export function resolveScriptTarget(nodes: AppNode[], handle?: string): AppNode | null {
  const scripts = nodes.filter((n) => n.type === "script");
  if (handle) {
    const want = handle.trim().toUpperCase();
    const byHandle = scripts.find(
      (n) => nodeHandle({ id: n.id, type: n.type }).toUpperCase() === want,
    );
    if (byHandle) return byHandle;
  }
  return scripts.length > 0 ? scripts[scripts.length - 1] : null;
}

// Derive a readable node title from an uploaded file's name: drop the extension, turn
// dashes/underscores into spaces, and title-case each word ("prakriti-reel.md" → "Prakriti Reel").
export function fileNameToTitle(name: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  return base
    .replace(/[-_]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
