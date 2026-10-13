# Approved script → its canvas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From an approved script, create its canvas in one step (or open the one it already has), land on it with the script on a Script node, and show "Parsing script…" honestly while it parses.

**Architecture:** "Is this Script node parsing?" moves from the node's local state into the canvas store (transient, never saved, like `videoGenStatus`), so whoever runs the parse — the node's own view, the gallery, or the new hand-off — drives one flag the node and its view both read. A canvas remembers the script it came from (`canvases.source_script_id`, one canvas per script); a new server action creates that canvas or returns the existing one. The New canvas dialog gains a `fromScript` mode that goes to `/canvases/<slug>?addScript=<scriptId>`; a headless `<AddScriptFromUrl/>` on the canvas strips the parameter and runs the existing `useAddScriptNode`, filling the canvas's empty seeded Script node when there is one.

**Tech Stack:** Next.js 16 App Router (server actions, `useSearchParams`), Supabase (one migration), zustand canvas store, React Flow, vitest + `renderToStaticMarkup`.

**Spec:** [docs/superpowers/specs/2026-10-12-script-to-canvas-design.md](../specs/2026-10-12-script-to-canvas-design.md) — read it; A1 (deleted canvas → Create canvas again) and A2 (team only) are confirmed.

**Worktree:** `C:\Users\cyril varghese\code\canvas-apps\asset-pipleline\.claude\worktrees\script-to-canvas` (branch `script-to-canvas`, from local `staging`). Run every command there.

## Global Constraints

- Copy, exactly: node and view label **"Parsing script…"**; actions **"Create canvas"** / **"Open canvas"**.
- The script view opened mid-parse shows its skeleton, never the empty upload screen; nothing opens by itself.
- One canvas per approved script; a deleted canvas frees the script to make a new one.
- The script on the canvas is a copy (spec 1 §5.4) — no syncing with later re-approvals.
- Parsing state is transient: never written to `nodes.data` or anywhere saved.
- Only approved scripts; the action is on the team's page only (never `/r/...`).
- shadcn primitives from `src/components/ui/*` only; Lucide icons, 1.5 stroke; purple only for the primary CTA.
- Data reads in client components go through TanStack Query if any are added (none are planned: the page is a server component and passes the canvas in).
- Migration `supabase/migrations/0056_canvas_source_script.sql` is written here but applied to the staging DB by the user (as 0052–0055 were).
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `npx vitest run <path>`; `npx tsc --noEmit`; `npx eslint <paths>`.

## Review Focus

1. **Double submit / two tabs:** two Create clicks (or two people) for one script must still give one canvas — the unique index plus "return the existing one" (Task 3 test).
2. **Arriving with `?addScript` when someone else holds the canvas lock (`canEdit` false):** nothing is added and nothing breaks; the parameter is left until the canvas becomes editable (Task 5 test on the pure decision helper).
3. **A canvas with no KB (no seeded empty Script node):** the script lands as a new node at the viewport centre (Task 5 helper test).
4. **The script view already open when a gallery-started parse begins:** it switches to the skeleton, then to the parsed document, without closing (Task 1 view-mode test).
5. **A failed parse clears the flag** for both failure kinds and a thrown parse, so the node never sticks on "Parsing script…" (Task 2 tests).

## File map

| File | Responsibility | Task |
|---|---|---|
| `src/lib/canvas-store.ts` | `scriptParsing` flags + `setScriptParsing` | 1 |
| `src/lib/nodes/script-view-mode.ts` (new) | pure: which of empty / skeleton / parsed the view shows | 1 |
| `src/components/nodes/script-focus-view.tsx` | reads the store flag; writes it in `runParse` | 1 |
| `src/components/nodes/script-node.tsx` | reads the store flag; "Parsing script…" body + pill | 1 |
| `src/components/nodes/processing-pill.tsx` | optional `label` | 1 |
| `src/components/nodes/script-document-skeleton.tsx` | first-parse label "Parsing script…" | 1 |
| `src/lib/scripts/add-to-canvas.ts` | `setParsing`, `fillScriptNode`, `opts.into` | 2 |
| `src/hooks/use-add-script-node.ts` | wires the two new deps; passes `opts` | 2 |
| `supabase/migrations/0056_canvas_source_script.sql` (new) | `source_script_id` + unique index | 3 |
| `src/lib/db/types.ts`, `src/lib/db/canvases.ts` | `source_script_id`; `createCanvas({sourceScriptId})`; `getScriptCanvas` | 3 |
| `src/lib/actions/canvases.ts` | `seedCanvas` helper; `createCanvasFromScriptAction` | 3 |
| `src/lib/canvases/paths.ts` (new) | `canvasHref(clientSlug, canvasSlug, addScriptId?)` | 4 |
| `src/components/canvases/new-canvas-dialog.tsx` | `fromScript` mode | 4 |
| `src/components/scripts/script-canvas-button.tsx` (new) | Create canvas / Open canvas | 4 |
| `src/components/script-review/team/approved-review-board.tsx`, `review-actions.tsx` | `canvasAction` slot | 4 |
| `src/app/clients/[id]/scripts/[scriptId]/page.tsx` | loads the script's canvas; renders the button | 4 |
| `src/lib/scripts/add-from-url.ts` (new) | pure: `planAddFromUrl(...)` | 5 |
| `src/components/canvas/add-script-from-url.tsx` (new) | headless: reads `?addScript`, strips it, adds | 5 |
| `src/components/canvas/canvas.tsx` | mounts `<AddScriptFromUrl/>` | 5 |
| roadmap §7 | D371–D372 | 6 |

---

### Task 1: One "parsing" flag, shared by the node and its view

