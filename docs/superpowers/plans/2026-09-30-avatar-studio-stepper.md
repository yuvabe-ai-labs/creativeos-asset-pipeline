# Avatar Studio Stepper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Avatar Studio as the approved five-step side stepper: Look → Profile sheet → Voice → Preview → Name & save. One Continue per step, the name as the page title, lifecycle actions that appear only once their object exists, and model names in place of "Runs on".

**Architecture:** The rules — which step is done, open or first, each step's status line, the lifecycle, and which models a face works with — go in one pure module (`src/lib/avatars/studio.ts`) plus `avatarWorksWith` in `generation.ts`, all unit-tested. A small hook owns the current step and the visit's skipped set. The page splits into a header, a stepper, a panel with a pinned footer, and a summary card; each step's content is its own component. No server, route or schema changes: autosave, draft creation, archive and the preview already exist.

**Tech Stack:** Next.js 16 · React 19 · TypeScript · shadcn on Base UI (`render` prop) · Tailwind v4 · vitest (node env).

**Spec:** `docs/superpowers/specs/2026-09-29-client-avatars-design.md` §4 (4.0–4.6), §8 · **ADR:** D297 · **Mockup (v2):** https://claude.ai/artifact/6Mg4qUZ5Ptw61HAxV6SxDR

## Global Constraints

- Every control is a shadcn primitive from `src/components/ui/*` — `Button`, `Input`, `Textarea`, `Label`, `Badge`, `DropdownMenu*`, `AlertDialog*`, `Tabs`. Never a raw `<button>`/`<input>`/`<textarea>`. Base UI composes with `render`, not `asChild`.
- Yuvabe design system: tokens only (no hex in JSX), `font-display` for headings, `.text-eyebrow` for small caps, `shadow-card` on resting cards, Lucide icons at `strokeWidth={1.5}`, easing `cubic-bezier(0.22,1,0.36,1)`. Purple only for the primary CTA, the current step and focus.
- Inline-editable text (the title) uses the house affordance: `underline decoration-dotted decoration-2 underline-offset-4`, transparent → `decoration-primary/50` on hover, plus `bg-primary/5`.
- One component per file, named export, split near 200 lines.
- Copy is taken verbatim from spec §4. Continue reads `Continue to {next step title, lower-cased}`; Back reads `Back to {previous step title, lower-cased}`.
- vitest runs in node: components and hooks are checked by `npx tsc --noEmit` and `npx eslint`, not tests.
- No migration. No new route.

## File map

| File | Change | Responsibility |
|---|---|---|
| `src/lib/avatars/constants.ts` | modify | `AVATAR_WORKS_WITH` |
| `src/lib/avatars/generation.ts` | modify | `avatarWorksWith`, `imageModelWorksWith`, `listSentence`; delete `avatarEngineNote` |
| `src/lib/avatars/studio.ts` | **create** | Steps, done/open/opening rules, status lines, lifecycle, face label |
| `src/hooks/use-studio-steps.ts` | **create** | Current step + this visit's skipped steps |
| `src/hooks/use-avatar-studio.ts` | modify | Autosave state, empty-name guard, Save validation, draft toast |
| `src/components/avatars/avatar-studio.tsx` | rewrite | Three-column assembly |
| `src/components/avatars/avatar-studio-header.tsx` | **create** | Back, title-as-name, badge, autosave, spent, menu |
| `src/components/avatars/avatar-studio-menu.tsx` | **create** | ⋯ menu: Discard draft / Archive, each confirmed |
| `src/components/avatars/avatar-studio-stepper.tsx` | **create** | The five steps down the side |
| `src/components/avatars/avatar-studio-footer.tsx` | **create** | Back + one primary action, pinned |
| `src/components/avatars/avatar-studio-summary.tsx` | **create** | Face, rows, Works with |
| `src/components/avatars/avatar-studio-preview-step.tsx` | **create** | Preview step shell + empty state |
| `src/components/avatars/avatar-studio-save-step.tsx` | **create** | Name + story |
| `src/components/avatars/avatar-studio-look-step.tsx` | modify | Works-with strip, upload note; drop its Continue button |
| `src/components/avatars/avatar-describe-panel.tsx` | modify | Works-with line under the settings row |
| `src/components/avatars/avatar-studio-sheet-step.tsx` | modify | Drop its own heading and the consent slot |
| `src/components/avatars/avatar-studio-voice-step.tsx` | modify | Card copy, real-person note; drop the preview |
| `src/components/avatars/avatar-voice-preview.tsx` | modify | Two-column layout (§4.4) |
| `src/components/avatars/avatar-studio-card.tsx` | **delete** | Replaced by header + summary + save step |
| `src/components/avatars/avatar-archive-button.tsx` | **delete** | Replaced by the menu |

