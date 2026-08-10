// Pure read-side interpretation of impersonation_audit_log (D141). No DB, no React, so
// it is unit-testable under this repo's node-environment vitest setup.
//
// `detail` has exactly two shapes in the wild:
//   { action: "deleteCanvasAction" }        — from withAction (server actions)
//   { method: "POST", path: "/api/..." }    — from assertImpersonationWriteAllowed (routes)

export type WriteClassification =
  | { kind: "quiet" }
  | { kind: "generate"; nodeId: string }
  | { kind: "action"; label: string };

// High-frequency plumbing that carries no operator intent. Counted, never listed —
// suppressing this is the entire reason the view is legible.
const QUIET_ACTIONS = new Set(["saveCanvasAction", "saveCanvasNodesAction"]);

const QUIET_PATH_SUFFIXES = ["/sign", "/cost", "/compile-preview", "/upstream-images"];

const ACTION_LABELS: Record<string, string> = {
  createCanvasAction: "Created a canvas",
  deleteCanvasAction: "Deleted a canvas",
  renameCanvasAction: "Renamed a canvas",
  createClientAction: "Created a client",
  deleteKBDocumentAction: "Deleted a knowledge-base document",
  deleteBrandImageAction: "Deleted a brand image",
  patchKBFieldAction: "Edited the knowledge base",
  saveKBOutputAction: "Edited the knowledge base",
  startKBBuildJob: "Started a knowledge-base build",
  markKBReadyAction: "Completed a knowledge-base build",
  savePromptOutputAction: "Edited a prompt's output",
  saveScriptOutputAction: "Edited a script's output",
  setVersionApprovalAction: "Changed a version's approval",
  setVersionLabelAction: "Labelled a version",
  markStuckJobFailed: "Marked a stuck job failed",
};

// The node uuid in the path is what makes exact correlation with generations.node_id
// possible — no timestamp fuzzing (spec §4.1).
const GENERATE_PATH =
  /\/api\/nodes\/([0-9a-fA-F-]{36})\/(generate|image-generate|video-generate|video-prompt|compose)$/;

// Ordered specific → general; first match wins.
const PATH_LABELS: Array<[RegExp, string]> = [
  [/\/finalize$/, "Uploaded a file"],
  [/\/kb\/re-(analyze|extract)$/, "Re-ran knowledge-base extraction"],
  [/\/restore-version$/, "Restored a version"],
  [/\/duplicate(-batch)?$/, "Duplicated a node"],
  [/\/parse$/, "Parsed a document"],
  [/\/file\/drive$/, "Imported a file from Drive"],
  [/\/file\/from-url$/, "Imported a file from a URL"],
  [/\/versions$/, "Created a version"],
  [/\/website-url$/, "Set the client's website"],
  [/\/drive-folder$/, "Linked a Drive folder"],
];

function resourceNoun(path: string): string {
  if (path.includes("/moodboards")) return "a moodboard item";
  if (path.includes("/brand-kit/assets")) return "a brand asset";
  if (path.includes("/kb/documents")) return "a knowledge-base document";
  if (path.includes("/kb/images")) return "a knowledge-base image";
  if (path.includes("/nodes/")) return "a node";
  if (path.includes("/clients/")) return "a client";
  return "a resource";
}

export function classifyWriteAction(
  detail: Record<string, unknown> | null,
): WriteClassification {
  const action = typeof detail?.action === "string" ? detail.action : null;
  if (action) {
    if (QUIET_ACTIONS.has(action)) return { kind: "quiet" };
    // An unmapped action still shows, using its own name — never silently dropped.
    return { kind: "action", label: ACTION_LABELS[action] ?? action };
  }

  const path = typeof detail?.path === "string" ? detail.path : null;
  const method = typeof detail?.method === "string" ? detail.method : null;
  if (!path || !method) return { kind: "action", label: "Unknown action" };

  const generate = GENERATE_PATH.exec(path);
  if (generate) return { kind: "generate", nodeId: generate[1] };

  if (QUIET_PATH_SUFFIXES.some((s) => path.endsWith(s))) return { kind: "quiet" };

  if (method.toUpperCase() === "DELETE") {
    return { kind: "action", label: `Deleted ${resourceNoun(path)}` };
  }

  for (const [pattern, label] of PATH_LABELS) {
    if (pattern.test(path)) return { kind: "action", label };
  }

  // The audit guarantee: anything unmapped is still visible, verbatim.
  return { kind: "action", label: `${method} ${path}` };
}
