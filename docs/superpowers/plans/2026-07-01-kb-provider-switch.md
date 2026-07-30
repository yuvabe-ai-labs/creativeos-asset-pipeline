# KB Analysis Provider Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `KB_ANALYSIS_PROVIDER=gemini` env var that switches all three KB analysis operations (document extraction, image analysis, website research) from OpenAI to Google Gemini, with OpenAI remaining the default.

**Architecture:** Extract the inline OpenAI logic from `extraction.ts` and `website-research.ts` into a `KBAnalysisProvider` interface with two implementations (`providers/openai.ts` and `providers/gemini.ts`). A `getKBProvider()` factory reads the env var and returns the correct implementation. The Trigger.dev task, webhook, DB schema, and UI are untouched.

**Tech Stack:** `@google/genai` v2.9.0 (already installed), `zod-to-json-schema` (new dependency), existing Zod schemas from `src/lib/kb/schema.ts`, existing `createGemini()` from `src/lib/gemini/server.ts`.

---

## File Structure

**New files:**
- `src/lib/kb/providers/interface.ts` — `KBAnalysisProvider` type + `getKBProvider()` factory
- `src/lib/kb/providers/openai.ts` — OpenAI implementation (logic moved verbatim from `extraction.ts` + `website-research.ts`)
- `src/lib/kb/providers/gemini.ts` — Gemini implementation
- `src/prompts/gemini-kb-extract.ts` — Gemini extract prompt (same system text, model: `gemini-3.1-pro-preview`)
- `src/prompts/gemini-kb-image-analyze.ts` — Gemini image analyze prompt (same system text, model: `gemini-2.5-flash`)
- `src/prompts/gemini-website-research.ts` — Gemini website research prompt (same system text, model: `gemini-3.1-pro-preview`)

**Modified files:**
- `src/lib/kb/extraction.ts` — Remove inline OpenAI logic; call `getKBProvider().extractKB()` + `getKBProvider().analyzeImages()`
- `src/lib/kb/website-research.ts` — Remove inline OpenAI logic; delegate to `getKBProvider().researchWebsite()`

**Unchanged:** `src/prompts/kb-extract.ts`, `src/prompts/kb-image-analyze.ts`, `src/prompts/website-research.ts` (OpenAI prompts stay as-is — the OpenAI provider imports them directly).

---

## Task 1: Install `zod-to-json-schema`

**Files:**
- Modify: `package.json` (via npm install)

- [ ] **Step 1: Install the package**

```bash
npm install zod-to-json-schema
```

Expected: `added 1 package` (or similar). No peer dep warnings expected.

- [ ] **Step 2: Verify TypeScript can resolve it**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors about `zod-to-json-schema`. (Other pre-existing errors are fine.)

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add zod-to-json-schema for Gemini structured output"
```

---

## Task 2: Provider interface + factory

**Files:**
- Create: `src/lib/kb/providers/interface.ts`

This file defines the shared type and the synchronous factory. It uses `require()` (not dynamic `import()`) so the factory stays synchronous — no need to make `extraction.ts` async for a selection that never changes at runtime.

- [ ] **Step 1: Create the file**

```ts
// src/lib/kb/providers/interface.ts
import "server-only";
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

- [ ] **Step 2: Verify TypeScript accepts the file**

```bash
npx tsc --noEmit 2>&1 | grep "providers/interface"
```

Expected: No output (no errors for this file).

- [ ] **Step 3: Commit**

```bash
git add src/lib/kb/providers/interface.ts
git commit -m "feat(kb): add KBAnalysisProvider interface + getKBProvider factory"
```

---

## Task 3: Gemini prompts (3 files)

**Files:**
- Create: `src/prompts/gemini-kb-extract.ts`
- Create: `src/prompts/gemini-kb-image-analyze.ts`
- Create: `src/prompts/gemini-website-research.ts`

The system prompt text is identical to the OpenAI equivalents. Only the `model` field differs. Copy the `SYSTEM_PROMPT` const from each OpenAI prompt file and use it verbatim.

- [ ] **Step 1: Create `src/prompts/gemini-kb-extract.ts`**

Open `src/prompts/kb-extract.ts` and copy its `SYSTEM_PROMPT` string verbatim. Then create:

```ts
// src/prompts/gemini-kb-extract.ts
const SYSTEM_PROMPT = `You are a brand knowledge extractor for CreativeOS...`; // same text as kb-extract.ts

export const geminiKbExtractPrompt = {
  id: "gemini-kb-extract",
  version: "1.0.0",
  model: "gemini-3.1-pro-preview",
  system: SYSTEM_PROMPT,
} as const;
```

