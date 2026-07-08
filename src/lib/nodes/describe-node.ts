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
      return "video prompt";
    case "video-gen":
      return "video generation";
    default:
      return node.type ?? "node";
  }
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
