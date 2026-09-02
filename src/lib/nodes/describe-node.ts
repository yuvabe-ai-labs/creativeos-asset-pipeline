// A short, human-identifying label for a node — derived from whatever content it
// ALREADY has, so we don't force every node to carry a `title`.
//
// This is the "representation layer" for grounding: how we describe a domain
// object to the model. It mirrors how a node's card labels itself for the user —
// same question, one answer.
//
// Takes a structural { type, data } so it works with both DB rows (NodeRow) and
// canvas nodes (AppNode).
export function describeNode(node: { type?: string; data: Record<string, unknown> }): string {
  const d = node.data ?? {};
  const title = str(d.title);
  if (title) return title; // a user-typed title always wins

  switch (node.type) {
    case "text":
      return snippet(d.text) || "empty text note";
    case "shot":
      return (
        snippet(shotDescription(d.script)) ||
        (typeof d.order === "number" ? `shot ${d.order}` : "shot")
      );
    case "multishot":
      // D209 — a Multishot node's identity: one generation with the cuts inside it. Unlike a
      // Shot, which promotes its own visual description, there is no single cut to surface here
      // (`cuts` is a whole ladder), so the label stays generic like image-gen/video-gen below.
      return typeof d.order === "number" ? `multishot ${d.order}` : "multishot";
    case "file":
      return str(d.filename) || "untitled file";
    case "draw":
      return "sketch";
    case "kb":
      return str(d.brandName) ? `brand KB — ${str(d.brandName)}` : "brand KB";
    case "script": {
      // a Script node's identity: its parsed reel-script title, else the raw source.
      const parsedTitle = str((d.parsed as { title?: string } | undefined)?.title);
      return parsedTitle || snippet(d.source) || "untitled script";
    }
    case "prompt":
      // a Prompt node's identity: the operator instruction, else the generated text.
      return snippet(d.instruction) || snippet(d.parsed) || "untitled prompt";
    case "image-gen":
      return "image generation";
    case "video-prompt":
      return "motion prompt";
    case "video-gen":
      return "video generation";
    default:
      return node.type ?? "node";
  }
}

// ── Ref handles ───────────────────────────────────────────────────────────────
// A node's THIRD identity (alongside the uuid it's stored under and the optional
// title): a short, stable, human-visible handle like "PRM-A3F9". It lets a human —
// and the copilot — refer to a specific node ("wire it to SHOT-7C2B") even when the
// node is untitled. Derived purely from the immutable uuid, so it never re-points.
const NODE_ABBREV: Record<string, string> = {
  script: "SCR",
  kb: "KB",
  file: "FILE",
  text: "TXT",
  prompt: "PRM",
  shot: "SHOT",
  multishot: "MSHOT",
  draw: "DRAW",
  "image-gen": "IMG",
  "video-prompt": "MPR",
  "video-gen": "VID",
};

export function nodeHandle(node: { id: string; type?: string }): string {
  const abbrev = (node.type && NODE_ABBREV[node.type]) || "NODE";
  return `${abbrev}-${node.id.slice(0, 4).toUpperCase()}`;
}

// The pair a UI needs to show a referenceable node: its friendly name (may collide
// for untitled twins) plus its handle (never collides). Consumers compose the two.
export function nodeLabel(node: {
  id: string;
  type?: string;
  data: Record<string, unknown>;
}): { name: string; handle: string } {
  return { name: describeNode(node), handle: nodeHandle(node) };
}

// Parse "@HANDLE" tokens out of a human's message and resolve them to node ids. This is
// the server-bound half of @-mention: the human named exact nodes, we turn those names
// back into real ids so the copilot can be grounded on precisely them (no LLM guessing).
export function resolveMentions(
  text: string,
  nodes: { id: string; type?: string }[],
): string[] {
  const tokens = new Set(
    (text.match(/@[\w-]+/g) ?? []).map((t) => t.slice(1).toUpperCase()),
  );
  if (tokens.size === 0) return [];
  return nodes.filter((n) => tokens.has(nodeHandle(n).toUpperCase())).map((n) => n.id);
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function snippet(v: unknown, max = 60): string {
  const s = str(v);
  return s.length > max ? `${s.slice(0, max).trimEnd()}…` : s;
}

// A shot node carries the parent script narrowed to one shot; its identity is
// that shot's visual description.
function shotDescription(script: unknown): string {
  const shots = (
    script as { visual_script?: { shots?: Array<{ description?: string }> } } | undefined
  )?.visual_script?.shots;
  return str(shots?.[0]?.description);
}
