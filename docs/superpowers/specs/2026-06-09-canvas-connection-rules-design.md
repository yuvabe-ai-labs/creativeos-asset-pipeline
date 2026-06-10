# Canvas — connection rules

**Date:** 2026-06-09
**Status:** Implemented
**Area:** Canvas → node connections

## Problem

The canvas had no connection validation. `onConnect` called `addEdge()` unconditionally — any handle could connect to any other. The File node also incorrectly rendered a target (incoming) handle, even though File nodes are upstream-only input nodes (PRD §7). There was no visual feedback to indicate which connections are legal.

## Goals

- Enforce PRD §10 connection rules: only allowed source → target type pairs can be wired.
- Silent failure — invalid drops are ignored; no toast or error.
- Visual grayout — while dragging a connection, nodes that are not valid targets dim to 30% opacity.
- The source node never dims itself during a drag.
- File node is source-only (no incoming handle).
- Future node types (`prompt`, `image-gen`, `video-gen`) are pre-registered so their connections work automatically when built.

## Non-goals

- No edge labels or type-specific connection styles.
- No enforcement of `fileKind` (image vs text) at connection time — the File node's target decides how to use the input.

## Design

### A. Rule map

Defined in `src/lib/canvas-nodes.ts` as `VALID_CONNECTIONS`:

| Source | Valid targets |
|---|---|
| `kb` | `script` |
| `script` | `prompt` |
| `file` | `prompt`, `image-gen` |
| `prompt` | `prompt`, `image-gen`, `video-gen` |
| `image-gen` | `prompt`, `video-gen` |
| `video-gen` | *(archive — not a node)* |

### B. Silent failure — `isValidConnection`

`src/components/canvas/canvas.tsx` passes an `isValidConnection` callback to `<ReactFlow>`. React Flow calls this for both the visual drag indicator (green/red) and the final connection guard — invalid connections are never created.

```typescript
const isValidConnection = useCallback(
  (connection: Connection | Edge) => {
    const source = nodes.find((n) => n.id === connection.source);
    const target = nodes.find((n) => n.id === connection.target);
    if (!source || !target) return false;
    return (VALID_CONNECTIONS[source.type ?? ""] ?? []).includes(target.type ?? "");
  },
  [nodes],
);
```

### C. Visual grayout

`src/components/nodes/use-node-connection-state.ts` — a shared hook used by every node component. Uses React Flow's `useConnection()` to detect an active drag and return one of four states:

| State | Meaning |
|---|---|
| `"idle"` | No drag in progress |
| `"source"` | This node is the drag origin |
| `"valid"` | This node is a valid target for the active drag |
| `"invalid"` | Not a valid target — apply `opacity-60 pointer-events-none` |

Applied in `file-node.tsx`, `script-node.tsx`, and `kb-node.tsx` via a `cn()` conditional on the wrapper `<div>`.

### D. File node handle fix

The `type="target"` Handle was removed from `file-node.tsx`. File nodes are source-only (same pattern as KB node). Nothing can connect into a File node.

## Testing

- Drag KB → Script: Script stays bright, edge created ✓
- Drag KB → File: File dims, drop ignored ✓  
- Drag File → any node (no valid targets today): all nodes dim, drop ignored ✓
- Auto-wire on "Add script node" still creates KB → Script edge (programmatic `connectNodes` bypasses the UI guard) ✓
- `npx tsc --noEmit` — zero new errors ✓