> **Important:** The `SYSTEM_PROMPT` must be the complete, verbatim text from `src/prompts/kb-extract.ts` lines 1–111. Do not truncate or paraphrase it.

- [ ] **Step 2: Create `src/prompts/gemini-kb-image-analyze.ts`**

Open `src/prompts/kb-image-analyze.ts` and copy its `SYSTEM_PROMPT` string verbatim. Then create:

```ts
// src/prompts/gemini-kb-image-analyze.ts
const SYSTEM_PROMPT = `You are a brand visual analyst for CreativeOS...`; // same text as kb-image-analyze.ts

export const geminiKbImageAnalyzePrompt = {
  id: "gemini-kb-image-analyze",
  version: "1.0.0",
  model: "gemini-2.5-flash",
  system: SYSTEM_PROMPT,
} as const;
```

> **Why `gemini-2.5-flash`:** Gemini 3 image models (gemini-3.1-flash-image, gemini-3-pro-image) are image-*generation* models only, not vision/analysis. `gemini-2.5-flash` is the correct model for multimodal image understanding.

- [ ] **Step 3: Create `src/prompts/gemini-website-research.ts`**

Open `src/prompts/website-research.ts` and copy its `SYSTEM_PROMPT` string verbatim. Then create:

```ts
// src/prompts/gemini-website-research.ts
const SYSTEM_PROMPT = `You are a brand researcher for CreativeOS...`; // same text as website-research.ts

export const geminiWebsiteResearchPrompt = {
  id: "gemini-website-research",
  version: "1.0.0",
  model: "gemini-3.1-pro-preview",
  system: SYSTEM_PROMPT,
} as const;
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "gemini-kb\|gemini-website"
```

Expected: No output.

- [ ] **Step 5: Commit**

```bash
git add src/prompts/gemini-kb-extract.ts src/prompts/gemini-kb-image-analyze.ts src/prompts/gemini-website-research.ts
git commit -m "feat(kb): add Gemini prompt configs for KB extraction, image analysis, and website research"
```

---

## Task 4: OpenAI provider

**Files:**
- Create: `src/lib/kb/providers/openai.ts`

This is a pure extraction of existing logic. Copy the internals of `runKBExtraction` and `researchBrandWebsite` verbatim into the provider shape. No behavioral change.

**Context to understand before writing:**

- `runKBExtraction` in `extraction.ts` currently:
  1. Calls `listKBDocuments(clientId)` + `listBrandImages(clientId)`
  2. Filters to only the requested `docIds` / `imageIds`
  3. Fetches text docs, builds `docUserContent` array with `input_file`/`input_text` parts
  4. Builds `imageUserContent` array with `input_image` parts
  5. Calls `openai.responses.parse()` twice in parallel (doc extract + image analyze)
  6. Merges into `TraceableBrandKB` + computes fill rate

- The provider's `extractKB` receives `{ clientId, docIds, researchMarkdown }` — no `imageIds`. Image analysis is a separate method.
- The provider's `analyzeImages` receives `{ clientId, imageIds }`.
- `researchWebsite` is the full body of the current `researchBrandWebsite` function.

- [ ] **Step 1: Create `src/lib/kb/providers/openai.ts`**