**Files:**
- Modify: `src/lib/canvas-store.ts` (type near `videoGenStatus` ~line 79; implementation near ~line 736)
- Create: `src/lib/nodes/script-view-mode.ts`
- Modify: `src/components/nodes/script-focus-view.tsx` (state at ~86, `mode` at ~112, `runParse` at ~143-173, prop `onParsingChange`)
- Modify: `src/components/nodes/script-node.tsx` (~54 local `isParsing`; ~108 pill; ~129 body; ~181 `onParsingChange`)
- Modify: `src/components/nodes/processing-pill.tsx`, `src/components/nodes/script-document-skeleton.tsx`
- Test: `src/lib/canvas-store.test.ts`, `src/lib/nodes/__tests__/script-view-mode.test.ts` (new), `src/components/nodes/__tests__/script-document-skeleton.test.tsx` (new)

**Interfaces:**
- Produces: store `scriptParsing: Record<string, true>`; `setScriptParsing(nodeId: string, parsing: boolean): void` (false deletes the key). `scriptViewMode(i: { parsing: boolean; hasParsed: boolean; replacing: boolean }): "skeleton" | "parsed" | "empty"`. `ProcessingPill({ processing, label? })`, label default `"Processing"`. `ScriptFocusView` loses `onParsingChange`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/canvas-store.test.ts`:

```ts
describe("scriptParsing", () => {
  it("marks a Script node as parsing and clears it, without touching node data", () => {
    const store = createCanvasStore([], []);
    store.getState().setScriptParsing("n1", true);
    expect(store.getState().scriptParsing).toEqual({ n1: true });
    store.getState().setScriptParsing("n1", false);
    expect(store.getState().scriptParsing).toEqual({});
    expect(store.getState().nodes).toEqual([]);
  });
});
```

Create `src/lib/nodes/__tests__/script-view-mode.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { scriptViewMode } from "../script-view-mode";

describe("scriptViewMode", () => {
  it("shows the skeleton whenever the script is parsing, even with nothing parsed yet (never the upload screen)", () => {
    expect(scriptViewMode({ parsing: true, hasParsed: false, replacing: false })).toBe("skeleton");
    expect(scriptViewMode({ parsing: true, hasParsed: true, replacing: false })).toBe("skeleton");
  });
  it("shows the parsed document once parsing ends (Review Focus 4)", () => {
    expect(scriptViewMode({ parsing: false, hasParsed: true, replacing: false })).toBe("parsed");
  });
  it("shows the upload screen when nothing is parsed or the person is replacing it", () => {
    expect(scriptViewMode({ parsing: false, hasParsed: false, replacing: false })).toBe("empty");
    expect(scriptViewMode({ parsing: false, hasParsed: true, replacing: true })).toBe("empty");
  });
});
```

Create `src/components/nodes/__tests__/script-document-skeleton.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ScriptDocumentSkeleton } from "../script-document-skeleton";

