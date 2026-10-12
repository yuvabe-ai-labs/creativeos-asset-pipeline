# Script copilot · paste a script — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paste any reel script into the copilot's chat and get it back as a CreativeOS script, word for word, with every gap guessed and asked about.

**Architecture:** A cheap gate (`mightBeScript`) plus a quick-model check (`script_detect`) decide whether a message is a whole script. If it is, the writer model reads the paste into the draft shape (`script_import`, streamed into the pane like a first draft). Plain code then turns that reading into the script (`buildImport`). That code cleans markdown, estimates missing lengths, resolves the reel number, keeps leftovers in the notes, checks every VO and card against the paste, turns each guess into an open item, and writes the reply. When a draft already exists, the parsed script waits on a replace card (`kind: "import"`) that the existing proposals route settles. A guess is settled when the person ticks it, when the copilot's `confirm_item` settles it, or, new here, when an edit changes the field it filled. That last case is handled in `changeWithRetry`, the one place every write passes through.

**Tech Stack:** Next.js route handlers, zod v4, Gemini (writer, streamed) + gpt-5.4-mini (quick), TanStack Query, shadcn/Base UI, vitest.

**Spec:** [docs/superpowers/specs/2026-10-12-script-copilot-paste-a-script-design.md](../specs/2026-10-12-script-copilot-paste-a-script-design.md). Parent: spec 2 (Generate). Read both.

**Worktree:** `C:\Users\cyril varghese\code\canvas-apps\asset-pipleline\.claude\worktrees\script-copilot-finish` (branch `worktree-script-copilot-finish`). Run every command from there.

## Global Constraints

- **The rule (spec §2):** what the paste has is used exactly; what it lacks is best-guessed and asked about in the chat.
- Only formatting is removed: table borders, bold markers, markdown backslash escapes, stray line breaks. Wording and spelling are never changed, typos included (§4.1).
- One shot per pasted row or scene; nothing is split or merged (§4.1).
- No avatar is ever linked without the person choosing it (§4.3, §6).
- Paste limit `MAX_PASTE_CHARS = 30000`; an ordinary message keeps `MAX_MESSAGE_CHARS = 4000` (§5.1).
- A pasted script is not rewritten to house rules on import (A4).
- Imported scripts are not examples until past Generate (A5). This already holds: `prompt-context.ts` `finished()` filters `stage !== "generate"`. Don't change it.
- User-facing copy says "avatar", never "presenter". Copy is plain sentences.
- Controls are shadcn primitives from `src/components/ui/*` only, never native elements (AGENTS.md).
- Motion easing `cubic-bezier(0.22,1,0.36,1)` only; purple only as a sparing accent (AGENTS.md).
- ADRs go in the one log, `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` §7, as D367 onward (Task 9).
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

Five inputs the spec implies that are most likely to hurt someone if untested. Each has a test in the task named:

1. **A markdown-exported paste:** `\[real review, verbatim\]`, `\*`, `**bold**`, `\_\_\_\_`. Cleaned to the plain words, the review placeholder still reads as a placeholder, and none of it is flagged as a mismatch. (Tasks 2 and 4.)
2. **Re-pasting the same reel over its own draft:** Reel 07 replacing Reel 07 keeps 07 and is not bumped as "taken". (Task 4, `resolveReelNumber`.)
3. **A message over 4,000 characters that isn't a script:** the reply explains and nothing changes. (Task 5.)
4. **A paste while the confirmation card is showing:** the import wins, the card is cleared, and the brief goes to `written`. (Task 5.)
5. **Some rows timed, others not:** only the untimed shots are estimated, and the guess names them. (Task 4.)

## File map

| File | Responsibility | Task |
|---|---|---|
| `src/lib/scripts/copilot/constants.ts` | `MAX_PASTE_CHARS` | 1 |
| `src/lib/scripts/copilot/message-text.ts` | `isLongText` (when to clip) | 1 |
| `src/components/scripts/generate/copilot-composer.tsx` | 30k limit, capped height, fade when long | 1 |
| `src/components/scripts/generate/copilot-chat-message.tsx` | clipped user bubble; import card slot | 1, 7 |
| `src/app/api/clients/[id]/scripts/[scriptId]/turn/route.ts` | accepts up to 30k | 1 |
| `src/lib/scripts/copilot/import-check.ts` (new) | `stripFormatting`, `normalizeForMatch`, `unmatchedShots` | 2 |
| `src/lib/scripts/copilot/schema.ts` | confirmation `paths`; `brief.imported`; `importCardSchema` | 3, 5, 6 |
| `src/lib/scripts/copilot/guesses.ts` (new) | `settleGuesses` | 3 |
| `src/lib/scripts/copilot/change.ts` | settle guesses on every edit; `replaces` | 3 |
| `src/lib/scripts/copilot/output.ts` | `importOutputSchema`, `detectOutputSchema` | 4, 5 |
| `src/lib/scripts/copilot/import.ts` (new) | `mightBeScript`, `estimateLength`, `resolveReelNumber`, `importSummary`, `buildImport` | 4, 5 |
| `src/lib/scripts/fixtures/reel-07-paste.ts` (new) | the Reel 07 outline as pasted, plus the D1–D4 block | 2 |
| `src/lib/scripts/fixtures/reel-07-import.ts` (new) | a faithful model reading of that paste | 4 |
| `src/prompts/script-copilot.ts` | `detect` and `import` tasks | 5 |
| `src/lib/scripts/copilot/messages.ts` | `detectPrompt`, `importPrompt` | 5 |
| `src/lib/scripts/copilot/draft-call.ts` (new) | `streamDraftCall` (shared by first draft and import) | 5 |
| `src/lib/scripts/copilot/import-turn.ts` (new) | `prepareImport`, `acceptImport` | 5, 6 |
| `src/lib/scripts/copilot/turn.ts` | detection before the brief/edit branch | 5, 6 |
| `src/lib/db/script-generate.ts` | `claimProposalCard` takes an import card too | 6 |
| `src/app/api/clients/[id]/scripts/[scriptId]/proposals/[messageId]/route.ts` | settle import cards | 6 |
| `src/components/scripts/generate/copilot-import-card.tsx` (new) | the replace card | 7 |
| `src/lib/scripts/copilot/suggestions.ts` | avatar chips after an import | 8 |
| `src/components/scripts/generate/copilot-suggestions.tsx`, `copilot-chat.tsx`, `generate-workspace.tsx` | a chip that links an avatar | 8 |
| `scripts/probe-script-import.itest.ts` (new) | live check of success 1–3 on the real writer | 9 |

Test command for everything below: `npx vitest run <path>`. Type check: `npx tsc --noEmit`.

---

### Task 1: The paste limit and clipped long text

**Files:**
- Modify: `src/lib/scripts/copilot/constants.ts`
- Modify: `src/lib/scripts/copilot/message-text.ts`
- Modify: `src/components/scripts/generate/copilot-composer.tsx`
- Modify: `src/components/scripts/generate/copilot-chat-message.tsx`
- Modify: `src/app/api/clients/[id]/scripts/[scriptId]/turn/route.ts:10,32`
- Test: `src/lib/scripts/copilot/__tests__/message-text.test.ts`, `src/app/api/clients/[id]/scripts/[scriptId]/turn/route.test.ts`, `src/components/scripts/generate/__tests__/copilot-chat-message.test.tsx` (new)

**Interfaces:**
- Produces: `MAX_PASTE_CHARS: number` (constants.ts); `isLongText(text: string): boolean` (message-text.ts).

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/scripts/copilot/__tests__/message-text.test.ts` (add `isLongText` to its import from `../message-text`):

```ts
describe("isLongText", () => {
  it("is false for an ordinary message", () => {
    expect(isLongText("Make the hook punchier")).toBe(false);
    expect(isLongText("one\ntwo\nthree")).toBe(false);
  });
  it("is true past six lines or 600 characters (a pasted script)", () => {
    expect(isLongText(["1", "2", "3", "4", "5", "6", "7"].join("\n"))).toBe(true);
    expect(isLongText("x".repeat(601))).toBe(true);
  });
});
```

Add to `src/app/api/clients/[id]/scripts/[scriptId]/turn/route.test.ts`, inside `describe("POST .../turn")`:

```ts
  it("takes a pasted script longer than an ordinary message, up to 30,000 characters", async () => {
    vi.mocked(prepareTurn).mockResolvedValue(() => ({ patch: null, result: [{ content: "ok", card: null }] }));
    const { POST } = await import("./route");
    expect((await POST(send({ text: "x".repeat(4001) }) as never, { params })).status).toBe(200);
    expect(vi.mocked(prepareTurn).mock.calls[0][0].text).toHaveLength(4001);
    const res = await POST(send({ text: "x".repeat(30001) }) as never, { params });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Keep a message under 30,000 characters.");
  });
```

Create `src/components/scripts/generate/__tests__/copilot-chat-message.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CopilotChatMessage } from "../copilot-chat-message";

const actions = { busy: false, send: () => {}, resolve: () => {} };
const mine = (content: string) => ({ id: "m1", role: "user" as const, content, card: null, createdAt: "t" });

