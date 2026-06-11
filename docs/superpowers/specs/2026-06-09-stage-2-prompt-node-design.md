# Stage 2a — Prompt node + functional edges (design)

**Date:** 2026-06-09
**Status:** Draft for review
**Parent:** `2026-05-30-creativeos-staging-roadmap.md` (Stage 2; ADRs D3, D6, D8, D9, D11, D18, D19)
**Architecture:** `2026-05-30-creativeos-architecture.md` (the spine — node lifecycle, version envelope, schema)

---

## 1. Context

Stage 1 shipped the Script node + Client KB on the reusable spine (`resolveInputs → compile →
runAction → writeVersion → setActive`). Stage 2 is the **connections & context-engineering**
stage: the first time nodes *connect* and one node consumes another's output.

The roadmap's Stage 2 is "Text + File + edges + Prompt node" — a large surface. This spec
covers **Stage 2a: the core composition loop** — functional edges, a Text node, and the
Prompt node — deferring the **File node** and **inline file attachments** to a later Stage 2b.

**Ships:** a designer wires Script / Text / (ambient) Client KB into a **Prompt node**, sees
the **final compiled prompt**, and generates an image-generation prompt — the first multi-node
pipeline. End to end: `Script/Text + KB → Prompt → generated image prompt`.

The spine is already built and reused unchanged: `insertVersion` / `setActiveVersion` /
`updateActiveVersionOutput` ([src/lib/db/versions.ts](../../../src/lib/db/versions.ts)), the
parse route as the `runAction` template ([src/app/api/nodes/[id]/parse/route.ts](../../../src/app/api/nodes/[id]/parse/route.ts)),
the `edges` table + `listEdges`/`saveCanvasEdges` + autosave
([src/lib/db/edges.ts](../../../src/lib/db/edges.ts), [src/components/canvas/canvas-autosave.tsx](../../../src/components/canvas/canvas-autosave.tsx)).
Edges already **persist**; Stage 2a adds edge **validation** and **resolution**.

---

## 2. Scope

**In (Stage 2a):**
- Edges become functional: cycle check on connect; defined source/target handles.
- `getNodeOutput` — pure selector turning any node's output into text.
- `resolveInputs` — shared resolver (ambient KB + upstream edge outputs) for the Prompt.
- **Text node** — typed text held in `node.data`, no AI, exposes its text as upstream output.
- **Prompt node** — `compilePrompt` (pure) + generate route + a focus view (EMPTY → SKELETON →
  RESULT) showing resolved inputs, the compiled prompt, the instruction, Generate, and an
  editable output.
- **Node palette** — a "+" menu to add Script / Text / Prompt (replaces the hardcoded button).