---

### Task 1: The Studio's rules, pure and tested

**Files:**
- Modify: `src/lib/avatars/constants.ts`, `src/lib/avatars/generation.ts`
- Create: `src/lib/avatars/studio.ts`
- Test: `src/lib/avatars/__tests__/studio.test.ts`, `src/lib/avatars/__tests__/generation.test.ts`

**Interfaces — produces:**
- `AVATAR_WORKS_WITH: { seedream: readonly string[]; generated: readonly string[]; real: readonly string[] }`
- `avatarWorksWith(avatar: Pick<Avatar, "front">): readonly string[]`
- `imageModelWorksWith(modelId: string): readonly string[]`
- `listSentence(names: readonly string[]): string`
- `type StudioStepId = "look" | "sheet" | "voice" | "preview" | "save"`
- `STUDIO_STEPS: readonly { id; title; heading; lede; optional }[]`
- `type StudioSnapshot = { avatar; name; preview; sheetGenerating; skipped }`
- `isLookDone(avatar): boolean`, `isStepDone(id, snap): boolean`, `isStepOpen(id, snap): boolean`
- `studioOpeningStep(avatar): StudioStepId`
- `stepStatusLine(id, snap): string`
- `type AvatarLifecycle = "new" | "draft" | "library"`, `avatarLifecycle(avatar): AvatarLifecycle`
- `avatarFaceLabel(avatar): string | null`

- [ ] **Step 1: Write the failing tests**

`src/lib/avatars/__tests__/studio.test.ts` covers, with `makeAvatar` from `./fixtures`:

```ts
describe("isLookDone", () => {
  it("needs a front image", () => expect(isLookDone(makeAvatar({ front: null }))).toBe(false));
  it("a generated front is enough", () =>
    expect(isLookDone(makeAvatar({ front: makeImage(GENERATED), likenessConsentAt: null }))).toBe(true));
  it("an uploaded photo also needs the permission", () =>
    expect(isLookDone(makeAvatar({ likenessConsentBy: null, likenessConsentAt: null }))).toBe(false));
  it("is false with no avatar at all", () => expect(isLookDone(null)).toBe(false));
});

describe("isStepOpen", () => {
  it("Look is always open", () => expect(isStepOpen("look", snap({ avatar: null }))).toBe(true));
  it("the rest wait for Look", () =>
    expect(isStepOpen("voice", snap({ avatar: makeAvatar({ front: null, status: "draft" }) }))).toBe(false));
  it("the rest open once Look is done", () => expect(isStepOpen("save", snap())).toBe(true));
});

describe("studioOpeningStep", () => {
  it("a new avatar opens on Look", () => expect(studioOpeningStep(null)).toBe("look"));
  it("an avatar in the library opens on Name & save", () =>
    expect(studioOpeningStep(makeAvatar({ status: "ready" }))).toBe("save"));
  it("a draft opens on its first unfinished optional step", () => {
    expect(studioOpeningStep(makeAvatar({ status: "draft", sheet: null }))).toBe("sheet");
    expect(studioOpeningStep(makeAvatar({ status: "draft", sheetStale: true }))).toBe("sheet");
    expect(studioOpeningStep(makeAvatar({ status: "draft", voice: null }))).toBe("voice");
    expect(studioOpeningStep(makeAvatar({ status: "draft", voice: NAMED }))).toBe("preview");
  });
});

describe("stepStatusLine", () => {
  it("Look names the image model, or asks for permission", () => {
    expect(stepStatusLine("look", snap({ avatar: null }))).toBe("Needed");
    expect(stepStatusLine("look", snap({ avatar: makeAvatar({ likenessConsentAt: null }) }))).toBe("Needs permission");
  });
  it("an optional step left with Continue reads Skipped", () =>
    expect(stepStatusLine("sheet", snap({ avatar: makeAvatar({ sheet: null }), skipped: new Set(["sheet"]) }))).toBe("Skipped"));
  it("the preview says when it saved a voice reference", () => {
    const avatar = makeAvatar({ personType: "generic", front: makeImage(GENERATED), voice: { mode: "native" }, voiceSample: SAMPLE });
    const preview = { status: "succeeded", mode: "native", voiceId: null, frontUrl: avatar.front!.url } as const;
    expect(stepStatusLine("preview", snap({ avatar, preview }))).toBe("Voice reference saved");
  });
  it("Name & save follows the typed name, not the stored one", () => {
    expect(stepStatusLine("save", snap({ avatar: makeAvatar({ status: "draft" }), name: "" }))).toBe("Needs a name");
    expect(stepStatusLine("save", snap({ avatar: makeAvatar({ status: "draft" }), name: "Riya" }))).toBe("Ready to save");
    expect(stepStatusLine("save", snap({ avatar: makeAvatar({ status: "ready" }) }))).toBe("In the library");
  });
});

describe("avatarLifecycle", () => {
  it("is new, draft or in the library", () => {
    expect(avatarLifecycle(null)).toBe("new");
    expect(avatarLifecycle(makeAvatar({ status: "draft" }))).toBe("draft");
    expect(avatarLifecycle(makeAvatar({ status: "ready" }))).toBe("library");
  });
});
```

