# KB Analysis Provider Switch — Design Spec

**Date:** 2026-07-01
**Status:** Approved for implementation

---

## 1. Overview

Add a provider switch to the KB analysis pipeline so it can run on either **OpenAI** (default) or **Google Gemini** by setting a single env var. All three KB analysis operations switch together: document extraction, image analysis, and website research.

**No changes** to the Trigger.dev task, webhook, server actions, UI, or DB schema — the switch lives entirely inside the `src/lib/kb/` layer.

---

## 2. Provider Detection

```
KB_ANALYSIS_PROVIDER=gemini   → Gemini provider
(unset or any other value)    → OpenAI provider (default)
```

`GOOGLE_GENAI_API_KEY` is already required by the image-gen feature and is always present in production — it cannot be used as the switch. `KB_ANALYSIS_PROVIDER` is an explicit opt-in.

---

## 3. Models

| Step | OpenAI (default) | Gemini |
|---|---|---|
| `extractKB` (docs + research Markdown) | `gpt-5.4-mini` | `gemini-3.1-pro-preview` |
| `analyzeImages` | `gpt-5.4-mini` | `gemini-2.5-flash` |
| `researchWebsite` | `gpt-5` + `web_search` tool | `gemini-3.1-pro-preview` + Google Search grounding |

**Why these Gemini models:**
- `gemini-3.1-pro-preview` — latest most capable model; best for complex document reasoning and web research
- `gemini-2.5-flash` — Gemini 3 image models are image-generation only (not vision analysis); 2.5 Flash is the correct vision/analysis model

---

## 4. Interface & Factory

**`src/lib/kb/providers/interface.ts`**

```ts
import type { TraceableBrandKB } from "@/lib/kb/schema";
import type { KBExtractionResult } from "@/lib/kb/extraction";

export type KBAnalysisProvider = {
  extractKB(input: {
    clientId: string;
    docIds: string[];
    researchMarkdown: string | null;
  }): Promise<KBExtractionResult>;

  analyzeImages(input: {
    clientId: string;
    imageIds: string[];
  }): Promise<TraceableBrandKB["image_analysis"]>;

  researchWebsite(url: string): Promise<string>;
};

export function getKBProvider(): KBAnalysisProvider {
  if (process.env.KB_ANALYSIS_PROVIDER === "gemini") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./gemini").geminiKBProvider;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("./openai").openaiKBProvider;
}
```

> **Why `require` instead of `import`:** Dynamic `import()` in a server-only module would require the function to be async; `require` is synchronous and simpler for a factory that just picks one of two pre-built objects.

---

## 5. File Structure

**New files:**
- `src/lib/kb/providers/interface.ts` — `KBAnalysisProvider` type + `getKBProvider()` factory
- `src/lib/kb/providers/openai.ts` — OpenAI implementation (logic extracted from current `extraction.ts` + `website-research.ts`)
- `src/lib/kb/providers/gemini.ts` — Gemini implementation
- `src/prompts/gemini-kb-extract.ts` — Gemini extract system prompt + model config
- `src/prompts/gemini-kb-image-analyze.ts` — Gemini image analyze system prompt + model config
- `src/prompts/gemini-website-research.ts` — Gemini website research system prompt + model config

**Modified files:**
- `src/lib/kb/extraction.ts` — remove inline OpenAI logic; call `getKBProvider().extractKB()` + `getKBProvider().analyzeImages()` + merge results
- `src/lib/kb/website-research.ts` — remove inline OpenAI logic; delegate to `getKBProvider().researchWebsite()`

**Unchanged:** `src/prompts/kb-extract.ts`, `kb-image-analyze.ts`, `website-research.ts` (OpenAI prompts stay as-is).

---

## 6. OpenAI Provider (`providers/openai.ts`)

Extracts the current logic verbatim from `extraction.ts` and `website-research.ts`. No behavioral change — this is a pure refactor of the existing code into the provider shape.

```ts
export const openaiKBProvider: KBAnalysisProvider = {
  async extractKB(input) { ... },   // current extraction.ts doc-call logic
  async analyzeImages(input) { ... }, // current extraction.ts image-call logic
  async researchWebsite(url) { ... }, // current website-research.ts logic
};
```

---

## 7. Gemini Provider (`providers/gemini.ts`)

### 7.1 Structured output