**Out (deferred, with where):**
- **File node** + **inline file attachments** on the Prompt → Stage 2b.
- **Stale-downstream badge** → Stage 3 (we *record* consumed upstream version ids now, per D9).
- **History / restore / compare UI** → later (the log already exists; `listVersions` is unused).
- The KB stays **ambient** (a per-node toggle, like Script's `kbSlices`) — **no KB→node edge
  drives resolution** (D6). Existing decorative KB edges are left untouched.

---

## 3. Architecture decision — node output resolution

A Prompt consumes upstream nodes' outputs **as text**. But output lives in two different
places depending on node kind (D19): a **Text** node is human-authored content on the node
(`node.data`, no version log); a **Script/Prompt** node's output is a **model** result in the
active version (`node_versions.output`).

**Chosen (Approach A): a single pure selector `getNodeOutput`.**

```ts
// src/lib/nodes/node-output.ts  (pure, unit-tested)
type NodeOutputInput = {
  type: string;                 // 'script' | 'text' | 'prompt' | …
  data: Record<string, unknown>;
  activeOutput: unknown | null; // the active version's output, or null
};

// Normalize any node's current output to plain text for downstream context.
export function getNodeOutput(node: NodeOutputInput): string {
  switch (node.type) {
    case "text":   return String(node.data.text ?? "");
    case "script": return renderScriptAsText(node.activeOutput); // ReelScript → readable text
    case "prompt": return String(node.activeOutput ?? "");
    default:       return typeof node.activeOutput === "string"
                     ? node.activeOutput
                     : JSON.stringify(node.activeOutput ?? "");
  }
}
```

Rejected: **B** (Text writes a version on save) — violates D18 (versions = LLM attempts), adds
noise; **C** (branch inline in `resolveInputs`) — scatters per-type logic, untestable in
isolation. A keeps the type logic in one pure place and honors D19's "human content on the
node, model output in the log."

---

## 4. Units

### 4.1 Functional edges

- **Handles (convention).** Prompt: **target** handle on the left (`in`) + source on the right
  (`out`, for chaining to Image Gen in Stage 3). Text / Script: source on the right (`out`).
  KB: unchanged (ambient).
- **Cycle check (D11) — the only graph algorithm.** A pure helper:

  ```ts
  // src/lib/canvas/graph.ts  (pure, unit-tested)
  export function wouldCreateCycle(edges: Edge[], source: string, target: string): boolean {
    // walk upstream from `source` via edges; if `target` is reachable, adding
    // source→target would close a cycle.
  }
  ```

  `onConnect` in [src/lib/canvas-store.ts](../../../src/lib/canvas-store.ts) calls it before
  `addEdge`; on cycle, skip the edge and `toast.error("That connection would create a loop")`.
- **Persistence/resolution split.** Storage is done (autosave). Resolution is §4.3.

### 4.2 Text node

- `TextNodeData = { text?: string }` in [src/lib/canvas-nodes.ts](../../../src/lib/canvas-nodes.ts).
- Component [src/components/nodes/text-node.tsx](../../../src/components/nodes/text-node.tsx):
  a small card with an inline-editable textarea (reuse the editorial inline-edit affordance)
  writing `node.data.text` via `updateNodeData`; a source handle. No version, no AI.
- Its output is read by `getNodeOutput` straight from `data.text` — so a Text node is usable as
  upstream context the instant it's typed.

### 4.3 `resolveInputs` (shared, server)

Server-side resolver for the Prompt's `runAction`, mirroring `getNodeActiveKB`'s style:

```ts
// src/lib/nodes/resolve-inputs.ts
export async function resolvePromptInputs(nodeId): Promise<{
  clientContext: string;                                  // ambient KB (reuse buildParseContext)
  upstream: { nodeId: string; versionId: string | null; label: string; text: string }[];
}>
```

- **Ambient KB:** reuse `getNodeActiveKB(nodeId)` + `buildParseContext(kb, slices)` with the
  Prompt node's `data.kbSlices` (same mechanism as Script).
- **Upstream:** a DB helper `getUpstreamOutputs(nodeId)` ([src/lib/db/nodes.ts](../../../src/lib/db/nodes.ts))
  loads edges where `target = nodeId`, then each source node's `{type, data, active.output}` via
  one join; each is normalized through `getNodeOutput`. Records `versionId` (the source's
  `active_version_id`) per upstream — written into `inputs_used` for D9.

### 4.4 Prompt node

- `PromptNodeData = { title?: string; instruction?: string; kbSlices?: KBSliceKey[] }`.
- **`compilePrompt` (pure, unit-tested)** — [src/lib/nodes/prompt.ts](../../../src/lib/nodes/prompt.ts):

  ```ts
  export function compilePrompt(input: {
    clientContext: string;
    upstream: { label: string; text: string }[];
    instruction: string;
  }): { system: string; user: string }
  ```

  Assembles a system message ("You write image-generation prompts…") and a `user` message
  with labeled context blocks (KB, each upstream node) + the operator instruction. The `user`
  string **is** the visible "final compiled prompt."
- **Generate route** `POST /api/nodes/[id]/generate` — mirrors the parse route exactly:
  `resolvePromptInputs → compilePrompt → LLM (freeform text) → insertVersion → setActiveVersion`;
  a failed attempt still logs a version. `inputs_used = { upstream: [{nodeId, versionId}], kbVersionId, kbSlices }`,
  `params_used = { instruction, promptId, promptVersion }`, `output = generatedPromptText`.
- **Prompt focus view** [src/components/nodes/prompt-focus-view.tsx](../../../src/components/nodes/prompt-focus-view.tsx) —
  a bottom Sheet mirroring `ScriptFocusView`, a three-state machine:
  - **EMPTY** (no active output): an *Inputs* panel (KB slice toggles + the list of connected
    upstream nodes with a short preview) + the editable instruction + **Generate**.
  - **SKELETON** (generating): a skeleton like `ScriptSkeleton`/`KBSkeleton`.
  - **RESULT**: the generated prompt (editable), **Save** (folds into the active version's
    output, D19), **Re-generate** (confirm if the edited output is dirty), and a collapsible
    **"Final compiled prompt"** showing the exact compiled `user` message.
  The inline node card shows a read-only preview of the active output + an Expand trigger
  (same pattern as the Script node).

### 4.5 Node palette

Replace the hardcoded "Add script node" button ([src/components/canvas/canvas.tsx](../../../src/components/canvas/canvas.tsx))
with a "+" Popover listing **Script / Text / Prompt**; each calls `addNode(type, position, id)`.
Extend `defaultData` ([src/lib/canvas-store.ts](../../../src/lib/canvas-store.ts)) and the
`nodeTypes` registry with `text` and `prompt`. (The KB auto-wire behavior is unchanged.)

---

## 5. Data-model notes

- No schema change: `text`/`prompt` are new `nodes.type` values; their content lives in
  `nodes.data` (D10 narrow waist). Prompt output lives in `node_versions.output` (D19).
- `nodeRowToFlow` already hydrates the active version's `output` into `data.parsed` for display
  generically — the Prompt's generated text rides that same path (display only; the server's
  `resolveInputs` reads the *real* active output, never `data.parsed`).
- `AppNode` union gains `Node<TextNodeData,"text">` and `Node<PromptNodeData,"prompt">`.

---

## 6. Testing

Pure functions get Vitest unit tests (Stage 1's approach):
- `wouldCreateCycle` — linear chains, diamonds, the self-loop, the closing edge.
- `getNodeOutput` — text node, script node (ReelScript → text), prompt node, empty/null.
- `compilePrompt` — block assembly, empty KB / no upstream / empty instruction.
Routes (`generate`), `resolveInputs`, and components: `tsc --noEmit` + `npm run lint` + manual
(`npm run dev`): add Text → type; add Prompt → connect Script + Text; toggle KB; Generate →
output lands; edit + Save persists; Re-generate; verify the cycle check blocks a loop.

---

## 7. Open follow-ups (not blocking)

- `renderScriptAsText` shape — a readable flattening of `ReelScript` vs raw JSON (pick readable;
  finalize in the plan).
- Whether Stage 2b's File node reuses the Prompt focus view's Inputs panel.
- The decorative KB→Script edge: leave as-is now; revisit if it confuses "functional vs ambient."
