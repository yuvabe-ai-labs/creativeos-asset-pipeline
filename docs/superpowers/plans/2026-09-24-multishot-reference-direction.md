# Multishot Direction Box & Identity-Only References Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the operator tell the Multishot writer what each reference image is for (via an @-mention Direction box), and stop the writer from lifting a reference's backdrop/lighting into the look.

**Architecture:** The node's existing `instruction` field gets its editor back (a `MentionInstructionEditor` between the reference strip and the shots). Server-side, the route numbers each attached image (`Reference image N:` text part before it) and resolves the instruction's `@[Label](id)` chips to `reference image N (name)` so the writer can map words to pictures. A shared prompt rule makes every reference identity-only unless the direction says otherwise.

**Tech Stack:** Next.js route handlers, React (Base UI / shadcn), OpenAI chat completions with vision parts, vitest.

**Spec:** [docs/superpowers/specs/2026-09-24-multishot-reference-direction-design.md](../specs/2026-09-24-multishot-reference-direction-design.md)

## Global Constraints

- Numbering source is `visionAttachmentsOf(upstream)` / `refEntriesOf(upstream)` — never filter images independently.
- The writer still NEVER writes reference tokens into beats (D233). It only reads the operator's.
- `paramsUsed.instruction` / `generationInputsSnapshot.instruction` keep the RAW stored instruction (`@[Label](id)` form); only the user turn gets the resolved text.
- `buildUserContent` output for every existing caller must stay byte-identical (the labelling is opt-in).
- Prompt IDs: `multishot-prompt-generate@10`, `multishot-prompt-kling@7`.
- UI: shadcn primitives only; Lucide icons at 1.5 stroke; no raw `<textarea>`.
- ADR number: **D281**, appended to `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` §7.
- Test runner: `npx vitest run <path>` (run per file/directory — the full suite has known timeout flakes).

---

### Task 1: `resolveRefMentions` — turn stored image chips into numbered prose

**Files:**
- Modify: `src/lib/nodes/ref-binding.ts` (add export after `citedRefIds`)
- Test: `src/lib/nodes/__tests__/ref-binding.test.ts`