```ts
// src/lib/kb/providers/openai.ts
import "server-only";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { createOpenAI } from "@/lib/openai/server";
import { listKBDocuments, listBrandImages } from "@/lib/db/kb";
import {
  TraceableBrandKBSchema,
  ImageAnalysisSchema,
  type TraceableBrandKB,
  type KBField,
} from "@/lib/kb/schema";
import { computeFillRate } from "@/lib/kb/fill-rate";
import { kbExtractPrompt } from "@/prompts/kb-extract";
import { kbImageAnalyzePrompt } from "@/prompts/kb-image-analyze";
import { websiteResearchPrompt } from "@/prompts/website-research";
import type { KBAnalysisProvider } from "./interface";

const TEXT_EXTENSIONS = new Set(["md", "txt"]);
const FILE_EXTENSIONS = new Set(["pdf", "docx", "pptx"]);

const DocExtractionSchema = TraceableBrandKBSchema.omit({ image_analysis: true });
type DocExtractionResult = z.infer<typeof DocExtractionSchema>;

function emptyKBField<T>(value: T | null = null): KBField<T> {
  return { value, confidence: "low", evidence_type: "inferred", status: "needs_review" };
}

function defaultEmptyImageAnalysis(): TraceableBrandKB["image_analysis"] {
  return {
    dominant_colors: emptyKBField<string[]>(null),
    visual_mood: emptyKBField<string>(null),
    aesthetic: emptyKBField<string>(null),
    subjects: emptyKBField<string>(null),
    composition_style: emptyKBField<string>(null),
    lighting_character: emptyKBField<string>(null),
    brand_consistency_notes: emptyKBField<string>(null),
  };
}

export const openaiKBProvider: KBAnalysisProvider = {
  async extractKB({ clientId, docIds, researchMarkdown }) {
    const allDocs = await listKBDocuments(clientId);
    const docs = allDocs.filter((d) => docIds.includes(d.id));

    const docUserContent: unknown[] = [];
    for (const doc of docs) {
      if (FILE_EXTENSIONS.has(doc.file_ext)) {
        docUserContent.push({ type: "input_file", file_url: doc.storage_url });
      } else if (TEXT_EXTENSIONS.has(doc.file_ext)) {
        const res = await fetch(doc.storage_url);
        if (!res.ok) throw new Error(`Could not fetch document: ${doc.filename}`);
        docUserContent.push({ type: "input_text", text: await res.text() });
      }
    }
    if (researchMarkdown) {
      docUserContent.push({
        type: "input_text",
        text: `--- Brand website research ---\n${researchMarkdown}`,
      });
    }
    docUserContent.push({
      type: "input_text",
      text: "Extract all brand knowledge from the documents above. Where multiple files cover the same brand, merge the information using UNION logic for lists and preferring the more specific value for strings.",
    });

    const openai = createOpenAI();
    const docResponse = await openai.responses.parse({
      model: kbExtractPrompt.model,
      input: [
        { role: "system", content: kbExtractPrompt.system },
        { role: "user", content: docUserContent as never },
      ],
      text: { format: zodTextFormat(DocExtractionSchema, "brand_kb") },
      temperature: 0.5,
    });

    const docKB = docResponse.output_parsed as DocExtractionResult | null;
    if (!docKB) throw new Error("Model returned no parsed output.");

    const kbOutput: TraceableBrandKB = {
      ...docKB,
      image_analysis: defaultEmptyImageAnalysis(),
    };

    return {
      kbOutput,
      modelUsed: kbExtractPrompt.model,
      fillRate: computeFillRate(kbOutput),
    };
  },

  async analyzeImages({ clientId, imageIds }) {
    const allImages = await listBrandImages(clientId);
    const images = allImages.filter((i) => imageIds.includes(i.id));

    if (images.length === 0) return defaultEmptyImageAnalysis();

    const imageUserContent: unknown[] = images.map((img) => ({
      type: "input_image",
      image_url: img.storage_url,
    }));
    imageUserContent.push({
      type: "input_text",
      text: "Analyze all provided brand images and extract visual identity signals for the image_analysis section.",
    });

    const openai = createOpenAI();
    const imageResponse = await openai.responses.parse({
      model: kbImageAnalyzePrompt.model,
      input: [
        { role: "system", content: kbImageAnalyzePrompt.system },
        { role: "user", content: imageUserContent as never },
      ],
      text: { format: zodTextFormat(ImageAnalysisSchema, "image_analysis") },
      temperature: 0.3,
    });

    return imageResponse.output_parsed ?? defaultEmptyImageAnalysis();
  },

  async researchWebsite(url) {
    const openai = createOpenAI();
    const res = await openai.responses.create({
      model: websiteResearchPrompt.model,
      input: [
        { role: "system", content: websiteResearchPrompt.system },
        { role: "user", content: `Brand website: ${url}` },
      ],
      tools: [{ type: "web_search" }],
    });
    const md = res.output_text?.trim();
    if (!md) throw new Error(`Website research returned no content for ${url}`);
    return md;
  },
};
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "providers/openai"
```

Expected: No output.

- [ ] **Step 3: Commit**

```bash
git add src/lib/kb/providers/openai.ts
git commit -m "feat(kb): add OpenAI KB provider (extracted from extraction.ts + website-research.ts)"
```

---

## Task 5: Gemini provider

**Files:**
- Create: `src/lib/kb/providers/gemini.ts`

