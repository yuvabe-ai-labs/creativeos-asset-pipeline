import type { XYPosition } from "@xyflow/react";
import type { AppNode } from "@/lib/canvas-nodes";
import { nodeHandle, nodeLabel } from "@/lib/nodes/describe-node";

// The action the copilot's `/api/copilot/actions` call may return — a DECISION the
// model made, NOT the work itself. Each variant is one tool the model could call;
// code (not the model) owns the recipe that running each decision executes.
//
// - add_node          → "drop a bare node of this type" (Lesson 5)
// - create_script_node → "turn the reel script the user pasted into a Script node"
// - parse_script       → "extract an existing Script node into shots"
// - open_node          → "open a node's editor/focus view (for a Shot, its Composer)"
export type CopilotAction =
  | { name: "add_node"; args: { type: string; title?: string } }
  | { name: "create_script_node"; args: { title?: string } }
  | { name: "parse_script"; args: { handle?: string } }
  | { name: "open_node"; args: { handle: string } };

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

// Resolve any node the copilot named by handle (e.g. SHOT-1A2B) → the node, else null. Unlike
// resolveScriptTarget there is no "most recent" fallback — opening a node needs an explicit target.
export function resolveNodeTarget(nodes: AppNode[], handle: string): AppNode | null {
  const want = handle.trim().toUpperCase();
  return nodes.find((n) => nodeHandle({ id: n.id, type: n.type }).toUpperCase() === want) ?? null;
}

// The copilot's confirmation after creating a Script node. It MUST include the node's
// handle: on a follow-up "yes", the model reads this message from the conversation and
// passes that handle to parse_script — so the parse targets THIS node, not a stale one.
export function scriptCreatedMessage(handle: string, title?: string): string {
  return title
    ? `Created a Script node ${handle} — “${title}”. Want me to parse it into shots?`
    : `Created a Script node ${handle}. Want me to parse it into shots?`;
}

// "@selected" sugar: translate the current canvas selection into the same visible
// "@HANDLE name" tokens the @-mention picker inserts, so resolveMentions handles them
// unchanged. Trailing space so the caret continues cleanly; "" when nothing is selected.
export function expandSelected(nodes: AppNode[]): string {
  const tokens = nodes
    .filter((n) => n.selected)
    .map((n) => {
      const { name, handle } = nodeLabel(n);
      return `@${handle} ${name}`;
    });
  return tokens.length ? `${tokens.join(" ")} ` : "";
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