In `generation.test.ts`, replace the `avatarEngineNote` block with:

```ts
describe("avatarWorksWith", () => {
  it("a Seedream face works everywhere", () =>
    expect(avatarWorksWith(makeAvatar({ front: makeImage(GENERATED) }))).toEqual(["Seedance", "Gemini Omni", "Kling", "Veo"]));
  it("another generated face drops Seedance", () => {
    const front = makeImage({ ...GENERATED, modelId: "gemini:gemini-3-pro-image" });
    expect(avatarWorksWith(makeAvatar({ front }))).toEqual(["Gemini Omni", "Kling", "Veo"]);
  });
  it("a real person's photo works on Gemini Omni and Kling only", () =>
    expect(avatarWorksWith(makeAvatar())).toEqual(["Gemini Omni", "Kling"]));
  it("no front, no models", () => expect(avatarWorksWith(makeAvatar({ front: null }))).toEqual([]));
});

describe("listSentence", () => {
  it("joins with commas and a final 'and'", () => {
    expect(listSentence(["A"])).toBe("A");
    expect(listSentence(["A", "B"])).toBe("A and B");
    expect(listSentence(["A", "B", "C"])).toBe("A, B and C");
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/lib/avatars`
Expected: FAIL — `Cannot find module '../studio'`, `avatarWorksWith is not a function`.

- [ ] **Step 3: Implement**

`constants.ts`:

```ts
// D297 — which video models an avatar can be used with, by the kind of face it has (spec §8).
// Names only: the per-model detail stays in the spec. Veo is left off a real person because
// Google may refuse a real face by region, and a names-only list cannot say "maybe".
export const AVATAR_WORKS_WITH = {
  seedream: ["Seedance", "Gemini Omni", "Kling", "Veo"],
  generated: ["Gemini Omni", "Kling", "Veo"],
  real: ["Gemini Omni", "Kling"],
} as const;
```

`generation.ts` — delete `avatarEngineNote`; add:

```ts
export function imageModelWorksWith(modelId: string): readonly string[] {
  return isSeedanceFaceModel(modelId) ? AVATAR_WORKS_WITH.seedream : AVATAR_WORKS_WITH.generated;
}

export function avatarWorksWith(avatar: Pick<Avatar, "front">): readonly string[] {
  if (!avatar.front) return [];
  const source = avatar.front.source;
  return source.kind === "generated" ? imageModelWorksWith(source.modelId) : AVATAR_WORKS_WITH.real;
}

export function listSentence(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
```

`studio.ts` implements the interfaces above. The rules, exactly:

- `isLookDone(a)` = `Boolean(a?.front) && !needsLikenessConsent(a)`.
- `isStepDone`: look → `isLookDone`; sheet → `sheet && !sheetStale`; voice → `voice !== null`; preview → `preview?.status === "succeeded" && !isVoicePreviewStale(preview, avatar)`; save → `status === "ready"`.
- `isStepOpen(id)` = `id === "look" || isLookDone(avatar) || avatar?.status === "ready"`.
- `studioOpeningStep(a)`: no Look → `look`; ready → `save`; no or stale sheet → `sheet`; no voice → `voice`; else `preview`. The preview itself loads after the page, so it is not consulted: an avatar whose preview is done still opens there, and Continue is one click. (Spec §4.0 is amended to say so in Task 5.)
- `stepStatusLine`: the table in spec §4.0. The Look line for a generated front is the image model's label from `imageGenClientModelMap`.
- `avatarLifecycle(a)`: `!a` → `new`; `status === "ready"` → `library`; else `draft`.
- `avatarFaceLabel(a)`: no front → null; upload → `Real person`; generated → `Generated · {model label}`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/avatars`
Expected: PASS.

- [ ] **Step 5: Commit** — `feat(avatars): the Studio's step, lifecycle and model rules, pure (D297)`

---

### Task 2: State — the steps hook, and the Studio hook's three gaps

**Files:**
- Create: `src/hooks/use-studio-steps.ts`
- Modify: `src/hooks/use-avatar-studio.ts`

**Interfaces — produces:**
- `useStudioSteps(initial: StudioStepId): { current: StudioStepId; skipped: ReadonlySet<StudioStepId>; go(id): void; next(currentDone: boolean): void; back(): void }`
- `useAvatarStudio` gains `saveState: "idle" | "saving" | "saved"` and `nameError: string | null`; `markReady()` now refuses an empty name itself.

- [ ] **Step 1: `useStudioSteps`**

```ts
export function useStudioSteps(initial: StudioStepId) {
  const [current, setCurrent] = useState<StudioStepId>(initial);
  const [skipped, setSkipped] = useState<ReadonlySet<StudioStepId>>(() => new Set());
  const index = STUDIO_STEPS.findIndex((s) => s.id === current);

  const go = useCallback((id: StudioStepId) => setCurrent(id), []);
  const back = useCallback(() => setCurrent(STUDIO_STEPS[Math.max(0, index - 1)].id), [index]);
  // Continue on an unfinished optional step is what skipping it means (D297).
  const next = useCallback((currentDone: boolean) => {
    if (STUDIO_STEPS[index].optional && !currentDone) {
      setSkipped((prev) => new Set(prev).add(current));
    }
    setCurrent(STUDIO_STEPS[Math.min(STUDIO_STEPS.length - 1, index + 1)].id);
  }, [current, index]);

  return { current, skipped, go, next, back };
}
```

Opening a step it cannot open is the caller's job to prevent (the stepper disables locked steps).

- [ ] **Step 2: `useAvatarStudio` — autosave state**

`setName`/`setStory` set `saveState` to `"saving"` whenever a row exists and a save is scheduled; `saveFields`' success sets `"saved"`, its failure `"idle"` (the toast already fires).

- [ ] **Step 3: `useAvatarStudio` — the empty-name guard**

```ts
const setName = useCallback((next: string) => {
  setNameState(next);
  // An avatar in the library with no name would drop back to draft on save (withStatus).
  if (avatar?.status === "ready" && !next.trim()) {
    setNameError("An avatar in the library needs a name.");
    return;
  }
  setNameError(null);
  saveFields({ name: next, story });
}, [avatar?.status, saveFields, story]);
```

- [ ] **Step 4: `useAvatarStudio` — Save validates the name; drafts announce themselves**

`markReady` begins with `if (!name.trim()) { setNameError("Give the avatar a name to save it."); return; }`. `ensureAvatar`, after `setAvatar(created)`, shows `toast("Saved as a draft so nothing is lost. The ⋯ menu can discard it.")`. `gaps` is dropped from the return (nothing reads it after Task 3).

- [ ] **Step 5: Check and commit**

Run: `npx tsc --noEmit && npx eslint src/hooks/use-studio-steps.ts src/hooks/use-avatar-studio.ts`
Commit — `feat(avatars): Studio step state, autosave status and the name guards (D297)`