**How Gemini structured output works (read before implementing):**
- Use `zodToJsonSchema(Schema)` to convert a Zod schema to JSON Schema for Gemini's `responseSchema` field.
- Set `responseMimeType: "application/json"` and parse `response.text` with `JSON.parse`.
- The `@google/genai` SDK: `ai.models.generateContent({ model, contents, config })`.
- `contents` is `[{ role: "user", parts: [...] }]` where parts are `{ text }`, `{ inlineData: { mimeType, data: base64 } }`.
- System instruction goes in `config.systemInstruction` (a string).

**How Gemini website research works:**
- Add `tools: [{ googleSearch: {} }]` in `config` — this enables Google Search grounding.
- No structured output for website research — just get `response.text`.

**How to send documents to Gemini:**
- PDF/DOCX/PPTX: Fetch the GCS URL, convert to base64 buffer, send as `inlineData` with the correct MIME type.
  - PDF → `application/pdf`
  - DOCX → `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
  - PPTX → `application/vnd.openxmlformats-officedocument.presentationml.presentation`
- MD/TXT: Fetch the GCS URL, send as `{ text: contents }` part.

**How to send images to Gemini:**
- Fetch the GCS URL, convert to base64 buffer, send as `inlineData` with `image/jpeg` or `image/png`.
- Detect MIME type from file extension: `.jpg`/`.jpeg` → `image/jpeg`, `.png` → `image/png`, `.webp` → `image/webp`.

**Important:** The `@google/genai` v2.9.0 `generateContent` method is called via `(ai.models as any).generateContent(...)` — look at `src/lib/image-gen/providers/gemini.ts` for the exact pattern used in this codebase.

- [ ] **Step 1: Create `src/lib/kb/providers/gemini.ts`**

```ts
// src/lib/kb/providers/gemini.ts
import "server-only";
import { zodToJsonSchema } from "zod-to-json-schema";
import { createGemini } from "@/lib/gemini/server";
import { listKBDocuments, listBrandImages } from "@/lib/db/kb";
import {
  TraceableBrandKBSchema,
  ImageAnalysisSchema,
  type TraceableBrandKB,
  type KBField,
} from "@/lib/kb/schema";
import { computeFillRate } from "@/lib/kb/fill-rate";
import { geminiKbExtractPrompt } from "@/prompts/gemini-kb-extract";
import { geminiKbImageAnalyzePrompt } from "@/prompts/gemini-kb-image-analyze";
import { geminiWebsiteResearchPrompt } from "@/prompts/gemini-website-research";
import type { KBAnalysisProvider } from "./interface";

const DocExtractionSchema = TraceableBrandKBSchema.omit({ image_analysis: true });

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const IMG_MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function emptyKBField<T>(value: T | null = null): KBField<T> {
  return { value, confidence: "low", evidence_type: "inferred", status: "needs_review" };
}

function defaultEmptyImageAnalysis(): TraceableBrandKB["image_analysis"] {
  return {
    dominant_colors: emptyKBField<string[]>(null),
    visual_mood: emptyKBField<string>(null),
    aesthetic: emptyKBField<string>(null),
    subjects: emptyKBField<string>(null),
    composition_style: emptyKBField<string>(null),
    lighting_character: emptyKBField<string>(null),
    brand_consistency_notes: emptyKBField<string>(null),
  };
}

async function fetchAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "application/octet-stream";
  const buffer = await res.arrayBuffer();
  return { data: Buffer.from(buffer).toString("base64"), mimeType: contentType };
}

