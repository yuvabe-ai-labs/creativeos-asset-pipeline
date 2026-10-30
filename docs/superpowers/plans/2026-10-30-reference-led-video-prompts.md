# Reference-led video prompts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop video prompts describing referenced products, replace the AI-written look block with an operator-owned "Rules for every shot" field, label every reference image with its role, clean the writer's brand context, and send the no-on-screen-text guard on every model.

**Architecture:** One new pure module (`src/lib/nodes/ref-roles.ts`) owns reference roles: parsing the writer's reading into `{id, role, name}` entries stored on the plan, and rendering the "Reference roles:" line in any lane's token dialect. The multishot writer's schema loses `look` and gains a role enum + name in its existing `references` reading; the multishot-prompt route stores that reading as `plan.refRoles` and carries the operator's rules across regenerates. The video-generate route adds the roles line (and the no-text line for Kling/Seedance) through one helper, after `selectReferences`, so it numbers only what is sent.

**Tech Stack:** Next.js route handlers, TypeScript, Vitest, OpenAI structured outputs (strict JSON schema), React (focus view).

**Spec:** [docs/superpowers/specs/2026-10-30-reference-led-video-prompts-design.md](../specs/2026-10-30-reference-led-video-prompts-design.md)

## Global Constraints

- Every wired image is still sent; `selectReferences` (D308) is unchanged. @ mentions stay optional.
- The writer never writes image tokens (D233 stands); code writes the roles line.
- `MultishotPlan.look` keeps its name in stored data — no migration. UI label: "Rules for every shot".
- Saved look text is never deleted silently; it keeps rendering.
- UI copy: plain words, no vendor names, no em-dash phrasing (memory: plain user-facing copy).
- Controls are shadcn primitives from `src/components/ui/*`; icons Lucide, 1.5 stroke.
- Run tests per file/directory (`npx vitest run <path>`), not the full suite (known timeout flakes).
- Commits: no AI attribution lines (user's global CLAUDE.md).

---

### Task 1: `ref-roles.ts` — role types, reading parser, roles line

**Files:**
- Create: `src/lib/nodes/ref-roles.ts`
- Test: `src/lib/nodes/__tests__/ref-roles.test.ts`

**Interfaces:**
- Produces:
  - `REF_ROLES: readonly ["product","person","location","storyboard","style","brand mark","other"]`
  - `type RefRole = (typeof REF_ROLES)[number]`
  - `type RefRoleEntry = { id: string; role: RefRole; name: string }`
  - `refRolesFromReading(reading: unknown, attachmentIds: string[]): RefRoleEntry[]`
  - `asRefRoles(raw: unknown): RefRoleEntry[] | undefined` (narrow a stored value)
  - `referenceRolesLine(sentIds: string[], labels: ReadonlyMap<string, {role: RefRole; name: string}>, dialect: TokenDialect | null): string`

- [ ] **Step 1: Write the failing tests** — cover: each role's clause; Omni/Kling/Seedance tokens via `imageRefDialect`/`klingImageDialect`/`seedanceImageDialect`; numbering over `sentIds` (an unsent image is skipped and the next takes its number); unlabelled ids skipped; `""` when nothing labelled or dialect null; semicolons in names become commas; `refRolesFromReading` maps `image` N to `attachmentIds[N-1]`, drops out-of-range / non-integer N, coerces an unknown role to `"other"`, trims and caps names at 60 chars, first entry per id wins; `asRefRoles` drops malformed rows and returns undefined for non-arrays.
- [ ] **Step 2: Run** `npx vitest run src/lib/nodes/__tests__/ref-roles.test.ts` — expect FAIL (module missing).
- [ ] **Step 3: Implement** `ref-roles.ts`:

```ts
import type { TokenDialect } from "./prompt-token-dialect";

export const REF_ROLES = ["product", "person", "location", "storyboard", "style", "brand mark", "other"] as const;
export type RefRole = (typeof REF_ROLES)[number];
export type RefRoleEntry = { id: string; role: RefRole; name: string };

const NAME_MAX = 60;
const isRole = (v: unknown): v is RefRole => typeof v === "string" && (REF_ROLES as readonly string[]).includes(v);

export function refRolesFromReading(reading: unknown, attachmentIds: string[]): RefRoleEntry[] {
  if (!Array.isArray(reading)) return [];
  const out: RefRoleEntry[] = [];
  for (const item of reading) {
    const n = (item as { image?: unknown })?.image;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > attachmentIds.length) continue;
    const id = attachmentIds[n - 1];
    if (out.some((e) => e.id === id)) continue;
    const role = (item as { role?: unknown }).role;
    const name = (item as { name?: unknown }).name;
    out.push({
      id,
      role: isRole(role) ? role : "other",
      name: typeof name === "string" ? name.trim().slice(0, NAME_MAX) : "",
    });
  }
  return out;
}

export function asRefRoles(raw: unknown): RefRoleEntry[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.filter(
    (e): e is RefRoleEntry =>
      !!e && typeof e === "object" && typeof (e as RefRoleEntry).id === "string" &&
      isRole((e as RefRoleEntry).role) && typeof (e as RefRoleEntry).name === "string",
  );
}

const CLAUSE: Record<RefRole, (name: string) => string> = {
  product: (n) => `is the product${n ? ` (${n})` : ""}: keep it exactly as pictured`,
  person: (n) => `is a person${n ? ` (${n})` : ""}`,
  location: (n) => `is the location${n ? ` (${n})` : ""}: the place, not a subject`,
  storyboard: (n) => `is a storyboard${n ? ` (${n})` : ""}: layout and framing only, never show the drawing`,
  style: (n) => `is a style reference${n ? ` (${n})` : ""}: light and colour only`,
  "brand mark": (n) => `is a brand mark${n ? ` (${n})` : ""}: a logo graphic, not an object`,
  other: (n) => (n ? `is ${n}` : ""),
};

export function referenceRolesLine(
  sentIds: string[],
  labels: ReadonlyMap<string, { role: RefRole; name: string }>,
  dialect: TokenDialect | null,
): string {
  if (!dialect) return "";
  const parts: string[] = [];
  for (const id of sentIds) {
    const label = labels.get(id);
    if (!label) continue;
    const token = dialect.tokenForId(id, label.name);
    const clause = CLAUSE[label.role](label.name.replace(/;/g, ","));
    if (token && clause) parts.push(`${token} ${clause}`);
  }
  return parts.length > 0 ? `Reference roles: ${parts.join(". ")}.` : "";
}
```

- [ ] **Step 4: Run the test** — expect PASS.
- [ ] **Step 5: Commit** `feat(video): reference roles module (D443)`.

### Task 2: Plan carries `refRoles`; the look stops being the writer's

**Files:**
- Modify: `src/lib/nodes/multishot-plan.ts` (type, `parsePlan`, `PlanFragment`, `mergeRefinedPlan`, `checkPlanLimits` message, doc comments)
- Test: `src/lib/nodes/__tests__/multishot-plan.test.ts`

**Interfaces:**
- Consumes: `RefRoleEntry`, `asRefRoles` (Task 1).
- Produces: `MultishotPlan.refRoles?: RefRoleEntry[]`; `mergeRefinedPlan(plan, "cut", fragment, cutId, cuts)` — scope type narrowed to `"cut"`; `PlanFragment = { text?: string }`.

- [ ] **Step 1: Tests** — `parsePlan` preserves a valid `refRoles` and drops malformed rows; omits the key when absent; `look` still parsed (stored plans). Remove/replace tests of the `"look"` merge scope. Limit message reads "Shorten the rules or the longest shots."
- [ ] **Step 2: Run** `npx vitest run src/lib/nodes/__tests__/multishot-plan.test.ts` — FAIL.
- [ ] **Step 3: Implement.**
  - Type: `look` doc becomes "D442 — Rules for every shot: the OPERATOR's text, rendered above the ladder. The writer no longer writes it; a whole regenerate carries it forward." Add `refRoles?: RefRoleEntry[]` with a D443 doc.
  - `parsePlan` return adds `...(asRefRoles(candidate.refRoles) ? { refRoles: asRefRoles(candidate.refRoles) } : {})` (compute once).
  - `PlanFragment = { text?: string }`; `mergeRefinedPlan(plan, scope: "cut", ...)` — delete the look branch.
  - `checkPlanLimits` message: "Shorten the rules or the longest shots."
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** with Task 3 (they ship together; the schema change breaks the route otherwise).

### Task 3: The multishot writers — named products, no look, role reading

**Files:**
- Modify: `src/prompts/multishot-prompt-generate.ts`, `src/prompts/multishot-prompt-kling.ts`, `src/prompts/multishot-prompt-seedance.ts`, `src/lib/avatars/presenter.ts:74` (avatar text)
- Test: `src/prompts/__tests__/multishot-prompt-generate.test.ts` (and kling/seedance prompt tests if present), `src/lib/avatars/__tests__/*` for the avatar text

**Interfaces:**
- Consumes: `REF_ROLES` (Task 1).
- Produces: `MULTISHOT_PLAN_SCHEMA` with `required: ["references", "beats"]`; `REFERENCE_READING.items` = `{ image: integer, role: enum REF_ROLES, name: string, contents: string }`; `MULTISHOT_BEAT_SCHEMA` unchanged in shape; `MULTISHOT_LOOK_SCHEMA`, `MULTISHOT_LOOK_BLOCK_RULES`, `LOOK_DESCRIPTION` deleted; new `MULTISHOT_RULES_INPUT` text block; `refineInstruction` scope `"all" | "cut"`; ids `multishot-prompt-generate@12`, `multishot-prompt-kling@9`, `multishot-prompt-seedance@8`.

- [ ] **Step 1: Tests** — system text: contains no "LOOK BLOCK", no "each one's colour and material", no "every component and colour", no "【】"; contains "Rules for every shot", the pin wording "exactly as in its reference", and "a product-only shot shows nobody"; schema has no `look`, role is an enum equal to `REF_ROLES`, reading requires `name`; `planSchemaForCuts` still enum-constrains `cutId`; all three writers share the schema object. Avatar row text no longer says "the person on camera in this shot".
- [ ] **Step 2: Run** `npx vitest run src/prompts/__tests__` — FAIL.
- [ ] **Step 3: Implement** (exact text):
  - Delete `MULTISHOT_LOOK_BLOCK_RULES`; add:

```ts
export const MULTISHOT_RULES_INPUT = `RULES FOR EVERY SHOT
The operator may give "Rules for every shot". They are added to the prompt above your beats
exactly as written. Obey them in every beat; never restate, quote or paraphrase them.

There is no look or atmosphere paragraph. Do not describe light, palette, grade or lens feel for
the sequence as a whole. A beat states light only when its shot text does.`;
```

  - `MULTISHOT_SHOT_TEXT_CONTRACT`: replace "The brand context tells you how the brand speaks, what the product is called and what it may not claim." with "The brand context tells you how the brand speaks and what it may not claim." Add after the people/props sentence: "A character reference applies only to shots whose text involves a person; a product-only shot shows nobody."
  - `MULTISHOT_SHARED_CRAFT` PRESERVATION becomes:

```
PRESERVATION
A referenced product is carried by its picture, not by your words. Name it, then pin it to the
picture in a few words whenever it is on screen: "the pouch exactly as in its reference". Never
describe its colour, material, shape, label text, lettering or logo: prose about the product
competes with the picture and the model draws a hybrid.
```

  - `referenceIdentificationBlock`: PRODUCT bullet becomes "PRODUCT — name it by what it is, in a few words ("the Jackfruit365 pouch", "the tan sliders"). Do not describe its colour, material, components, label or logo: the reference carries all of that, and prose competing with it produces a hybrid."; the BACKGROUND bullet ends "In every beat set there, name the setting in a few words ("at the podcast desk"); do not inventory its light or palette." (drop "Put it in the look block"); CHARACTER keeps wardrobe but says "in every beat the character appears in"; STYLE becomes "take nothing into words; the picture carries its light and colour."; the "A CHARACTER OR PRODUCT REFERENCE CARRIES IDENTITY" paragraph drops "into the look or"; "a short identifying phrase — colour, material, product name" becomes "a short identifying name"; the backgrounds/characters exception sentence keeps "a character applies to the shots that involve a person".
  - `SYSTEM`: opening "You return one written beat per shot." (no look); replace `${MULTISHOT_LOOK_BLOCK_RULES}` with `${MULTISHOT_RULES_INPUT}`.
  - `REFERENCE_READING`: `required: ["image","role","name","contents"]`; `role: { type: "string", enum: [...REF_ROLES], description: "This image's role. The direction or a shot instruction wins when it states one; otherwise read it from the image." }`; `name: { type: "string", description: "1 to 5 words: what the operator would call it (\"Jackfruit365 pouch\", \"podcast set\", \"James\")." }`; `contents` description drops "for a product, every component and colour" → "for a product, what it is in a few words".
  - `MULTISHOT_PLAN_SCHEMA`: drop `look` (properties and required). Delete `LOOK_DESCRIPTION`, `MULTISHOT_LOOK_SCHEMA`.
  - `refineInstruction`: `scope: "all" | "cut"`; the plan JSON sent as context is `{ beats }` only; drop the look sentence from the "all" copy-back instruction and the look branch of the narrow instruction.
  - Kling & Seedance: import `MULTISHOT_RULES_INPUT` instead of the look rules; opening line drops the look; Seedance SOUND drops "and 【】 for subtitles"; Kling budget sentence keeps 400. Bump ids with comment lines `@9 (D441–D444)` / `@8 (D441–D444)`.
  - `presenter.ts:74`: `` `${avatar.name}, ${lead ? "the" : "a"} person on camera when a shot shows someone. Take only their face, hair, build and clothing from this image, never its plain background, lighting or framing.` ``
- [ ] **Step 4: Run** `npx vitest run src/prompts/__tests__ src/lib/avatars src/lib/nodes/__tests__/multishot-plan.test.ts` — PASS.
- [ ] **Step 5: Commit** `feat(prompts): multishot writers name products, drop the look, read reference roles (D441, D442, D444)`.

### Task 4: Single-take motion prompts

**Files:**
- Modify: `src/prompts/video-prompt-shared.ts` (SPINE), `src/prompts/video-prompt-seedance.ts`, version bumps in `video-prompt-veo.ts` (5→6), `video-prompt-kling.ts` (4→5), `video-prompt-gemini-omni.ts` (1→2), `video-prompt-seedance.ts` (1→2)
- Test: existing tests under `src/prompts/__tests__/` for these records

- [ ] **Step 1: Tests** — SPINE has no "label text, logo, lettering, colours"; has "exactly as in its reference"; Seedance has no "【】" and no "label text, logo"; versions bumped.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** SPINE item 3:

```
3. Preservation — the frame and any reference carry what things look like. Name the product and
   pin it in a few words ("the jar exactly as in its reference"); never describe its colour, shape,
   label text, lettering or logo, which competes with the picture. Keep props where they are and
   the light as it is: no deformation, no added objects, no changed quantities.
```

  and its follow-up paragraph: "Do not invent new objects, people, settings, or styles that are not in the frame, and do not pad with generic scene description." (drop "but DO restate…"). MULTI-IMAGE paragraph: "do not re-describe their visual content." Seedance: SOUND TAGS drops "and 【】 for subtitles"; ASSET RESPONSIBILITY example becomes "@Image 1 is the product: keep it exactly as pictured, not its position in this frame"; PRESERVATION becomes the same wording as SPINE item 3 (export it from video-prompt-shared as `REFERENCE_PRESERVATION` and use it in both).
- [ ] **Step 4: Run** `npx vitest run src/prompts/__tests__` — PASS.
- [ ] **Step 5: Commit** `feat(prompts): single-take prompts pin products to their reference (D441)`.

### Task 5: Multishot-prompt route — rules in, roles stored, look carried

**Files:**
- Modify: `src/app/api/nodes/[id]/multishot-prompt/route.ts`, `src/lib/nodes/resolve-inputs.ts` (`buildMultishotUserTurn`)
- Test: `src/app/api/nodes/[id]/multishot-prompt/route.test.ts`, `src/lib/nodes/__tests__/resolve-inputs*.test.ts` (user turn)

**Interfaces:**
- Consumes: `refRolesFromReading` (Task 1), new schema (Task 3), `mergeRefinedPlan` "cut" (Task 2).
- Produces: `buildMultishotUserTurn({..., rules?: string})` adds `Rules for every shot (added above your beats as written; obey them, never restate them):\n<rules>` after production notes.

- [ ] **Step 1: Tests** — `scope: "look"` is treated as `"all"` (no longer special); a whole write stores `refRoles` mapped from `references[].image` to the attachment ids, in `refIds` order; a whole write with a previous plan copies its `look`; a cut refine keeps the previous `look` and `refRoles`; the user turn contains the rules block when the previous plan has rules.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
  - `scope = body?.scope === "cut" ? "cut" : "all"`.
  - Pass `rules: previousPlan?.look ?? ""` to `buildMultishotUserTurn`.
  - Schema pick: `scope === "cut" ? MULTISHOT_BEAT_SCHEMA : planSchemaForCuts(...)`; drop `MULTISHOT_LOOK_SCHEMA` import.
  - After parse, on `scope === "all"`: `{ ...parsed.plan, look: previousPlan?.look ?? "", refRoles: refRolesFromReading(raw?.references, refIds), targetModel: ... }`.
  - `refineInstruction` plan arg: `previousPlan ? renderPlanRefs(previousPlan, planCap, refIds) : { look: "", beats: [] }` stays (it reads `.beats` only now).
- [ ] **Step 4: Run** `npx vitest run "src/app/api/nodes/[id]/multishot-prompt" src/lib/nodes/__tests__` — PASS.
- [ ] **Step 5: Commit** `feat(multishot): the writer reads the rules, the plan keeps reference roles (D442, D443)`.

### Task 6: Video-generate — roles line and the no-text guard

**Files:**
- Create: `src/lib/video-gen/request-prompt.ts`
- Modify: `src/lib/video-gen/resolve-prompt.ts` (add `refRolesOfResolved`, `roleDialectOfResolved`), `src/app/api/nodes/[id]/video-generate/route.ts`
- Test: `src/lib/video-gen/__tests__/request-prompt.test.ts`, `src/lib/video-gen/__tests__/resolve-prompt.test.ts`, the video-generate route test

**Interfaces:**
- Consumes: `referenceRolesLine`, `asRefRoles` (Task 1); `NO_ON_SCREEN_TEXT_LINE` (compose-omni-prompt.ts).
- Produces:
  - `refRoleLabels(resolved, promptUpstream): Map<string, {role, name}>` — plan `refRoles` first; then any upstream row with `data.presenter` truthy and a string `data.title` not already labelled → `{ role: "person", name: title }`.
  - `roleDialectOfResolved(resolved, sentIds, singleTakeTarget?): TokenDialect | null` — multishot: `dialectForCapability(multishotCapabilityFor(resolved.targetModel), sentIds)`; single: `singleTakeRefDialect(singleTakeTarget, sentIds)`.
  - `withRequestLines(prompt: string, { provider: string; rolesLine: string }): string` — `kling`: `[rolesLine, NO_ON_SCREEN_TEXT_LINE, prompt]`; `seedance`: `[rolesLine, prompt, NO_ON_SCREEN_TEXT_LINE]`; otherwise `[rolesLine, prompt]`; empty parts dropped, joined by blank lines.
- [ ] **Step 1: Tests** — `withRequestLines` per provider and with an empty roles line; `refRoleLabels` merges plan roles and presenter fallback; route: Omni request prompt starts with "Reference roles: <IMAGE_REF_0> is the product (…)" after the header; Kling request carries "No on-screen text." ahead of the triples; inputs snapshot records the final prompt.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** In the route, after `referenceUrls` and the `renderResolvedPrompt` re-number:

```ts
const rolesLine = referenceRolesLine(
  selection.sent,
  refRoleLabels(resolved, promptUpstream),
  roleDialectOfResolved(resolved, selection.sent, singleTake),
);
prompt = withRequestLines(prompt, { provider: config.provider, rolesLine });
```

  placed before `presenterVoice` so `requestPrompt` builds on it.
- [ ] **Step 4: Run** `npx vitest run src/lib/video-gen "src/app/api/nodes/[id]/video-generate"` — PASS.
- [ ] **Step 5: Commit** `feat(video): label each reference by role; no on-screen text on every model (D443, D445)`.

### Task 7: Focus view, node card, refine — "Rules for every shot"

**Files:**
- Modify: `src/components/nodes/multishot-prompt-focus-view.tsx`, `src/components/nodes/multishot-prompt-node.tsx`, `src/components/nodes/refine-with-ai.tsx`, `src/lib/nodes/refine-suggestions.ts`, `src/lib/nodes/plan-mentions.ts`
- Test: `src/lib/nodes/__tests__/plan-mentions.test.ts`, refine-suggestions tests, `src/components/nodes/__tests__/version-viewing-ui.test.tsx`

- [ ] **Step 1: Tests** — `planMentionables` lists shots only; `resolvePlanMentions` leaves an old `plan:look` token as its bare label; `RefineScope` has no `look`; version view labels rules "Rules for every shot".
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
  - `refine-suggestions.ts`: `RefineScope = "all" | "cut"`; delete the `look` list; header comment drops the look reference.
  - `plan-mentions.ts`: delete `LOOK_MENTION_ID` and its mentionable; `resolvePlanMentions` keeps `if (id === "plan:look") return label;` for old notes.
  - `refine-with-ai.tsx`: drop `look` from HELP/PLACEHOLDER; hint "Type @ to point at a shot."
  - Focus view: the look card becomes "Rules for every shot" — `ListChecks` icon instead of `Sun`; no `RefineWithAI`/rewrite buttons; collapsed preview "None. Add rules every shot must follow." when empty; helper text "Added above every shot exactly as written. The AI never writes or changes these."; placeholder via the editor's existing prop if it has one. `postMultishotPrompt` scope type `"cut"`; toast copy drops the look arm; history card label "Rules for every shot".
  - Node card: unchanged behaviour, still shows the first line.
- [ ] **Step 4: Run** the tests above plus `npx tsc --noEmit -p .` — PASS.
- [ ] **Step 5: Commit** `feat(multishot): the look card becomes Rules for every shot (D442, YUV-371)`.

### Task 8: Writer's default brand context

**Files:**
- Modify: `src/lib/kb/parse-context.ts`, `src/components/nodes/multishot-prompt-node.tsx:121`
- Test: `src/lib/kb/__tests__/parse-context*.test.ts`

- [ ] **Step 1: Test** — `DEFAULT_MULTISHOT_PROMPT_SLICES` equals `["casting","personality","tone_of_voice","compliance"]`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** — export the constant with a D444 comment; the node uses `d.kbSlices ?? DEFAULT_MULTISHOT_PROMPT_SLICES`.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(kb): the multishot writer gets no visual slices by default (D444)`.

### Task 9: Records and verification

- [ ] Append D441–D445 to roadmap §7 (Decision / Why / Rejected / Refines / Originated → this spec).
- [ ] `npx tsc --noEmit -p .`, `npx eslint` on touched files, `npx vitest run` per touched directory.
- [ ] Commit `docs(adr): D441–D445 reference-led video prompts`.
- [ ] Live check (paid, ask first): one J365 podcast shot on Omni, old vs new prompt.