describe("the person's message", () => {
  it("shows a short message whole", () => {
    expect(renderToStaticMarkup(<CopilotChatMessage message={mine("Make it warmer")} actions={actions} avatars={[]} />)).not.toContain('data-clipped="true"');
  });
  it("clips a pasted script to its first lines, fading out", () => {
    const pasted = Array.from({ length: 40 }, (_, i) => `| row ${i} | visual | vo |`).join("\n");
    expect(renderToStaticMarkup(<CopilotChatMessage message={mine(pasted)} actions={actions} avatars={[]} />)).toContain('data-clipped="true"');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/scripts/copilot/__tests__/message-text.test.ts "src/app/api/clients/[id]/scripts/[scriptId]/turn/route.test.ts" src/components/scripts/generate/__tests__/copilot-chat-message.test.tsx`
Expected: FAIL. `isLongText` is not exported, the 4,001-character message gets a 400, and there's no `data-clipped`.

- [ ] **Step 3: Implement**

`src/lib/scripts/copilot/constants.ts`, after `MAX_MESSAGE_CHARS`:

```ts
/** A whole pasted script must fit in one message (paste-a-script spec §5.1): Reel 07 with the
 *  disclaimer block is about 4,000 characters, and a client's Word script with notes runs longer.
 *  The turn sends a long message that is not a script back with MAX_MESSAGE_CHARS (import.ts). */
export const MAX_PASTE_CHARS = 30000;
```

`src/lib/scripts/copilot/message-text.ts`, at the end:

```ts
/** A message long enough to show clipped (a pasted script): the message box and the sent bubble
 *  show its first few lines, fading out, never the whole script (paste-a-script spec §3). */
export function isLongText(text: string): boolean {
  return text.length > 600 || text.split("\n").length > 6;
}
```

`src/components/scripts/generate/copilot-composer.tsx`: import `cn` from `@/lib/utils`, `isLongText` from `@/lib/scripts/copilot/message-text`, and `MAX_PASTE_CHARS` in place of `MAX_MESSAGE_CHARS`. Then change the textarea to:

```tsx
        <InputGroupTextarea
          rows={2}
          value={text}
          maxLength={MAX_PASTE_CHARS}
          placeholder="Tell the copilot about the reel, ask for a change, or paste a script…"
          // A pasted script shows its first lines, fading out; the box never grows past them.
          className={cn("max-h-36 overflow-y-auto", isLongText(text) && "[mask-image:linear-gradient(to_bottom,#000_55%,transparent)]")}
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
```

`src/components/scripts/generate/copilot-chat-message.tsx`: import `isLongText` beside `messageParagraphs`. Replace the `mine ? (<div …>{message.content}</div>)` branch with `<PersonText content={message.content} />`, and add:

```tsx
/** The person's words. A pasted script shows its first lines, fading out, as in the message box. */
function PersonText({ content }: { content: string }) {
  const long = isLongText(content);
  return (
    <div
      data-clipped={long}
      className={cn(
        "max-w-[92%] whitespace-pre-wrap rounded-2xl bg-muted px-3.5 py-2.5 text-sm leading-relaxed",
        long && "max-h-40 overflow-hidden [mask-image:linear-gradient(to_bottom,#000_55%,transparent)]",
      )}
    >
      {content}
    </div>
  );
}
```

`turn/route.ts`: import `MAX_PASTE_CHARS` (drop `MAX_MESSAGE_CHARS` from that import), and change line 32 to:

```ts
      if (text.length > MAX_PASTE_CHARS) return apiError(`Keep a message under ${MAX_PASTE_CHARS.toLocaleString("en")} characters.`, 400);
```

Update the route's header comment to `{ text (≤ 30,000: a pasted script), leadAvatarId? }`.

- [ ] **Step 4: Run them to see them pass**

Run the Step 2 command. Expected: PASS. Then run the whole turn route test file. If an existing test asserted the old "4000" text, update its expectation to the new 30,000 copy.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scripts/copilot/constants.ts src/lib/scripts/copilot/message-text.ts src/components/scripts/generate/copilot-composer.tsx src/components/scripts/generate/copilot-chat-message.tsx "src/app/api/clients/[id]/scripts/[scriptId]/turn" src/lib/scripts/copilot/__tests__/message-text.test.ts src/components/scripts/generate/__tests__/copilot-chat-message.test.tsx
git commit -m "feat(scripts): a pasted script fits in one message and shows clipped

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The word-for-word check

**Files:**
- Create: `src/lib/scripts/copilot/import-check.ts`
- Create: `src/lib/scripts/fixtures/reel-07-paste.ts`
- Test: `src/lib/scripts/copilot/__tests__/import-check.test.ts`

**Interfaces:**
- Produces: `stripFormatting(text: string): string`, `normalizeForMatch(text: string): string`, `type Mismatch = { shotId: string; index: number; fields: ("vo" | "onScreenText")[] }`, `unmatchedShots(doc: ScriptDoc, paste: string): Mismatch[]`. Fixture: `REEL_07_PASTE: string`.

- [ ] **Step 1: Create the paste fixture**

`src/lib/scripts/fixtures/reel-07-paste.ts`. This is the text a person copies out of `docs/sample-scripts/Jackfruit365_Reel_Script_Outlines_Oct26-Mar27.docx.md`: the disclaimer block (lines 129–137) and then Reel 07 (lines 375–406), unchanged, markdown escapes included. Use `String.raw` so the backslashes stay:

```ts
// Paste-a-script spec §7 — what a person pastes: the outline document's disclaimer block, then
// Reel 07, exactly as the .docx → .md export has them (escapes and bold markers included).
export const REEL_07_PASTE = String.raw`**Disclaimers (on screen at the outro, verbatim)**

* **D1, on every reel.** Helps control blood sugar levels when used as part of a diabetic diet and lifestyle. Individual results may vary.

* **D2, on every reel.** Not a substitute for prescribed medication. Consult your doctor before changing your diabetes management.

* **D3, whenever the study, the journal or the claim card with the study line appears.** Based on a randomised, double-blind, placebo-controlled study, Nutrition & Diabetes, 2021\.

* **D4, on the pack end card of every reel.** This is not a medicine. FSSAI Lic. No. \_\_\_\_ (licence number to be supplied by the brand).

**Reel 07  Greek yogurt before the 9:30 stand-up**

| UGC · REVIEW · OPTION | Pan-India   ·   Thu 19 Nov   ·   Diabetes Awareness Month   ·   9:16, 45 to 55 sec   ·   AI-generated |
| :---- | :---- |

**Purpose.**  A younger viewer's version of the habit: plain Greek yogurt for breakfast on a workday, with the flour stirred in.

**Character.**  Rhea, 27, Bengaluru, a product designer at a start-up. Oversized shirt, hair in a claw clip, earphones round her neck. Quick and dry, English with an easy Bengaluru mix.

**Setting and camera.**  Compact rented flat kitchen at 8:15 am. Steel bowl, a tub of plain Greek yogurt with no label, chopped apple, a handful of nuts, laptop open at the end of the counter. Natural light. Handheld, top-down on the bowl.

| Beat | Visual | VO | On-screen text |
| :---- | :---- | :---- | :---- |
| **HOOK 0-4s** | Rhea spoons yogurt into a steel bowl with one hand and checks her phone with the other. | Okay, breakfast. I've got eight minutes before my stand-up. | **8 minutes** |
| **INTRO 4-9s** | Plain Greek yogurt in the bowl, a small pile of nuts, an apple on the board. | Plain Greek yogurt, some nuts, half an apple. That's most of my mornings. | **Plain yogurt. Nuts. Apple.** |
| **STORY 9-15s** | Her phone buzzes with a calendar reminder. She shrugs and keeps going. | I'm not cooking at eight in the morning, so whatever I add has to be quick. | **Seconds, not minutes** |
| **STEP 15-21s** | Top-down: one level tablespoon of flour is stirred through the yogurt until smooth. | One level tablespoon of the jackfruit flour, straight into the yogurt. Stir till it's smooth. | **Just 1 tablespoon per meal** |
| **REVIEW 21-29s** | A real Amazon review card slides in with a Verified Purchase badge. Rhea glances at it. Use a real, cleared review on this theme: adding it to a quick breakfast. | One customer wrote on Amazon: "\[real review, verbatim\]". | **Customer review on Amazon** **Verified Purchase** |
| **BODY 29-35s** | Chopped apple and nuts go on top. Rhea eats standing, one eye on the laptop. | Apple and nuts on top, and I eat it standing up, one eye on my mail. | **Breakfast, done.** |
| **PAYOFF 35-40s** | She rinses the bowl, puts the pack back beside the yogurt tub and picks up her tote. | Bowl in the sink, bag on my shoulder, out by nine. Mostly. | **Out by nine.** |
| **PROOF 40-45s** | Hold on the claim card over the pack. | It's 100% green jackfruit, nothing else. And it's clinically tested. | **Helps control blood sugar levels\*** **100% green jackfruit. Nothing else.** |
| **OUTRO 45-50s** | Pack on the counter beside the yogurt tub. | Jackfruit365 Green Jackfruit Flour. Available on Amazon. | **Pack shot. Available on Amazon. Disclaimer line.** |

**Watch-outs**

* Plain yogurt only. No flavoured or sweetened yogurt, honey or granola on screen.

* No protein, muscle, weight-loss or 'diet food' language. The flour is not described as protein or as a fat-burner.

* Rhea is an adult in her late 20s. Say nothing about her own sugar or health.

* Unlabelled tub, so no real yogurt brand appears.
`;
```

Before committing, diff the fixture's text against the source file's lines 129–137 and 375–406, and fix any line that differs.

- [ ] **Step 2: Write the failing tests**

`src/lib/scripts/copilot/__tests__/import-check.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";
import { scriptDocSchema, type ScriptDoc } from "@/lib/scripts/schema";
import { REEL_07_PASTE } from "@/lib/scripts/fixtures/reel-07-paste";
import { normalizeForMatch, stripFormatting, unmatchedShots } from "../import-check";

const base = scriptDocSchema.parse(reel01);
const withShots = (shots: { vo: string; onScreenText: string }[]): ScriptDoc => ({
  ...base,
  shots: shots.map((s, i) => ({ ...base.shots[0], id: `s0${i + 1}`, ...s })),
});

describe("stripFormatting", () => {
  it("drops markdown escapes and bold markers, never words (Review Focus 1)", () => {
    expect(stripFormatting(String.raw`"\[real review, verbatim\]"`)).toBe('"[real review, verbatim]"');
    expect(stripFormatting(String.raw`**Helps control blood sugar levels\***`)).toBe("Helps control blood sugar levels*");
    expect(stripFormatting(String.raw`FSSAI Lic. No. \_\_\_\_ (licence`)).toBe("FSSAI Lic. No. ____ (licence");
    expect(stripFormatting("2021\\.")).toBe("2021.");
  });
});

describe("normalizeForMatch", () => {
  it("ignores spacing and quote style", () => {
    expect(normalizeForMatch("It’s  100%\ngreen")).toBe(normalizeForMatch("It's 100% green"));
    expect(normalizeForMatch("“hi”")).toBe('"hi"');
  });
  it("keeps case and wording", () => {
    expect(normalizeForMatch("Stir till")).not.toBe(normalizeForMatch("stir until"));
  });
});

describe("unmatchedShots", () => {
  it("passes Reel 07's lines as written, card lines joined and placeholder unescaped", () => {
    const doc = withShots([
      { vo: "Okay, breakfast. I've got eight minutes before my stand-up.", onScreenText: "8 minutes" },
      { vo: 'One customer wrote on Amazon: "[real review, verbatim]".', onScreenText: "Customer review on Amazon\nVerified Purchase" },
      { vo: "It’s 100% green jackfruit, nothing else. And it’s clinically tested.", onScreenText: "Helps control blood sugar levels* 100% green jackfruit. Nothing else." },
      { vo: "", onScreenText: "" },
    ]);
    expect(unmatchedShots(doc, REEL_07_PASTE)).toEqual([]);
  });

  it("names a shot whose VO or card the import changed (success 10)", () => {
    const doc = withShots([
      { vo: "Okay, breakfast. I've got eight minutes before my stand-up.", onScreenText: "8 minutes" },
      { vo: "Plain Greek yoghurt, some nuts, half an apple.", onScreenText: "Plain yogurt. Nuts. Apple." },
      { vo: "Bowl in the sink, bag on my shoulder, out by nine. Mostly.", onScreenText: "Out by 9." },
    ]);
    expect(unmatchedShots(doc, REEL_07_PASTE)).toEqual([
      { shotId: "s02", index: 1, fields: ["vo"] },
      { shotId: "s03", index: 2, fields: ["onScreenText"] },
    ]);
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run src/lib/scripts/copilot/__tests__/import-check.test.ts`
Expected: FAIL, because `../import-check` doesn't exist.

- [ ] **Step 4: Implement**

`src/lib/scripts/copilot/import-check.ts`:

```ts
import type { ScriptDoc } from "../schema";

// Paste-a-script spec §4.1 and §4.4: only formatting is removed from a paste, and afterwards every
// shot's VO and on-screen text must still be found in the pasted text, so "word for word" is
// checked, not trusted. Spacing and quote style are ignored; wording, case and spelling never are.

/** Markdown's formatting, not the script's words. Bold markers are dropped first, only where they
 *  are not escaped, so an escaped "\_\_\_\_" keeps its four underscores; then backslash escapes. */
export function stripFormatting(text: string): string {
  return text
    .replace(/(?<!\\)(\*\*|__)/g, "")
    .replace(/\\([\\`*_{}[\]()#+\-.!|<>~"])/g, "$1");
}

export function normalizeForMatch(text: string): string {
  return stripFormatting(text)
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export type Mismatch = { shotId: string; index: number; fields: ("vo" | "onScreenText")[] };

/** Each shot with a VO or on-screen text that is not in the paste as written. An empty field passes:
 *  a beat's later shots carry nothing (the carry rule, D327). */
export function unmatchedShots(doc: ScriptDoc, paste: string): Mismatch[] {
  const haystack = normalizeForMatch(paste);
  const found = (text: string) => {
    const n = normalizeForMatch(text);
    return n === "" || haystack.includes(n);
  };
  return doc.shots.flatMap((s, index) => {
    const fields = (["vo", "onScreenText"] as const).filter((f) => !found(s[f]));
    return fields.length > 0 ? [{ shotId: s.id, index, fields: [...fields] }] : [];
  });
}
```

Note: the card "Customer review on Amazon\nVerified Purchase" matches the paste's `**Customer review on Amazon** **Verified Purchase**` because both normalise to one space.

- [ ] **Step 5: Run them to see them pass**

Run the Step 3 command. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/scripts/copilot/import-check.ts src/lib/scripts/fixtures/reel-07-paste.ts src/lib/scripts/copilot/__tests__/import-check.test.ts
git commit -m "feat(scripts): a word-for-word check of an imported script against its paste

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: A guess settles when its part is edited

**Files:**
- Modify: `src/lib/scripts/copilot/schema.ts:48-57` (`scriptNotesSchema`)
- Create: `src/lib/scripts/copilot/guesses.ts`
- Modify: `src/lib/scripts/copilot/change.ts`
- Test: `src/lib/scripts/copilot/__tests__/guesses.test.ts` (new), `src/lib/scripts/copilot/__tests__/change.test.ts`

**Interfaces:**
- Produces: confirmation items gain `paths?: string[]` (field paths as in `fields.ts`: `shots.<id>.lengthSeconds`, `cast.<id>.name`, …). `settleGuesses(before: ScriptDoc, after: ScriptDoc, notes: ScriptNotes): ScriptNotes` returns the same object when nothing settles. `Change<T>`'s success variant gains `replaces?: true`.

- [ ] **Step 1: Write the failing tests**

`src/lib/scripts/copilot/__tests__/guesses.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";
import { scriptDocSchema } from "@/lib/scripts/schema";
import { settleGuesses } from "../guesses";
import type { ScriptNotes } from "../schema";

const doc = scriptDocSchema.parse(reel01);
const [s1, s2] = doc.shots;
const notes: ScriptNotes = {
  brief: "",
  confirmations: [
    { id: "g1", text: "Lengths were estimated.", confirmed: false, paths: [`shots.${s1.id}.lengthSeconds`, `shots.${s2.id}.lengthSeconds`] },
    { id: "c1", text: "Sun 1 Nov is Kerala Piravi", confirmed: false },
  ],
};
const withLength = (id: string, n: number) => ({ ...doc, shots: doc.shots.map((s) => (s.id === id ? { ...s, lengthSeconds: n } : s)) });

describe("settleGuesses", () => {
  it("settles a guess when the person changes a field it filled", () => {
    const out = settleGuesses(doc, withLength(s2.id, s2.lengthSeconds + 1), notes);
    expect(out.confirmations.map((c) => c.confirmed)).toEqual([true, false]);
  });
  it("returns the notes untouched when no guessed field changed", () => {
    const edited = { ...doc, header: { ...doc.header, title: "New title" } };
    expect(settleGuesses(doc, edited, notes)).toBe(notes);
  });
  it("does not settle on a removed shot: a missing field is not an edit", () => {
    const removed = { ...doc, shots: doc.shots.filter((s) => s.id !== s1.id) };
    expect(settleGuesses(doc, removed, notes)).toBe(notes);
  });
});
```

Append to `src/lib/scripts/copilot/__tests__/change.test.ts` (inside the existing `describe`; add `type ScriptNotes` to the `../schema` import):

```ts
  it("an edit to a guessed field settles that guess in the same save", async () => {
    const guess: ScriptNotes = { brief: "", confirmations: [{ id: "g1", text: "Beats were added.", confirmed: false, paths: [`shots.${doc.shots[0].id}.beat`] }] };
    const current = { ...script(1), notes: guess };
    const save = vi.fn(async (v: number) => script(v + 1));
    const edited = { ...current.doc!, shots: current.doc!.shots.map((s, i) => (i === 0 ? { ...s, beat: "OPEN" } : s)) };
    await changeWithRetry({ read: async () => current, save }, () => ({ patch: { doc: edited }, result: null }));
    expect(save.mock.calls[0][1].notes?.confirmations[0].confirmed).toBe(true);
  });

  it("a patch that replaces the draft keeps the guesses it brings", async () => {
    const fresh: ScriptNotes = { brief: "", confirmations: [{ id: "g1", text: "Beats were added.", confirmed: false, paths: [`shots.${doc.shots[0].id}.beat`] }] };
    const save = vi.fn(async (v: number) => script(v + 1));
    const replaced = { ...doc, shots: doc.shots.map((s, i) => (i === 0 ? { ...s, beat: "OPEN" } : s)) };
    await changeWithRetry({ read: async () => script(1), save }, () => ({ patch: { doc: replaced, notes: fresh }, result: null, replaces: true }));
    expect(save.mock.calls[0][1].notes).toBe(fresh);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/scripts/copilot/__tests__/guesses.test.ts src/lib/scripts/copilot/__tests__/change.test.ts`
Expected: FAIL. `../guesses` is missing, and the change test's guess stays unconfirmed. TypeScript also flags `paths` and `replaces` as unknown keys, but vitest still runs.

- [ ] **Step 3: Implement**

`schema.ts`, in `scriptNotesSchema`'s confirmation object, after `confirmed`:

```ts
    /** A guess's fields (paste-a-script §4.3), as fields.ts paths: changing any of them settles it.
     *  Absent on items to confirm from the card, which only a tick or the copilot settles. */
    paths: z.array(z.string().max(120)).max(200).optional(),
```

`src/lib/scripts/copilot/guesses.ts`:

```ts
import type { ScriptDoc } from "../schema";
import { parseFieldPath, readField } from "./fields";
import type { ScriptNotes } from "./schema";

// Paste-a-script spec §4.3 — a guess the import made stays an open item until the person answers
// it (the tick, or the copilot's confirm_item) or changes the part it filled. This is the second.

export function settleGuesses(before: ScriptDoc, after: ScriptDoc, notes: ScriptNotes): ScriptNotes {
  let changed = false;
  const confirmations = notes.confirmations.map((c) => {
    if (c.confirmed || !c.paths?.length) return c;
    const edited = c.paths.some((p) => {
      const target = parseFieldPath(p);
      if (!target) return false;
      const was = readField(before, notes, target);
      const now = readField(after, notes, target);
      // A field that is gone (its shot removed) was not edited.
      return was !== null && now !== null && was !== now;
    });
    if (!edited) return c;
    changed = true;
    return { ...c, confirmed: true };
  });
  return changed ? { ...notes, confirmations } : notes;
}
```

`change.ts`: import `settleGuesses` from `./guesses` and `type ScriptPatch` (already imported). Change the type and the save line:

```ts
/** What a change decides from the script as it stands: a patch to save (or null for none) and a
 *  result for the caller, or an error to return as-is. Must be pure: it can run more than once.
 *  `replaces`: the patch is a whole new draft (an accepted import), not an edit of this one. */
export type Change<T> = { patch: ScriptPatch | null; result: T; replaces?: true } | { error: string; status: number };
```

```ts
    const saved = await io.save(current.docVersion, withSettledGuesses(current, decided.patch, decided.replaces === true));
```

```ts
/** Every edit of the draft passes here, so a guess whose field it changed is settled in the same
 *  save (guesses.ts). A replacing patch brings its own guesses, so nothing is settled. */
function withSettledGuesses(current: GenerateScript, patch: ScriptPatch, replaces: boolean): ScriptPatch {
  if (replaces || !current.doc || !patch.doc) return patch;
  const notes = patch.notes ?? current.notes;
  const settled = settleGuesses(current.doc, patch.doc, notes);
  return settled === notes ? patch : { ...patch, notes: settled };
}
```

- [ ] **Step 4: Run them to see them pass**

Run the Step 2 command, then `npx vitest run src/lib/scripts/copilot` and `npx tsc --noEmit`. Expected: PASS with no type errors. `toHaveBeenCalledWith(4, { notes: EMPTY_NOTES })` in the existing change test still passes, because an untouched patch is passed through as the same object.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scripts/copilot/schema.ts src/lib/scripts/copilot/guesses.ts src/lib/scripts/copilot/change.ts src/lib/scripts/copilot/__tests__/guesses.test.ts src/lib/scripts/copilot/__tests__/change.test.ts
git commit -m "feat(scripts): a guess settles when the person edits the part it filled

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: From the model's reading to a script, notes and reply

**Files:**
- Modify: `src/lib/scripts/copilot/output.ts` (add `importOutputSchema`)
- Create: `src/lib/scripts/copilot/import.ts`
- Create: `src/lib/scripts/fixtures/reel-07-import.ts`
- Test: `src/lib/scripts/copilot/__tests__/import.test.ts`

**Interfaces:**
- Consumes: `stripFormatting`, `unmatchedShots` (Task 2); confirmation `paths` (Task 3); `toScriptDoc` (draft.ts); `fillToFinal`; `openItemsLine` (brief.ts); `nextReelNumber` (prompt-context.ts); `reelLabel`, `shotSummary` (utils.ts); `formatSeconds`, `totalSeconds` (timeline.ts).
- Produces:
  - `importOutputSchema`, `type ImportOutput` (output.ts)
  - `estimateLength(vo: string): number`
  - `resolveReelNumber(pasted: number | null, library: Script[], scriptId: string, fallback: number | null): { reelNumber: number; taken: number | null }`
  - `importSummary(doc: ScriptDoc): string` → `"Reel 07 · 9 shots · 50s"`
  - `type ImportResult = { doc: ScriptDoc; notes: ScriptNotes; reply: string }`
  - `buildImport(raw: ImportOutput, opts: { paste: string; reelNumber: number; takenReel: number | null; avatars: CopilotAvatar[] }): ImportResult | { error: string }`
  - Fixture `REEL_07_IMPORT: ImportOutput`.

- [ ] **Step 1: Add the model's output schema**

`output.ts`, after `draftOutputSchema`:

```ts
/** Paste-a-script spec §4 — the model's reading of a pasted script. The header, context, cast and
 *  shots come before `kept`, in the first draft's order, so partial-draft.ts streams it into the pane
 *  the same way. `lengthSeconds` is 0 where the paste has no timing: code estimates it (import.ts). */
export const importOutputSchema = z.object({
  readable: z.boolean(),
  problem: z.string(),
  reelNumber: z.number().int().nullable(),
  header: draftOutputSchema.shape.header,
  context: draftOutputSchema.shape.context,
  cast: z.array(z.object({ key: z.string(), name: z.string(), description: z.string(), isLead: z.boolean() })),
  shots: z.array(shotFieldsSchema),
  kept: z.array(z.object({ name: z.string(), text: z.string() })),
  guessed: z.object({ beats: z.boolean(), lead: z.boolean() }),
  summary: z.string(),
});
export type ImportOutput = z.infer<typeof importOutputSchema>;
```

- [ ] **Step 2: Create the model-answer fixture**

`src/lib/scripts/fixtures/reel-07-import.ts` is a faithful reading of `REEL_07_PASTE`: what a correct model returns. Formatting is removed and the escapes are left in one place on purpose, so the test proves `buildImport` cleans them.

```ts
import type { ImportOutput } from "@/lib/scripts/copilot/output";

// A faithful reading of REEL_07_PASTE (paste-a-script spec §7, success 1–3). The review VO keeps the
// export's backslash escapes, as a model sometimes does; buildImport must clean them (Review Focus 1).
export const REEL_07_IMPORT: ImportOutput = {
  readable: true,
  problem: "",
  reelNumber: 7,
  header: {
    title: "Greek yogurt before the 9:30 stand-up", format: "UGC · REVIEW · OPTION", region: "Pan-India",
    postDate: "Thu 19 Nov", theme: "Diabetes Awareness Month", aspect: "9:16", targetLength: "45 to 55 sec", production: "AI-generated",
  },
  context: {
    purpose: "A younger viewer's version of the habit: plain Greek yogurt for breakfast on a workday, with the flour stirred in.",
    settingAndCamera: "Compact rented flat kitchen at 8:15 am. Steel bowl, a tub of plain Greek yogurt with no label, chopped apple, a handful of nuts, laptop open at the end of the counter. Natural light. Handheld, top-down on the bowl.",
    disclaimers: [
      "D1, on every reel. Helps control blood sugar levels when used as part of a diabetic diet and lifestyle. Individual results may vary.",
      "D2, on every reel. Not a substitute for prescribed medication. Consult your doctor before changing your diabetes management.",
      "D4, on the pack end card of every reel. This is not a medicine. FSSAI Lic. No. ____ (licence number to be supplied by the brand).",
    ].join("\n"),
    watchOuts: [
      "Plain yogurt only. No flavoured or sweetened yogurt, honey or granola on screen.",
      "No protein, muscle, weight-loss or 'diet food' language. The flour is not described as protein or as a fat-burner.",
      "Rhea is an adult in her late 20s. Say nothing about her own sugar or health.",
      "Unlabelled tub, so no real yogurt brand appears.",
    ],
  },
  cast: [{
    key: "rhea", name: "Rhea", isLead: true,
    description: "Rhea, 27, Bengaluru, a product designer at a start-up. Oversized shirt, hair in a claw clip, earphones round her neck. Quick and dry, English with an easy Bengaluru mix.",
  }],
  shots: [
    { beat: "HOOK", lengthSeconds: 4, visual: "Rhea spoons yogurt into a steel bowl with one hand and checks her phone with the other.", vo: "Okay, breakfast. I've got eight minutes before my stand-up.", onScreenText: "8 minutes", onScreen: ["rhea"] },
    { beat: "INTRO", lengthSeconds: 5, visual: "Plain Greek yogurt in the bowl, a small pile of nuts, an apple on the board.", vo: "Plain Greek yogurt, some nuts, half an apple. That's most of my mornings.", onScreenText: "Plain yogurt. Nuts. Apple.", onScreen: [] },
    { beat: "STORY", lengthSeconds: 6, visual: "Her phone buzzes with a calendar reminder. She shrugs and keeps going.", vo: "I'm not cooking at eight in the morning, so whatever I add has to be quick.", onScreenText: "Seconds, not minutes", onScreen: ["rhea"] },
    { beat: "STEP", lengthSeconds: 6, visual: "Top-down: one level tablespoon of flour is stirred through the yogurt until smooth.", vo: "One level tablespoon of the jackfruit flour, straight into the yogurt. Stir till it's smooth.", onScreenText: "Just 1 tablespoon per meal", onScreen: [] },
    { beat: "REVIEW", lengthSeconds: 8, visual: "A real Amazon review card slides in with a Verified Purchase badge. Rhea glances at it. Use a real, cleared review on this theme: adding it to a quick breakfast.", vo: String.raw`One customer wrote on Amazon: "\[real review, verbatim\]".`, onScreenText: "Customer review on Amazon\nVerified Purchase", onScreen: ["rhea"] },
    { beat: "BODY", lengthSeconds: 6, visual: "Chopped apple and nuts go on top. Rhea eats standing, one eye on the laptop.", vo: "Apple and nuts on top, and I eat it standing up, one eye on my mail.", onScreenText: "Breakfast, done.", onScreen: ["rhea"] },
    { beat: "PAYOFF", lengthSeconds: 5, visual: "She rinses the bowl, puts the pack back beside the yogurt tub and picks up her tote.", vo: "Bowl in the sink, bag on my shoulder, out by nine. Mostly.", onScreenText: "Out by nine.", onScreen: ["rhea"] },
    { beat: "PROOF", lengthSeconds: 5, visual: "Hold on the claim card over the pack.", vo: "It's 100% green jackfruit, nothing else. And it's clinically tested.", onScreenText: "Helps control blood sugar levels*\n100% green jackfruit. Nothing else.", onScreen: [] },
    { beat: "OUTRO", lengthSeconds: 5, visual: "Pack on the counter beside the yogurt tub.", vo: "Jackfruit365 Green Jackfruit Flour. Available on Amazon.", onScreenText: "Pack shot. Available on Amazon. Disclaimer line.", onScreen: [] },
  ],
  kept: [{ name: "D3 disclaimer", text: "D3, whenever the study, the journal or the claim card with the study line appears. Based on a randomised, double-blind, placebo-controlled study, Nutrition & Diabetes, 2021." }],
  guessed: { beats: false, lead: false },
  summary: "Rhea's workday Greek-yogurt breakfast, with the flour stirred in.",
};
```

- [ ] **Step 3: Write the failing tests**

`src/lib/scripts/copilot/__tests__/import.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";
import { scriptDocSchema, type Script } from "@/lib/scripts/schema";
import { REEL_07_PASTE } from "@/lib/scripts/fixtures/reel-07-paste";
import { REEL_07_IMPORT } from "@/lib/scripts/fixtures/reel-07-import";
import { buildImport, estimateLength, importSummary, mightBeScript, resolveReelNumber, type ImportResult } from "../import";
import { REVIEW_PLACEHOLDER } from "../constants";
import { fillToFinal } from "../fill-to-final";
import type { ImportOutput } from "../output";

const RIYA = { id: "a1", name: "Riya", story: "27, Bengaluru", front: null, specific: false };
const opts = { paste: REEL_07_PASTE, reelNumber: 7, takenReel: null, avatars: [RIYA] };
const built = (raw: ImportOutput = REEL_07_IMPORT, o: Partial<typeof opts> = {}): ImportResult => {
  const r = buildImport(raw, { ...opts, ...o });
  if ("error" in r) throw new Error(r.error);
  return r;
};
const libraryScript = (id: string, reelNumber: number): Script => {
  const doc = scriptDocSchema.parse(reel01);
  return { id, clientId: "c1", stage: "visualise", doc: { ...doc, header: { ...doc.header, reelNumber } }, approvedAt: null, createdAt: "t", updatedAt: "t" };
};
const SCENES: ImportOutput = {
  ...REEL_07_IMPORT,
  reelNumber: null,
  shots: REEL_07_IMPORT.shots.slice(0, 3).map((s) => ({ ...s, lengthSeconds: 0 })),
  guessed: { beats: true, lead: false },
};

describe("buildImport — Reel 07 (success 1–4)", () => {
  it("keeps 9 shots with the outline's beats and lengths, and its words exactly", () => {
    const { doc } = built();
    expect(doc.shots.map((s) => s.beat)).toEqual(["HOOK", "INTRO", "STORY", "STEP", "REVIEW", "BODY", "PAYOFF", "PROOF", "OUTRO"]);
    expect(doc.shots.map((s) => s.lengthSeconds)).toEqual([4, 5, 6, 6, 8, 6, 5, 5, 5]);
    expect(doc.shots[0].vo).toBe("Okay, breakfast. I've got eight minutes before my stand-up.");
  });

  it("carries the header, the lead, the watch-outs and the disclaimers as written", () => {
    const { doc } = built();
    expect(doc.header).toEqual({ ...REEL_07_IMPORT.header, reelNumber: 7 });
    expect(doc.cast).toEqual([expect.objectContaining({ name: "Rhea", isLead: true, avatarId: null, description: REEL_07_IMPORT.cast[0].description })]);
    expect(doc.context.watchOuts).toEqual(REEL_07_IMPORT.context.watchOuts);
    for (const d of ["D1, on every reel.", "D2, on every reel.", "D4, on the pack end card of every reel."]) expect(doc.context.disclaimers).toContain(d);
  });

  it("cleans the markdown escapes, so the review is the placeholder and an open item (success 3, Review Focus 1)", () => {
    const r = built();
    expect(r.doc.shots[4].vo).toBe(`One customer wrote on Amazon: "${REVIEW_PLACEHOLDER}".`);
    expect(fillToFinal(r.doc, r.notes)[0].id).toBe(`placeholder.shots.${r.doc.shots[4].id}.vo`);
  });

  it("keeps what had no place in the notes, word for word, and names it", () => {
    const r = built();
    expect(r.notes.brief).toBe(`From the pasted script:\n\n${REEL_07_IMPORT.kept[0].text}`);
    expect(r.reply).toContain("Kept in the notes, word for word: D3 disclaimer.");
  });

  it("opens the reply with what it imported, asks who plays Rhea, and ends on the open items", () => {
    const r = built();
    const paragraphs = r.reply.split("\n\n");
    expect(paragraphs[0]).toMatch(/^Imported Reel 07 · 9 shots · 50s\./);
    expect(paragraphs).toContain("Who plays Rhea? Pick an avatar below, or keep Rhea in words for now.");
    expect(paragraphs.at(-1)).toMatch(/^1 thing to settle before it's final\. First: Paste a real, cleared Amazon review/);
    expect(r.notes.confirmations).toEqual([]);
  });

  it("asks nothing about avatars when the client has none", () => {
    expect(built(REEL_07_IMPORT, { avatars: [] }).reply).not.toContain("Who plays");
  });
});

describe("buildImport — guesses (success 5, 10)", () => {
  it("estimates missing lengths and asks about them and the beat labels, each an open item tied to its fields", () => {
    const r = built(SCENES);
    expect(r.doc.shots.map((s) => s.lengthSeconds)).toEqual(SCENES.shots.map((s) => estimateLength(s.vo)));
    expect(r.notes.confirmations.map((c) => c.id)).toEqual(["g1", "g2"]);
    expect(r.notes.confirmations[0].paths).toEqual(r.doc.shots.map((s) => `shots.${s.id}.lengthSeconds`));
    expect(r.notes.confirmations[1].paths).toEqual(r.doc.shots.map((s) => `shots.${s.id}.beat`));
    expect(r.reply).toContain("Keep the timings I estimated? There were none in the paste");
    expect(r.reply).toContain("Are the beat labels right? The paste had none, so I labelled the shots HOOK, INTRO and STORY.");
  });

  it("estimates only the untimed shots when some rows have timings (Review Focus 5)", () => {
    const mixed: ImportOutput = { ...REEL_07_IMPORT, shots: REEL_07_IMPORT.shots.map((s, i) => (i === 2 || i === 6 ? { ...s, lengthSeconds: 0 } : s)) };
    const r = built(mixed);
    expect(r.doc.shots[0].lengthSeconds).toBe(4);
    expect(r.notes.confirmations[0]).toMatchObject({ text: "S3 and S7 had no timing, so their lengths were estimated from the VO.", paths: [`shots.${r.doc.shots[2].id}.lengthSeconds`, `shots.${r.doc.shots[6].id}.lengthSeconds`] });
    expect(r.reply).toContain("Keep the timings I estimated for S3 and S7?");
  });

  it("makes a Narrator the lead when nobody is named, and asks who is on screen instead of who plays them", () => {
    const r = built({ ...REEL_07_IMPORT, cast: [], shots: REEL_07_IMPORT.shots.map((s) => ({ ...s, onScreen: [] })) });
    expect(r.doc.cast).toEqual([expect.objectContaining({ name: "Narrator", isLead: true })]);
    expect(r.reply).toContain("Who is on screen? Nobody was named, so I made the lead Narrator.");
    expect(r.reply).not.toContain("Who plays");
    expect(r.notes.confirmations[0].paths).toEqual([`cast.${r.doc.cast[0].id}.name`, `cast.${r.doc.cast[0].id}.description`]);
  });

  it("names a shot whose VO the reading changed, and lists it to check", () => {
    const off: ImportOutput = { ...REEL_07_IMPORT, shots: REEL_07_IMPORT.shots.map((s, i) => (i === 1 ? { ...s, vo: "Plain Greek yoghurt, some nuts." } : s)) };
    const r = built(off);
    expect(r.reply).toContain("S2 doesn't match the paste word for word, so it's listed to check.");
    expect(r.notes.confirmations[0]).toMatchObject({ id: "g1", paths: [`shots.${r.doc.shots[1].id}.vo`], confirmed: false });
  });

  it("refuses a paste with no shots, saying what was missing (spec §5.4)", () => {
    expect(buildImport({ ...REEL_07_IMPORT, readable: false, problem: "There is no shot table in it.", shots: [] }, opts)).toEqual({ error: "There is no shot table in it." });
    expect(buildImport({ ...REEL_07_IMPORT, shots: [] }, opts)).toEqual({ error: "I couldn't find a series of shots or scenes in it." });
  });
});

describe("resolveReelNumber (spec §5.3)", () => {
  it("keeps the pasted number when it is free", () => {
    expect(resolveReelNumber(7, [libraryScript("a", 1)], "me", null)).toEqual({ reelNumber: 7, taken: null });
  });
  it("takes the next free number when another script has it", () => {
    expect(resolveReelNumber(1, [libraryScript("a", 1), libraryScript("b", 8)], "me", null)).toEqual({ reelNumber: 9, taken: 1 });
  });
  it("keeps the number when the script that has it is this one, re-pasted (Review Focus 2)", () => {
    expect(resolveReelNumber(7, [libraryScript("me", 7)], "me", null)).toEqual({ reelNumber: 7, taken: null });
  });
  it("falls back to the brief's number, then the next free one, when the paste has none", () => {
    expect(resolveReelNumber(null, [libraryScript("a", 3)], "me", 5)).toEqual({ reelNumber: 5, taken: null });
    expect(resolveReelNumber(null, [libraryScript("a", 3)], "me", null)).toEqual({ reelNumber: 4, taken: null });
  });
  it("says so in the reply when the number was taken (success 9)", () => {
    expect(built(REEL_07_IMPORT, { reelNumber: 9, takenReel: 7 }).reply).toMatch(/^Imported Reel 09 · 9 shots · 50s\. Reel 07 is taken, so this is Reel 09\./);
  });
});

describe("small pieces", () => {
  it("estimates a length from the VO read aloud, 2 to 10 seconds, 3 with no VO", () => {
    expect(estimateLength("")).toBe(3);
    expect(estimateLength("Okay.")).toBe(2);
    expect(estimateLength("one two three four five six seven eight nine ten")).toBe(4);
    expect(estimateLength("word ".repeat(60))).toBe(10);
  });
  it("sums up an import as reel, shots and length", () => {
    expect(importSummary(built().doc)).toBe("Reel 07 · 9 shots · 50s");
  });
  it("only sends long, many-line messages to the script check", () => {
    expect(mightBeScript("Make the hook punchier")).toBe(false);
    expect(mightBeScript("x".repeat(500))).toBe(false);
    expect(mightBeScript(REEL_07_PASTE)).toBe(true);
    expect(mightBeScript("x".repeat(4001))).toBe(true);
  });
});
```

- [ ] **Step 4: Run them to see them fail**

Run: `npx vitest run src/lib/scripts/copilot/__tests__/import.test.ts`
Expected: FAIL, because `../import` doesn't exist.

- [ ] **Step 5: Implement**

`src/lib/scripts/copilot/import.ts`:

```ts
import type { Script, ScriptDoc } from "../schema";
import { formatSeconds, totalSeconds } from "../timeline";
import { reelLabel, shotSummary } from "../utils";
import { openItemsLine } from "./brief";
import { MAX_MESSAGE_CHARS } from "./constants";
import { toScriptDoc } from "./draft";
import { fillToFinal } from "./fill-to-final";
import { stripFormatting, unmatchedShots } from "./import-check";
import type { ImportOutput } from "./output";
import { nextReelNumber } from "./prompt-context";
import type { CopilotAvatar, ScriptNotes } from "./schema";

// Paste-a-script spec §2–§5 — the model's reading of a pasted script becomes a script, its notes and
// the reply. The rule: what the paste has is used exactly; what it lacks is guessed and asked about.
// Plain code over the model's answer, so each promise is checked here rather than trusted.

/** The cheap gate before the quick model is asked (§5.2): a whole script is long and has many lines.
 *  Short messages, every chip among them, never pay for the check. */
export function mightBeScript(text: string): boolean {
  return text.length > MAX_MESSAGE_CHARS || (text.length >= 400 && text.split("\n").filter((l) => l.trim()).length >= 6);
}

/** A shot the paste gives no timing for: its VO read aloud at about 2.5 words a second, 2 to 10
 *  seconds; 3 for a shot with no VO. */
export function estimateLength(vo: string): number {
  const words = vo.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return 3;
  return Math.min(10, Math.max(2, Math.round(words * 0.4)));
}

/** §5.3 — the pasted number, unless another of the client's scripts has it; then the next free one.
 *  This script's own number never counts as taken, so re-pasting a reel over itself keeps it. */
export function resolveReelNumber(pasted: number | null, library: Script[], scriptId: string, fallback: number | null): { reelNumber: number; taken: number | null } {
  const others = library.filter((s) => s.id !== scriptId);
  if (pasted !== null && pasted > 0) {
    const taken = others.some((s) => s.doc.header.reelNumber === pasted);
    return taken ? { reelNumber: nextReelNumber(others), taken: pasted } : { reelNumber: pasted, taken: null };
  }
  return { reelNumber: fallback ?? nextReelNumber(others), taken: null };
}

export function importSummary(doc: ScriptDoc): string {
  return [reelLabel(doc.header.reelNumber), shotSummary(doc)].filter(Boolean).join(" · ");
}

/** "S3", "S3 and S7", "S3, S5 and S7". */
function listOf(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** Only formatting is removed (§4.1): markdown escapes and bold markers the model left in. */
function clean(out: ImportOutput): ImportOutput {
  const c = (s: string) => stripFormatting(s).trim();
  const h = out.header;
  return {
    ...out,
    header: {
      title: c(h.title), format: c(h.format), region: c(h.region), postDate: c(h.postDate),
      theme: c(h.theme), aspect: c(h.aspect), targetLength: c(h.targetLength), production: c(h.production),
    },
    context: {
      purpose: c(out.context.purpose), settingAndCamera: c(out.context.settingAndCamera),
      disclaimers: c(out.context.disclaimers), watchOuts: out.context.watchOuts.map(c).filter(Boolean),
    },
    cast: out.cast.map((m) => ({ ...m, name: c(m.name), description: c(m.description) })),
    shots: out.shots.map((s) => ({ ...s, beat: c(s.beat), visual: c(s.visual), vo: c(s.vo), onScreenText: c(s.onScreenText) })),
    kept: out.kept.map((k) => ({ name: k.name.trim(), text: c(k.text) })).filter((k) => k.text),
  };
}

export type ImportResult = { doc: ScriptDoc; notes: ScriptNotes; reply: string };

type Guess = { text: string; paths: string[] };

export function buildImport(
  raw: ImportOutput,
  opts: { paste: string; reelNumber: number; takenReel: number | null; avatars: CopilotAvatar[] },
): ImportResult | { error: string } {
  if (!raw.readable) return { error: raw.problem.trim() || "I couldn't find a series of shots or scenes in it." };
  if (raw.shots.length === 0) return { error: "I couldn't find a series of shots or scenes in it." };
  const out = clean(raw);

  // §4.3 — no timing: estimated from the VO. The model returns 0 where the paste has none.
  const untimed = out.shots.flatMap((s, i) => (s.lengthSeconds > 0 ? [] : [i]));
  const shots = out.shots.map((s, i) => (untimed.includes(i) ? { ...s, lengthSeconds: estimateLength(s.vo) } : s));
  // §4.3 — nobody named on screen: a Narrator leads.
  const leadGuessed = out.guessed.lead || out.cast.length === 0;
  const cast = out.cast.length > 0
    ? out.cast.map((m) => ({ ...m, avatarId: null }))
    : [{ key: "narrator", name: "Narrator", description: "", avatarId: null, isLead: true }];

  let doc: ScriptDoc;
  try {
    // No avatar ids are passed: an import never links an avatar (§4.3, §6).
    doc = toScriptDoc({ header: out.header, context: out.context, cast, shots, summary: out.summary }, { reelNumber: opts.reelNumber, avatarIds: new Set() });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "The script didn't hold together." };
  }

  const shotName = (i: number) => `S${i + 1}`;
  const guesses: Guess[] = [];
  const questions: string[] = [];
  if (untimed.length > 0) {
    const paths = untimed.map((i) => `shots.${doc.shots[i].id}.lengthSeconds`);
    if (untimed.length === doc.shots.length) {
      const total = formatSeconds(totalSeconds(doc.shots));
      guesses.push({ text: `Shot lengths were estimated from the VO (about ${total} s in all).`, paths });
      questions.push(`Keep the timings I estimated? There were none in the paste, so I worked them out from the VO (about ${total} s). Or give me the real ones.`);
    } else {
      const names = listOf(untimed.map(shotName));
      guesses.push({ text: `${names} had no timing, so ${untimed.length === 1 ? "its length was" : "their lengths were"} estimated from the VO.`, paths });
      questions.push(`Keep the timings I estimated for ${names}? The paste had none for ${untimed.length === 1 ? "it" : "them"}. Or give me the real ones.`);
    }
  }
  if (out.guessed.beats) {
    const beats = [...new Set(doc.shots.map((s) => s.beat).filter(Boolean))];
    guesses.push({ text: "The beat labels were added by the copilot.", paths: doc.shots.map((s) => `shots.${s.id}.beat`) });
    questions.push(`Are the beat labels right? The paste had none, so I labelled the shots ${listOf(beats)}.`);
  }
  const lead = doc.cast.find((c) => c.isLead)!;
  if (leadGuessed) {
    guesses.push({ text: `Nobody was named on screen, so the lead is ${lead.name}.`, paths: [`cast.${lead.id}.name`, `cast.${lead.id}.description`] });
    questions.push(`Who is on screen? Nobody was named, so I made the lead ${lead.name}.`);
  } else if (opts.avatars.length > 0) {
    // §4.3 — never linked here: the chips under the reply ask (suggestions.ts).
    const names = [lead, ...doc.cast.filter((c) => !c.isLead)].map((c) => c.name);
    questions.push(names.length === 1
      ? `Who plays ${names[0]}? Pick an avatar below, or keep ${names[0]} in words for now.`
      : `Who plays ${listOf(names)}? Pick an avatar below for ${names[0]} first, or keep them in words for now.`);
  }
  // §4.4 — a line the reading changed is named, and listed to check.
  const mismatches = unmatchedShots(doc, opts.paste);
  for (const m of mismatches) {
    const what = m.fields.map((f) => (f === "vo" ? "VO" : "on-screen text")).join(" and ");
    guesses.push({ text: `${shotName(m.index)}'s ${what} doesn't match the pasted script word for word. Check it against the paste.`, paths: m.fields.map((f) => `shots.${m.shotId}.${f}`) });
  }

  const notes: ScriptNotes = {
    brief: out.kept.length > 0 ? `From the pasted script:\n\n${out.kept.map((k) => k.text).join("\n\n")}`.slice(0, 8000) : "",
    confirmations: guesses.slice(0, 20).map((g, i) => ({ id: `g${i + 1}`, text: g.text.slice(0, 500), confirmed: false, paths: g.paths })),
  };

  const head = [`Imported ${importSummary(doc)}.`];
  if (opts.takenReel !== null) head.push(`${reelLabel(opts.takenReel)} is taken, so this is ${reelLabel(doc.header.reelNumber)}.`);
  if (out.kept.length > 0) head.push(`Kept in the notes, word for word: ${listOf(out.kept.map((k) => k.name || "a note"))}.`);
  if (mismatches.length > 0) {
    const one = mismatches.length === 1;
    head.push(`${listOf(mismatches.map((m) => shotName(m.index)))} ${one ? "doesn't" : "don't"} match the paste word for word, so ${one ? "it's" : "they're"} listed to check.`);
  }
  const reply = [head.join(" "), ...questions, openItemsLine(fillToFinal(doc, notes))].join("\n\n");
  return { doc, notes, reply };
}
```

Check before running: `toScriptDoc` names shots `s01…` in order, so `doc.shots[i]` is `out.shots[i]`. `carryShot` may empty a later shot's VO that repeats its beat's first line. An empty field passes `unmatchedShots`, which is intended (D327). `prompt-context.ts` imports nothing from `import.ts`, so there is no cycle.

- [ ] **Step 6: Run them to see them pass**

Run: `npx vitest run src/lib/scripts/copilot/__tests__/import.test.ts`. Expected: PASS. If the "1 thing to settle" expectation fails because `fillToFinal` finds another item, read which one. The fixture should be complete; fix the fixture, not the assertion.

- [ ] **Step 7: Commit**

```bash
git add src/lib/scripts/copilot/output.ts src/lib/scripts/copilot/import.ts src/lib/scripts/fixtures/reel-07-import.ts src/lib/scripts/copilot/__tests__/import.test.ts
git commit -m "feat(scripts): an imported script keeps the paste's words, guesses the gaps and asks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The copilot recognises a pasted script and imports it

**Files:**
- Modify: `src/prompts/script-copilot.ts` (tasks `detect`, `import`; version 3)
- Modify: `src/lib/scripts/copilot/messages.ts` (`detectPrompt`, `importPrompt`)
- Modify: `src/lib/scripts/copilot/output.ts` (`detectOutputSchema`)
- Modify: `src/lib/scripts/copilot/schema.ts` (`brief.imported`)
- Create: `src/lib/scripts/copilot/draft-call.ts`
- Create: `src/lib/scripts/copilot/import-turn.ts`
- Modify: `src/lib/scripts/copilot/turn.ts`
- Test: `src/lib/scripts/copilot/__tests__/turn.test.ts`, `src/lib/scripts/copilot/__tests__/messages.test.ts`

**Interfaces:**
- Consumes: `buildImport`, `resolveReelNumber`, `importSummary`, `mightBeScript` (Task 4); `importOutputSchema`.
- Produces:
  - `detectOutputSchema = z.object({ wholeScript: z.boolean() })`
  - `detectPrompt(base, { hasDraft: boolean; text: string }): Prompt`, `importPrompt(base, { text: string }): Prompt`
  - `streamDraftCall(deps: Pick<TurnDeps, "call" | "stream" | "onDraft">, args): Promise<z.infer<S>>`
  - `prepareImport(input: TurnInput, deps: TurnDeps, base: CopilotBase): Promise<Apply>`
  - `Brief.imported: boolean` (default `false`)
  - `export type Apply` from turn.ts
  - model call names `script_detect` (quick) and `script_import` (writer).

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/scripts/copilot/__tests__/turn.test.ts` (add the imports shown):

```ts
import { REEL_07_PASTE } from "@/lib/scripts/fixtures/reel-07-paste";
import { REEL_07_IMPORT } from "@/lib/scripts/fixtures/reel-07-import";
import { EMPTY_PARTIAL_DRAFT } from "../partial-draft";
import type { Script } from "@/lib/scripts/schema";

describe("pasting a whole script (paste-a-script spec)", () => {
  it("imports it as the first draft: detect, then read, then save the script, notes and reply", async () => {
    const m = fakeModel({ script_detect: [{ wholeScript: true }], script_import: [REEL_07_IMPORT] });
    const out = ok(await run(script(), REEL_07_PASTE, deps(m.call)));
    expect(m.calls).toEqual(["script_detect", "script_import"]);
    expect(out.patch?.doc?.shots).toHaveLength(9);
    expect(out.patch?.doc?.header.reelNumber).toBe(7);
    expect(out.patch?.brief).toMatchObject({ phase: "written", imported: true, reelNumber: 7, card: null });
    expect(out.patch?.notes?.brief).toContain("From the pasted script:");
    expect(out.result).toHaveLength(1);
    expect(out.result[0].content).toMatch(/^Imported Reel 07 · 9 shots · 50s\./);
  });

  it("shows the skeleton the moment the reading starts, as a first draft does (D366)", async () => {
    const m = fakeModel({ script_detect: [{ wholeScript: true }], script_import: [REEL_07_IMPORT] });
    const onDraft = vi.fn();
    await run(script(), REEL_07_PASTE, { ...deps(m.call), onDraft });
    expect(onDraft).toHaveBeenNthCalledWith(1, EMPTY_PARTIAL_DRAFT);
  });

  it("wins over the brief mid-way: a paste while the card is showing imports, and the card goes (Review Focus 4)", async () => {
    const brief: Brief = { ...EMPTY_BRIEF, phase: "confirm", format: { value: "UGC", status: "given" }, narrative: { value: "A. Hook A: s", status: "given" }, card: CARD };
    const m = fakeModel({ script_detect: [{ wholeScript: true }], script_import: [REEL_07_IMPORT] });
    const out = ok(await run(script({ brief }), REEL_07_PASTE, deps(m.call)));
    expect(out.patch?.brief).toMatchObject({ phase: "written", imported: true, card: null });
    expect(out.patch?.brief?.format).toEqual({ value: "UGC", status: "given" });
  });

  it("goes on with the brief when the long message is not a whole script", async () => {
    const m = fakeModel({ script_detect: [{ wholeScript: false }], script_brief_read: [extraction({ format: { action: "given", value: "UGC" } })] });
    const brief = "Notes for the reel.\n".repeat(30);
    await run(script(), brief, deps(m.call));
    expect(m.calls).toEqual(["script_detect", "script_brief_read"]);
  });

  it("sends back a message over 4,000 characters that is not a script, changing nothing (Review Focus 3)", async () => {
    const m = fakeModel({ script_detect: [{ wholeScript: false }] });
    const out = ok(await run(script(), "x".repeat(4001), deps(m.call)));
    expect(out.patch).toBeNull();
    expect(out.result[0].content).toBe("That's longer than a chat message can be (4,000 characters), and it doesn't read as a whole script. If it is one, paste the whole script, shot table included.");
  });

  it("changes nothing when the paste can't be read as a script, and says what to try (spec §5.4)", async () => {
    const m = fakeModel({ script_detect: [{ wholeScript: true }], script_import: [{ ...REEL_07_IMPORT, readable: false, problem: "There is no shot table in it.", shots: [] }] });
    const out = ok(await run(script(), REEL_07_PASTE, deps(m.call)));
    expect(out.patch).toBeNull();
    expect(out.result[0].content).toBe("I couldn't read that as a script: There is no shot table in it. Nothing was changed. Try pasting the whole script, shot table included.");
  });

  it("takes the next free reel number when the pasted one is taken (success 9)", async () => {
    const taken: Script = { id: "other", clientId: "c1", stage: "visualise", doc: { ...doc, header: { ...doc.header, reelNumber: 7 } }, approvedAt: null, createdAt: "t", updatedAt: "t" };
    const m = fakeModel({ script_detect: [{ wholeScript: true }], script_import: [REEL_07_IMPORT] });
    const apply = await prepareTurn({ script: script(), ctx: { ...ctx, library: [taken] }, text: REEL_07_PASTE, lastAssistant: "" }, deps(m.call));
    const out = ok(apply(script()));
    expect(out.patch?.doc?.header.reelNumber).toBe(8);
    expect(out.result[0].content).toContain("Reel 07 is taken, so this is Reel 08.");
  });

  it("refuses to save over a draft that appeared while it read", async () => {
    const m = fakeModel({ script_detect: [{ wholeScript: true }], script_import: [REEL_07_IMPORT] });
    const apply = await prepareTurn({ script: script(), ctx, text: REEL_07_PASTE, lastAssistant: "" }, deps(m.call));
    expect(apply(script({ doc, docVersion: 2 }))).toEqual({ error: "The script changed while I was working. Send that again.", status: 409 });
  });
});
```

Append to `src/lib/scripts/copilot/__tests__/messages.test.ts` (import `detectPrompt`, `importPrompt` beside the existing prompt imports; reuse that file's `base` object if it has one, otherwise declare `const base = { clientName: "J", kbText: "KB", library: "L", avatars: "A" };`):

```ts
describe("the paste prompts", () => {
  it("asks the detector with whether a draft exists, and gives the reader the paste whole", () => {
    expect(detectPrompt(base, { hasDraft: true, text: "PASTE" }).user).toBe("## Is there a draft already\nYes\n\n## The person's message\nPASTE");
    const p = importPrompt(base, { text: "PASTE" });
    expect(p.user).toBe("## The pasted script\nPASTE");
    expect(p.system).toContain("the pasted script outranks the rules above");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/scripts/copilot/__tests__/turn.test.ts src/lib/scripts/copilot/__tests__/messages.test.ts`
Expected: FAIL. The prompts don't exist, and the turn throws `unexpected call script_brief_read`, or calls no detector at all.

- [ ] **Step 3: Prompts and schemas**

`src/prompts/script-copilot.ts`: add two task texts before the `export`, register them, and bump `version` to 3:

```ts
const detect = `Decide whether the person's message is a whole reel script to import. A whole script has a series of shots or scenes (a shot table, numbered scenes, a scene-by-scene outline), usually with a title, a header line or character detail.
Not a whole script: a few shots to add to or change in the existing draft ("add these two shots after the hook"), a brief, notes, a pasted review, a question.
wholeScript: true only for a whole script.`;

const importScript = `The person pasted a whole reel script. Turn it into this app's script, word for word. For this task the pasted script outranks the rules above, the brand KB and the example scripts wherever they differ: never rewrite it to the house rules, and never add, drop, split or merge anything.
- Every word goes in as written: the title; purpose; setting and camera; each person's description; every shot's visual, vo and onScreenText; watch-outs; disclaimers with their labels as written ("D4, on the pack end card of every reel. …"); and the header (format, region, postDate, theme, aspect, targetLength, production), each as written. Remove only formatting: table borders, bold and other markdown markers, backslash escapes, stray line breaks. Never fix spelling or wording, typos included.
- One shot per row or scene of the paste, in order. The number of shots equals the number of rows or scenes.
- beat and lengthSeconds come from the paste: "HOOK 0-4s" is beat "HOOK" and lengthSeconds 4; "0:04-0:09" is 5. When the paste gives a shot no timing, lengthSeconds is 0; the app estimates it. When the paste has no beat labels at all, label each shot yourself (HOOK, INTRO, …) and set guessed.beats.
- cast: every person the paste names, with their description as written, and exactly one lead (the one the paste calls the lead, else the one on screen most). onScreen lists the keys of who is on screen in the shot. When nobody is named, return one person named "Narrator" as the lead and set guessed.lead.
- Square-bracket placeholders stay exactly as written.
- Anything with no place in these fields (a music cue, a props list, a director's note, a link, a disclaimer this reel does not use) goes into kept, word for word: name says in two or three words what it is ("music cue"), text is the piece as written.
- A field the paste does not give is "" (an empty list for watchOuts). Never invent it.
- reelNumber: the reel number the paste gives ("Reel 07" is 7), else null.
- readable is false only when the message has no shots or scenes to read; then problem says in one sentence what is missing.
summary: one line describing the script.`;
```

```ts
  version: 3,
  rules,
  tasks: { extract, angles, card, draft, edit, inline, detect, import: importScript },
```

`output.ts`, at the end:

```ts
/** Paste-a-script spec §5.2 — is the message a whole script (import) or anything else (the turn
 *  goes on as before). Asked of the quick model, only for long messages (import.ts mightBeScript). */
export const detectOutputSchema = z.object({ wholeScript: z.boolean() });
```

`messages.ts`, at the end:

```ts
export function detectPrompt(base: CopilotBase, i: { hasDraft: boolean; text: string }): Prompt {
  return {
    system: system(base, "detect"),
    user: [section("Is there a draft already", i.hasDraft ? "Yes" : "No"), section("The person's message", i.text)].join("\n\n"),
  };
}

export function importPrompt(base: CopilotBase, i: { text: string }): Prompt {
  return { system: system(base, "import"), user: section("The pasted script", i.text) };
}
```

`schema.ts`, `briefSchema`: add `imported: z.boolean().default(false),` after `card`. In `EMPTY_BRIEF`, add `imported: false`. Comment it: `/** The draft came from a pasted script (paste-a-script spec), so the copilot asks who plays whom. */`.

- [ ] **Step 4: Share the streaming call**

`src/lib/scripts/copilot/draft-call.ts`:

```ts
import type { z } from "zod";
import type { StreamingCall, StructuredCall } from "./model";
import { EMPTY_PARTIAL_DRAFT, parsePartialDraft, type PartialDraft } from "./partial-draft";

/** A call whose answer is shaped like a draft (header, cast, shots), streamed into the pane: the empty
 *  draft line at once (D366), then a new line each time a header field, a person or a whole shot has
 *  arrived (D337). Used by the first draft and by a pasted script's import. */
export async function streamDraftCall<S extends z.ZodType>(
  deps: { call: StructuredCall; stream?: StreamingCall; onDraft?: (draft: PartialDraft) => void },
  args: { name: string; system: string; user: string; schema: S },
): Promise<z.infer<S>> {
  deps.onDraft?.(EMPTY_PARTIAL_DRAFT);
  if (!deps.stream) return deps.call(args);
  let shown = "0:0:0";
  return deps.stream(args, (text) => {
    const partial = parsePartialDraft(text);
    if (!partial) return;
    const sig = `${Object.keys(partial.header).length}:${partial.cast.length}:${partial.shots.length}`;
    if (sig === shown) return;
    shown = sig;
    deps.onDraft?.(partial);
  });
}
```

In `turn.ts`'s `confirm` step, replace from `deps.onDraft?.(EMPTY_PARTIAL_DRAFT);` through `: await deps.call(draftArgs);` with:

```ts
      const out = await streamDraftCall(deps, draftArgs);
```

Drop the now-unused `EMPTY_PARTIAL_DRAFT` and `parsePartialDraft` imports from turn.ts, but keep `type PartialDraft`. Run `npx vitest run src/lib/scripts/copilot/__tests__/turn.test.ts -t "before the draft"`. The existing first-draft tests must still pass; this step is a pure refactor.

- [ ] **Step 5: The import turn**

`src/lib/scripts/copilot/import-turn.ts`:

```ts
import { streamDraftCall } from "./draft-call";
import { buildImport, resolveReelNumber } from "./import";
import { importPrompt, type CopilotBase } from "./messages";
import { importOutputSchema } from "./output";
import type { Apply, TurnDeps, TurnInput } from "./turn";

// Paste-a-script spec §3 — a whole script pasted into the chat. With no draft yet it becomes the
// first draft, streamed into the pane while the writer reads it.

export async function prepareImport(input: TurnInput, deps: TurnDeps, base: CopilotBase): Promise<Apply> {
  const { script, ctx, text } = input;
  const out = await streamDraftCall(deps, { name: "script_import", ...importPrompt(base, { text }), schema: importOutputSchema });
  const reel = resolveReelNumber(out.reelNumber, ctx.library, script.id, script.brief.reelNumber);
  const built = buildImport(out, { paste: text, reelNumber: reel.reelNumber, takenReel: reel.taken, avatars: ctx.avatars });
  if ("error" in built) {
    const content = `I couldn't read that as a script: ${built.error} Nothing was changed. Try pasting the whole script, shot table included.`;
    return () => ({ patch: null, result: [{ content, card: null }] });
  }
  return (current) => {
    if (current.docVersion !== script.docVersion || current.doc) {
      return { error: "The script changed while I was working. Send that again.", status: 409 };
    }
    // The pasted script wins over a brief in progress (§3 step 2); what was given stays on the brief.
    const brief = { ...current.brief, phase: "written" as const, imported: true, reelNumber: built.doc.header.reelNumber, card: null };
    return { patch: { doc: built.doc, notes: built.notes, brief }, result: [{ content: built.reply, card: null }] };
  };
}
```

`turn.ts`:
1. `export type Apply = (current: GenerateScript) => Change<Reply[]>;` (add `export`).
2. Import `MAX_MESSAGE_CHARS` from `./constants`, `mightBeScript` from `./import`, `prepareImport` from `./import-turn`, `detectPrompt` from `./messages`, `detectOutputSchema` from `./output`, and `streamDraftCall` from `./draft-call`.
3. Replace `prepareTurn`'s body:

```ts
export async function prepareTurn(input: TurnInput, deps: TurnDeps): Promise<Apply> {
  const format = input.script.doc?.header.format ?? input.script.brief.format.value;
  const base = baseFor(input.ctx, format);
  // A whole pasted script is imported, wherever the brief is (paste-a-script spec §3). The quick
  // model is asked only for long, many-line messages; chips and ordinary replies never pay for it.
  if (!input.script.doc && mightBeScript(input.text)) {
    const quick = deps.quick ?? deps.call;
    const seen = await quick({ name: "script_detect", ...detectPrompt(base, { hasDraft: false, text: input.text }), schema: detectOutputSchema });
    if (seen.wholeScript) return prepareImport(input, deps, base);
  }
  // Up to MAX_PASTE_CHARS is let in for a pasted script; anything else keeps the message limit.
  if (input.text.length > MAX_MESSAGE_CHARS) return () => ({ patch: null, result: [{ content: TOO_LONG, card: null }] });
  return input.script.doc ? prepareEdit(input, deps, base, input.script.doc) : prepareBrief(input, deps, base);
}

const TOO_LONG = `That's longer than a chat message can be (${MAX_MESSAGE_CHARS.toLocaleString("en")} characters), and it doesn't read as a whole script. If it is one, paste the whole script, shot table included.`;
```

The `!input.script.doc` condition is temporary. Task 6 removes it, when a paste over an existing draft gets its replace card.

- [ ] **Step 6: Run them to see them pass**

Run: `npx vitest run src/lib/scripts/copilot` and `npx tsc --noEmit`. Expected: PASS. If `tsc` flags a `Brief` literal that lacks `imported` (a test that builds a Brief without spreading `EMPTY_BRIEF`), add `imported: false` there. `rows.test.ts` must still pass: a stored brief without `imported` reads as `false`.

- [ ] **Step 7: Commit**

```bash
git add src/prompts/script-copilot.ts src/lib/scripts/copilot/messages.ts src/lib/scripts/copilot/output.ts src/lib/scripts/copilot/schema.ts src/lib/scripts/copilot/draft-call.ts src/lib/scripts/copilot/import-turn.ts src/lib/scripts/copilot/turn.ts src/lib/scripts/copilot/__tests__
git commit -m "feat(scripts): a pasted script is recognised and imported as the first draft

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Pasting over a draft — the replace card (server)

**Files:**
- Modify: `src/lib/scripts/copilot/schema.ts` (`importCardSchema`, `messageCardSchema`)
- Modify: `src/lib/scripts/copilot/import-turn.ts` (draft branch; `acceptImport`)
- Modify: `src/lib/scripts/copilot/turn.ts` (detect over a draft too)
- Modify: `src/lib/db/script-generate.ts:105-117` (`claimProposalCard`)
- Modify: `src/app/api/clients/[id]/scripts/[scriptId]/proposals/[messageId]/route.ts`
- Test: `src/lib/scripts/copilot/__tests__/turn.test.ts`, `src/app/api/clients/[id]/scripts/[scriptId]/proposals/[messageId]/route.test.ts`

**Interfaces:**
- Consumes: `prepareImport`, `buildImport`, `importSummary` (Tasks 4–5); `Change.replaces` (Task 3).
- Produces: `importCardSchema`, `type ImportCard = { kind: "import"; status: "pending" | "accepted" | "rejected"; summary: string; replacing: string; doc: ScriptDoc; notes: ScriptNotes; reply: string }`; `acceptImport(current: GenerateScript, card: ImportCard): Change<{ reply: string }>`; `claimProposalCard(…, card: ProposalCard | ImportCard)`.

- [ ] **Step 1: Write the failing tests**

Append to `turn.test.ts` (add `acceptImport` from `../import-turn`, `buildImport` from `../import`, `shotSummary` from `@/lib/scripts/utils`, and `type ImportCard` from `../schema`):

```ts
describe("pasting a whole script over a draft (spec §3, Q1)", () => {
  it("reads the paste first, then asks with a replace card; nothing changes and nothing streams", async () => {
    const m = fakeModel({ script_detect: [{ wholeScript: true }], script_import: [REEL_07_IMPORT] });
    const onDraft = vi.fn();
    const out = ok(await run(script({ doc }), REEL_07_PASTE, { ...deps(m.call), onDraft }));
    expect(m.calls).toEqual(["script_detect", "script_import"]);
    expect(out.patch).toBeNull();
    expect(onDraft).not.toHaveBeenCalled();
    expect(out.result[0].content).toBe("Replace the current draft with this script? Nothing changes until you choose.");
    expect(out.result[0].card).toMatchObject({ kind: "import", status: "pending", summary: "Reel 07 · 9 shots · 50s", replacing: shotSummary(doc) });
  });

  it("a few pasted rows the detector calls an edit go to the editor, not the importer (A3)", async () => {
    const rows = REEL_07_PASTE.split("\n").filter((l) => l.startsWith("| **")).slice(0, 6).join("\n");
    const m = fakeModel({ script_detect: [{ wholeScript: false }], script_edit: [{ ops: [], reply: "Which shots should these go after?" }] });
    const out = ok(await run(script({ doc }), `Add these after the hook:\n${rows}`, deps(m.call)));
    expect(m.calls).toEqual(["script_detect", "script_edit"]);
    expect(out.result[0].content).toBe("Which shots should these go after?");
  });
});

describe("acceptImport", () => {
  const built = buildImport(REEL_07_IMPORT, { paste: REEL_07_PASTE, reelNumber: 7, takenReel: null, avatars: [] });
  if ("error" in built) throw new Error(built.error);
  const card: ImportCard = { kind: "import", status: "pending", summary: "Reel 07 · 9 shots · 50s", replacing: shotSummary(doc), doc: built.doc, notes: built.notes, reply: built.reply };

  it("replaces the draft and its notes whole, and keeps the import's guesses open", () => {
    expect(acceptImport(script({ doc }), card)).toEqual({
      patch: { doc: built.doc, notes: built.notes, brief: expect.objectContaining({ phase: "written", imported: true, reelNumber: 7, card: null }) },
      result: { reply: built.reply },
      replaces: true,
    });
  });
  it("refuses a card that was already settled", () => {
    expect(acceptImport(script({ doc }), { ...card, status: "rejected" })).toEqual({ error: "That was already settled.", status: 409 });
  });
});
```

Append to the proposals `route.test.ts` (import `type ImportCard` alongside `ProposalCard`):

```ts
describe("POST .../proposals/:messageId — a pasted script's replace card", () => {
  const importCard = (): ImportCard => ({
    kind: "import", status: "pending", summary: "Reel 07 · 9 shots · 50s", replacing: "13 shots · 62s",
    doc: reel01Doc(), notes: { brief: "From the pasted script:\n\nmusic cue", confirmations: [] }, reply: "Imported Reel 01 · 9 shots · 50s.",
  });
  beforeEach(async () => {
    vi.resetAllMocks();
    await allowClient();
    vi.mocked(claimProposalCard).mockResolvedValue(true);
    vi.mocked(listScriptMessages).mockResolvedValue([{ id: MSG, role: "assistant", content: "x", card: importCard(), createdAt: "t" }]);
    vi.mocked(loadGenerateState).mockResolvedValue(stateOf(generateScript()));
  });

  it("accepting replaces the draft and posts the import's reply", async () => {
    vi.mocked(changeGenerateScript).mockImplementation(runChangeAgainst(generateScript({ doc: reel01Doc() })) as never);
    const { POST } = await import("./route");
    expect((await POST(decide("accept") as never, { params })).status).toBe(200);
    expect(vi.mocked(claimProposalCard).mock.calls[0][3]).toMatchObject({ kind: "import", status: "accepted" });
    expect(vi.mocked(insertScriptMessages).mock.calls[0][3]).toEqual([{ role: "assistant", content: "Imported Reel 01 · 9 shots · 50s.", card: null }]);
  });

  it("rejecting keeps the draft and says so", async () => {
    const { POST } = await import("./route");
    expect((await POST(decide("reject") as never, { params })).status).toBe(200);
    expect(changeGenerateScript).not.toHaveBeenCalled();
    expect(vi.mocked(insertScriptMessages).mock.calls[0][3]).toEqual([{ role: "assistant", content: "Kept the current draft.", card: null }]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/scripts/copilot/__tests__/turn.test.ts "src/app/api/clients/[id]/scripts/[scriptId]/proposals"`
Expected: FAIL. `acceptImport` and `ImportCard` don't exist yet, and a paste over a draft is not detected.

- [ ] **Step 3: Implement**

`schema.ts`: change the `../schema` import to `import { scriptDocSchema, shotSchema, type ScriptDoc } from "../schema";`. After `proposalCardSchema` add the following, and add `importCardSchema` to `messageCardSchema`'s list:

```ts
/** Paste-a-script spec §3 — a whole script pasted over a draft. It is read first (§8 Q1), so the card
 *  can say what it holds and accepting is instant; it keeps the read script until the person decides. */
export const importCardSchema = z.object({
  kind: z.literal("import"),
  status: z.enum(["pending", "accepted", "rejected"]),
  /** "Reel 07 · 9 shots · 50s" */
  summary: z.string(),
  /** The draft it would replace: "13 shots · 62s". */
  replacing: z.string(),
  doc: scriptDocSchema,
  notes: scriptNotesSchema,
  /** The import's reply, posted when the person accepts. */
  reply: z.string(),
});
export type ImportCard = z.infer<typeof importCardSchema>;
```

`import-turn.ts`: add imports `import { shotSummary } from "../utils";`, `import type { Change } from "./change";`, `importSummary` from `./import`, and `type GenerateScript, type ImportCard` from `./schema`. Then replace the body of `prepareImport` from `const out = …` down to the `"error" in built` block (inclusive) with:

```ts
  const args = { name: "script_import", ...importPrompt(base, { text }), schema: importOutputSchema };
  // Over a draft, nothing streams into the pane: the draft stays until the person chooses (§3).
  const out = script.doc ? await deps.call(args) : await streamDraftCall(deps, args);
  const reel = resolveReelNumber(out.reelNumber, ctx.library, script.id, script.doc?.header.reelNumber ?? script.brief.reelNumber);
  const built = buildImport(out, { paste: text, reelNumber: reel.reelNumber, takenReel: reel.taken, avatars: ctx.avatars });
  if ("error" in built) {
    const content = `I couldn't read that as a script: ${built.error} Nothing was changed. Try pasting the whole script, shot table included.`;
    return () => ({ patch: null, result: [{ content, card: null }] });
  }
  if (script.doc) {
    const card: ImportCard = {
      kind: "import", status: "pending", summary: importSummary(built.doc), replacing: shotSummary(script.doc),
      doc: built.doc, notes: built.notes, reply: built.reply,
    };
    return () => ({ patch: null, result: [{ content: "Replace the current draft with this script? Nothing changes until you choose.", card }] });
  }
```

Leave the rest (the no-draft `return (current) => …`) as it is. Then add:

```ts
/** The person accepted a pasted script over the draft: it replaces the draft and its notes whole,
 *  whatever was typed since (they chose the paste). `replaces` keeps its guesses open (change.ts). */
export function acceptImport(current: GenerateScript, card: ImportCard): Change<{ reply: string }> {
  if (card.status !== "pending") return { error: "That was already settled.", status: 409 };
  const brief = { ...current.brief, phase: "written" as const, imported: true, reelNumber: card.doc.header.reelNumber, card: null };
  return { patch: { doc: card.doc, notes: card.notes, brief }, result: { reply: card.reply }, replaces: true };
}
```

`turn.ts`, in `prepareTurn`: drop the `!input.script.doc &&` condition and pass `hasDraft: input.script.doc !== null` to `detectPrompt`.

`src/lib/db/script-generate.ts`: import `type ImportCard`, and make the signature `claimProposalCard(clientId: string, scriptId: string, messageId: string, card: ProposalCard | ImportCard)`. Update its doc comment to "Settles a before-and-after or replace card …".

Proposals route: import `acceptImport` from `@/lib/scripts/copilot/import-turn`. Then replace from `const card = …` through the end of the `else` block with:

```ts
      const card = message?.card?.kind === "proposal" || message?.card?.kind === "import" ? message.card : null;
      if (!card) return apiError("That change is not on this script.", 404);
      if (card.status !== "pending") return apiError("That change was already settled.", 409);

      // Claim the card first: only one decision can settle it, so two accepts never apply it twice.
      const status = decision === "accept" ? "accepted" : "rejected";
      const claimed = await claimProposalCard(clientId, scriptId, messageId, card.kind === "import" ? { ...card, status } : { ...card, status });
      if (!claimed) return apiError("That change was already settled.", 409);

      if (decision === "reject") {
        const content = card.kind === "import" ? "Kept the current draft." : "Left the script as it was.";
        await insertScriptMessages(clientId, scriptId, null, [{ role: "assistant", content, card: null }]);
      } else if (card.kind === "import") {
        // Paste-a-script spec §3: the pasted script replaces the draft.
        const outcome = await changeGenerateScript(clientId, scriptId, (current) => acceptImport(current, card));
        if ("error" in outcome) {
          await setMessageCard(clientId, scriptId, messageId, card);
          return apiError(outcome.error, outcome.status);
        }
        await insertScriptMessages(clientId, scriptId, null, [{ role: "assistant", content: outcome.result.reply, card: null }]);
      } else {
        // …the existing proposal branch, unchanged (avatarIds, acceptProposal, setMessageCard, reply)…
      }
```

Update the route's header comment to say it also settles a pasted script's replace card.

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/lib/scripts/copilot "src/app/api/clients/[id]/scripts"` and `npx tsc --noEmit`. Expected: PASS. `rows.test.ts` still passes, because an unknown card shape still reads as `null`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scripts/copilot src/lib/db/script-generate.ts "src/app/api/clients/[id]/scripts/[scriptId]/proposals"
git commit -m "feat(scripts): a script pasted over a draft is read first and offered on a replace card

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The replace card in the chat

**Files:**
- Create: `src/components/scripts/generate/copilot-import-card.tsx`
- Modify: `src/components/scripts/generate/copilot-chat-message.tsx`
- Test: `src/components/scripts/generate/__tests__/copilot-import-card.test.tsx`

**Interfaces:**
- Consumes: `ImportCard` (Task 6); `ChatActions.resolve(messageId, decision)` (existing, which already posts to the proposals route).
- Produces: `CopilotImportCard({ card, disabled, onResolve })`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";
import { scriptDocSchema } from "@/lib/scripts/schema";
import type { ImportCard } from "@/lib/scripts/copilot/schema";
import { CopilotImportCard } from "../copilot-import-card";

const card: ImportCard = {
  kind: "import", status: "pending", summary: "Reel 07 · 9 shots · 50s", replacing: "13 shots · 62s",
  doc: scriptDocSchema.parse(reel01), notes: { brief: "", confirmations: [] }, reply: "Imported.",
};
const html = (c: ImportCard) => renderToStaticMarkup(<CopilotImportCard card={c} disabled={false} onResolve={() => {}} />);

describe("the replace card", () => {
  it("says what the paste holds and what it would replace, with both choices", () => {
    const out = html(card);
    expect(out).toContain(card.doc.header.title);
    expect(out).toContain("Reel 07 · 9 shots · 50s, replacing 13 shots · 62s");
    expect(out).toContain("Replace the draft");
    expect(out).toContain("Keep the current one");
  });
  it("shows how it was settled once decided", () => {
    expect(html({ ...card, status: "accepted" })).toContain("Replaced the draft");
    expect(html({ ...card, status: "rejected" })).toContain("Kept the current draft");
    expect(html({ ...card, status: "rejected" })).not.toContain("Replace the draft");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/components/scripts/generate/__tests__/copilot-import-card.test.tsx`
Expected: FAIL, because the module is missing.

- [ ] **Step 3: Implement**

`copilot-import-card.tsx`. It follows `copilot-proposal-card.tsx`'s shell (same border, padding and badge):

```tsx
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ImportCard } from "@/lib/scripts/copilot/schema";

const STATUS: Record<Exclude<ImportCard["status"], "pending">, string> = {
  accepted: "Replaced the draft", rejected: "Kept the current draft",
};

/** Paste-a-script spec §3 — a whole script pasted over a draft. Nothing changes until the person
 *  picks; the card says what the paste holds and what it would replace (§8 Q1). */
export function CopilotImportCard({ card, disabled, onResolve }: {
  card: ImportCard;
  disabled: boolean;
  onResolve: (decision: "accept" | "reject") => void;
}) {
  return (
    <div className="flex w-full flex-col gap-3 rounded-xl border border-border bg-background p-3 text-sm">
      <div className="flex flex-col gap-0.5">
        <span className="text-eyebrow">Pasted script</span>
        <span className="font-medium">{card.doc.header.title}</span>
        <span className="text-muted-foreground">{card.summary}, replacing {card.replacing}</span>
      </div>
      {card.status === "pending" ? (
        <div className="flex gap-2">
          <Button size="sm" disabled={disabled} onClick={() => onResolve("accept")}>Replace the draft</Button>
          <Button size="sm" variant="outline" disabled={disabled} onClick={() => onResolve("reject")}>Keep the current one</Button>
        </div>
      ) : (
        <Badge variant="outline" className="self-start">{STATUS[card.status]}</Badge>
      )}
    </div>
  );
}
```

`copilot-chat-message.tsx`: import it, and after the proposal line add:

```tsx
      {card?.kind === "import" && <CopilotImportCard card={card} disabled={actions.busy} onResolve={(d) => actions.resolve(message.id, d)} />}
```

- [ ] **Step 4: Run it to see it pass**

Run the Step 2 command, then `npx vitest run src/components/scripts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/scripts/generate/copilot-import-card.tsx src/components/scripts/generate/copilot-chat-message.tsx src/components/scripts/generate/__tests__/copilot-import-card.test.tsx
git commit -m "feat(scripts): the replace card for a script pasted over a draft

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Avatar chips after an import

**Files:**
- Modify: `src/lib/scripts/copilot/import.ts` (export `NARRATOR`)
- Modify: `src/lib/scripts/copilot/suggestions.ts`
- Modify: `src/components/scripts/generate/copilot-suggestions.tsx`, `copilot-chat.tsx`, `copilot-chat-message.tsx` (`ChatActions.link`), `generate-workspace.tsx`
- Test: `src/lib/scripts/copilot/__tests__/suggestions.test.ts`; update `actions` in `src/components/scripts/generate/__tests__/copilot-chat-message.test.tsx`

**Interfaces:**
- Consumes: `brief.imported` (Task 5); `useLinkCastAvatar(clientId, scriptId)` (existing, PATCH `cast/[castId]`, which checks that the avatar is this client's and ready).
- Produces: `Suggestion.link?: { castId: string; avatarId: string }`; `avatarFits(member: { name: string; description: string }, avatar: CopilotAvatar): boolean`; `ChatActions.link: (castId: string, avatarId: string) => void`; `NARRATOR = "Narrator"`.

- [ ] **Step 1: Write the failing tests**

Append to `suggestions.test.ts` (import `avatarFits`):

```ts
describe("after an import (paste-a-script §4.3)", () => {
  const unlinked = { ...reel01, cast: reel01.cast.map((c) => ({ ...c, avatarId: null })) };
  const imported = (avatarsExtra: GenerateState["avatars"] = []) => {
    const s = state({ brief: { ...EMPTY_BRIEF, phase: "written", imported: true }, doc: unlinked });
    return { ...s, avatars: [...s.avatars, ...avatarsExtra] };
  };

  it("offers the client's avatars for the lead, a fitting one first; a tap links, it never sends", () => {
    const s = imported();
    const lead = s.script.doc!.cast.find((c) => c.isLead)!;
    const fit = { id: "a9", name: lead.name, story: "", front: null, specific: false };
    const chips = suggestionsFor({ ...s, avatars: [...s.avatars, fit] }).filter((x) => x.link);
    expect(chips[0]).toEqual({ label: `${lead.name} as ${lead.name}`, text: "", send: false, link: { castId: lead.id, avatarId: "a9" } });
    expect(chips).toHaveLength(4); // the helper's three avatars plus the fitting one
  });

  it("asks nothing once everyone is linked, and nothing for a script the copilot wrote", () => {
    const linked = { ...reel01, cast: reel01.cast.map((c) => ({ ...c, avatarId: "6f1c2b1e-0000-4000-8000-0000000000aa" })) };
    expect(suggestionsFor(state({ brief: { ...EMPTY_BRIEF, imported: true }, doc: linked })).some((x) => x.link)).toBe(false);
    expect(suggestionsFor(state({ doc: unlinked })).some((x) => x.link)).toBe(false);
  });
});

describe("avatarFits", () => {
  const rhea = { name: "Rhea", description: "27, Bengaluru, a product designer." };
  it("fits on a whole-word name match either way, case aside", () => {
    expect(avatarFits(rhea, { id: "a", name: "rhea", story: "", front: null, specific: false })).toBe(true);
    expect(avatarFits(rhea, { id: "a", name: "Priya", story: "Plays Rhea in the UGC reels", front: null, specific: false })).toBe(true);
    expect(avatarFits(rhea, { id: "a", name: "Rheana", story: "", front: null, specific: false })).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/scripts/copilot/__tests__/suggestions.test.ts`
Expected: FAIL. `avatarFits` doesn't exist and no chip has `link`.

- [ ] **Step 3: Implement**

`import.ts`: add `export const NARRATOR = "Narrator";` and use it in place of the two `"Narrator"` literals (the cast name and the key stays `"narrator"`).

`suggestions.ts`:

```ts
import { NARRATOR } from "./import";
import type { CopilotAvatar, GenerateState } from "./schema";

/** `link` makes a chip that links an avatar to a character instead of sending a message (an import
 *  asks who plays whom; paste-a-script §4.3). Only a tap links: nothing is linked unasked. */
export type Suggestion = { label: string; text: string; send: boolean; leadAvatarId?: string; link?: { castId: string; avatarId: string } };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasWord = (word: string, text: string) => word.length > 1 && new RegExp(`\\b${escapeRe(word)}\\b`, "i").test(text);

/** An avatar that plainly fits a character: either's name is a whole word in the other's name or words. */
export function avatarFits(member: { name: string; description: string }, avatar: CopilotAvatar): boolean {
  return hasWord(avatar.name.trim(), `${member.name} ${member.description}`) || hasWord(member.name.trim(), `${avatar.name} ${avatar.story}`);
}
```

In `suggestionsFor`'s draft branch, right after `const out: Suggestion[] = [];`:

```ts
  // After an import the copilot asked who plays whom: the avatars for the first character still in
  // words (the lead first), a fitting one first. A guessed Narrator is asked about in words instead.
  const member = script.brief.imported
    ? [...script.doc.cast].sort((a, b) => Number(b.isLead) - Number(a.isLead)).find((c) => !c.avatarId && c.name !== NARRATOR)
    : undefined;
  if (member && state.avatars.length > 0) {
    const ranked = [...state.avatars].sort((a, b) => Number(avatarFits(member, b)) - Number(avatarFits(member, a)));
    out.push(...ranked.map((a) => ({ label: `${avatarLabel(a, state.avatars)} as ${member.name}`, text: "", send: false, link: { castId: member.id, avatarId: a.id } })));
  }
```

`copilot-chat-message.tsx`, `ChatActions`: add

```ts
  /** Links an avatar to a character, from a chip after an import (paste-a-script §4.3). */
  link: (castId: string, avatarId: string) => void;
```

`copilot-suggestions.tsx`: add the prop `onLink: (castId: string, avatarId: string) => void`, and make the click:

```tsx
          onClick={() => (s.link ? onLink(s.link.castId, s.link.avatarId) : s.send ? onSend(s.text, s.leadAvatarId) : onFill(s.text))}
```

`copilot-chat.tsx`: pass `onLink={actions.link}` to `CopilotSuggestions`.

`generate-workspace.tsx`: import `useLinkCastAvatar`, then:

```ts
  const avatarLink = useLinkCastAvatar(clientId, scriptId);
  …
    busy: turn.isPending || proposal.isPending || avatarLink.isPending,
    …
    link: (castId: string, avatarId: string) => avatarLink.mutate({ castId, avatarId }, { onError: fail }),
```

In `__tests__/copilot-chat-message.test.tsx` (Task 1), add `link: () => {}` to `actions`.

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/lib/scripts/copilot/__tests__/suggestions.test.ts src/components/scripts` and `npx tsc --noEmit`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scripts/copilot/import.ts src/lib/scripts/copilot/suggestions.ts src/lib/scripts/copilot/__tests__/suggestions.test.ts src/components/scripts/generate
git commit -m "feat(scripts): after an import, avatar chips ask who plays each character

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Live probe, ADRs and the whole-branch check

**Files:**
- Create: `scripts/probe-script-import.itest.ts`
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` §7 (append D367–D370 after D366)

- [ ] **Step 1: The live probe**

The real writer reads Reel 07 and a scene-by-scene script, and the quick model sorts three messages. This checks the prompt, which no unit test can: success 1–3, 5, 6 and 10 on the real model.

```ts
// Paste-a-script spec §7 — the import and the detector on the REAL models. Costs a few cents.
//
//   npx vitest run --config vitest.integration.config.ts scripts/probe-script-import.itest.ts
import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.loadEnvFile(".env");
});

const BASE = {
  clientName: "Jackfruit365",
  kbText: "This client has no brand KB yet. Write from the person's description and the example scripts only, and say so.",
  library: "This client has no scripts yet. Take the format from the person's description and the house rules.",
  avatars: "The client has no saved avatars yet; describe every person in words.",
};

const SCENES = `Monday dosa

Amma, 60, Chennai, in a cotton saree, unhurried.

Scene 1. Amma pours batter on a hot tawa. VO: "Monday means dosa."
Scene 2. She stirs a spoon of the flour into the batter. VO: "One spoon of the flour, every time."
Scene 3. The family eats at the table. VO: "Nobody can tell."
Scene 4. Pack shot on the counter. VO: "Jackfruit365. On Amazon."

Music: soft veena under the whole reel.
Props: steel tumbler, banana leaf.`;

describe("pasting a script into the copilot (live)", () => {
  it("reads Reel 07 word for word, with its beats and lengths (success 1–3, 10)", async () => {
    const { structuredCaller } = await import("@/lib/scripts/copilot/model");
    const { SCRIPT_WRITER_MODEL, REVIEW_PLACEHOLDER } = await import("@/lib/scripts/copilot/constants");
    const { importPrompt } = await import("@/lib/scripts/copilot/messages");
    const { importOutputSchema } = await import("@/lib/scripts/copilot/output");
    const { buildImport } = await import("@/lib/scripts/copilot/import");
    const { unmatchedShots } = await import("@/lib/scripts/copilot/import-check");
    const { REEL_07_PASTE } = await import("@/lib/scripts/fixtures/reel-07-paste");
    const { REEL_07_IMPORT } = await import("@/lib/scripts/fixtures/reel-07-import");

    const out = await structuredCaller(SCRIPT_WRITER_MODEL)({ name: "script_import", ...importPrompt(BASE, { text: REEL_07_PASTE }), schema: importOutputSchema });
    expect(out.reelNumber).toBe(7);
    const r = buildImport(out, { paste: REEL_07_PASTE, reelNumber: 7, takenReel: null, avatars: [] });
    if ("error" in r) throw new Error(r.error);
    console.log(r.reply);
    expect(r.doc.shots.map((s) => s.beat)).toEqual(REEL_07_IMPORT.shots.map((s) => s.beat));
    expect(r.doc.shots.map((s) => s.lengthSeconds)).toEqual([4, 5, 6, 6, 8, 6, 5, 5, 5]);
    expect(unmatchedShots(r.doc, REEL_07_PASTE)).toEqual([]);
    expect(r.doc.header).toEqual({ ...REEL_07_IMPORT.header, reelNumber: 7 });
    expect(r.doc.cast.find((c) => c.isLead)?.name).toBe("Rhea");
    expect(r.doc.context.watchOuts).toEqual(REEL_07_IMPORT.context.watchOuts);
    for (const d of ["D1, on every reel.", "D2, on every reel.", "D4, on the pack end card of every reel."]) expect(r.doc.context.disclaimers).toContain(d);
    expect(r.doc.shots[4].vo).toContain(REVIEW_PLACEHOLDER);
  });

  it("guesses lengths and beats for a scene-by-scene script, and keeps the music and props (success 5, 6)", async () => {
    const { structuredCaller } = await import("@/lib/scripts/copilot/model");
    const { SCRIPT_WRITER_MODEL } = await import("@/lib/scripts/copilot/constants");
    const { importPrompt } = await import("@/lib/scripts/copilot/messages");
    const { importOutputSchema } = await import("@/lib/scripts/copilot/output");
    const { buildImport } = await import("@/lib/scripts/copilot/import");

    const out = await structuredCaller(SCRIPT_WRITER_MODEL)({ name: "script_import", ...importPrompt(BASE, { text: SCENES }), schema: importOutputSchema });
    const r = buildImport(out, { paste: SCENES, reelNumber: 1, takenReel: null, avatars: [] });
    if ("error" in r) throw new Error(r.error);
    console.log(r.reply);
    expect(r.doc.shots).toHaveLength(4);
    expect(r.reply).toContain("Keep the timings I estimated?");
    expect(r.reply).toContain("Are the beat labels right?");
    expect(r.notes.brief).toContain("soft veena under the whole reel");
    expect(r.notes.brief).toContain("steel tumbler, banana leaf");
    expect(r.doc.cast.find((c) => c.isLead)?.name).toBe("Amma");
  });

  it("tells a whole script from a few rows and a brief (spec §5.2)", async () => {
    const { structuredCaller } = await import("@/lib/scripts/copilot/model");
    const { SCRIPT_QUICK_MODEL } = await import("@/lib/scripts/copilot/constants");
    const { detectPrompt } = await import("@/lib/scripts/copilot/messages");
    const { detectOutputSchema } = await import("@/lib/scripts/copilot/output");
    const { REEL_07_PASTE } = await import("@/lib/scripts/fixtures/reel-07-paste");
    const detect = (text: string, hasDraft: boolean) =>
      structuredCaller(SCRIPT_QUICK_MODEL)({ name: "script_detect", ...detectPrompt(BASE, { hasDraft, text }), schema: detectOutputSchema });
    const rows = REEL_07_PASTE.split("\n").filter((l) => l.startsWith("| **")).slice(3, 5).join("\n");

    expect((await detect(REEL_07_PASTE, false)).wholeScript).toBe(true);
    expect((await detect(SCENES, true)).wholeScript).toBe(true);
    expect((await detect(`Add these two shots after the hook:\n${rows}`, true)).wholeScript).toBe(false);
    expect((await detect("Reel for Onam. UGC, Saraswathi leads, lunch at home, post on Sun 31 Aug. Keep it warm, no hard sell.\n".repeat(6), false)).wholeScript).toBe(false);
  });
});
```

Run: `npx vitest run --config vitest.integration.config.ts scripts/probe-script-import.itest.ts`
Expected: PASS. If a check fails, fix the `import` or `detect` task text in `src/prompts/script-copilot.ts` and run again. Don't loosen the check. Keep the two printed replies for Step 4's report.

- [ ] **Step 2: The whole branch**

Run: `npx vitest run`, `npx tsc --noEmit`, `npx eslint src/lib/scripts src/components/scripts src/prompts "src/app/api/clients/[id]/scripts"`.
Expected: all green. For pre-existing failures, see the memory notes on the kling flake and registry tests: re-run before investigating, and report anything still failing with its output.

Then in the app (`npm run dev` in the worktree, a Jackfruit365 script):
1. On a new script, paste `REEL_07_PASTE`. The composer shows a few faded lines. After sending, the pill uses writing verbs and the skeleton appears. Then 9 shots arrive, the reply opens with "Imported Reel 07 · 9 shots · 50s.", and avatar chips appear if the client has avatars.
2. Tap an avatar chip: Rhea is linked in the cast list.
3. Paste the scene script over that draft. You get the replace card. Choose Keep: nothing changes. Paste again and choose Replace: you get 4 shots, guesses listed under open items, and the music and props in the notes.
4. Change one estimated length by typing. The "Shot lengths were estimated…" item settles.

- [ ] **Step 3: ADRs**

Append after D366 in `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` §7, in its format (Decision / Why / Rejected / Refines / Originated):

- **D367 — A pasted script is imported, not written.** A long, many-line message goes to the quick model's `script_detect`, and a whole script goes to the writer's `script_import`, which reads the paste in the draft's shape and streams it into the pane. Plain code (`buildImport`) cleans the markdown, estimates missing lengths, resolves the reel number, keeps leftovers in the notes under "From the pasted script", and writes the reply. *Why:* agencies already have scripts, and the rule "use it exactly, else guess and ask" is only trustworthy where it can be checked. *Rejected:* the brief reader also classifying (it doesn't run once a draft exists); letting the model estimate lengths (code is repeatable and testable); a heuristic-only detector (it can't tell "add these two shots" from a script). *Refines →* D337, D366. *Originated →* paste-a-script spec.
- **D368 — Every imported VO and card is checked against the paste.** `unmatchedShots` ignores spacing, quote style and markdown formatting only. A mismatch is named in the reply and becomes an open item. *Why:* "word for word" is shown, not trusted. *Rejected:* fuzzy matching (it would hide a changed word).
- **D369 — A guess is an item to confirm with the fields it filled.** Confirmations gain `paths`. `changeWithRetry` settles a guess when an edit changes one of its fields, and a patch marked `replaces` (an accepted import) is exempt. *Why:* spec A2, "until answered or edited", and every write already passes through `changeWithRetry`. *Rejected:* a separate guesses list (a second open-items mechanism); settling in each route (five places to forget).
- **D370 — A paste over a draft is read first, then offered on a replace card.** The card is `kind: "import"` and is settled by the proposals route. The paste limit is 30,000 characters; a non-script message keeps 4,000. *Why:* spec Q1 (a), so accepting is instant and the card says what it holds. *Rejected:* a card first and parsing on accept (the card couldn't summarise the paste).

Also record in D367 that the avatar chips after an import link via the existing cast PATCH route, and only on a tap.

- [ ] **Step 4: Commit and report**

```bash
git add scripts/probe-script-import.itest.ts docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md
git commit -m "test(scripts): live probe for pasting a script; ADRs D367-D370

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Report to the user: the probe's two printed replies, the full test/tsc/lint results, and the four in-app checks. Then use superpowers:finishing-a-development-branch.

---

## Self-review (done while writing)

- **Spec coverage:** §3 flow → Tasks 1, 5, 6, 7. §4.1 exact words, one shot per row, beats and timings → Task 4, plus the prompt in Task 5 and the probe in Task 9. §4.2 nothing lost → Task 4 (`kept`). §4.3 guesses: timings and beats (Task 4), Narrator (Task 4), avatars (Tasks 4 and 8), placeholders (Task 4 via `fillToFinal`), a guess open until answered or edited (Tasks 3 and 4). §4.4 checked → Tasks 2 and 4. §5.1 length → Tasks 1 and 5. §5.2 what counts → Tasks 5 and 6 (A3), probe in Task 9. §5.3 reel number → Tasks 4 and 5. §5.4 failure → Tasks 4 and 5. §6 out of scope: nothing added. A5 already holds (Global Constraints). Success 1–10 → Tasks 4–9, with 1–3, 5, 6 and 10 also checked live in Task 9.
- **Placeholders:** none.
- **Types:** `ImportOutput`, `ImportResult`, `ImportCard`, `Apply`, `TurnDeps` and `Change.replaces` are named the same in every task. `buildImport` takes `{ paste, reelNumber, takenReel, avatars }` everywhere. `claimProposalCard` takes the union from Task 6 on.
- **Review Focus:** each of the five has a named test: 1 in Tasks 2 and 4, 2 in Task 4, 3 in Task 5, 4 in Task 5, 5 in Task 4.