async function fetchAsText(url: string, filename: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch document: ${filename}`);
  return res.text();
}

export const geminiKBProvider: KBAnalysisProvider = {
  async extractKB({ clientId, docIds, researchMarkdown }) {
    const allDocs = await listKBDocuments(clientId);
    const docs = allDocs.filter((d) => docIds.includes(d.id));

    const parts: unknown[] = [];

    for (const doc of docs) {
      const binaryMime = MIME_BY_EXT[doc.file_ext];
      if (binaryMime) {
        const { data } = await fetchAsBase64(doc.storage_url);
        parts.push({ inlineData: { mimeType: binaryMime, data } });
      } else {
        // md / txt
        const text = await fetchAsText(doc.storage_url, doc.filename);
        parts.push({ text });
      }
    }

    if (researchMarkdown) {
      parts.push({ text: `--- Brand website research ---\n${researchMarkdown}` });
    }

    parts.push({
      text: "Extract all brand knowledge from the documents above. Where multiple files cover the same brand, merge the information using UNION logic for lists and preferring the more specific value for strings.",
    });

    const ai = createGemini();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (ai.models as any).generateContent({
      model: geminiKbExtractPrompt.model,
      contents: [{ role: "user", parts }],
      config: {
        systemInstruction: geminiKbExtractPrompt.system,
        responseMimeType: "application/json",
        responseSchema: zodToJsonSchema(DocExtractionSchema),
        temperature: 0.5,
      },
    });

    const raw = response.text ?? "";
    if (!raw) throw new Error("Gemini KB extract returned no content.");
    const docKB = JSON.parse(raw);

    const kbOutput: TraceableBrandKB = {
      ...docKB,
      image_analysis: defaultEmptyImageAnalysis(),
    };

    return {
      kbOutput,
      modelUsed: geminiKbExtractPrompt.model,
      fillRate: computeFillRate(kbOutput),
    };
  },

  async analyzeImages({ clientId, imageIds }) {
    const allImages = await listBrandImages(clientId);
    const images = allImages.filter((i) => imageIds.includes(i.id));

    if (images.length === 0) return defaultEmptyImageAnalysis();

    const parts: unknown[] = [];
    for (const img of images) {
      const ext = img.filename.split(".").pop()?.toLowerCase() ?? "jpg";
      const mimeType = IMG_MIME_BY_EXT[ext] ?? "image/jpeg";
      const { data } = await fetchAsBase64(img.storage_url);
      parts.push({ inlineData: { mimeType, data } });
    }
    parts.push({
      text: "Analyze all provided brand images and extract visual identity signals for the image_analysis section.",
    });

    const ai = createGemini();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (ai.models as any).generateContent({
      model: geminiKbImageAnalyzePrompt.model,
      contents: [{ role: "user", parts }],
      config: {
        systemInstruction: geminiKbImageAnalyzePrompt.system,
        responseMimeType: "application/json",
        responseSchema: zodToJsonSchema(ImageAnalysisSchema),
        temperature: 0.3,
      },
    });

    const raw = response.text ?? "";
    if (!raw) return defaultEmptyImageAnalysis();
    return JSON.parse(raw) as TraceableBrandKB["image_analysis"];
  },

  async researchWebsite(url) {
    const ai = createGemini();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (ai.models as any).generateContent({
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
  },
};
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "providers/gemini"
```

Expected: No output.

- [ ] **Step 3: Commit**

```bash
git add src/lib/kb/providers/gemini.ts
git commit -m "feat(kb): add Gemini KB provider (extract, image analysis, website research)"
```

---

## Task 6: Refactor `extraction.ts` — thin coordinator

**Files:**
- Modify: `src/lib/kb/extraction.ts`

Replace the entire file with the thin coordinator version. The `KBExtractionResult` type export stays in this file (the interface imports it from here, which is fine — no circular dependency because `interface.ts` only imports the type).

**Current `extraction.ts`** (before): 130 lines, all OpenAI logic inline.
**After**: ~50 lines, pure orchestration calling the provider.

- [ ] **Step 1: Replace `extraction.ts` with the thin coordinator**

Replace the entire file content with:

```ts
// src/lib/kb/extraction.ts
import "server-only";
import { listKBDocuments, listBrandImages } from "@/lib/db/kb";
import { computeFillRate } from "@/lib/kb/fill-rate";
import { getKBProvider } from "@/lib/kb/providers/interface";
import type { TraceableBrandKB, KBField } from "@/lib/kb/schema";

export type KBExtractionResult = {
  kbOutput: TraceableBrandKB;
  modelUsed: string;
  fillRate: number;
};

function emptyKBField<T>(value: T | null = null): KBField<T> {
  return { value, confidence: "low", evidence_type: "inferred", status: "needs_review" };
}

export function defaultEmptyImageAnalysis(): TraceableBrandKB["image_analysis"] {
  return {
    dominant_colors: emptyKBField<string[]>(null),
    visual_mood: emptyKBField<string>(null),
    aesthetic: emptyKBField<string>(null),
    subjects: emptyKBField<string>(null),
    composition_style: emptyKBField<string>(null),
    lighting_character: emptyKBField<string>(null),
    brand_consistency_notes: emptyKBField<string>(null),
  };
}

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
    provider.extractKB({
      clientId: input.clientId,
      docIds: input.docIds,
      researchMarkdown: input.researchMarkdown,
    }),
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

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "extraction"
```

Expected: No output.

- [ ] **Step 3: Run existing tests to confirm no regression**

```bash
npx vitest run src/lib/kb/ --reporter=verbose 2>&1 | tail -20
```

Expected: All tests pass (build-message tests + parse-context tests).

- [ ] **Step 4: Commit**

```bash
git add src/lib/kb/extraction.ts
git commit -m "refactor(kb): extraction.ts → thin coordinator delegating to KBAnalysisProvider"
```

---

## Task 7: Refactor `website-research.ts` — one-line delegate

**Files:**
- Modify: `src/lib/kb/website-research.ts`

Replace the file with a one-line delegate. The function signature is unchanged — callers in `trigger/kb-build.ts` are unaffected.

- [ ] **Step 1: Replace `website-research.ts`**

```ts
// src/lib/kb/website-research.ts
import "server-only";
import { getKBProvider } from "@/lib/kb/providers/interface";

export async function researchBrandWebsite(url: string): Promise<string> {
  return getKBProvider().researchWebsite(url);
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "website-research"
```

Expected: No output.

- [ ] **Step 3: Run all tests**

```bash
npx vitest run src/lib/kb/ --reporter=verbose 2>&1 | tail -20
```

Expected: All tests still pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/kb/website-research.ts
git commit -m "refactor(kb): website-research.ts → one-line delegate to KBAnalysisProvider"
```

---

## Task 8: Full TypeScript + test check + ADR entry

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (append ADR D32)

- [ ] **Step 1: Full TypeScript check**

```bash
npx tsc --noEmit 2>&1
```

Expected: No new errors compared to before this feature. (Pre-existing errors from unrelated code are fine — compare to baseline if unsure.)

- [ ] **Step 2: Run all KB tests**

```bash
npx vitest run src/lib/kb/ --reporter=verbose
```

Expected: All tests pass.

- [ ] **Step 3: Append ADR D32 to the staging roadmap**

Open `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` and find the ADR log section (§7). Append D32 between D31 and the "Parked / out-of-scope" section:

```markdown
### D32 — Provider abstraction for KB analysis

**Decision:** Extract KB analysis (doc extraction, image analysis, website research) behind a `KBAnalysisProvider` interface. `getKBProvider()` reads `KB_ANALYSIS_PROVIDER` env var and returns the OpenAI or Gemini implementation. OpenAI is the default.

**Why:** Allows switching Gemini as the analysis backend without touching the Trigger.dev task, webhook, DB schema, or UI. The existing image-gen provider pattern (`src/lib/image-gen/providers/`) proved this approach works well.

**Rejected:** Per-step provider selection (e.g. OpenAI for extract + Gemini for images) — unnecessary complexity. Fallback (try OpenAI if Gemini fails) — YAGNI.

**Refines:** D25 (KB build pipeline), D31 (Trigger.dev KB pipeline).

**Originated → spec:** `docs/superpowers/specs/2026-07-01-kb-provider-switch-design.md`
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md
git commit -m "docs(adr): D32 — provider abstraction for KB analysis"
```

---

## Self-Review Notes

**Spec coverage check:**
- ✅ Provider detection (`KB_ANALYSIS_PROVIDER=gemini`) — Task 2
- ✅ Models table (gemini-3.1-pro-preview, gemini-2.5-flash) — Task 3
- ✅ Interface + factory — Task 2
- ✅ File structure (6 new, 2 modified) — Tasks 2–7
- ✅ OpenAI provider (verbatim extraction) — Task 4
- ✅ Gemini structured output (zodToJsonSchema + responseSchema) — Task 5
- ✅ Gemini document handling (inlineData for binary, text for md/txt) — Task 5
- ✅ Gemini image analysis (inlineData with image MIME types) — Task 5
- ✅ Gemini website research (googleSearch grounding) — Task 5
- ✅ extraction.ts thin coordinator — Task 6
- ✅ website-research.ts delegate — Task 7
- ✅ ADR D32 — Task 8
- ✅ zod-to-json-schema dependency — Task 1

**Type consistency check:**
- `KBExtractionResult` exported from `extraction.ts`, imported in `interface.ts` ✅
- `geminiKBProvider` (camelCase) matches `require("./gemini").geminiKBProvider` in factory ✅
- `openaiKBProvider` (camelCase) matches `require("./openai").openaiKBProvider` in factory ✅
- `defaultEmptyImageAnalysis` defined in `extraction.ts` and in both providers (each file has its own copy — no cross-file dep) ✅
- `geminiKbExtractPrompt`, `geminiKbImageAnalyzePrompt`, `geminiWebsiteResearchPrompt` — names match imports in Task 5 ✅