---

### Task 3: The frame — header, menu, stepper, footer, summary

**Files:** create `avatar-studio-header.tsx`, `avatar-studio-menu.tsx`, `avatar-studio-stepper.tsx`, `avatar-studio-footer.tsx`, `avatar-studio-summary.tsx`; rewrite `avatar-studio.tsx`; delete `avatar-studio-card.tsx`, `avatar-archive-button.tsx`.

**Interfaces — consumes:** everything from Tasks 1–2.

- [ ] **Step 1: Header** — props `{ clientSlug, clientName, avatar, name, onName, nameError, saveState, spentCredits, onArchive }`.
  A ghost `Button` "Avatars" with `ChevronLeft` rendering a `Link` to the library; eyebrow `{clientName} · Avatars`; the title — an `Input` with `aria-label="Avatar name"`, placeholder "Untitled avatar", `maxLength={AVATAR_NAME_MAX}`, styled borderless in `font-display text-2xl font-semibold` with the house inline-edit affordance, `aria-invalid` when `nameError`; a `Badge` — New (outline), Draft, In the library; `Saving…` / a `Check` and "Saved" when `saveState` is not idle; `AvatarCreditCost` + "spent" when `spentCredits > 0`; `AvatarStudioMenu` unless the lifecycle is `new`.

- [ ] **Step 2: Menu** — props `{ lifecycle: "draft" | "library", name, spentCredits, onConfirm }`.
  A `DropdownMenu` whose trigger is a ghost icon `Button` (`MoreHorizontal`, `aria-label="More actions"`). One item — **Discard draft** (`Trash2`, destructive text) with the note "Only this draft. Credits already spent stay spent.", or **Archive avatar** (`Archive`) with "Leaves the library. Videos that already use it keep working." The item opens a controlled `AlertDialog` with the spec §4.6 copy; its confirm calls `onConfirm`. Both go through the existing archive (D297).

- [ ] **Step 3: Stepper** — props `{ current, snapshot, onGo }`.
  An `<ol>` of `STUDIO_STEPS`. Each item is a ghost `Button` (`aria-current="step"` on the current one, `disabled` when `!isStepOpen`) holding a 26 px circle — the number, a `Check` when done and not current, a `Lock` when closed; filled primary when current, primary outline when done, dashed when skipped — then the title and `stepStatusLine`. A 1.5 px connector runs between circles, primary once the step above is done. `sticky top-6` on wide screens; below `md` a horizontal scroll row of titles.

- [ ] **Step 4: Footer** — props `{ back: { label, onClick } | null, primary: { label, onClick, disabled, reason? } }`.
  `sticky bottom-0` inside the panel, `border-t`, `bg-card`. Back is a ghost `Button` with `ChevronLeft`; the reason, when present, is a muted line beside the primary `Button`.

- [ ] **Step 5: Summary** — props `{ avatar, name }`.
  A `Card` with `shadow-card`: the square front (or a `UserRound` placeholder), the name in `font-display` (or "Untitled avatar"), rows Face (`avatarFaceLabel`), Profile sheet (Optional / Out of date / Added), Voice (`avatarVoiceLabel` or Optional), and with a native voice, Voice reference (`{s} s saved` / Not yet). Then `text-eyebrow` "Works with" and a `Badge` per `avatarWorksWith` name, or "Pick a front image first."

- [ ] **Step 6: `avatar-studio.tsx`** — `grid lg:grid-cols-[13.5rem_minmax(0,1fr)_16rem] gap-6`. It builds the `StudioSnapshot` from `useAvatarStudio`, `useAvatarGeneration` (`generatingSheet`), `useAvatarVoicePreview` and `useStudioSteps(studioOpeningStep(initialAvatar))`; renders the header, the stepper, a `Card` panel (eyebrow `Step N of 5 · Optional`, `font-display` heading, lede, the step body, the footer) and the summary. The footer's primary: `Continue to …` everywhere but the last step, disabled on Look until `isLookDone`, with the reason "Pick a front image to continue" or "Confirm permission to continue"; on Name & save, **Save to library** (`markReady`, disabled while busy) or **Done** (to the library) once in the library.

- [ ] **Step 7: Delete the card and the archive button; check and commit**

