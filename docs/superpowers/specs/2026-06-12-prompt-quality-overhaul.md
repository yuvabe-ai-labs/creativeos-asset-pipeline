# Prompt quality overhaul — Nano Banana system prompt, file extraction depth, DEFAULT_INSTRUCTION

**Date:** 2026-06-12
**Status:** Implemented
**Area:** Canvas → Prompt node + File node LLM extraction

## Problem

The `prompt-generate` system prompt was three lines with no structural guidance — the model had to guess what a Nano Banana (Google Gemini 3 Image) prompt looks like. Generated prompts were generic and lacked the camera specs, lighting vocabulary, and material specificity the model responds to.

The `file-node-extract` system prompt told the model to "be concise" and "signal-dense, not verbose" — which caused thin image descriptions. Downstream prompts had no colours, no composition, no lighting, and no textures to draw from.

## Goals

- Rewrite `prompt-generate` to give the model the official Nano Banana 5-element formula, explicit vocabulary lists, and brand-application rules.
- Rewrite `file-node-extract` to extract rich visual detail from images (composition, lighting, colours, textures, mood, style) instead of one-sentence summaries.
- Update `DEFAULT_INSTRUCTION` to signal the right output shape to the operator without exposing internal model names or formula.
- Version-bump both prompts (`version: 1` → `2`) to preserve the audit trail.

## Non-goals

- No changes to `compilePrompt`, `buildParseContext`, or the context assembly pipeline — the block ordering and KB slice rendering are correct.
- No changes to `kb-extract`, `script-parse`, or the KB re-analysis prompt — out of scope.
- No model change or temperature tuning — same model, defaults unchanged.
- No UI changes.

## Design

### A. Target model — Nano Banana (Google Gemini 3 Image)

Nano Banana is Google's image generation model family built on Gemini 3 (launched Nov 2025). The official prompting guide (Google Cloud Blog, Mar 2026) specifies:

**Formula:** `[Subject] + [Action] + [Location/context] + [Composition] + [Style]`

**Official example:**
> *A striking fashion model wearing a tailored brown dress, sleek boots, and holding a structured handbag. Posing with a confident, statuesque stance, slightly turned. Against a seamless, deep cherry red studio backdrop. Medium-full shot, center-framed. Fashion magazine style editorial, shot on medium-format analog film, pronounced grain, high saturation, cinematic lighting effect.*

Key findings from research:

| Principle | Detail |
|---|---|
| Format | Prose paragraph for complex shots; comma-separated for simple |
| Length | 80–150 words for brand shots; longer = more control |
| Materiality | "navy blue tweed" not "suit jacket"; hex codes for brand colours |
| Lighting | Must be physically specific — "three-point softbox", "Chiaroscuro", "golden hour backlighting" |
| Junk tokens | "highly detailed", "ultra realistic", "beautiful", "8K", "masterpiece" — ignored by model |

**Sources:** [Google Cloud Blog](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana) · [Google Nano Banana Pro tips](https://blog.google/products-and-platforms/products/gemini/prompting-tips-nano-banana-pro/) · [LetsEnhance 2026 guide](https://letsenhance.io/blog/article/ai-text-prompt-guide/) · [AtLabs guide](https://www.atlabs.ai/blog/the-ultimate-nano-banana-pro-prompting-guide-mastering-gemini-3-pro-image) · [PromptingGuide meta-prompting](https://www.promptingguide.ai/techniques/meta-prompting)

### B. `prompt-generate` system prompt (v1 → v2)

**v1** (3 lines): no formula, no vocabulary, no brand rules.

**v2** instructs the model to:
- Output one prose paragraph, 80–150 words, subject first
- Weave all 6 elements: subject & action, setting, composition + camera spec (lens/f-stop), lighting (named setups), style & medium (film stock, colour grading), colour & materiality (hex codes, surface names)
- Draw from curated vocabulary lists for lighting, camera, and style terms
- Avoid the junk token list ("highly detailed", "beautiful", etc.)
- Apply brand colours by name + hex verbatim; use casting descriptor as-is; never include compliance never-use words

The system prompt is a **meta-prompt** — it gives the model the formula + vocabulary it needs to translate brand context and upstream creative material into a Nano Banana–optimised output.

### C. `file-node-extract` system prompt (v1 → v2)

**v1** Rule 4: *"Be concise. Keep it signal-dense, not verbose."* — caused one-sentence image summaries.

**v2** replaces Rule 4 with: *"Be thorough and specific. Downstream image generation needs rich visual context — sparse descriptions produce weak results. Err toward more detail, not less."*

Adds an explicit **image file section** listing every observable dimension to extract:
subject/pose, composition (shot type, framing, negative space), lighting (quality, direction, colour temp, shadows), colours (names + hex), materials & textures, mood/atmosphere, and photography style.

**Text/document section** is unchanged in intent but clarified: precise facts, direct quotes, structured relationships.

### D. `DEFAULT_INSTRUCTION`

| Before | After |
|---|---|
| `"Write an image-generation prompt from the material above."` | `"Write a detailed image prompt — subject, setting, lighting, and visual style — from the context above."` |

The new wording is operator-facing: it signals the right output shape (subject, setting, lighting, visual style) without leaking model names or the internal formula. Shown as placeholder text in the Prompt node's instruction textarea when left blank.

## Testing

- `npx tsc --noEmit` — clean.
- File node (image, `useLlm` on) → run extraction → `processedOutput` contains colours, composition, lighting, textures; not a single-sentence summary.
- Prompt node with no instruction → placeholder shows `"Write a detailed image prompt — subject, setting, lighting, and visual style — from the context above."`.
- Generate from Prompt node with Brand KB (visual identity + casting) → output: one prose paragraph referencing specific brand hex colours and casting descriptor; no junk tokens ("highly detailed", "beautiful", etc.).

## Migration note

`prompt-generate` version bumped `1` → `2`. `file-node-extract` version bumped `1` → `2`. The `version` field in each prompt config object tracks this for the `params_used` envelope stored in `node_versions` — existing generation history remains interpretable (v1 rows record the old params; v2 rows record the new).