Uses `zodToJsonSchema` (from `zod-to-json-schema` package, to be added as a dependency) to convert the existing Zod schemas to JSON Schema for Gemini's `responseSchema` field:

```ts
import { zodToJsonSchema } from "zod-to-json-schema";

const gemini = createGemini();
const response = await gemini.models.generateContent({
  model: geminiKbExtractPrompt.model,
  contents: [{ role: "user", parts: [...] }],
  config: {
    systemInstruction: geminiKbExtractPrompt.system,
    responseMimeType: "application/json",
    responseSchema: zodToJsonSchema(DocExtractionSchema),
    temperature: 0.5,
  },
});
const parsed = JSON.parse(response.text ?? "");
```

### 7.2 Document handling

Gemini accepts PDFs natively as `inlineData` (base64) or via file URI. For GCS URLs, fetch the bytes and send as `inlineData` with the correct MIME type. Text files (`.md`, `.txt`) are sent as `text` parts — same as OpenAI.

### 7.3 Image analysis

Images fetched from GCS, sent as `inlineData` with `image/jpeg` or `image/png` MIME type. Structured JSON output via `responseSchema: zodToJsonSchema(ImageAnalysisSchema)`.

### 7.4 Website research

```ts
const response = await gemini.models.generateContent({
  model: geminiWebsiteResearchPrompt.model,
  contents: [{ role: "user", parts: [{ text: `Brand website: ${url}` }] }],
  config: {
    systemInstruction: geminiWebsiteResearchPrompt.system,
    tools: [{ googleSearch: {} }],
  },
});
const md = response.text?.trim();
if (!md) throw new Error(`Website research returned no content for ${url}`);
return md;
```

Output contract is identical to the OpenAI version: free-form Markdown brand brief.

---

## 8. `extraction.ts` after refactor

Becomes a thin coordinator — no provider-specific logic:

```ts
export async function runKBExtraction(input: {
  clientId: string;
  docIds: string[];
  imageIds: string[];
  researchMarkdown: string | null;
}): Promise<KBExtractionResult> {
  const allDocs = await listKBDocuments(input.clientId);
  const allImages = await listBrandImages(input.clientId);
  const docs = allDocs.filter((d) => input.docIds.includes(d.id));
  const images = allImages.filter((i) => input.imageIds.includes(i.id));

  if (docs.length === 0 && !input.researchMarkdown) {
    throw new Error("Need at least one document or website research to extract.");
  }

  const provider = getKBProvider();

  const [extractResult, imageAnalysis] = await Promise.all([
    provider.extractKB({ clientId: input.clientId, docIds: input.docIds, researchMarkdown: input.researchMarkdown }),
    images.length > 0
      ? provider.analyzeImages({ clientId: input.clientId, imageIds: input.imageIds })
      : Promise.resolve(defaultEmptyImageAnalysis()),
  ]);

  const kbOutput: TraceableBrandKB = {
    ...extractResult.kbOutput,
    image_analysis: imageAnalysis,
  };

  return {
    kbOutput,
    modelUsed: extractResult.modelUsed,
    fillRate: computeFillRate(kbOutput),
  };
}
```

---

## 9. Gemini Prompts

Same system prompt text as the OpenAI equivalents — the brand knowledge extraction rules, image analysis rules, and website research instructions are model-agnostic. Only the `model` field differs.

```ts
// src/prompts/gemini-kb-extract.ts
export const geminiKbExtractPrompt = {
  id: "gemini-kb-extract",
  version: "1.0.0",
  model: "gemini-3.1-pro-preview",
  system: SYSTEM_PROMPT,  // same text as kb-extract.ts
} as const;
```

---

## 10. Error handling

Both providers throw `Error` on failure — callers (`extraction.ts`, `website-research.ts`) don't need to change their error handling. The Trigger.dev task's existing `catch` block handles all failures uniformly.

---

## 11. ADR note

This refactor introduces a new architectural decision — provider abstraction for KB analysis — to be recorded as **D32** in the staging roadmap after implementation.

---

## 12. Out of scope

- Per-step provider selection (e.g. OpenAI for extract, Gemini for images) — not needed now
- UI to switch providers — env var only
- Streaming responses — both providers called with full response (no streaming needed for structured output)
- Fallback (try OpenAI if Gemini fails) — YAGNI