Run: `npx tsc --noEmit && npx eslint src/components/avatars src/hooks`
Commit — `feat(avatars): the Studio frame — side stepper, header, menu, pinned footer, summary (D297)`

---

### Task 4: The five steps' content

**Files:** modify look, describe panel, sheet, voice, voice preview; create preview step and save step.

- [ ] **Step 1: Look** — drop the "Continue to profile sheet" button and the step's own heading block (the panel head says it). Under the Describe settings row, replace the Seedance-only warning with the works-with line: `Works with ${listSentence(imageModelWorksWith(modelId))}.`, plus ` For Seedance too, use ${seedanceFaceModelLabel()}.` when the model is not the Seedance face model. In Upload, beside the dropzone: the note "An uploaded photo is treated as a real person. Real faces work with Gemini Omni and Kling." and the consent block. Once a front exists, a muted strip: eyebrow "This face works with" and a `Badge` per `avatarWorksWith` name.

- [ ] **Step 2: Sheet** — drop the heading paragraph and the `consent` prop (the step only opens once Look, and so consent, is done).

- [ ] **Step 3: Voice** — drop the heading paragraph and the preview block. Card copy from spec §4.3. For a real person: the note "A real person runs on Gemini Omni and Kling. Neither takes a voice reference, so the voice is applied after generation."

- [ ] **Step 4: Preview step** — `AvatarStudioPreviewStep({ avatar, preview, disabled })`. With no voice: a dashed empty state — `AudioLines`, "Choose a voice first", "The voice decides which model makes the preview.", and an outline `Button` "Back to voice" (an `onBackToVoice` prop). Otherwise `AvatarVoicePreview`, re-laid as two columns: left the "Made with" line, the line box, the button, the reference card or its hint; right the 9:16 clip area (dashed "Your clip appears here", the skeleton, or the clip with its line and the Out of date badge). Stacks under `md`.

- [ ] **Step 5: Save step** — `AvatarStudioSaveStep({ name, story, nameError, onName, onStory })`. `Label` + `Input` "Name" (`aria-invalid`, `aria-describedby` to the error, focused when `nameError` changes to a value) beside `Label` + `Textarea` "Background story" with an "Optional" tag.

- [ ] **Step 6: Check and commit**

Run: `npx vitest run src/lib/avatars "src/app/api/clients/[id]/avatars" && npx tsc --noEmit && npx eslint src/components/avatars src/hooks src/lib/avatars`
Commit — `feat(avatars): the Studio's five steps, preview and save as steps of their own (D297)`

---

### Task 5: Record it

- [ ] Amend spec §4.0's opening rule: a draft with Look done opens on Profile sheet (no or stale sheet), else Voice (no voice), else Preview — the preview is not consulted, because it loads after the page.
- [ ] Add an "As built" note to this plan and the browser checklist below.
- [ ] Commit — `docs(avatars): Studio stepper as built (D297)`

## Verify in the running app

1. **New avatar** — no ⋯ menu, badge "New", title reads "Untitled avatar", steps 2–5 locked.
2. Type a name in the title, then Generate: a toast says a draft was saved; the badge becomes Draft; ⋯ offers **Discard draft**; the name was kept.
3. Pick a front: steps unlock; the summary shows "Generated · Seedream 5.0 Lite" and four model names. Switch the model to Nano Banana: the line under the settings says Seedance needs Seedream.
4. **Continue** through Profile sheet without generating: it reads Skipped. There is no Skip button anywhere.
5. Voice → the engine's own → Preview: the Seedance path, the reference card once done. Remove the voice: the Preview step shows "Choose a voice first" with Back to voice.
6. Name & save with an empty name: the error shows and the field is focused. Fill it and **Save to library**: back in the library, the avatar is Ready.
7. Reopen it: it opens on Name & save, all steps open, ⋯ offers **Archive avatar**, the footer says **Done**. Clear the title: "An avatar in the library needs a name." and nothing saves.
8. Upload a photo on a new avatar: the note and consent sit beside it; Continue waits for the tick; the summary lists Gemini Omni and Kling only.
9. Discard a draft: confirmation names the credits spent; back to the library; it is gone.
10. At phone width: the stepper is a row of titles, the summary sits below the panel.
