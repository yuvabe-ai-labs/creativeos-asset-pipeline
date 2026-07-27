# Credit System 3E — Pre-Generation Estimate UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a credit-cost estimate next to each focus view's Generate button — video and
prompt compute it fully client-side (both are pure math, no network round-trip); image needs
one small server round-trip (live provider token counting can't run in the browser), which
reuses the exact same computation the real reservation already uses, so the number shown
before generating always matches what gets reserved.

**Architecture:** Video and prompt import 3B's pure functions (`computeVideoCost`,
`estimatePromptCredits`, `usdToFinalCredits`) directly and compute a derived value in render
— no new state machinery beyond what's already local to each component. Image needs a new
server-only shared function (`estimateImageGenerationCostUsd`, extracted from 3C's
already-shipped `image-generate/route.ts` — this is now a second call site for that exact
computation, so extracting it is the DRY rule this project's own `CLAUDE.md` states, not
speculative abstraction) and one new read-only API route that wraps it, called from a
300ms-debounced `useEffect` matching the debounce pattern `prompt-focus-view.tsx` already
uses for its own preview fetch.

**Tech Stack:** React (client components, `useState`/`useEffect`), Next.js route handlers.

## Global Constraints

- **Video and prompt estimates must never make a network request.** `computeVideoCost`
  (`@/lib/video-gen/cost`), `estimatePromptCredits` (`@/lib/credits/prompt-estimate`), and
  `usdToFinalCredits` (`@/lib/credits/units`) are all pure, client-importable (none carry
  `import "server-only"` — confirmed by reading each file's top import) — compute the
  estimate as a plain derived value in the render body, not in an effect.
- **The image estimate must call the exact same computation the real reservation uses.**
  `estimateImageGenerationCostUsd` (Task 1) is the one function both
  `image-generate/route.ts` (real reservation, already shipped in 3C) and
  `image-generate/estimate/route.ts` (this plan's preview-only route, Task 2) call — never
  reimplement the isOpenAI/sizeKey/output-cost/input-token logic a second time.
- **The estimate-only route must be read-only and must not affect the ledger.** It never
  calls `insertGeneration`, `reserveCredits`, or anything else that writes to
  `credit_transactions` or `generations` — it exists purely to show a number, and returns
  `{ estimatedCredits: null }` (200, not an error) when the underlying cost can't be
  determined, since a preview endpoint failing to estimate is not the same failure class as
  the real reservation failing closed (design spec §4's fail-closed rule is about the real
  reservation gate in `image-generate/route.ts`, unaffected by this plan).
- Every route this plan touches or adds still goes through `withNode` for org-isolation,
  matching every other `/api/nodes/[id]/*` route in this app — even though the estimate
  computation itself doesn't need the resolved caller/node data.
- **Scoping decision, stated explicitly rather than silently assumed:** this plan covers only
  the primary Generate button in each focus view (`image-gen-output-settings-body.tsx`'s
  `showGenerate` button; `video-gen-focus-view.tsx`'s and `prompt-focus-view.tsx`'s Generate
  buttons). The image focus view's separate Edit-mode action button
  (`ImageGenEditPanel`, a different component) is explicitly **out of scope** — it can get its
  own estimate in a later round if wanted; extending this plan to cover it would roughly
  double Task 5's size for a flow this design spec never explicitly cited.
- No automated tests for this plan (matches this repo's established convention — component/UI
  changes get build + manual verification, not fabricated tests; the two new/changed server
  files are route handlers and an I/O-bound shared function, also convention-exempt). Every
  task's verification is `npm run build` **and** `npx tsc --noEmit` — this project's `npm run
  build` has been confirmed (during 3B/3D) to miss type errors that a full `tsc --noEmit`
  catches, so both are run, not just one.

---

### Task 1: Extract `estimateImageGenerationCostUsd`, refactor 3C's reservation to use it

**Files:**
- Create: `src/lib/image-gen/estimate.ts`
- Modify: `src/app/api/nodes/[id]/image-generate/route.ts`

**Interfaces:**
- Produces: `estimateImageGenerationCostUsd(input: { modelId: string; quality: string |
  undefined; aspectRatio: string | undefined; imageSize: string | undefined; prompt: string;
  referenceUrls: string[] }): Promise<number | null>` — returns USD (not credits). The exact
  name Task 2's new route imports.

No test (I/O-bound — calls live provider token-counting endpoints via `countGeminiInputTokens`/
`countOpenAIInputTokens`). Verified by `npm run build` + `npx tsc --noEmit`.

- [ ] **Step 1: Create the shared estimate function**

```ts
// src/lib/image-gen/estimate.ts
import "server-only";
import { estimateImageOutputCost, estimateImageInputCost } from "./cost";
import { countGeminiInputTokens } from "./providers/gemini";
import { countOpenAIInputTokens, aspectRatioToOpenAISize } from "./providers/openai";

/**
 * Exact-when-possible pre-generation cost estimate for an image model, in USD. Shared by the
 * real generation route (image-generate/route.ts, which reserves against it) and the
 * estimate-only preview route (image-generate/estimate/route.ts) — the same computation
 * either way, so what's shown to the user always matches what gets reserved. Returns null
 * when estimateImageOutputCost has no priced entry for this model/quality/size — the real
 * route fails closed on null (design spec §4); the preview route just shows "unavailable".
 */
export async function estimateImageGenerationCostUsd(input: {
  modelId: string;
  quality: string | undefined;
  aspectRatio: string | undefined;
  imageSize: string | undefined;
  prompt: string;
  referenceUrls: string[];
}): Promise<number | null> {
  const isOpenAI = input.modelId.startsWith("openai:");
  const sizeKey = isOpenAI
    ? aspectRatioToOpenAISize(input.aspectRatio ?? "1:1")
    : (input.imageSize ?? "1K");

  const outputCostUsd = estimateImageOutputCost(input.modelId, input.quality, sizeKey);
  if (outputCostUsd === null) return null;

  const hasReferenceImages = input.referenceUrls.length > 0;
  const inputTokens = isOpenAI
    ? await countOpenAIInputTokens(input.prompt, input.referenceUrls)
    : await countGeminiInputTokens(input.modelId.split(":")[1], input.prompt, input.referenceUrls);
  const inputCostUsd = estimateImageInputCost(input.modelId, inputTokens, hasReferenceImages) ?? 0;

  return outputCostUsd + inputCostUsd;
}
```

- [ ] **Step 2: Update `image-generate/route.ts`'s imports**

Replace:

```ts
import { computeImageCost, estimateImageOutputCost, estimateImageInputCost } from "@/lib/image-gen/cost";
import { countGeminiInputTokens } from "@/lib/image-gen/providers/gemini";
import { countOpenAIInputTokens, aspectRatioToOpenAISize } from "@/lib/image-gen/providers/openai";
```

with:

```ts
import { computeImageCost } from "@/lib/image-gen/cost";
import { estimateImageGenerationCostUsd } from "@/lib/image-gen/estimate";
```

- [ ] **Step 3: Replace the inline estimate computation with a call to the shared function**

Replace:

```ts
    try {
      const hasReferenceImages = referenceUrls.length > 0;
      const isOpenAI = modelId.startsWith("openai:");
      const quality = validatedParams.quality as string | undefined;
      const sizeKey = isOpenAI
        ? aspectRatioToOpenAISize((validatedParams.aspect_ratio as string) ?? "1:1")
        : ((validatedParams.image_size as string) ?? "1K");

      const outputCostUsd = estimateImageOutputCost(modelId, quality, sizeKey);
      if (outputCostUsd === null) {
        throw new Error(`No cost estimate available for ${modelId} at this quality/size.`);
      }

      const inputTokens = isOpenAI
        ? await countOpenAIInputTokens(prompt, referenceUrls)
        : await countGeminiInputTokens(modelId.split(":")[1], prompt, referenceUrls);
      const inputCostUsd = estimateImageInputCost(modelId, inputTokens, hasReferenceImages) ?? 0;

      const estimatedCredits = usdToFinalCredits(outputCostUsd + inputCostUsd);
      const reservation = await reserveCredits(caller.orgId, generation.id, estimatedCredits);
      if (!reservation.ok) {
        throw new CreditLimitError("Monthly credit limit reached");
      }
```

with:

```ts
    try {
      const costUsd = await estimateImageGenerationCostUsd({
        modelId,
        quality: validatedParams.quality as string | undefined,
        aspectRatio: validatedParams.aspect_ratio as string | undefined,
        imageSize: validatedParams.image_size as string | undefined,
        prompt,
        referenceUrls,
      });
      if (costUsd === null) {
        throw new Error(`No cost estimate available for ${modelId} at this quality/size.`);
      }

      const estimatedCredits = usdToFinalCredits(costUsd);
      const reservation = await reserveCredits(caller.orgId, generation.id, estimatedCredits);
      if (!reservation.ok) {
        throw new CreditLimitError("Monthly credit limit reached");
      }
```

(`usdToFinalCredits`, `reserveCredits`, `CreditLimitError` stay imported exactly as they
already are — only the two lines shown above change.)

- [ ] **Step 4: Build and typecheck**

Run: `npm run build`
Expected: succeeds with no type errors.

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 5: Regression test**

Run: `npm test`
Expected: all existing tests still pass (this task touches no test files, and the
extraction preserves behavior exactly — same function calls, same order, same values).

- [ ] **Step 6: Commit**

```bash
git add src/lib/image-gen/estimate.ts src/app/api/nodes/\[id\]/image-generate/route.ts
git commit -m "refactor(image-gen): extract estimateImageGenerationCostUsd (shared by reservation and the new estimate preview)"
```

---

### Task 2: Image estimate-only preview route

**Files:**
- Create: `src/app/api/nodes/[id]/image-generate/estimate/route.ts`

**Interfaces:**
- Consumes: `estimateImageGenerationCostUsd` (Task 1), `usdToFinalCredits`
  (`@/lib/credits/units`), `imageGenRegistry` (`@/lib/image-gen/registry`, existing).
- Produces: `POST /api/nodes/:id/image-generate/estimate` → `{ estimatedCredits: number |
  null }` (200). The exact response shape Task 5's client-side fetch reads.

No test (route handler). Verified by `npm run build` + `npx tsc --noEmit`.

- [ ] **Step 1: Write the route**

```ts
// src/app/api/nodes/[id]/image-generate/estimate/route.ts
import { estimateImageGenerationCostUsd } from "@/lib/image-gen/estimate";
import { usdToFinalCredits } from "@/lib/credits/units";
import { imageGenRegistry } from "@/lib/image-gen/registry";
import { apiError, apiOk, withNode } from "@/lib/api/route-helpers";

// Read-only preview — never writes to generations or credit_transactions. Reuses the exact
// same computation image-generate/route.ts reserves against (estimateImageGenerationCostUsd),
// so the number shown here always matches what the real request would reserve.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withNode(params, async () => {
    const body = (await req.json().catch(() => null)) as
      | {
          modelId?: unknown;
          quality?: unknown;
          aspect_ratio?: unknown;
          image_size?: unknown;
          prompt?: unknown;
          referenceUrls?: unknown;
        }
      | null;

    const modelId = typeof body?.modelId === "string" ? body.modelId : null;
    if (!modelId || !imageGenRegistry[modelId]) {
      return apiError(`Unknown modelId: ${modelId}`, 400);
    }
    const prompt = typeof body?.prompt === "string" ? body.prompt : "";
    const referenceUrls = Array.isArray(body?.referenceUrls)
      ? (body.referenceUrls as unknown[]).filter((u): u is string => typeof u === "string")
      : [];

    const costUsd = await estimateImageGenerationCostUsd({
      modelId,
      quality: typeof body?.quality === "string" ? body.quality : undefined,
      aspectRatio: typeof body?.aspect_ratio === "string" ? body.aspect_ratio : undefined,
      imageSize: typeof body?.image_size === "string" ? body.image_size : undefined,
      prompt,
      referenceUrls,
    });

    return apiOk({
      estimatedCredits: costUsd === null ? null : usdToFinalCredits(costUsd),
    });
  });
}
```

- [ ] **Step 2: Build and typecheck**

Run: `npm run build`
Expected: succeeds with no type errors.

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/nodes/\[id\]/image-generate/estimate/route.ts
git commit -m "feat(credits): add read-only image-generate/estimate preview route"
```

---

### Task 3: Video estimate — client-side, synchronous

**Files:**
- Modify: `src/components/nodes/video-gen-focus-view.tsx`

**Interfaces:**
- Consumes: `computeVideoCost`, `isVideoAudioEnabled`, `asResolutionString`
  (`@/lib/video-gen/cost`, already exist — same functions `complete.ts` already uses at
  settlement), `usdToFinalCredits` (`@/lib/credits/units`).

No test (client component). Verified by `npm run build` + `npx tsc --noEmit`, plus manual
browser verification (listed at the end of this plan).

- [ ] **Step 1: Add the imports**

Add after the existing `import { videoGenApi } from "@/lib/video-gen/api";` line:

```ts
import { computeVideoCost, isVideoAudioEnabled, asResolutionString } from "@/lib/video-gen/cost";
import { usdToFinalCredits } from "@/lib/credits/units";
```

- [ ] **Step 2: Compute the estimate in the "Derived state" section**

Replace:

```ts
  const imageInputs = videoGenClientModelMap[modelId]?.imageInputs ?? {
    startFrame: true,
    endFrame: false,
    maxReferenceImages: 0,
  };
```

with:

```ts
  const imageInputs = videoGenClientModelMap[modelId]?.imageInputs ?? {
    startFrame: true,
    endFrame: false,
    maxReferenceImages: 0,
  };

  const durationSeconds = Number(params.seconds ?? params.duration ?? 0);
  const audioEnabled = isVideoAudioEnabled(params.audio);
  const resolution = asResolutionString(params.resolution);
  const videoCostEstimate = computeVideoCost(modelId, durationSeconds, audioEnabled, resolution);
  const estimatedCredits = videoCostEstimate ? usdToFinalCredits(videoCostEstimate.usd) : null;
```

- [ ] **Step 3: Render it next to the Generate button**

Replace:

```tsx
                {lastError && !isGenerating && (
                  <p className="text-xs text-destructive">
                    Last attempt failed: {lastError}
                  </p>
                )}
```

with:

```tsx
                {estimatedCredits !== null && (
                  <p className="text-xs text-muted-foreground">
                    Est. {estimatedCredits} credit{estimatedCredits === 1 ? "" : "s"}
                  </p>
                )}
                {lastError && !isGenerating && (
                  <p className="text-xs text-destructive">
                    Last attempt failed: {lastError}
                  </p>
                )}
```

- [ ] **Step 4: Build and typecheck**

Run: `npm run build`
Expected: succeeds with no type errors.

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 5: Commit**

```bash
git add src/components/nodes/video-gen-focus-view.tsx
git commit -m "feat(credits): show pre-generation credit estimate in the video focus view"
```

---

### Task 4: Prompt estimate — client-side, synchronous

**Files:**
- Modify: `src/components/nodes/prompt-focus-view.tsx`

**Interfaces:**
- Consumes: `estimatePromptCredits` (`@/lib/credits/prompt-estimate`) — already returns
  credits directly (design spec §5 — this heuristic has no underlying USD figure, so it
  deliberately does not call `usdToFinalCredits`, same as the server-side reservation call
  site in `generate/route.ts`).

No test (client component). Verified by `npm run build` + `npx tsc --noEmit`, plus manual
browser verification (listed at the end of this plan).

- [ ] **Step 1: Add the import**

Add after the existing `import { DEFAULT_INSTRUCTION } from "@/lib/nodes/prompt";` line:

```ts
import { estimatePromptCredits } from "@/lib/credits/prompt-estimate";
```

- [ ] **Step 2: Compute the estimate**

Replace:

```ts
  const params = useParams<{ id: string }>();
  const [draft, setDraft] = useState(output ?? "");
```

with:

```ts
  const params = useParams<{ id: string }>();
  const estimatedCredits = estimatePromptCredits(upstream.length);
  const [draft, setDraft] = useState(output ?? "");
```

- [ ] **Step 3: Render it next to the Generate button**

Replace:

```tsx
                    <ShotControlsRow
                      controls={controls ?? DEFAULT_SHOT_CONTROLS}
                      onChange={(next) => onPatch({ controls: next })}
                    />
                    <Button
                      className="w-full"
                      size="default"
                      onClick={runGenerate}
                      disabled={generating || !editable}
                    >
                      <Sparkles className="size-4" />
                      {generating ? "Generating…" : output ? "Re-generate" : "Generate prompt"}
                    </Button>
```

with:

```tsx
                    <ShotControlsRow
                      controls={controls ?? DEFAULT_SHOT_CONTROLS}
                      onChange={(next) => onPatch({ controls: next })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Est. {estimatedCredits} credit{estimatedCredits === 1 ? "" : "s"}
                    </p>
                    <Button
                      className="w-full"
                      size="default"
                      onClick={runGenerate}
                      disabled={generating || !editable}
                    >
                      <Sparkles className="size-4" />
                      {generating ? "Generating…" : output ? "Re-generate" : "Generate prompt"}
                    </Button>
```

- [ ] **Step 4: Build and typecheck**

Run: `npm run build`
Expected: succeeds with no type errors.

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 5: Commit**

```bash
git add src/components/nodes/prompt-focus-view.tsx
git commit -m "feat(credits): show pre-generation credit estimate in the prompt focus view"
```

---

### Task 5: Image estimate — debounced server call, wired through the output-settings body

**Files:**
- Modify: `src/components/nodes/image-gen-output-settings-body.tsx`
- Modify: `src/components/nodes/image-gen-focus-view.tsx`

**Interfaces:**
- Consumes: `POST /api/nodes/:id/image-generate/estimate` (Task 2) → `{ estimatedCredits:
  number | null }`.
- `ImageGenOutputSettingsBody` gains two new required props: `estimatedCredits: number |
  null` and `estimating: boolean` — the exact names `ImageGenFocusView` (this task) passes.

No test (client components). Verified by `npm run build` + `npx tsc --noEmit`, plus manual
browser verification (listed at the end of this plan).

- [ ] **Step 1: Add the two new props to `ImageGenOutputSettingsBody`**

Replace:

```ts
type Props = {
  model: ClientModelSpec;
  values: ParamFormValues;
  onValuesChange: (next: ParamFormValues) => void;
  onCommit: (values: ParamFormValues) => void;
  onModelChange: (id: string) => void;
  /** How many reference images are connected — drives the over-limit warning. */
  referenceCount: number;
  refValidation: ValidationResult;
  /** The Edit tab has its own action button, so it hides this one. */
  showGenerate: boolean;
  onGenerate: () => void;
  generating: boolean;
  editing: boolean;
  /** A prompt node must be connected before generation is possible. */
  hasPrompt: boolean;
  /** An existing attempt turns "Generate" into "Re-generate". */
  hasImage: boolean;
};
```

with:

```ts
type Props = {
  model: ClientModelSpec;
  values: ParamFormValues;
  onValuesChange: (next: ParamFormValues) => void;
  onCommit: (values: ParamFormValues) => void;
  onModelChange: (id: string) => void;
  /** How many reference images are connected — drives the over-limit warning. */
  referenceCount: number;
  refValidation: ValidationResult;
  /** The Edit tab has its own action button, so it hides this one. */
  showGenerate: boolean;
  onGenerate: () => void;
  generating: boolean;
  editing: boolean;
  /** A prompt node must be connected before generation is possible. */
  hasPrompt: boolean;
  /** An existing attempt turns "Generate" into "Re-generate". */
  hasImage: boolean;
  /** Pre-generation credit estimate — null while unavailable/still computing. */
  estimatedCredits: number | null;
  estimating: boolean;
};
```

- [ ] **Step 2: Destructure the new props and render the estimate**

Replace:

```ts
export function ImageGenOutputSettingsBody({
  model,
  values,
  onValuesChange,
  onCommit,
  onModelChange,
  referenceCount,
  refValidation,
  showGenerate,
  onGenerate,
  generating,
  editing,
  hasPrompt,
  hasImage,
}: Props) {
```

with:

```ts
export function ImageGenOutputSettingsBody({
  model,
  values,
  onValuesChange,
  onCommit,
  onModelChange,
  referenceCount,
  refValidation,
  showGenerate,
  onGenerate,
  generating,
  editing,
  hasPrompt,
  hasImage,
  estimatedCredits,
  estimating,
}: Props) {
```

Then replace:

```tsx
      {showGenerate && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={<span className="mt-5 flex w-full justify-start" />}
            >
              <Button
                className="px-14 py-4 text-sm"
                size="default"
                onClick={onGenerate}
                disabled={Boolean(generateDisabledReason)}
              >
                <Sparkles className="size-4" strokeWidth={1.5} />
                {generating
                  ? "Generating…"
                  : editing
                  ? "Editing…"
                  : hasImage
                  ? "Re-generate"
                  : "Generate"}
              </Button>
            </TooltipTrigger>
            {generateDisabledReason && (
              <TooltipContent side="top" className="max-w-56 text-center">
                {generateDisabledReason}
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      )}
```

with:

```tsx
      {showGenerate && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={<span className="mt-5 flex w-full justify-start" />}
            >
              <Button
                className="px-14 py-4 text-sm"
                size="default"
                onClick={onGenerate}
                disabled={Boolean(generateDisabledReason)}
              >
                <Sparkles className="size-4" strokeWidth={1.5} />
                {generating
                  ? "Generating…"
                  : editing
                  ? "Editing…"
                  : hasImage
                  ? "Re-generate"
                  : "Generate"}
              </Button>
            </TooltipTrigger>
            {generateDisabledReason && (
              <TooltipContent side="top" className="max-w-56 text-center">
                {generateDisabledReason}
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      )}
      {showGenerate && (estimating || estimatedCredits !== null) && (
        <p className="mt-2 text-xs text-muted-foreground">
          {estimating
            ? "Estimating cost…"
            : `Est. ${estimatedCredits} credit${estimatedCredits === 1 ? "" : "s"}`}
        </p>
      )}
```

- [ ] **Step 3: Add estimate state to `ImageGenFocusView`**

Replace:

```ts
  const [fetchedPrompt, setFetchedPrompt] = useState<{
    nodeId: string;
    text: string;
  } | null>(null);
```

with:

```ts
  const [fetchedPrompt, setFetchedPrompt] = useState<{
    nodeId: string;
    text: string;
  } | null>(null);
  const [estimatedCredits, setEstimatedCredits] = useState<number | null>(null);
  const [estimating, setEstimating] = useState(false);
```

- [ ] **Step 4: Add the debounced estimate effect, right after `connectedImageUrls` is derived**

Replace:

```ts
  const connectedImageUrls = upstream
    .filter(
      (u) =>
        (u.type === "file" || u.type === "draw" || u.type === "image-gen") &&
        !!u.fileUrl
    )
    .map((u) => u.fileUrl as string);
  const firstConnectedImageUrl = connectedImageUrls[0];
```

with:

```ts
  const connectedImageUrls = upstream
    .filter(
      (u) =>
        (u.type === "file" || u.type === "draw" || u.type === "image-gen") &&
        !!u.fileUrl
    )
    .map((u) => u.fileUrl as string);
  const firstConnectedImageUrl = connectedImageUrls[0];
  // Stable primitive for the effect's dep array — connectedImageUrls itself is a new array
  // reference every render (derived, not stored in state).
  const connectedImageUrlsKey = JSON.stringify(connectedImageUrls);

  // Debounced pre-generation cost estimate — mirrors the 300ms debounce pattern this app's
  // own prompt-focus-view.tsx already uses for its compile-preview fetch. Only meaningful on
  // the Generate tab (Edit has its own action button, out of scope per this plan) and once
  // there's a prompt to estimate from.
  useEffect(() => {
    if (!open || activeTab === "edit" || !fetchedPrompt?.text) {
      setEstimatedCredits(null);
      setEstimating(false);
      return;
    }
    let cancelled = false;
    setEstimating(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/nodes/${nodeId}/image-generate/estimate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modelId: selectedModelId,
            quality: paramValues.quality,
            aspect_ratio: paramValues.aspect_ratio,
            image_size: paramValues.image_size,
            prompt: fetchedPrompt.text,
            referenceUrls: connectedImageUrls,
          }),
        });
        const json = (await res.json()) as { estimatedCredits: number | null };
        if (!cancelled && res.ok) setEstimatedCredits(json.estimatedCredits);
      } catch {
        if (!cancelled) setEstimatedCredits(null);
      } finally {
        if (!cancelled) setEstimating(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // connectedImageUrls omitted on purpose — connectedImageUrlsKey is the stable stand-in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeTab, selectedModelId, paramValues, connectedImageUrlsKey, fetchedPrompt, nodeId]);
```

- [ ] **Step 5: Pass the new props into `ImageGenOutputSettingsBody`**

Replace:

```tsx
  const outputSettingsBody = (
    <ImageGenOutputSettingsBody
      model={model}
      values={paramValues}
      onValuesChange={setParamValues}
      onCommit={commitParams}
      onModelChange={changeModel}
      referenceCount={referenceCount}
      refValidation={refValidation}
      showGenerate={activeTab !== "edit"}
      onGenerate={handleGenerate}
      generating={generating}
      editing={editing}
      hasPrompt={Boolean(promptUpstream)}
      hasImage={Boolean(imageUrl)}
    />
  );
```

with:

```tsx
  const outputSettingsBody = (
    <ImageGenOutputSettingsBody
      model={model}
      values={paramValues}
      onValuesChange={setParamValues}
      onCommit={commitParams}
      onModelChange={changeModel}
      referenceCount={referenceCount}
      refValidation={refValidation}
      showGenerate={activeTab !== "edit"}
      onGenerate={handleGenerate}
      generating={generating}
      editing={editing}
      hasPrompt={Boolean(promptUpstream)}
      hasImage={Boolean(imageUrl)}
      estimatedCredits={estimatedCredits}
      estimating={estimating}
    />
  );
```

- [ ] **Step 6: Build and typecheck**

Run: `npm run build`
Expected: succeeds with no type errors.

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 7: Regression test**

Run: `npm test`
Expected: all existing tests still pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/nodes/image-gen-output-settings-body.tsx src/components/nodes/image-gen-focus-view.tsx
git commit -m "feat(credits): show pre-generation credit estimate in the image focus view"
```

---

## Self-Review

**1. Spec coverage.** Design spec §5's "shown in the UI next to each focus view's Generate
button... recomputed reactively as the user changes model/params" — Tasks 3/4 (synchronous,
recomputes every render since they're plain derived values, not memoized/stale) and Task 5
(debounced fetch re-fires on every param/model/reference/prompt change). "The client-displayed
number is never trusted as the reservation input... the route handler recomputes the estimate
server-side" — already true before this plan (3C's reservation logic was never touched to
trust anything from the client); this plan only adds a *separate*, read-only preview call,
never wires the estimate route's output into the reservation path.

**2. Placeholder scan.** No TBD/TODO. Every task's code is exact and complete, including the
full before/after context needed to locate each edit precisely (verified against each file's
actual current content, not reconstructed from memory).

**3. Type consistency.** `estimateImageGenerationCostUsd`'s signature (Task 1) matches its one
caller in Task 2 exactly. `ImageGenOutputSettingsBody`'s new `estimatedCredits`/`estimating`
props (Task 5) are declared once in its `Props` type and passed with identical names from
`ImageGenFocusView`. The `/image-generate/estimate` response shape (`{ estimatedCredits:
number | null }`, Task 2) matches exactly what Task 5's client-side `fetch` reads.

No gaps found.

---

## Manual staging verification checklist (no browser access in this environment)

- [ ] Video focus view: changing duration/audio/resolution updates the shown estimate
      immediately, no flicker or stale value
- [ ] Prompt focus view: connecting/disconnecting an upstream node changes the shown estimate
      by exactly 5 credits per node
- [ ] Image focus view (Generate tab): changing quality/size/model updates the estimate after
      ~300ms, with "Estimating cost…" shown during the gap; switching to the Edit tab hides it
      (out of scope per this plan, not broken)
- [ ] Image focus view: the estimate shown before clicking Generate matches (or is very close
      to — the pre-flight count and the actual generation's token usage can differ slightly)
      the `Amount`/`Credits` recorded on the resulting generation

---

Plan complete and saved to `docs/superpowers/plans/2026-07-24-credit-system-3e-estimate-ui.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