**Interfaces:**
- Consumes: `RefEntry` (`{ id: string; label: string }`), `refDisplayName`, module-level `MENTION` (= `mentionDialect()`), all already in `ref-binding.ts`.
- Produces: `export function resolveRefMentions(text: string, refs: RefEntry[]): string`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/nodes/__tests__/ref-binding.test.ts` (add `resolveRefMentions` to the existing import from `"../ref-binding"`):

```ts
describe("resolveRefMentions", () => {
  const refs = [
    { id: "a", label: "File: turnaround.png" },
    { id: "b", label: "File: kitchen.png" },
  ];

  it("numbers a connected image by its position in the roster, 1-based, with its name", () => {
    expect(
      resolveRefMentions("@[File: turnaround.png](a) is the character, identity only", refs),
    ).toBe("reference image 1 (turnaround.png) is the character, identity only");
  });

  it("numbers every mention independently", () => {
    expect(
      resolveRefMentions("look from @[File: kitchen.png](b), face from @[File: turnaround.png](a)", refs),
    ).toBe("look from reference image 2 (kitchen.png), face from reference image 1 (turnaround.png)");
  });

  // A disconnected image must never be renumbered onto whatever now sits in its old slot.
  it("degrades a mention of an image no longer connected to its plain name", () => {
    expect(resolveRefMentions("use @[File: gone.png](z)", refs)).toBe("use gone.png");
  });

  it("returns text with no mentions unchanged", () => {
    expect(resolveRefMentions("keep it warm", refs)).toBe("keep it warm");
    expect(resolveRefMentions("", refs)).toBe("");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/nodes/__tests__/ref-binding.test.ts`
Expected: FAIL — `resolveRefMentions is not a function` (or not exported).

- [ ] **Step 3: Implement**

In `src/lib/nodes/ref-binding.ts`, after `citedRefIds`:

```ts
/**
 * D281 — the operator's Direction text → what the multishot WRITER reads. `@[Label](id)` becomes
 * `reference image N (name)`, N being the image's 1-based position in `refs` — the same order the
 * route labels the attached images in (`buildUserContent(..., { labelImages: true })`), so the
 * words and the pictures agree. A mention of an image no longer connected becomes its plain name:
 * never renumbered onto whatever now sits in its old slot (BUG-010).
 */
export function resolveRefMentions(text: string, refs: RefEntry[]): string {
  if (!text.includes("@[")) return text;
  const position = new Map(refs.map((r, i) => [r.id, i + 1]));
  return MENTION.parse(text)
    .map((s) => {
      if (s.kind === "text") return s.text;
      const n = position.get(s.id);
      const name = refDisplayName(s.label);
      return n === undefined ? name : `reference image ${n} (${name})`;
    })
    .join("");
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/nodes/__tests__/ref-binding.test.ts`
Expected: PASS (all tests in file).

- [ ] **Step 5: Commit**

```bash
git add src/lib/nodes/ref-binding.ts src/lib/nodes/__tests__/ref-binding.test.ts
git commit -m "feat(ref-binding): resolve Direction image mentions to numbered references (D281)"
```

---

### Task 2: `buildUserContent` — opt-in numbered image labels

**Files:**
- Modify: `src/lib/nodes/compose-message.ts:76-87`
- Test: `src/lib/nodes/compose-message.test.ts`

**Interfaces:**
- Produces: `buildUserContent(compiledText: string, upstream: UpstreamPreview[], opts?: { labelImages?: boolean }): UserContent`. With `labelImages: true`, each image part is preceded by `{ type: "text", text: "Reference image N:" }` (N 1-based over `isVisionAttachment` order). Without it, output is unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/nodes/compose-message.test.ts` (it already has the `up()` helper and imports):

```ts
describe("buildUserContent — labelImages (D281)", () => {
  const imgA = up({ nodeId: "a", type: "file", fileKind: "image", fileUrl: "https://x/a.png" });
  const doc = up({ nodeId: "d", type: "file", fileKind: "document", fileUrl: "https://x/d.pdf" });
  const imgB = up({ nodeId: "b", type: "file", fileKind: "image", fileUrl: "https://x/b.png" });

  it("puts a numbered label before each image, counting only vision attachments", () => {
    const content = buildUserContent("PROMPT", [imgA, doc, imgB], { labelImages: true });
    expect(content).toEqual([
      { type: "text", text: "PROMPT" },
      { type: "text", text: "Reference image 1:" },
      { type: "image_url", image_url: { url: "https://x/a.png", detail: "auto" } },
      { type: "text", text: "Reference image 2:" },
      { type: "image_url", image_url: { url: "https://x/b.png", detail: "auto" } },
    ]);
  });

  it("leaves the default (unlabelled) shape exactly as it was", () => {
    expect(buildUserContent("PROMPT", [imgA, imgB])).toEqual([
      { type: "text", text: "PROMPT" },
      { type: "image_url", image_url: { url: "https://x/a.png", detail: "auto" } },
      { type: "image_url", image_url: { url: "https://x/b.png", detail: "auto" } },
    ]);
  });

  it("is still a plain string with no images", () => {
    expect(buildUserContent("PROMPT", [doc], { labelImages: true })).toBe("PROMPT");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/nodes/compose-message.test.ts`
Expected: FAIL on the first new test (no label parts emitted).

- [ ] **Step 3: Implement**

Replace `buildUserContent` in `src/lib/nodes/compose-message.ts`:

```ts
// `labelImages` (D281, the multishot writer only): each image is preceded by "Reference image N:",
// N counted over the same `isVisionAttachment` order as `refEntriesOf`, so the operator's
// Direction ("reference image 2 (kitchen.png)", via resolveRefMentions) points at a picture the
// writer can actually tell apart. Off by default — every other caller's message is unchanged.
export function buildUserContent(
  compiledText: string,
  upstream: UpstreamPreview[],
  opts: { labelImages?: boolean } = {},
): UserContent {
  const visionAttachments = upstream.filter(isVisionAttachment);
  if (visionAttachments.length === 0) return compiledText;

  return [
    { type: "text", text: compiledText },
    ...visionAttachments.flatMap((u, i): ContentPart[] =>
      opts.labelImages
        ? [{ type: "text", text: `Reference image ${i + 1}:` }, toImagePart(u)]
        : [toImagePart(u)],
    ),
  ];
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/nodes/compose-message.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nodes/compose-message.ts src/lib/nodes/compose-message.test.ts
git commit -m "feat(compose-message): opt-in numbered labels on attached images (D281)"
```

---

### Task 3: Route — resolve the Direction and number the images

**Files:**
- Modify: `src/app/api/nodes/[id]/multishot-prompt/route.ts` (imports; `buildMultishotUserTurn` call ~line 116-129; `buildUserContent` call ~line 249)
- Test: `src/app/api/nodes/[id]/multishot-prompt/route.test.ts`

**Interfaces:**
- Consumes: `resolveRefMentions(text, refs)` (Task 1), `buildUserContent(text, upstream, { labelImages: true })` (Task 2), existing `refs = refEntriesOf(resolved.upstream)` at route.ts:110.

- [ ] **Step 1: Write the failing tests**

Append to `route.test.ts`:

```ts
describe("POST multishot-prompt — Direction references (D281)", () => {
  const IMAGE = {
    nodeId: "img-1",
    versionId: null,
    label: "File",
    name: "turnaround.png",
    type: "file",
    text: "",
    fileKind: "image",
    fileUrl: "https://cdn/turnaround.png",
  };

  function withImage() {
    vi.mocked(resolveMultishotPromptInputs).mockResolvedValueOnce({
      clientContext: "",
      kbVersionId: null,
      slices: [],
      upstream: [IMAGE],
      cuts: CUTS,
      targetModel: undefined,
      scriptNotes: "",
    } as never);
  }

  it("hands the writer the Direction with image chips resolved to numbered references", async () => {
    withImage();
    returns(PLAN);
    await post({ instruction: "@[File: turnaround.png](img-1) is the character, identity only" });
    expect(vi.mocked(buildMultishotUserTurn).mock.calls[0][0].instruction).toBe(
      "reference image 1 (turnaround.png) is the character, identity only",
    );
  });

  it("records the RAW instruction on the version, not the resolved one", async () => {
    withImage();
    returns(PLAN);
    const raw = "@[File: turnaround.png](img-1) identity only";
    await post({ instruction: raw });
    expect(runPromptGeneration.mock.calls[0][0].paramsUsed).toMatchObject({ instruction: raw });
  });

  it("labels each attached image with its reference number", async () => {
    withImage();
    returns(PLAN);
    await post({ instruction: "" });
    const content = create.mock.calls[0][0].messages[1].content as Array<{ type: string; text?: string }>;
    expect(content[1]).toEqual({ type: "text", text: "Reference image 1:" });
    expect(content[2].type).toBe("image_url");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run "src/app/api/nodes/[id]/multishot-prompt/route.test.ts"`
Expected: the first and third new tests FAIL (instruction passed through raw; no label part). The second passes already — that's fine, it guards the change.

- [ ] **Step 3: Implement**

In `route.ts`, change the import:

```ts
import { refEntriesOf, resolveRefMentions } from "@/lib/nodes/ref-binding";
```

In the `buildMultishotUserTurn({...})` call, replace `instruction,` with:

```ts
        // D281 — the Direction's `@[Label](id)` image chips, resolved to "reference image N
        // (name)" over the SAME roster the images are labelled with below. The raw form is what
        // gets recorded (paramsUsed / snapshot), so a version still says which image was meant.
        instruction: resolveRefMentions(instruction, refs),
```

In `call()`, change the user message content to:

```ts
                content: buildUserContent(user, resolved.upstream.filter(isVisionAttachment), {
                  labelImages: true,
                }),
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run "src/app/api/nodes/[id]/multishot-prompt/route.test.ts"`
Expected: PASS (whole file).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/nodes/[id]/multishot-prompt/route.ts" "src/app/api/nodes/[id]/multishot-prompt/route.test.ts"
git commit -m "feat(multishot-prompt): number references and resolve Direction mentions (D281)"
```

---

### Task 4: Prompt backstop — references are identity-only

**Files:**
- Modify: `src/prompts/multishot-prompt-generate.ts` (ID + version note ~line 25; `referenceIdentificationBlock` line 51-54; `MULTISHOT_LOOK_BLOCK_RULES` line 88-104)
- Modify: `src/prompts/multishot-prompt-kling.ts` (ID + version note ~line 31)
- Test: `src/prompts/__tests__/multishot-prompt-generate.test.ts`

**Interfaces:**
- Produces: `MULTISHOT_PROMPT_ID === "multishot-prompt-generate@10"`, `MULTISHOT_KLING_PROMPT_ID === "multishot-prompt-kling@7"`. Both system prompts contain the identity-only rule (shared via `referenceIdentificationBlock`).

- [ ] **Step 1: Write the failing tests**

Append to `multishot-prompt-generate.test.ts` (add `import { multishotPromptKling, MULTISHOT_KLING_PROMPT_ID } from "../multishot-prompt-kling";` at the top):

```ts
// D281 — an operator attached a three-angle character turnaround on a grey seamless, and the
// writer put a light studio backdrop into the look. Both writers share this rule.
describe("references are identity-only (D281)", () => {
  const writers = [
    ["Omni", multishotPromptGenerate().system],
    ["Kling", multishotPromptKling().system],
  ] as const;

  it.each(writers)("%s: a reference carries identity, never its backdrop or light", (_, system) => {
    expect(system).toMatch(/A REFERENCE IS IDENTITY ONLY/);
    expect(system).toMatch(/backdrop, studio lighting/i);
    expect(system).toMatch(/identity sheet, never a location/i);
  });

  it.each(writers)("%s: takes look from a reference only when the direction says so", (_, system) => {
    expect(system).toMatch(/unless the operator's direction/i);
    expect(system).toMatch(/names a reference as the source of the look/i);
  });

  it.each(writers)("%s: still forbids writing the reference numbers into beats", (_, system) => {
    expect(system).toMatch(/"reference image 2"/);
  });

  it("bumps both prompt ids", () => {
    expect(MULTISHOT_PROMPT_ID).toBe("multishot-prompt-generate@10");
    expect(MULTISHOT_KLING_PROMPT_ID).toBe("multishot-prompt-kling@7");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/prompts/__tests__/multishot-prompt-generate.test.ts`
Expected: FAIL on every new test.

- [ ] **Step 3: Implement**

`multishot-prompt-generate.ts` — version note and ID:

```ts
// @10 (D281): references are identity-only unless the operator's direction says otherwise; images
//     arrive labelled "Reference image N" and the direction may cite them by that number.
export const MULTISHOT_PROMPT_ID = "multishot-prompt-generate@10";
```

In `referenceIdentificationBlock`, replace the first two paragraphs of the returned string (from `REFERENCES` through the end of the `DO NOT WRITE REFERENCE TOKENS…` paragraph) with:

```ts
  return `REFERENCES
The reference images are ATTACHED to your message, each preceded by "Reference image N". LOOK AT THEM and identify what each one shows. The number exists only so the operator's direction can point at a picture; what a reference is, you decide from the image itself.

A REFERENCE IS IDENTITY ONLY unless the operator's direction says to take something else from it. From a reference, carry who or what it shows — face, build, hair, wardrobe, the product's design. Never carry its background, backdrop, studio lighting, the colour of a seamless, its camera angle or its framing into the look or into any beat. A sheet showing one subject from several angles on a plain background is an identity sheet, never a location.

DO NOT WRITE REFERENCE TOKENS. Never write <IMAGE_REF_0>, "the first image", "reference image 2", @Image1, or any other pointer into the attachment list. Which picture binds to which beat is the operator's decision, made by hand after reading your draft. A token you assign yourself binds a specific photograph silently, and a wrong binding raises no error — it is only visible in a clip already paid for.
```

(Everything from `Instead, NAME WHAT YOU SAW` onward stays exactly as it is.)

In `MULTISHOT_LOOK_BLOCK_RULES`, replace the paragraph starting `Never derive the look from the brand context` with:

```ts
Never derive the look from the brand context, the product, the market, the season or the
reference images. None of those is a statement of how THIS film looks, and filling the gap from
them invents a setting the script never asked for. The one exception is stated direction itself:
when the operator's direction names a reference as the source of the look ("take the setting and
light from reference image 2"), describe that image's setting and light as repeatable physical
facts. A reference the direction does not name that way contributes nothing to the look.
```

`multishot-prompt-kling.ts` — version note and ID:

```ts
// @7 (D281): shares the identity-only reference rule and the numbered-reference direction.
export const MULTISHOT_KLING_PROMPT_ID = "multishot-prompt-kling@7";
```

- [ ] **Step 4: Run to verify pass (prompts + route, since the route test pins the Kling id)**

Run: `npx vitest run src/prompts/__tests__ "src/app/api/nodes/[id]/multishot-prompt"`
Expected: PASS. If any older test asserted the literal "Their labels are filenames and mean nothing", update that assertion to `/decide from the image itself/`.

- [ ] **Step 5: Commit**

```bash
git add src/prompts/multishot-prompt-generate.ts src/prompts/multishot-prompt-kling.ts src/prompts/__tests__/multishot-prompt-generate.test.ts
git commit -m "feat(multishot-prompt): references are identity-only unless directed (D281)"
```

---

### Task 5: Direction box in the focus view

**Files:**
- Modify: `src/components/nodes/multishot-prompt-focus-view.tsx` (lucide import line 6-15; the removal comment at line 545-548; the INPUT column between the `ReferenceImageStrip` block ~line 722-733 and the shots block ~line 735)

**Interfaces:**
- Consumes: existing `instructionDraft` / `setInstructionDraft` state, `onPatch`, `upstream`, `isReadOnly`, `generating`, `refining`, `FieldLabel`, `MentionInstructionEditor` (default dialect = `@[Label](id)`, the form Task 1 resolves).

- [ ] **Step 1: Add the icon import**

Add `Compass` to the `lucide-react` import list.

- [ ] **Step 2: Insert the editor**

Directly after the `promptRefImages.length > 0 ? (<ReferenceImageStrip … />) : (<p …>No reference images connected…</p>)` expression and before `{cuts.length === 0 ? (`, insert:

```tsx
                      {/* D281 — the operator's Direction: what each reference is FOR. The writer
                          otherwise has to guess, and a character turnaround on a grey seamless got
                          read as the location. @-chips resolve server-side to "reference image N",
                          the same number the attached image is labelled with. Node input, not plan
                          output, so it writes through immediately and is not held by Save/Cancel. */}
                      <div className="flex flex-col gap-2">
                        <FieldLabel icon={Compass} label="Direction" />
                        <MentionInstructionEditor
                          value={instructionDraft}
                          onChange={(v) => {
                            setInstructionDraft(v);
                            onPatch({ instruction: v });
                          }}
                          placeholder="e.g. @ the turnaround is the character — identity only, ignore its backdrop. Take the setting and light from @ the kitchen shot."
                          upstream={upstream}
                          disabled={isReadOnly || generating || !!refining}
                          className="min-h-16"
                        />
                        <p className="text-[0.65rem] text-muted-foreground">
                          References are used for identity only unless you say otherwise here.
                        </p>
                      </div>
```

- [ ] **Step 3: Update the stale removal comment**

Replace the comment block at lines 545-548 (`// No editors for \`instruction\` / \`cutInstructions\` any longer …`) with:

```tsx
  // Per-cut instruction editors were removed (operator request 2026-09-08); `cutInstructions` is
  // still read from the node and sent, there is just no surface for typing new ones. The
  // sequence-level `instruction` came back as the Direction box (D281).
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit -p . ; npx eslint src/components/nodes/multishot-prompt-focus-view.tsx`
Expected: no errors in the touched files.

- [ ] **Step 5: Manual check in the app**

Open a Multishot Prompt node's focus view with the turnaround image and the kitchen image connected. Confirm: the Direction box sits between References and Shots; typing `@` offers both images as chips; the text persists after closing and reopening. Generate with "@turnaround is the character, identity only" and confirm the "Sent to model" tab shows `reference image 1 (…)` in the user turn and the look block doesn't mention a grey/studio backdrop.

- [ ] **Step 6: Commit**

```bash
git add src/components/nodes/multishot-prompt-focus-view.tsx
git commit -m "feat(multishot-prompt): Direction box with @-mentioned references (D281)"
```

---

### Task 6: ADR D281

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (append to §7 after the last entry)
- Modify: `docs/superpowers/specs/2026-09-24-multishot-reference-direction-design.md` (status line)

- [ ] **Step 1: Append the ADR**

```markdown
### D281 — Reference images are identity-only unless the operator's Direction says otherwise *(recorded 2026-09-24; refines D233, D262)*

**Decision.** The Multishot Prompt node regains a sequence-level Direction box (the existing
`instruction` field) in which the operator @-mentions references and says what each is for. The
route labels each attached image `Reference image N:` and resolves the Direction's chips to
`reference image N (name)` over the same roster (`refEntriesOf`). Both writers share a rule: a
reference carries identity only — never its backdrop, studio light, angle or framing — unless the
Direction names it as the source of the look.

**Why.** A three-angle character turnaround on a grey seamless was read as the location, and the
plan arrived on a light studio background. D262 already forbade deriving look from references, in
one sentence; the images arrived unnumbered and the operator had nowhere to say what each was for,
so the writer guessed.

**Rejected.** Per-reference role pickers (Subject / Product / Look) — a second control for what one
free-text box with mentions covers; revisit if operators keep typing the same roles. A prompt-only
fix — still guesswork without a way to point at a specific image; kept as the backstop instead.

**Originated →** [2026-09-24-multishot-reference-direction-design.md](2026-09-24-multishot-reference-direction-design.md)
```

- [ ] **Step 2: Mark the spec implemented**

Change the spec's status line to `*2026-09-24 · status: implemented*`.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md docs/superpowers/specs/2026-09-24-multishot-reference-direction-design.md
git commit -m "docs(adr): D281 identity-only references and the Direction box"
```

---

## Final verification

Run: `npx vitest run src/lib/nodes src/prompts "src/app/api/nodes/[id]/multishot-prompt"`
Expected: all PASS.