describe("ScriptDocumentSkeleton", () => {
  it("says Parsing script… on a first parse, and keeps its re-read wording otherwise", () => {
    expect(renderToStaticMarkup(<ScriptDocumentSkeleton />)).toContain("Parsing script…");
    expect(renderToStaticMarkup(<ScriptDocumentSkeleton reextracting />)).toContain("Reading the script again…");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/canvas-store.test.ts src/lib/nodes/__tests__/script-view-mode.test.ts src/components/nodes/__tests__/script-document-skeleton.test.tsx`
Expected: FAIL — `setScriptParsing` is not a function; `../script-view-mode` missing; the skeleton says "Reading the script…".

- [ ] **Step 3: Implement**

`canvas-store.ts` — in the store type, after `setVideoGenError`:

```ts
  // Which Script nodes are parsing right now. Whoever runs the parse (the node's own view, the
  // gallery, the Create-canvas hand-off) sets it, and the node and its view both read it.
  // Transient like videoGenStatus: never saved, so a closed tab cannot leave a node "parsing".
  scriptParsing: Record<string, true>;
  setScriptParsing: (nodeId: string, parsing: boolean) => void;
```

and in the implementation, after `setVideoGenError`:

```ts
    scriptParsing: {},
    setScriptParsing: (nodeId, parsing) =>
      set((s) => {
        if (parsing) return { scriptParsing: { ...s.scriptParsing, [nodeId]: true } };
        const { [nodeId]: _, ...rest } = s.scriptParsing;
        return { scriptParsing: rest };
      }),
```

(If eslint flags the unused `_`, use `const rest = { ...s.scriptParsing }; delete rest[nodeId];`.)

`src/lib/nodes/script-view-mode.ts`:

```ts
// The Script view's three states (EMPTY → SKELETON → PARSED). A parse in progress always wins,
// so a view opened while the gallery or the Create-canvas hand-off parses shows the skeleton,
// never the upload screen (script-to-canvas spec §2.4).
export function scriptViewMode(i: { parsing: boolean; hasParsed: boolean; replacing: boolean }): "skeleton" | "parsed" | "empty" {
  if (i.parsing) return "skeleton";
  return i.hasParsed && !i.replacing ? "parsed" : "empty";
}
```

`script-focus-view.tsx`:
- import `useCanvasStore` from `"@/components/canvas/canvas-store-provider"` (as `script-node.tsx` does) and `scriptViewMode` from `"@/lib/nodes/script-view-mode"`.
- Replace `const [parsing, setParsing] = useState(false);` with:
  ```ts
  const parsing = useCanvasStore((s) => s.scriptParsing[nodeId] === true);
  const setScriptParsing = useCanvasStore((s) => s.setScriptParsing);
  ```
- Replace the `mode` ternary with `const mode = scriptViewMode({ parsing, hasParsed, replacing });`.
- In `runParse`: `setParsing(true); onParsingChange?.(true);` → `setScriptParsing(nodeId, true);` and in `finally` → `setScriptParsing(nodeId, false);`.
- Remove the `onParsingChange` prop from the type and the destructuring.

`script-node.tsx`:
- Replace `const [isParsing, setIsParsing] = useState(false);` with `const isParsing = useCanvasStore((s) => s.scriptParsing[id] === true);`.
- Remove `onParsingChange={setIsParsing}` from `<ScriptFocusView …>`.
- Pill: `<ProcessingPill processing label="Parsing" />`.
- In the `isParsing ? (…)` body, add the words above the bars:
  ```tsx
  <p className="text-xs text-muted-foreground">Parsing script…</p>
  ```
- Double-click and the open control stay as they are: the node can be opened while parsing (spec §2.4).

`processing-pill.tsx`: `export function ProcessingPill({ processing, label = "Processing" }: { processing: boolean; label?: string })` and render `{label}` in place of the literal.

`script-document-skeleton.tsx`: `"Reading the script…"` → `"Parsing script…"` (the re-read wording stays).

- [ ] **Step 4: Run them to see them pass**

Run the Step 2 command, then `npx vitest run src/components/nodes src/lib/canvas-store.test.ts` and `npx tsc --noEmit`. Expected: PASS. Fix any other caller of `onParsingChange` tsc reports (there should be none besides script-node).

- [ ] **Step 5: Commit**

```bash
git add src/lib/canvas-store.ts src/lib/canvas-store.test.ts src/lib/nodes/script-view-mode.ts src/lib/nodes/__tests__/script-view-mode.test.ts src/components/nodes
git commit -m "feat(canvas): a Script node's parsing state is shared, so it shows wherever the parse started

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Adding a script drives the flag, and can fill an empty Script node

**Files:**
- Modify: `src/lib/scripts/add-to-canvas.ts`
- Modify: `src/hooks/use-add-script-node.ts`
- Test: `src/lib/scripts/__tests__/add-to-canvas.test.ts`

**Interfaces:**
- Consumes: `setScriptParsing` (Task 1).
- Produces: `AddScriptDeps` gains `fillScriptNode(nodeId: string, data: { title: string; source: string }): void` and `setParsing(nodeId: string, parsing: boolean): void`. `addScriptToCanvas(scriptId, position, d, opts?: { into?: string })` — with `into`, the script goes into that existing (empty) Script node instead of a new one. `useAddScriptNode()` returns `(scriptId: string, position: XYPosition, opts?: { into?: string }) => Promise<void>`.

- [ ] **Step 1: Write the failing tests**

In `add-to-canvas.test.ts`, add `fillScriptNode: vi.fn(), setParsing: vi.fn(),` to `deps()`'s defaults, then append inside the describe:

```ts
  it("marks the node as parsing for exactly the length of the parse", async () => {
    const order: string[] = [];
    const d = deps({
      setParsing: vi.fn((_id: string, p: boolean) => void order.push(p ? "on" : "off")),
      parse: vi.fn(async () => { order.push("parse"); return { ok: true, output: { visual_script: { shots: [] } } }; }),
      writeParsed: vi.fn(() => void order.push("write")),
    });
    await addScriptToCanvas("s1", POS, d);
    expect(order).toEqual(["on", "parse", "write", "off"]);
    expect(d.setParsing).toHaveBeenCalledWith("n1", true);
  });

  it("clears the parsing state when the parse fails, is still saving, or throws (Review Focus 5)", async () => {
    for (const parse of [
      vi.fn().mockResolvedValue({ ok: false, reason: "failed", error: "Bad" }),
      vi.fn().mockResolvedValue({ ok: false, reason: "saving", error: "Still saving" }),
      vi.fn().mockRejectedValue(new Error("offline")),
    ]) {
      const d = deps({ parse });
      await addScriptToCanvas("s1", POS, d);
      expect(d.setParsing).toHaveBeenLastCalledWith("n1", false);
    }
  });

  it("fills an existing empty Script node instead of adding one, when told to", async () => {
    const d = deps();
    await addScriptToCanvas("s1", POS, d, { into: "seeded" });
    expect(d.addScriptNode).not.toHaveBeenCalled();
    expect(d.fillScriptNode).toHaveBeenCalledWith("seeded", { title: "Golu starts today", source: expect.any(String) });
    expect(d.setParsing).toHaveBeenCalledWith("seeded", true);
    expect(d.writeParsed).toHaveBeenCalledWith("seeded", expect.anything());
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/scripts/__tests__/add-to-canvas.test.ts`
Expected: FAIL — `setParsing` never called; `into` ignored.

- [ ] **Step 3: Implement**

`add-to-canvas.ts` — add the two deps to `AddScriptDeps`:

```ts
  /** Puts the script into an existing empty Script node (a new canvas's seeded one). */
  fillScriptNode: (nodeId: string, data: { title: string; source: string }) => void;
  /** The canvas's shared "this node is parsing" flag (canvas store, never saved). */
  setParsing: (nodeId: string, parsing: boolean) => void;
```

Change the signature and the node/parse block:

```ts
export async function addScriptToCanvas(scriptId: string, position: XYPosition, d: AddScriptDeps, opts: { into?: string } = {}): Promise<void> {
```

```ts
  const nodeId = opts.into ?? d.newId();
  if (opts.into) d.fillScriptNode(nodeId, { title: header.title, source });
  else d.addScriptNode(nodeId, position, { title: header.title, source });
  if (detail.leadAvatarId) d.attachAvatar(detail.leadAvatarId, nodeId, position);

  const toastId = d.toast.loading(`Parsing "${header.title}"…`);
  d.setParsing(nodeId, true);
  try {
    let result: ParseResult;
    try {
      result = await d.parse(nodeId, source);
    } catch {
      d.toast.error(`Could not parse the script. It is on the canvas; open the node to parse it again.`, { id: toastId });
      return;
    }
    if (!result.ok) {
      d.toast.error(result.reason === "failed" ? `${result.error.replace(/\.?$/, ".")} ${RETRY}` : result.error, { id: toastId });
      return;
    }
    d.writeParsed(nodeId, result.output);
    const n = result.output.visual_script?.shots?.length ?? 0;
    d.toast.success(`"${header.title}" parsed into ${n} shot${n === 1 ? "" : "s"}`, { id: toastId });
  } finally {
    d.setParsing(nodeId, false);
  }
```

(Keep the existing early returns for load failure and non-approved scripts above this block unchanged.)

`use-add-script-node.ts`:

```ts
  return useCallback(
    (scriptId: string, position: XYPosition, opts?: { into?: string }) =>
      addScriptToCanvas(scriptId, position, {
        …existing deps…,
        fillScriptNode: (nodeId, data) => storeApi.getState().updateNodeData(nodeId, data),
        setParsing: (nodeId, parsing) => storeApi.getState().setScriptParsing(nodeId, parsing),
      }, opts),
    [clientId, storeApi, addAvatarNode],
  );
```

Update the hook's header comment: it can also fill a canvas's empty seeded Script node (the Create-canvas hand-off).

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/lib/scripts/__tests__/add-to-canvas.test.ts` and `npx tsc --noEmit`. Expected: PASS (the six existing tests unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/lib/scripts/add-to-canvas.ts src/lib/scripts/__tests__/add-to-canvas.test.ts src/hooks/use-add-script-node.ts
git commit -m "feat(canvas): adding an approved script shows it parsing, and can fill an empty Script node

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: A canvas remembers the script it came from

**Files:**
- Create: `supabase/migrations/0056_canvas_source_script.sql`
- Modify: `src/lib/db/types.ts` (`CanvasRow`, ~line 63)
- Modify: `src/lib/db/canvases.ts` (`createCanvas` ~50; add `getScriptCanvas`)
- Modify: `src/lib/actions/canvases.ts` (extract `seedCanvas`; add `createCanvasFromScriptAction`)
- Test: `src/lib/actions/canvases.test.ts`

**Interfaces:**
- Produces: `CanvasRow.source_script_id: string | null`; `createCanvas({ clientId, orgId, name, sourceScriptId?: string | null })`; `getScriptCanvas(clientId: string, scriptId: string): Promise<CanvasRow | null>`; `createCanvasFromScriptAction({ clientId, clientSlug, scriptId, name }): Promise<{ canvas: CanvasRow; created: boolean }>`.

- [ ] **Step 1: The migration**

`supabase/migrations/0056_canvas_source_script.sql`:

```sql
-- Script-to-canvas (D371): a canvas remembers the approved script it was created from, so the
-- script's page can say "Open canvas". One canvas per script; deleting the canvas (a hard delete)
-- frees the script to make another. Deleting the script leaves the canvas, unlinked.
alter table canvases
  add column source_script_id uuid references client_scripts(id) on delete set null;

create unique index canvases_source_script_id_key
  on canvases (source_script_id)
  where source_script_id is not null;
```

- [ ] **Step 2: Write the failing tests**

In `src/lib/actions/canvases.test.ts`: extend the hoisted mocks with `getScriptCanvasMock: vi.fn(async () => null)` and `getScriptMock: vi.fn()`, add `getScriptCanvas: getScriptCanvasMock` to the `@/lib/db/canvases` mock, add `vi.mock("@/lib/db/scripts", () => ({ getScript: getScriptMock }));`, import `createCanvasFromScriptAction`, and append:

```ts
describe("createCanvasFromScriptAction", () => {
  const approved = { id: "script-1", clientId: "client-1", stage: "approved" };
  const input = { clientId: "client-1", clientSlug: "acme", scriptId: "script-1", name: "Reel 12 · Golu starts today" };
  beforeEach(() => {
    vi.resetAllMocks();
    resolveImpersonationStateMock.mockResolvedValue({ isImpersonating: false });
    resolveOrgIdMock.mockResolvedValue("org-1");
    getScriptMock.mockResolvedValue(approved);
    getScriptCanvasMock.mockResolvedValue(null);
    createCanvasMock.mockImplementation(async (a) => ({ id: "canvas-1", slug: "reel-12", ...a }));
  });

  it("creates the canvas linked to the script", async () => {
    const out = await createCanvasFromScriptAction(input);
    expect(createCanvasMock).toHaveBeenCalledWith(expect.objectContaining({ clientId: "client-1", orgId: "org-1", sourceScriptId: "script-1", name: input.name }));
    expect(out).toMatchObject({ created: true, canvas: { id: "canvas-1" } });
  });

  it("returns the script's existing canvas instead of making a second one", async () => {
    getScriptCanvasMock.mockResolvedValue({ id: "canvas-0", slug: "reel-12" });
    const out = await createCanvasFromScriptAction(input);
    expect(createCanvasMock).not.toHaveBeenCalled();
    expect(out).toEqual({ created: false, canvas: { id: "canvas-0", slug: "reel-12" } });
  });

  it("when a second request wins the race, returns the canvas it made (Review Focus 1)", async () => {
    getScriptCanvasMock.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "canvas-race", slug: "reel-12" });
    createCanvasMock.mockRejectedValue(new Error("duplicate key value violates unique constraint"));
    const out = await createCanvasFromScriptAction(input);
    expect(out).toEqual({ created: false, canvas: { id: "canvas-race", slug: "reel-12" } });
  });

  it("refuses a script that is not approved", async () => {
    getScriptMock.mockResolvedValue({ ...approved, stage: "visualise" });
    await expect(createCanvasFromScriptAction(input)).rejects.toThrow("Only an approved script can start a canvas.");
    expect(createCanvasMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run src/lib/actions/canvases.test.ts`
Expected: FAIL — `createCanvasFromScriptAction` is not exported.

- [ ] **Step 4: Implement**

`src/lib/db/types.ts` — in `CanvasRow` add:

```ts
  /** D371 — the approved script this canvas was created from (one canvas per script). */
  source_script_id: string | null;
```

`src/lib/db/canvases.ts` — `createCanvas` takes `sourceScriptId?: string | null` and inserts `source_script_id: input.sourceScriptId ?? null` alongside the other columns. Add:

```ts
/** D371 — the canvas an approved script started, if it still exists (deleting a canvas frees it). */
export async function getScriptCanvas(clientId: string, scriptId: string): Promise<CanvasRow | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("canvases")
    .select("*")
    .eq("client_id", clientId)
    .eq("source_script_id", scriptId)
    .maybeSingle();
  if (error) throw error;
  return (data as CanvasRow) ?? null;
}
```

`src/lib/actions/canvases.ts`:
1. Move the KB-node + empty-Script-node seeding out of `createCanvasAction` into a module-private helper, unchanged:
   ```ts
   /** A new canvas starts with the client's KB node wired to an empty Script node, when there is a KB. */
   async function seedCanvas(canvasId: string, clientId: string, clientSlug: string): Promise<void> { …the existing block… }
   ```
   and call `await seedCanvas(canvas.id, input.clientId, input.clientSlug);` from `createCanvasAction`.
2. Import `getScriptCanvas` (with the other canvases imports), `getScript` from `@/lib/db/scripts`, `type CanvasRow` from `@/lib/db/types`, and add:

```ts
/** D371 — "Create canvas" on an approved script: the script's canvas, made now or already there.
 *  One canvas per script; a racing second request gets the first one's canvas (unique index). The
 *  canvas is seeded as any new canvas is; the script itself is added on the canvas, which fills
 *  the seeded empty Script node (AddScriptFromUrl), so it parses with the lead's avatar attached. */
export async function createCanvasFromScriptAction(input: {
  clientId: string;
  clientSlug: string;
  scriptId: string;
  name: string;
}): Promise<{ canvas: CanvasRow; created: boolean }> {
  return withAction("createCanvasFromScriptAction", async () => {
    const name = input.name?.trim();
    if (!name) throw new Error("Canvas needs a name");
    const script = await getScript(input.clientId, input.scriptId);
    if (!script || script.stage !== "approved") throw new Error("Only an approved script can start a canvas.");
    const existing = await getScriptCanvas(input.clientId, input.scriptId);
    if (existing) return { canvas: existing, created: false };

    const orgId = await resolveOrgId();
    let canvas: CanvasRow;
    try {
      canvas = await createCanvas({ clientId: input.clientId, orgId, name, sourceScriptId: input.scriptId });
    } catch (e) {
      const raced = await getScriptCanvas(input.clientId, input.scriptId);
      if (raced) return { canvas: raced, created: false };
      throw e;
    }
    await seedCanvas(canvas.id, input.clientId, input.clientSlug);
    revalidatePath(`/clients/${input.clientSlug}`);
    revalidatePath(`/clients/${input.clientSlug}/scripts/${input.scriptId}`);
    return { canvas, created: true };
  });
}
```

- [ ] **Step 5: Run them to see them pass**

Run: `npx vitest run src/lib/actions` and `npx tsc --noEmit`. Expected: PASS, including `with-action-coverage.test.ts` (the new action uses `withAction`; if that test keeps an explicit list of actions, add the new name there). The existing `createCanvasAction` tests still pass unchanged.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0056_canvas_source_script.sql src/lib/db/types.ts src/lib/db/canvases.ts src/lib/actions/canvases.ts src/lib/actions/canvases.test.ts
git commit -m "feat(canvas): a canvas can be created from an approved script, one per script

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Create canvas / Open canvas on the approved script

**Files:**
- Create: `src/lib/canvases/paths.ts`
- Modify: `src/components/canvases/new-canvas-dialog.tsx`
- Create: `src/components/scripts/script-canvas-button.tsx`
- Modify: `src/components/script-review/team/review-actions.tsx`, `src/components/script-review/team/approved-review-board.tsx`
- Modify: `src/app/clients/[id]/scripts/[scriptId]/page.tsx`
- Test: `src/lib/canvases/__tests__/paths.test.ts` (new), `src/components/scripts/__tests__/script-canvas-button.test.tsx` (new)

**Interfaces:**
- Consumes: `createCanvasFromScriptAction`, `getScriptCanvas` (Task 3).
- Produces: `canvasHref(clientSlug: string, canvasSlug: string, addScriptId?: string): string` → `/clients/<c>/canvases/<s>` plus `?addScript=<id>` when given. `NewCanvasDialog` prop `fromScript?: { id: string; title: string }`. `ScriptCanvasButton({ clientId, clientSlug, script: { id; title }, canvas: { slug: string } | null })`. `ReviewActions` / `ApprovedReviewBoard` prop `canvasAction?: ReactNode`. The `?addScript` parameter is what Task 5 reads.

- [ ] **Step 1: Write the failing tests**

`src/lib/canvases/__tests__/paths.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { canvasHref } from "../paths";

describe("canvasHref", () => {
  it("points at the canvas, and asks it to add the script when one is given", () => {
    expect(canvasHref("acme", "reel-12")).toBe("/clients/acme/canvases/reel-12");
    expect(canvasHref("acme", "reel-12", "6f1c2b1e-0000-4000-8000-000000000001")).toBe("/clients/acme/canvases/reel-12?addScript=6f1c2b1e-0000-4000-8000-000000000001");
  });
});
```

`src/components/scripts/__tests__/script-canvas-button.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/actions/canvases", () => ({ createCanvasAction: vi.fn(), createCanvasFromScriptAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { ScriptCanvasButton } from "../script-canvas-button";

const props = { clientId: "c1", clientSlug: "acme", script: { id: "s1", title: "Reel 12 · Golu starts today" } };

describe("ScriptCanvasButton", () => {
  it("offers Create canvas while the script has no canvas", () => {
    const html = renderToStaticMarkup(<ScriptCanvasButton {...props} canvas={null} />);
    expect(html).toContain("Create canvas");
    expect(html).not.toContain("Open canvas");
  });
  it("offers Open canvas, linking to it, once the script has one", () => {
    const html = renderToStaticMarkup(<ScriptCanvasButton {...props} canvas={{ slug: "reel-12" }} />);
    expect(html).toContain("Open canvas");
    expect(html).toContain('href="/clients/acme/canvases/reel-12"');
    expect(html).not.toContain("Create canvas");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/canvases/__tests__/paths.test.ts src/components/scripts/__tests__/script-canvas-button.test.tsx`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement**

`src/lib/canvases/paths.ts`:

```ts
/** A canvas's page. `addScriptId` asks the canvas to add that approved script once it can edit
 *  (AddScriptFromUrl reads it, then removes it from the URL). */
export function canvasHref(clientSlug: string, canvasSlug: string, addScriptId?: string): string {
  const base = `/clients/${clientSlug}/canvases/${canvasSlug}`;
  return addScriptId ? `${base}?addScript=${encodeURIComponent(addScriptId)}` : base;
}
```

`new-canvas-dialog.tsx`:
- New optional prop, documented: `/** D371 — creating this canvas for an approved script: the name starts as the script's title, and the canvas is the script's (made now or already there). */ fromScript?: { id: string; title: string };`
- `const [name, setName] = useState(fromScript?.title ?? "");` and in `onOpenChange` reset with `setName(fromScript?.title ?? "")`.
- `handleCreate`'s transition body:

```ts
        if (fromScript) {
          const { canvas, created } = await createCanvasFromScriptAction({ clientId, clientSlug, scriptId: fromScript.id, name: name.trim() });
          router.push(canvasHref(clientSlug, canvas.slug, created ? fromScript.id : undefined));
          toast.success(created ? `Created “${canvas.name}”` : `This script already has a canvas: “${canvas.name}”`);
          return;
        }
        const canvas = await createCanvasAction({ clientId, clientSlug, name: name.trim() });
        router.push(canvasHref(clientSlug, canvas.slug));
        toast.success(`Created “${canvas.name}”`);
```

(keep the existing comment about not closing the dialog before navigating, and the `catch`.)

`src/components/scripts/script-canvas-button.tsx`:

```tsx
"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { NewCanvasDialog } from "@/components/canvases/new-canvas-dialog";
import { canvasHref } from "@/lib/canvases/paths";

/** D371 — an approved script's next step: make its canvas (the script lands on it, parsing), or
 *  open the one it already has. One canvas per script. */
export function ScriptCanvasButton({ clientId, clientSlug, script, canvas }: {
  clientId: string;
  clientSlug: string;
  script: { id: string; title: string };
  canvas: { slug: string } | null;
}) {
  if (canvas) {
    return (
      <Button variant="outline" size="sm" nativeButton={false} render={<Link href={canvasHref(clientSlug, canvas.slug)} />}>
        Open canvas
      </Button>
    );
  }
  return <NewCanvasDialog clientId={clientId} clientSlug={clientSlug} fromScript={script} trigger={<Button size="sm">Create canvas</Button>} />;
}
```

`review-actions.tsx`: add `canvasAction?: ReactNode` to the props (import `type ReactNode` from "react"); render `{canvasAction}` just before `{latest && <CommentsButton …/>}`; mention it in the header comment ("and, once approved, Create / Open canvas").

`approved-review-board.tsx`: add `canvasAction?: ReactNode` to its props and pass it to `<ReviewActions … canvasAction={canvasAction} />`.

`page.tsx` (scripts/[scriptId]): import `getScriptCanvas` and `ScriptCanvasButton`. After `const label = …`:

```tsx
  // D371 — an approved script's canvas: Create canvas, or Open canvas once it has one.
  const scriptCanvas = script.stage === "approved" ? await getScriptCanvas(client.id, script.id) : null;
  const canvasAction = script.stage === "approved" ? (
    <ScriptCanvasButton
      clientId={client.id}
      clientSlug={client.slug}
      script={{ id: script.id, title: `${label ? `${label} · ` : ""}${script.doc.header.title}` }}
      canvas={scriptCanvas ? { slug: scriptCanvas.slug } : null}
    />
  ) : null;
```

Pass `canvasAction={canvasAction}` to `<ApprovedReviewBoard …>`. In the read-only branch, render the action above the view when there is one:

```tsx
        <>
          {canvasAction && <div className="mb-4 flex justify-end">{canvasAction}</div>}
          <ScriptView script={script} avatarFaces={avatarFaces} />
        </>
```

- [ ] **Step 4: Run them to see them pass**

Run the Step 2 command, then `npx vitest run src/components/script-review src/components/scripts src/components/canvases` and `npx tsc --noEmit`. Expected: PASS (the existing review-actions tests unchanged — the prop is optional).

- [ ] **Step 5: Commit**

```bash
git add src/lib/canvases src/components/canvases/new-canvas-dialog.tsx src/components/scripts/script-canvas-button.tsx src/components/scripts/__tests__/script-canvas-button.test.tsx src/components/script-review/team "src/app/clients/[id]/scripts/[scriptId]/page.tsx"
git commit -m "feat(scripts): an approved script offers Create canvas, then Open canvas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The canvas adds the script it was created for

**Files:**
- Create: `src/lib/scripts/add-from-url.ts`
- Create: `src/components/canvas/viewport-centre.ts`
- Create: `src/components/canvas/add-script-from-url.tsx`
- Modify: `src/components/canvas/gallery-drawer/gallery-drawer.tsx:289-297` (use `viewportCentre`)
- Modify: `src/components/canvas/canvas.tsx` (mount beside `<CanvasKBStatus …/>`)
- Test: `src/lib/scripts/__tests__/add-from-url.test.ts` (new)

**Interfaces:**
- Consumes: `useAddScriptNode()(scriptId, position, { into })` (Task 2); the `?addScript=` parameter (Task 4).
- Produces: `planAddFromUrl(i: { scriptId: string | null; canEdit: boolean; nodes: { id: string; type?: string; position: XYPosition; data: Record<string, unknown> }[] }): { kind: "none" } | { kind: "wait" } | { kind: "add"; scriptId: string; into: string | null; position: XYPosition | null }`; `viewportCentre(rf: { screenToFlowPosition: (p: { x: number; y: number }) => XYPosition }): XYPosition`; `<AddScriptFromUrl />` (renders nothing).

- [ ] **Step 1: Write the failing test**

`src/lib/scripts/__tests__/add-from-url.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { planAddFromUrl } from "../add-from-url";

const kb = { id: "kb", type: "kb", position: { x: 80, y: 120 }, data: {} };
const emptyScript = { id: "seeded", type: "script", position: { x: 360, y: 120 }, data: { title: "" } };
const usedScript = { id: "used", type: "script", position: { x: 0, y: 0 }, data: { title: "Old", source: "| Beat |" } };

describe("planAddFromUrl", () => {
  it("does nothing without the parameter", () => {
    expect(planAddFromUrl({ scriptId: null, canEdit: true, nodes: [kb, emptyScript] })).toEqual({ kind: "none" });
  });
  it("waits while this session cannot edit the canvas (Review Focus 2)", () => {
    expect(planAddFromUrl({ scriptId: "s1", canEdit: false, nodes: [kb, emptyScript] })).toEqual({ kind: "wait" });
  });
  it("fills the new canvas's empty seeded Script node, where it sits", () => {
    expect(planAddFromUrl({ scriptId: "s1", canEdit: true, nodes: [kb, usedScript, emptyScript] }))
      .toEqual({ kind: "add", scriptId: "s1", into: "seeded", position: { x: 360, y: 120 } });
  });
  it("adds a new node at the viewport centre when there is no empty Script node (no KB) (Review Focus 3)", () => {
    expect(planAddFromUrl({ scriptId: "s1", canEdit: true, nodes: [] })).toEqual({ kind: "add", scriptId: "s1", into: null, position: null });
    expect(planAddFromUrl({ scriptId: "s1", canEdit: true, nodes: [usedScript] })).toEqual({ kind: "add", scriptId: "s1", into: null, position: null });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/lib/scripts/__tests__/add-from-url.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

`src/lib/scripts/add-from-url.ts`:

```ts
import type { XYPosition } from "@xyflow/react";

// D372 — arriving on a canvas from "Create canvas" (?addScript=<id>): what to do. Plain, so the
// decision is testable without a canvas. The script goes into the new canvas's empty seeded Script
// node (wired to the KB) when there is one, else onto a new node at the viewport centre (null).

export type AddFromUrlPlan =
  | { kind: "none" }
  | { kind: "wait" }
  | { kind: "add"; scriptId: string; into: string | null; position: XYPosition | null };

type PlanNode = { id: string; type?: string; position: XYPosition; data: Record<string, unknown> };

export function planAddFromUrl(i: { scriptId: string | null; canEdit: boolean; nodes: PlanNode[] }): AddFromUrlPlan {
  if (!i.scriptId) return { kind: "none" };
  if (!i.canEdit) return { kind: "wait" };
  const empty = i.nodes.find((n) => n.type === "script" && !n.data.source && !n.data.parsed);
  return { kind: "add", scriptId: i.scriptId, into: empty?.id ?? null, position: empty?.position ?? null };
}
```

`src/components/canvas/viewport-centre.ts` — lifted from `gallery-drawer.tsx`'s `computeDefaultPosition` (now its second caller):

```ts
import type { XYPosition } from "@xyflow/react";

/** The flow position at the centre of the visible canvas: where a node added without a target lands. */
export function viewportCentre(rf: { screenToFlowPosition: (p: { x: number; y: number }) => XYPosition }): XYPosition {
  const el = document.querySelector<HTMLDivElement>(".react-flow");
  if (!el) return { x: 0, y: 0 };
  const rect = el.getBoundingClientRect();
  return rf.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
}
```

In `gallery-drawer.tsx`, `computeDefaultPosition` becomes `return options?.position ?? viewportCentre(reactFlow);`.

`src/components/canvas/add-script-from-url.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useReactFlow } from "@xyflow/react";
import { useCanvasStoreApi } from "./canvas-store-provider";
import { useCanvasEditable } from "./canvas-editable-context";
import { useAddScriptNode } from "@/hooks/use-add-script-node";
import { planAddFromUrl } from "@/lib/scripts/add-from-url";
import { viewportCentre } from "./viewport-centre";

/** D372 — headless. Arriving from an approved script's "Create canvas" (?addScript=<id>), adds that
 *  script once this session can edit: the parameter is removed first, so a reload or Back never adds
 *  it again (script-to-canvas spec §3). The add itself is useAddScriptNode's: parse, avatar, toasts. */
export function AddScriptFromUrl() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const canEdit = useCanvasEditable();
  const storeApi = useCanvasStoreApi();
  const reactFlow = useReactFlow();
  const addScript = useAddScriptNode();
  const done = useRef(false);
  const scriptId = params.get("addScript");

  useEffect(() => {
    if (done.current) return;
    // AppNode's data is a typed union; the plan only reads `source` / `parsed`.
    const nodes = storeApi.getState().nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data as Record<string, unknown> }));
    const plan = planAddFromUrl({ scriptId, canEdit, nodes });
    if (plan.kind !== "add") return;
    done.current = true;
    const rest = new URLSearchParams(params.toString());
    rest.delete("addScript");
    router.replace(rest.size > 0 ? `${pathname}?${rest}` : pathname, { scroll: false });
    void addScript(plan.scriptId, plan.position ?? viewportCentre(reactFlow), { into: plan.into ?? undefined });
  }, [scriptId, canEdit, params, pathname, router, storeApi, reactFlow, addScript]);

  return null;
}
```

`canvas.tsx`: import `AddScriptFromUrl` and mount it right after `<CanvasKBStatus … />` with a one-line comment: `{/* D372 — adds the approved script this canvas was created for (?addScript) */}`.

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run src/lib/scripts/__tests__/add-from-url.test.ts src/components/canvas` and `npx tsc --noEmit`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scripts/add-from-url.ts src/lib/scripts/__tests__/add-from-url.test.ts src/components/canvas/viewport-centre.ts src/components/canvas/add-script-from-url.tsx src/components/canvas/gallery-drawer/gallery-drawer.tsx src/components/canvas/canvas.tsx
git commit -m "feat(canvas): a canvas created from an approved script adds it, parsing, on arrival

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: ADRs and the whole-branch check

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` §7 (append after the last entry, D370)

- [ ] **Step 1: ADRs** — in the log's format (`### D3xx — Title *(recorded 2026-10-13)*`, then Decision / Why / Rejected / Refines → / Originated → `docs/superpowers/specs/2026-10-12-script-to-canvas-design.md`):
  - **D371 — An approved script starts one canvas, and the canvas remembers it.** `canvases.source_script_id` (unique when set, `on delete set null`); `createCanvasFromScriptAction` makes it or returns the existing one; the script page shows Create canvas / Open canvas. *Why:* the post-approval step was four moves across three pages, and nothing stopped a second canvas. *Rejected:* a column on `client_scripts` (a deleted canvas would leave a dangling pointer); finding the canvas by scanning Script nodes (the node holds a copy, not an id). *Refines →* spec 1 §5.2.
  - **D372 — "Parsing" is canvas-store state, and the canvas adds the script itself.** A transient `scriptParsing` flag replaces the Script node's local state, set by whoever parses; the dialog hands off through `?addScript`, and headless `AddScriptFromUrl` removes it and runs `useAddScriptNode`, filling the seeded empty Script node. *Why:* a gallery-started parse showed "Not extracted" and the upload screen; one path for every add keeps parse/avatar/toasts in `addScriptToCanvas`. *Rejected:* seeding the Script node on the server (a second copy of the parse and avatar logic); saving "parsing" in node data (a closed tab would leave it stuck). *Refines →* D337 (streamed parse states), spec 1 §5.2.

- [ ] **Step 2: The whole branch** — run `npx vitest run`, `npx tsc --noEmit` (errors only under `.next/` are the dev server's stale generated types; restart the dev server), `npx eslint src/lib src/components src/app supabase` limited to files this branch changed. Re-run any cold-cache timeout file alone before investigating.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md
git commit -m "docs(adr): D371-D372 approved script to its canvas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Hand back to the user** (they run these): apply `0056_canvas_source_script.sql` to the staging DB; restart the worktree's dev server; then on an approved script: Create canvas (name pre-filled) → land on the canvas → the Script node says "Parsing script…" and opening it shows the skeleton → it becomes the script → back on the script page the action says Open canvas → reload the canvas: still one Script node; delete the canvas → Create canvas again.

---

## Self-review (done while writing)

- **Spec coverage:** §2.1–2.2 → Task 4; §2.3 → Tasks 3, 5 (seeded node filled, avatar via `useAddScriptNode`); §2.4 → Tasks 1, 2; §2.5 and §3 one-per-script / A1 → Tasks 3, 4; copy-not-sync → unchanged behaviour (node holds a copy); parsing honest everywhere → Tasks 1, 2 (gallery uses the same path); failed parse → Task 2; nothing added twice → Task 5 (param stripped before the add; `done` ref); approved only → Tasks 3, 4; A2 team only → the button lives only on the team's script page. Success 1–8 → Tasks 1–5 tests plus Task 6's hand-back checks (3, 5, 8 are in-app).
- **Placeholders:** none.
- **Types:** `setScriptParsing`, `scriptViewMode`, `AddScriptDeps.fillScriptNode/setParsing`, `addScriptToCanvas(…, opts)`, `getScriptCanvas`, `createCanvasFromScriptAction → { canvas, created }`, `canvasHref`, `planAddFromUrl`, `viewportCentre` — same names in every task.
- **Review Focus:** 1 → Task 3; 2, 3 → Task 5; 4 → Task 1; 5 → Task 2.

