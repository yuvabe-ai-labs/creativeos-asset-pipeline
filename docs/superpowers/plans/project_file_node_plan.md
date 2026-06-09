# File Node — Connection Rules Plan

> **Previous work:** File Node core implementation is complete (upload, preview, replace, remove, autosave). This plan covers enforcing PRD §10 connection rules with silent failure + visual grayout of invalid targets.

---

## Context

The canvas currently has **no connection validation** — any handle can connect to any other. `onConnect` calls `addEdge()` unconditionally, and there is no `isValidConnection` prop on ReactFlow.

Additionally, `file-node.tsx` incorrectly renders **both** a target (left) and source (right) handle. Per PRD §7, File nodes are input/upstream nodes — they should never receive connections. KB node already follows this pattern (source-only).

Connection rules come directly from **PRD §10**.

---

## Connection Rule Map (PRD §10)

| Source type | Valid target types |
|---|---|
| `kb` | `script` |
| `script` | `prompt` |
| `file` | `prompt`, `image-gen` |
| `prompt` | `prompt`, `image-gen`, `video-gen` |
| `image-gen` | `prompt`, `video-gen` |
| `video-gen` | *(archive — not a node)* |

Future node types (`prompt`, `image-gen`, `video-gen`) are included now so connections work automatically when those nodes are built.

---

## Behaviour

- **Silent failure** — invalid connections are simply not created, no toasts or error indicators
- **Visual grayout** — while dragging a connection, nodes that are **not valid targets** dim to `opacity-30` with `pointer-events-none`; valid targets remain fully opaque (or get a subtle ring on hover)
- The source node never dims itself during a drag

---

## Implementation

### 1. `VALID_CONNECTIONS` — `src/lib/canvas-nodes.ts`

Single source of truth for which source node type can connect to which target types.

```typescript
export const VALID_CONNECTIONS: Record<string, readonly string[]> = {
  kb:          ["script"],
  script:      ["prompt"],
  file:        ["prompt", "image-gen"],
  prompt:      ["prompt", "image-gen", "video-gen"],
  "image-gen": ["prompt", "video-gen"],
  "video-gen": [],
} as const;
```

---

### 2. `useNodeConnectionState` hook — `src/components/nodes/use-node-connection-state.ts`

Uses React Flow's built-in `useConnection()` hook. Returns one of four states per node.

```typescript
import { useConnection } from "@xyflow/react";
import { VALID_CONNECTIONS } from "@/lib/canvas-nodes";

type ConnectionState = "idle" | "source" | "valid" | "invalid";

export function useNodeConnectionState(
  nodeId: string,
  nodeType: string,
): ConnectionState {
  const connection = useConnection();
  if (!connection.inProgress) return "idle";
  if (connection.fromNode?.id === nodeId) return "source"; // this node is the drag origin
  const validTargets = VALID_CONNECTIONS[connection.fromNode?.type ?? ""] ?? [];
  return validTargets.includes(nodeType) ? "valid" : "invalid";
}
```

---

### 3. Apply hook in each node — `file-node.tsx`, `script-node.tsx`, `kb-node.tsx`

Add to the outer wrapper `className`:

```tsx
const connState = useNodeConnectionState(id, "file"); // or "script" / "kb"

<div
  className={cn(
    "w-44 rounded-lg border border-border bg-card shadow-card",
    "transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
    "hover:-translate-y-0.5 hover:scale-[1.006]",
    selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
    connState === "invalid" && "opacity-30 pointer-events-none",
  )}
>
```

Also remove the `type="target"` Handle from `file-node.tsx` (no incoming connections allowed).

---

### 4. `isValidConnection` + silent failure — `src/components/canvas/canvas.tsx`

```tsx
import { useCallback } from "react";
import { type Connection } from "@xyflow/react";
import { VALID_CONNECTIONS } from "@/lib/canvas-nodes";

const isValidConnection = useCallback(
  (connection: Connection) => {
    const source = nodes.find((n) => n.id === connection.source);
    const target = nodes.find((n) => n.id === connection.target);
    if (!source || !target) return false;
    return (VALID_CONNECTIONS[source.type ?? ""] ?? []).includes(
      target.type ?? "",
    );
  },
  [nodes],
);

// Add to <ReactFlow>:
<ReactFlow
  ...
  isValidConnection={isValidConnection}
>
```

---

## Files to change

| File | Change |
|---|---|
| `src/lib/canvas-nodes.ts` | Add `VALID_CONNECTIONS` export |
| `src/components/nodes/use-node-connection-state.ts` | **New** — shared hook |
| `src/components/nodes/file-node.tsx` | Remove target Handle + use hook |
| `src/components/nodes/script-node.tsx` | Use hook |
| `src/components/nodes/kb-node.tsx` | Use hook |
| `src/components/canvas/canvas.tsx` | Add `isValidConnection` callback + prop |

---

## Verification

1. Drag from KB source → Script target: Script stays bright, edge created ✓
2. Drag from KB source → File target: File dims, no edge created on drop ✓
3. Drag from File source → any existing node (script, kb, file): all dim, no edge created ✓
4. File node has no left-side snap target when hovering a connection drag ✓
5. Auto-wire on "Add script node" still works (programmatic `connectNodes` bypasses UI guard) ✓
6. `npx tsc --noEmit` — zero new errors ✓

---

## Deferred features (unchanged)

### F-A — "Use LLM" toggle + LLM extraction

**Open questions:**
1. Free-text extraction prompt or JSON schema editor?
2. Image extraction model — `gpt-4o-mini` or `gpt-4o`?
3. Output editing UX — key-value editor, raw JSON textarea, or read-only?
4. "Extract" vs "Re-extract" labeling with confirm dialog?
5. Should failed extractions create `node_versions` rows?
6. If "Use LLM" is turned off after versions exist — preserve or warn?

---

### F-B — "Select from client files" picker

**Open questions:**
1. Reuse `client_brand_images` / `client_kb_documents`, or new `client_files` table? **Recommended:** new table.
2. Where is the library managed? Dedicated "Files" tab or only through the picker?
3. File types in the library — same as File node, or include future `.pdf`/`.docx`?
4. Cross-canvas references — broken `fileUrl` if a client file is deleted?
5. Picker UX — thumbnail grid (images) + list (text)? Search/filter?

---

### F-C — `.docx` / `.pdf` support

**Open questions:**
1. Reuse KB document extraction utility or a separate lightweight extractor?
2. PDF preview — extracted text in `<pre>`, first-page thumbnail, or filename only?
3. Include embedded image extraction (PRD §21 F3) in F-C scope or as a separate feature?
4. Per-file size limit — 5 MB or 20 MB?
5. Same `node-files` bucket or a separate `node-docs` bucket?
6. Does F-C depend on F-A (LLM mode)?
