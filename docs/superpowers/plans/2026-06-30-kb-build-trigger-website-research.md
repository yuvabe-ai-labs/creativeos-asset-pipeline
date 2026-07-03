# KB Build — Trigger.dev + Brand Website Research — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move KB extraction off the synchronous Next.js route into a Trigger.dev background job, add an optional brand-website URL input on the KB onboarding page that triggers a `gpt-5 + web_search` research step, and stream phase status to the browser via Supabase Realtime.

**Architecture:** A `client_kb_jobs` execution-scratchpad table (mirrors `generations` per D25) holds run state. A server action inserts the row and calls `kbBuildTask.trigger()`. The Trigger.dev worker runs OpenAI calls only; all DB/Storage writes go through a single `/api/webhooks/kb-build` route. The KB onboarding page subscribes to the job row via Supabase Realtime for phase-banner updates and the terminal refresh. Research output is free-form Markdown saved as a `client_kb_documents` row — the existing `kb-extract` UNION-merges it with uploaded docs (no `TraceableBrandKB` schema change).

**Tech Stack:** Next.js (App Router), Supabase (Postgres + Realtime + GCS via `lib/storage`), Trigger.dev v3, OpenAI Responses API (`gpt-5` + `web_search` tool, `gpt-5.4-mini` for extract), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-30-kb-build-trigger-website-research-design.md`

**Commit style:** Do NOT add `Co-Authored-By` trailers to commit messages.

---

## File Structure

**Create:**
- `supabase/migrations/0008_client_kb_jobs.sql` — schema migration
- `src/lib/db/kb-jobs.ts` — `client_kb_jobs` repo
- `src/lib/kb/build-message.ts` + `.test.ts` — pure `buildExtractingMessage` helper
- `src/lib/kb/extraction.ts` + `.test.ts` — pure orchestration of `kb-extract` + `kb-image-analyze`
- `src/lib/kb/website-research.ts` — `researchBrandWebsite(url)` OpenAI call
- `src/prompts/website-research.ts` — system prompt
- `src/app/api/webhooks/kb-build/route.ts` — phase / succeeded / failed handler
- `src/app/api/clients/[id]/website-url/route.ts` — PATCH for debounced URL save
- `src/components/kb/use-kb-job-status.ts` — Realtime hook
- `trigger/kb-build.ts` — Trigger.dev task

**Modify:**
- `src/lib/db/types.ts` — add `ClientKBJobRow`, add `website_url` to `ClientRow`
- `src/lib/db/clients.ts` — add `updateClientWebsiteUrl`
- `src/lib/actions/kb.ts` — add `startKBBuildJob`, `markStuckJobFailed`
- `src/components/kb/kb-onboarding-upload-step.tsx` — URL field + Realtime running-job view
- `src/app/clients/[slug]/kb/page.tsx` — load latest job, pass to upload step
- `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` — append D31

**Delete (final task):**
- `src/app/api/clients/[id]/kb/extract/route.ts` — logic moved into `lib/kb/extraction.ts`

---

## Task 1: DB migration — `client_kb_jobs` table + `clients.website_url`

**Files:**
- Create: `supabase/migrations/0008_client_kb_jobs.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0008_client_kb_jobs.sql`:

```sql
-- 1. Persist optional brand website URL on the client
ALTER TABLE clients ADD COLUMN website_url text;

-- 2. KB job execution-scratchpad table (mirrors `generations` per D25)
CREATE TYPE client_kb_job_status AS ENUM (
  'queued',
  'researching',
  'extracting',
  'finalizing',
  'succeeded',
  'failed'
);

CREATE TABLE client_kb_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  status          client_kb_job_status NOT NULL DEFAULT 'queued',
  phase_message   text,
  website_url     text,
  doc_ids_used    uuid[] NOT NULL DEFAULT '{}',
  trigger_run_id  text,
  version_id      uuid REFERENCES client_kb_versions(id) ON DELETE SET NULL,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX client_kb_jobs_client_status_idx
  ON client_kb_jobs(client_id, status);

-- 3. One running job per client — partial unique index
CREATE UNIQUE INDEX client_kb_jobs_one_running_idx
  ON client_kb_jobs(client_id)
  WHERE status IN ('queued','researching','extracting','finalizing');

-- 4. Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE client_kb_jobs;
```

- [ ] **Step 2: Apply against the Supabase project**

Run the migration via Supabase Dashboard SQL editor OR the Supabase CLI:
```bash
supabase db push
```
Expected: migration applies cleanly. Verify in the dashboard that `client_kb_jobs` table exists and `clients.website_url` column is present.

- [ ] **Step 3: Verify Realtime publication**

In Supabase Dashboard → Database → Replication, confirm `client_kb_jobs` appears in the `supabase_realtime` publication.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0008_client_kb_jobs.sql
git commit -m "feat(kb): add client_kb_jobs table and clients.website_url"
```

---

## Task 2: TypeScript types for the new table + column

**Files:**
- Modify: `src/lib/db/types.ts`

- [ ] **Step 1: Add `website_url` to `ClientRow`**

In `src/lib/db/types.ts`, update `ClientRow`:

```ts
export type ClientRow = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  website_url: string | null;
  kb_status: "pending" | "in_review" | "ready";
  active_kb_version_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};
```

- [ ] **Step 2: Add `ClientKBJobRow`**

Append to `src/lib/db/types.ts`:

```ts
export type ClientKBJobStatus =
  | "queued"
  | "researching"
  | "extracting"
  | "finalizing"
  | "succeeded"
  | "failed";

export type ClientKBJobRow = {
  id: string;
  client_id: string;
  status: ClientKBJobStatus;
  phase_message: string | null;
  website_url: string | null;
  doc_ids_used: string[];
  trigger_run_id: string | null;
  version_id: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};
```

- [ ] **Step 3: Verify TS compiles**

```bash
npx tsc --noEmit
```
Expected: no new errors. (Existing errors unrelated to this change are fine.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/types.ts
git commit -m "feat(kb): add ClientKBJobRow and website_url types"
```

---

## Task 3: `client_kb_jobs` repo

**Files:**
- Create: `src/lib/db/kb-jobs.ts`

- [ ] **Step 1: Write the repo**

Create `src/lib/db/kb-jobs.ts`:

```ts
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { ClientKBJobRow, ClientKBJobStatus } from "./types";

export async function insertKBJob(input: {
  clientId: string;
  websiteUrl: string | null;
  docIdsUsed: string[];
}): Promise<ClientKBJobRow> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_kb_jobs")
    .insert({
      client_id: input.clientId,
      website_url: input.websiteUrl,
      doc_ids_used: input.docIdsUsed,
      status: "queued",
    })
    .select()
    .single();
  if (error) throw error;
  return data as ClientKBJobRow;
}

export async function getKBJob(jobId: string): Promise<ClientKBJobRow | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_kb_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw error;
  return (data as ClientKBJobRow) ?? null;
}

export async function getLatestKBJob(
  clientId: string,
): Promise<ClientKBJobRow | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_kb_jobs")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as ClientKBJobRow) ?? null;
}

export async function updateKBJobPhase(input: {
  jobId: string;
  status: ClientKBJobStatus;
  phaseMessage: string;
}): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("client_kb_jobs")
    .update({
      status: input.status,
      phase_message: input.phaseMessage,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.jobId);
  if (error) throw error;
}

export async function setKBJobTriggerRunId(
  jobId: string,
  triggerRunId: string,
): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("client_kb_jobs")
    .update({ trigger_run_id: triggerRunId })
    .eq("id", jobId);
  if (error) throw error;
}

export async function markKBJobSucceeded(input: {
  jobId: string;
  versionId: string;
}): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("client_kb_jobs")
    .update({
      status: "succeeded",
      version_id: input.versionId,
      phase_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.jobId);
  if (error) throw error;
}

export async function markKBJobFailed(input: {
  jobId: string;
  error: string;
}): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("client_kb_jobs")
    .update({
      status: "failed",
      error: input.error,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.jobId);
  if (error) throw error;
}

// Idempotent stuck-job cleanup — only marks failed if not already terminal.
export async function markKBJobStuckIfRunning(jobId: string): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("client_kb_jobs")
    .update({
      status: "failed",
      error: "Stuck — manually cleared",
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .not("status", "in", '("succeeded","failed")');
  if (error) throw error;
}
```

- [ ] **Step 2: Verify TS compiles**

```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/kb-jobs.ts
git commit -m "feat(kb): add client_kb_jobs repo"
```

---

## Task 4: `buildExtractingMessage` pure helper — TDD

**Files:**
- Create: `src/lib/kb/build-message.ts`
- Create: `src/lib/kb/build-message.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/kb/build-message.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildExtractingMessage } from "./build-message";

describe("buildExtractingMessage", () => {
  it("returns 'Reading website research…' when only research is present", () => {
    expect(buildExtractingMessage({ hasResearch: true, docCount: 0, imgCount: 0 }))
      .toBe("Reading website research…");
  });

  it("uses singular when there is exactly one document or image", () => {
    expect(buildExtractingMessage({ hasResearch: false, docCount: 1, imgCount: 1 }))
      .toBe("Reading 1 document and analyzing 1 image…");
  });

  it("uses plural for multiple documents and images", () => {
    expect(buildExtractingMessage({ hasResearch: false, docCount: 3, imgCount: 5 }))
      .toBe("Reading 3 documents and analyzing 5 images…");
  });

  it("omits the images clause when there are none", () => {
    expect(buildExtractingMessage({ hasResearch: false, docCount: 3, imgCount: 0 }))
      .toBe("Reading 3 documents…");
  });

  it("omits the documents clause when there are none", () => {
    expect(buildExtractingMessage({ hasResearch: false, docCount: 0, imgCount: 2 }))
      .toBe("Analyzing 2 images…");
  });

  it("ignores hasResearch when docs/images are present (research is bundled into docs)", () => {
    expect(buildExtractingMessage({ hasResearch: true, docCount: 3, imgCount: 0 }))
      .toBe("Reading 3 documents…");
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npx vitest run src/lib/kb/build-message.test.ts
```
Expected: FAIL with `Cannot find module './build-message'`.

- [ ] **Step 3: Implement `buildExtractingMessage`**

Create `src/lib/kb/build-message.ts`:

```ts
export function buildExtractingMessage(p: {
  hasResearch: boolean;
  docCount: number;
  imgCount: number;
}): string {
  const docNoun = (n: number) => (n === 1 ? "document" : "documents");
  const imgNoun = (n: number) => (n === 1 ? "image" : "images");
  const docPart = p.docCount > 0 ? `${p.docCount} ${docNoun(p.docCount)}` : null;
  const imgPart = p.imgCount > 0 ? `${p.imgCount} ${imgNoun(p.imgCount)}` : null;

  if (p.hasResearch && !docPart && !imgPart) return "Reading website research…";
  if (docPart && imgPart) return `Reading ${docPart} and analyzing ${imgPart}…`;
  if (docPart) return `Reading ${docPart}…`;
  if (imgPart) return `Analyzing ${imgPart}…`;
  return "Building knowledge base…";
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
npx vitest run src/lib/kb/build-message.test.ts
```
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/kb/build-message.ts src/lib/kb/build-message.test.ts
git commit -m "feat(kb): add buildExtractingMessage helper"
```

---

## Task 5: `runKBExtraction` — refactor route body into a pure function

**Files:**
- Create: `src/lib/kb/extraction.ts`
- Reference (read for the source logic): `src/app/api/clients/[id]/kb/extract/route.ts`

This task **only refactors** — the existing route still works after. The route is deleted in Task 14.

- [ ] **Step 1: Write the new lib function**

Create `src/lib/kb/extraction.ts`:

```ts
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

export type KBExtractionResult = {
  kbOutput: TraceableBrandKB;
  modelUsed: string;
  fillRate: number;
};

// Pure orchestration: takes already-frozen doc/image id lists + optional research
// Markdown; returns the structured KB. Does NOT write to DB or storage.
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
  if (input.researchMarkdown) {
    docUserContent.push({
      type: "input_text",
      text: `--- Brand website research ---\n${input.researchMarkdown}`,
    });
  }
  docUserContent.push({
    type: "input_text",
    text: "Extract all brand knowledge from the documents above. Where multiple files cover the same brand, merge the information using UNION logic for lists and preferring the more specific value for strings.",
  });

  const imageUserContent: unknown[] = images.map((img) => ({
    type: "input_image",
    image_url: img.storage_url,
  }));
  if (imageUserContent.length > 0) {
    imageUserContent.push({
      type: "input_text",
      text: "Analyze all provided brand images and extract visual identity signals for the image_analysis section.",
    });
  }

  const openai = createOpenAI();
  const [docResponse, imageResponse] = await Promise.all([
    openai.responses.parse({
      model: kbExtractPrompt.model,
      input: [
        { role: "system", content: kbExtractPrompt.system },
        { role: "user", content: docUserContent as never },
      ],
      text: { format: zodTextFormat(DocExtractionSchema, "brand_kb") },
      temperature: 0.5,
    }),
    images.length > 0
      ? openai.responses.parse({
          model: kbImageAnalyzePrompt.model,
          input: [
            { role: "system", content: kbImageAnalyzePrompt.system },
            { role: "user", content: imageUserContent as never },
          ],
          text: { format: zodTextFormat(ImageAnalysisSchema, "image_analysis") },
          temperature: 0.3,
        })
      : Promise.resolve(null),
  ]);

  const docKB = docResponse.output_parsed as DocExtractionResult | null;
  if (!docKB) throw new Error("Model returned no parsed output.");

  const kbOutput: TraceableBrandKB = {
    ...docKB,
    image_analysis: imageResponse?.output_parsed ?? defaultEmptyImageAnalysis(),
  };

  return {
    kbOutput,
    modelUsed: kbExtractPrompt.model,
    fillRate: computeFillRate(kbOutput),
  };
}
```

- [ ] **Step 2: Verify TS compiles**

```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/kb/extraction.ts
git commit -m "feat(kb): extract runKBExtraction into pure lib function"
```

---

## Task 6: `researchBrandWebsite` lib + system prompt

**Files:**
- Create: `src/prompts/website-research.ts`
- Create: `src/lib/kb/website-research.ts`

- [ ] **Step 1: Write the system prompt**

Create `src/prompts/website-research.ts`:

```ts
const SYSTEM_PROMPT = `You are a brand researcher for CreativeOS, an AI-powered creative production system.
Given a brand website URL, visit it (use the web_search tool) and produce a clean Markdown brief that a downstream brand-extraction LLM will consume alongside uploaded brand documents.

INSTRUCTIONS
- Visit the homepage. Follow nav links to about, products/services, contact, and 1-2 most prominent content pages. Do NOT crawl the whole site — depth is wasted; breadth across page types is what matters.
- Quote distinctive phrases verbatim from the site for tone/voice cues.
- Note hex codes only if visible in stated brand color callouts; do not guess from screenshots.
- Spot compliance signals: words the brand uses repeatedly (preferred verbs); words conspicuously avoided (e.g. medical claim words for a wellness brand); regulatory disclaimers in footer.
- For social: list handle URLs only if linked from the site itself.

OUTPUT
A single Markdown document with these H2 sections (omit a section if genuinely no signal on it — do NOT invent):

## About
## Voice & tone cues
## Visual cues
## Target audience signals
## Products / services
## Social presence
## Compliance signals spotted
## Sources
   - bullet list of URLs you actually opened
`;

export const websiteResearchPrompt = {
  id: "website-research",
  version: "1.0.0",
  model: "gpt-5",
  system: SYSTEM_PROMPT,
  notes: "Free-form Markdown brand brief produced by gpt-5 + web_search tool. Consumed by kb-extract as another document.",
} as const;
```

- [ ] **Step 2: Write the lib function**

Create `src/lib/kb/website-research.ts`:

```ts
import "server-only";
import { createOpenAI } from "@/lib/openai/server";
import { websiteResearchPrompt } from "@/prompts/website-research";

export async function researchBrandWebsite(url: string): Promise<string> {
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
}
```

- [ ] **Step 3: Verify TS compiles**

```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/prompts/website-research.ts src/lib/kb/website-research.ts
git commit -m "feat(kb): add brand website research (gpt-5 + web_search)"
```

---

## Task 7: `updateClientWebsiteUrl` repo function + PATCH route

**Files:**
- Modify: `src/lib/db/clients.ts`
- Create: `src/app/api/clients/[id]/website-url/route.ts`

- [ ] **Step 1: Add `updateClientWebsiteUrl` to clients repo**

Append to `src/lib/db/clients.ts` (after `updateClientLogoUrl`):

```ts
export async function updateClientWebsiteUrl(
  clientId: string,
  websiteUrl: string | null,
): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("clients")
    .update({ website_url: websiteUrl })
    .eq("id", clientId);
  if (error) throw error;
}
```

- [ ] **Step 2: Create the PATCH route**

Create `src/app/api/clients/[id]/website-url/route.ts`:

```ts
import { updateClientWebsiteUrl } from "@/lib/db/clients";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";

function normalizeUrl(raw: unknown): string | null {
  if (raw === null) return null;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withClient(params, async (clientId) => {
    return withTryCatch("Failed to save website URL", async () => {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return apiError("Invalid JSON body.", 400);
      }
      const raw = (body as { websiteUrl?: unknown } | null)?.websiteUrl;
      const url = normalizeUrl(raw);
      await updateClientWebsiteUrl(clientId, url);
      return apiOk({ websiteUrl: url });
    });
  });
}
```

- [ ] **Step 3: Verify TS compiles**

```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/clients.ts src/app/api/clients/[id]/website-url/route.ts
git commit -m "feat(kb): PATCH route to save brand website URL"
```

---

## Task 8: KB build webhook — phase / succeeded / failed handler

**Files:**
- Create: `src/app/api/webhooks/kb-build/route.ts`

This webhook owns every DB and Storage write for the KB build. Worker calls it; nothing else does.

- [ ] **Step 1: Write the webhook**

Create `src/app/api/webhooks/kb-build/route.ts`:

```ts
import "server-only";
import { apiError, apiOk } from "@/lib/api/route-helpers";
import {
  updateKBJobPhase,
  markKBJobSucceeded,
  markKBJobFailed,
  getKBJob,
} from "@/lib/db/kb-jobs";
import { insertKBDocument, insertKBVersion, setActiveKBVersion } from "@/lib/db/kb";
import { setKBStatus } from "@/lib/db/clients";
import { uploadKBDocument } from "@/lib/storage";
import type { TraceableBrandKB } from "@/lib/kb/schema";
import type { ClientKBJobStatus } from "@/lib/db/types";

const NON_TERMINAL: ClientKBJobStatus[] = [
  "queued", "researching", "extracting", "finalizing",
];

type PhasePayload = {
  jobId: string;
  kind: "phase";
  status: "researching" | "extracting" | "finalizing";
  message: string;
};

type SucceededPayload = {
  jobId: string;
  kind: "succeeded";
  researchMarkdown: string | null;
  kbOutput: TraceableBrandKB;
  modelUsed: string;
  fillRate: number;
};

type FailedPayload = {
  jobId: string;
  kind: "failed";
  error: string;
};

type Payload = PhasePayload | SucceededPayload | FailedPayload;

function isAuthorized(req: Request): boolean {
  const secret = process.env.TRIGGER_WEBHOOK_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) return apiError("Unauthorized.", 401);

  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return apiError("Invalid JSON body.", 400);
  }
  if (!body?.jobId || !body?.kind) return apiError("Missing jobId or kind.", 400);

  try {
    if (body.kind === "phase") {
      await updateKBJobPhase({
        jobId: body.jobId,
        status: body.status,
        phaseMessage: body.message,
      });
      return apiOk({ ok: true });
    }

    if (body.kind === "failed") {
      await markKBJobFailed({ jobId: body.jobId, error: body.error });
      return apiOk({ ok: true });
    }

    // kind === "succeeded" — terminal: do all the graduation writes.
    const job = await getKBJob(body.jobId);
    if (!job) return apiError("Job not found.", 404);
    if (!NON_TERMINAL.includes(job.status)) {
      // Already terminal — idempotent no-op.
      return apiOk({ ok: true, alreadyTerminal: true });
    }

    const docIdsForVersion = [...job.doc_ids_used];

    // 1. Persist research Markdown as a kb document, if any.
    if (body.researchMarkdown) {
      const url = await uploadKBDocument(
        job.client_id,
        "website-research.md",
        body.researchMarkdown,
      );
      const researchDoc = await insertKBDocument({
        clientId: job.client_id,
        filename: "website-research.md",
        fileExt: "md",
        storageUrl: url,
        sizeBytes: body.researchMarkdown.length,
      });
      docIdsForVersion.push(researchDoc.id);
    }

    // 2. Insert the KB version + set active + flip kb_status.
    const version = await insertKBVersion({
      clientId: job.client_id,
      output: body.kbOutput,
      modelUsed: body.modelUsed,
      docIdsUsed: docIdsForVersion,
      fillRate: body.fillRate,
    });
    await setActiveKBVersion(job.client_id, version.id);
    await setKBStatus(job.client_id, "in_review");

    // 3. Mark the job succeeded.
    await markKBJobSucceeded({ jobId: body.jobId, versionId: version.id });

    return apiOk({ ok: true, versionId: version.id });
  } catch (e) {
    const error = e instanceof Error ? e.message : "Webhook failed.";
    // Best-effort: mark the job failed so the UI escapes the running state.
    try { await markKBJobFailed({ jobId: body.jobId, error }); } catch {}
    return apiError(error, 500);
  }
}
```

- [ ] **Step 2: Verify `uploadKBDocument` exists and accepts `(clientId, filename, contents)` signature**

Check `src/lib/storage/index.ts` (or wherever `uploadKBDocument` lives — referenced in D30). It currently expects a File or Buffer.

Run:
```bash
grep -rn "export.*uploadKBDocument" src/lib/storage
```

If the existing `uploadKBDocument` does NOT accept a string body, add a sibling helper. For example, in `src/lib/storage/kb.ts` (or wherever D30 placed it), add:

```ts
export async function uploadKBDocumentText(
  clientId: string,
  filename: string,
  contents: string,
): Promise<string> {
  return uploadKBDocument(clientId, new File([contents], filename, { type: "text/markdown" }));
}
```

And update the webhook import + call to use `uploadKBDocumentText`.

(Implementer's judgment: if the existing helper already takes a string, skip this sub-step.)

- [ ] **Step 3: Add `TRIGGER_WEBHOOK_SECRET` to `.env` and Vercel env**

In `.env` (local dev):
```
TRIGGER_WEBHOOK_SECRET=<generate-a-long-random-string>
```

Also add to Vercel project env (Production + Preview) AND to the Trigger.dev project env vars dashboard (so the worker can read it).

- [ ] **Step 4: Verify TS compiles**

```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/webhooks/kb-build/route.ts
# include storage helper edit if added in step 2
git commit -m "feat(kb): add /api/webhooks/kb-build for Trigger.dev callbacks"
```

---

## Task 9: Server actions — `startKBBuildJob`, `markStuckJobFailed`

**Files:**
- Modify: `src/lib/actions/kb.ts`

- [ ] **Step 1: Add the actions**

Replace `src/lib/actions/kb.ts` with (or append to its existing content):

```ts
"use server";

import { tasks } from "@trigger.dev/sdk/v3";
import { revalidatePath } from "next/cache";
import { getClientById } from "@/lib/db/clients";
import { listKBDocuments, listBrandImages } from "@/lib/db/kb";
import {
  insertKBJob,
  setKBJobTriggerRunId,
  markKBJobStuckIfRunning,
  getKBJob,
} from "@/lib/db/kb-jobs";
import type { kbBuildTask } from "../../../trigger/kb-build";

export async function startKBBuildJob(clientId: string): Promise<{ jobId: string }> {
  const client = await getClientById(clientId);
  if (!client) throw new Error("Client not found.");

  const [docs, images] = await Promise.all([
    listKBDocuments(clientId),
    listBrandImages(clientId),
  ]);

  if (!client.website_url && docs.length === 0) {
    throw new Error("Add a website URL or upload at least one document.");
  }

  let job;
  try {
    job = await insertKBJob({
      clientId,
      websiteUrl: client.website_url,
      docIdsUsed: docs.map((d) => d.id),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("client_kb_jobs_one_running_idx")) {
      throw new Error("A KB build is already running for this client.");
    }
    throw e;
  }

  const run = await tasks.trigger<typeof kbBuildTask>("kb-build", {
    jobId: job.id,
    clientId,
    websiteUrl: client.website_url,
    docIds: docs.map((d) => d.id),
    imageIds: images.map((i) => i.id),
  });

  await setKBJobTriggerRunId(job.id, run.id);
  revalidatePath(`/clients/${client.slug}/kb`);
  return { jobId: job.id };
}

export async function markStuckJobFailed(jobId: string): Promise<void> {
  const job = await getKBJob(jobId);
  if (!job) throw new Error("Job not found.");
  await markKBJobStuckIfRunning(jobId);
  const client = await getClientById(job.client_id);
  if (client) revalidatePath(`/clients/${client.slug}/kb`);
}
```

- [ ] **Step 2: Verify TS compiles**

```bash
npx tsc --noEmit
```
Expected: a circular import warning from `../../../trigger/kb-build` is acceptable because we import only the type. If TS complains about the path, change the import to:

```ts
import type { kbBuildTask } from "@/../trigger/kb-build";
```

…or use a string-only `tasks.trigger("kb-build", payload)` with the payload typed inline. Pick whichever the project resolves cleanly.

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/kb.ts
git commit -m "feat(kb): add startKBBuildJob and markStuckJobFailed server actions"
```

---

## Task 10: Trigger.dev task `kb-build`

**Files:**
- Create: `trigger/kb-build.ts`

- [ ] **Step 1: Write the task**

Create `trigger/kb-build.ts`:

```ts
import { task, logger } from "@trigger.dev/sdk/v3";
import { buildExtractingMessage } from "@/lib/kb/build-message";

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export const kbBuildTask = task({
  id: "kb-build",
  maxDuration: 600,
  run: async (payload: {
    jobId: string;
    clientId: string;
    websiteUrl: string | null;
    docIds: string[];
    imageIds: string[];
  }) => {
    const appUrl = process.env.APP_URL;
    if (!appUrl) throw new Error("APP_URL env var not set");
    const secret = process.env.TRIGGER_WEBHOOK_SECRET;
    if (!secret) throw new Error("TRIGGER_WEBHOOK_SECRET env var not set");
    const webhook = `${appUrl}/api/webhooks/kb-build`;

    const postWebhook = (body: object) =>
      fetch(webhook, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${secret}`,
        },
        body: JSON.stringify(body),
      });

    const phase = (status: string, message: string) =>
      postWebhook({ jobId: payload.jobId, kind: "phase", status, message });

    try {
      const docCount = payload.docIds.length;
      const imgCount = payload.imageIds.length;

      // Phase 1: research (optional)
      let researchMarkdown: string | null = null;
      if (payload.websiteUrl) {
        await phase("researching", `Researching ${safeHost(payload.websiteUrl)}…`);
        const { researchBrandWebsite } = await import("@/lib/kb/website-research");
        researchMarkdown = await researchBrandWebsite(payload.websiteUrl);
      }

      // Phase 2: extract + analyze (parallel inside runKBExtraction)
      await phase("extracting", buildExtractingMessage({
        hasResearch: researchMarkdown !== null,
        docCount,
        imgCount,
      }));
      const { runKBExtraction } = await import("@/lib/kb/extraction");
      const result = await runKBExtraction({
        clientId: payload.clientId,
        docIds: payload.docIds,
        imageIds: payload.imageIds,
        researchMarkdown,
      });

      // Phase 3: finalize
      await phase("finalizing", "Building knowledge base…");
      await postWebhook({
        jobId: payload.jobId,
        kind: "succeeded",
        researchMarkdown,
        kbOutput: result.kbOutput,
        modelUsed: result.modelUsed,
        fillRate: result.fillRate,
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : "KB build failed";
      logger.error("kb-build failed", { jobId: payload.jobId, error });
      await postWebhook({ jobId: payload.jobId, kind: "failed", error });
    }
  },
});
```

- [ ] **Step 2: Verify trigger.config picks it up**

`trigger.config.ts` already includes `dirs: ["./trigger"]` — no change needed.

- [ ] **Step 3: Deploy to Trigger.dev dev environment**

```bash
npx trigger.dev@latest dev
```

In another terminal, verify the task appears in the Trigger.dev dashboard.

- [ ] **Step 4: Verify TS compiles**

```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add trigger/kb-build.ts
git commit -m "feat(kb): add kb-build Trigger.dev task"
```

---

## Task 11: Realtime hook `useKBJobStatus`

**Files:**
- Create: `src/components/kb/use-kb-job-status.ts`

- [ ] **Step 1: Write the hook**

Create `src/components/kb/use-kb-job-status.ts`:

```ts
"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { ClientKBJobRow } from "@/lib/db/types";

export function useKBJobStatus(
  clientId: string,
  initialJob: ClientKBJobRow | null,
): ClientKBJobRow | null {
  const [job, setJob] = useState<ClientKBJobRow | null>(initialJob);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    const channel = supabase
      .channel(`kb-job:${clientId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "client_kb_jobs",
          filter: `client_id=eq.${clientId}`,
        },
        (payload) => {
          const next = payload.new as ClientKBJobRow | undefined;
          if (next) setJob(next);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId]);

  return job;
}
```

- [ ] **Step 2: Verify the browser Supabase helper exists**

```bash
grep -rn "createBrowserSupabase" src/lib/supabase
```

If it doesn't exist, look for an equivalent (e.g., `createClient` in `src/lib/supabase/client.ts`) and use that instead. The hook should use whatever the project already uses for browser-side Supabase access.

- [ ] **Step 3: Verify TS compiles**

```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/kb/use-kb-job-status.ts
git commit -m "feat(kb): add useKBJobStatus Realtime hook"
```

---

## Task 12: KB onboarding step UI — URL field + running-job view

**Files:**
- Modify: `src/components/kb/kb-onboarding-upload-step.tsx`

- [ ] **Step 1: Update the component**

Edit `src/components/kb/kb-onboarding-upload-step.tsx`. Add the new imports at top:

```ts
import { LinkIcon } from "lucide-react";
import { startKBBuildJob, markStuckJobFailed } from "@/lib/actions/kb";
import { useKBJobStatus } from "./use-kb-job-status";
import type { ClientKBJobRow } from "@/lib/db/types";
```

Extend the `Props` type:

```ts
type Props = {
  clientId: string;
  clientSlug: string;
  initialDocuments: ClientKBDocumentRow[];
  initialImages: ClientBrandImageRow[];
  initialWebsiteUrl: string | null;
  initialJob: ClientKBJobRow | null;
};
```

Update component signature and add state:

```ts
export function KBOnboardingUploadStep({
  clientId,
  initialDocuments,
  initialImages,
  initialWebsiteUrl,
  initialJob,
}: Props) {
  const router = useRouter();
  const [documents, setDocuments] = useState(initialDocuments);
  const [images, setImages] = useState(initialImages);
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const [uploadingImgs, setUploadingImgs] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState(initialWebsiteUrl ?? "");
  const [starting, startStartTransition] = useTransition();
  const job = useKBJobStatus(clientId, initialJob);

  // … existing computed totals …
```

Replace the `handleExtract` function body with the new server-action call:

```ts
function handleExtract() {
  startStartTransition(async () => {
    try {
      await startKBBuildJob(clientId);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start build.");
    }
  });
}
```

Add the debounced URL save handler — place near the other handlers:

```ts
useEffect(() => {
  if (websiteUrl === (initialWebsiteUrl ?? "")) return;
  const handle = setTimeout(() => {
    void fetch(`/api/clients/${clientId}/website-url`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ websiteUrl: websiteUrl || null }),
    });
  }, 800);
  return () => clearTimeout(handle);
}, [websiteUrl, clientId, initialWebsiteUrl]);
```

(Add `useEffect` to the React import at the top.)

Replace the render. **First**, when a job is non-terminal, show the running view:

```tsx
const NON_TERMINAL = new Set([
  "queued", "researching", "extracting", "finalizing",
]);
const isRunning = job !== null && NON_TERMINAL.has(job.status);
const tenMinAgo = Date.now() - 10 * 60 * 1000;
const isStuck = isRunning && new Date(job!.updated_at).getTime() < tenMinAgo;

useEffect(() => {
  if (!job) return;
  if (job.status === "succeeded") {
    toast.success("KB built — review below");
    router.refresh();
  } else if (job.status === "failed") {
    toast.error(job.error ?? "KB build failed");
  }
}, [job?.status, job?.error, router]);

if (isRunning) {
  return (
    <div className="animate-rise space-y-6">
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <span className="size-4 mt-0.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <div className="flex-1">
            <p className="text-sm font-medium">{job!.phase_message ?? "Building knowledge base…"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              This usually takes 60–120 seconds. You can close this tab and come back — we&apos;ll keep building.
            </p>
          </div>
        </div>
        {isStuck && (
          <div className="mt-4 border-t pt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              This build appears stuck. Clear it to start a new one.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await markStuckJobFailed(job!.id);
                router.refresh();
              }}
            >
              Clear stuck build
            </Button>
          </div>
        )}
      </Card>
      <KBSkeleton />
    </div>
  );
}
```

**Second**, replace the upload step's top section with the website URL field:

```tsx
return (
  <div className="animate-rise space-y-6">
    {/* Brand website URL */}
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <LinkIcon className="size-4 text-muted-foreground" />
        <Label htmlFor="website-url" className="text-sm font-medium">
          Brand website <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
      </div>
      <Input
        id="website-url"
        className="mt-2"
        placeholder="https://yourbrand.com"
        value={websiteUrl}
        onChange={(e) => setWebsiteUrl(e.target.value)}
      />
      <p className="mt-2 text-xs text-muted-foreground">
        We&apos;ll research the site and add it as a knowledge source.
      </p>
    </Card>

    {/* … existing documents + images grid unchanged … */}

    <div className="flex items-center gap-3">
      <Button
        onClick={handleExtract}
        disabled={starting || (documents.length === 0 && !websiteUrl.trim()) || uploadingDocs || uploadingImgs}
      >
        <SparklesIcon className="mr-1.5 size-4" />
        {starting ? "Starting…" : "Extract & Build KB"}
      </Button>
      {documents.length === 0 && !websiteUrl.trim() && (
        <p className="text-sm text-muted-foreground">
          Add a website or upload a document to continue
        </p>
      )}
    </div>
  </div>
);
```

Remove the now-obsolete `extracting` `useTransition` and its `if (extracting)` early-return — replaced by the `isRunning` branch above.

Add the necessary imports at the top:

```ts
import { useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
```

- [ ] **Step 2: Verify TS + lint**

```bash
npx tsc --noEmit
npx eslint src/components/kb/kb-onboarding-upload-step.tsx
```
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/kb/kb-onboarding-upload-step.tsx
git commit -m "feat(kb): URL field + Realtime running-job view on onboarding step"
```

---

## Task 13: KB page-load handoff — fetch latest job + pass website URL

**Files:**
- Modify: `src/app/clients/[slug]/kb/page.tsx`

- [ ] **Step 1: Find the file and identify the current props passed to `KBOnboardingUploadStep`**

```bash
grep -n "KBOnboardingUploadStep" src/app/clients/[slug]/kb/page.tsx
```

- [ ] **Step 2: Add latest-job + website URL to the props**

Near the existing data loads (where `listKBDocuments` and `listBrandImages` are called), add:

```ts
import { getLatestKBJob } from "@/lib/db/kb-jobs";

// inside the page component, alongside other awaits:
const latestJob = await getLatestKBJob(client.id);
```

Pass to the upload step:

```tsx
<KBOnboardingUploadStep
  clientId={client.id}
  clientSlug={client.slug}
  initialDocuments={documents}
  initialImages={images}
  initialWebsiteUrl={client.website_url}
  initialJob={latestJob}
/>
```

- [ ] **Step 3: Verify TS compiles + page renders**

```bash
npx tsc --noEmit
npm run dev
```
Visit `/clients/<slug>/kb` and confirm the page loads without errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/clients/[slug]/kb/page.tsx
git commit -m "feat(kb): page loads latest job + website URL for onboarding step"
```

---

## Task 14: End-to-end smoke test (manual)

**Files:** none — manual verification.

- [ ] **Step 1: Start dev environment**

Two terminals:
```bash
# Terminal A
npm run dev

# Terminal B
npx trigger.dev@latest dev
```

- [ ] **Step 2: Path 1 — URL-only build**

1. Open `/clients/<some-test-client>/kb`.
2. Type a real brand URL (e.g., `https://yuvabe.com`) in the new field. Wait 1 second.
3. Refresh the page — confirm the URL persisted.
4. Click "Extract & Build KB".
5. Observe: the page swaps to the running view with banner "Researching yuvabe.com…".
6. After ~30–90s the banner changes to "Reading website research…".
7. Then "Building knowledge base…".
8. Then the page refreshes and the review step renders. Confirm a `website-research.md` row exists in the Documents panel.
9. Confirm the KB version has extracted fields with low fill rate (acceptable for URL-only).

- [ ] **Step 3: Path 2 — URL + docs + images**

1. Same client (or a new one). Upload 2 docs and 3 images.
2. Confirm the website URL is still there.
3. Click "Extract & Build KB".
4. Banner: "Researching yuvabe.com…" → "Reading 3 documents and analyzing 3 images…" → "Building knowledge base…".
5. Confirm fill rate is higher than path 1.

- [ ] **Step 4: Path 3 — docs-only (URL cleared)**

1. Clear the URL field (it auto-saves null).
2. Click Extract.
3. Banner: "Reading 2 documents…" (no researching phase, no images phrase).
4. Confirm review step renders.

- [ ] **Step 5: Path 4 — double-click guard**

1. With a build running, click Extract again.
2. Expect a toast: "A KB build is already running for this client."

- [ ] **Step 6: Path 5 — failure mode**

1. Set URL to something unreachable like `https://this-domain-truly-does-not-exist-xyz123.com`.
2. Click Extract.
3. Wait for failure toast and the upload step to return.
4. Confirm the job row is `failed` in the DB.

- [ ] **Step 7: Commit nothing — this task is verification**

If any path fails, fix and re-commit the relevant task; don't commit a "smoke test" record.

---

## Task 15: Delete the old extract route

**Files:**
- Delete: `src/app/api/clients/[id]/kb/extract/route.ts`

- [ ] **Step 1: Confirm nothing still calls the old route**

```bash
grep -rn "/kb/extract" src --include="*.ts" --include="*.tsx"
```
Expected output: empty (the only references should now be in the upload-step file you updated in Task 12, which switched to `startKBBuildJob`). If anything remains, fix it before deleting.

- [ ] **Step 2: Delete the route**

```bash
git rm src/app/api/clients/[id]/kb/extract/route.ts
```

- [ ] **Step 3: Verify TS compiles**

```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(kb): remove old synchronous extract route"
```

---

## Task 16: Append ADR D31 to the roadmap

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md`

- [ ] **Step 1: Append D31**

Open `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md`. Find the end of D30 in §7 (right before "Parked / out-of-scope"). Insert:

```markdown
### D31 — KB build runs on Trigger.dev with a `client_kb_jobs` graduation table; Supabase Realtime pushes phases *(recorded 2026-06-30; refines D13; reuses D25 pattern)*
**Decision.** The KB build pipeline (optional website research → docs extract → image analyze → graduate to `client_kb_versions`) moves off the Next.js route into a single **Trigger.dev** task `kb-build`. A new **`client_kb_jobs`** table tracks the run (`queued → researching → extracting → finalizing → succeeded/failed`, with `phase_message`, `website_url`, `doc_ids_used`, `trigger_run_id`, `version_id`). On success the job **graduates** into a `client_kb_versions` row + `setActiveKBVersion` + `kb_status='in_review'` — identical pattern to D25's `generations → node_versions` graduation, just at the client-KB level instead of the node-generation level. The Trigger.dev worker holds the OpenAI calls; **a single Vercel webhook owns every DB/Storage write** (same boundary as `video-generate.ts`). The KB onboarding page subscribes to `client_kb_jobs` via **Supabase Realtime** (D12) for phase updates and the terminal refresh; one running job per client is enforced by a partial unique index on non-terminal statuses. Website URL persists on `clients.website_url` so re-research is a button click. Brand website research is a free-form Markdown call (`gpt-5` + `web_search` tool); the output is saved as a `client_kb_documents` row and merged into `TraceableBrandKB` by the existing `kb-extract` UNION rules — **no schema change** to the KB itself.
**Why.** The synchronous KB extract route hit a wall the moment `gpt-5 + web_search` joined the chain — total wall time (research + extract + image-analyze) now exceeds Vercel's 60s function limit, and split-route + cron-reconcile (D26's pattern for Veo) is the wrong shape for a 3-step always-multi-step pipeline that needs phase-by-phase progress visibility. Trigger.dev is **already in the stack** for video gen, so this is reuse, not new infra. Pushing the OpenAI calls onto the worker keeps Vercel time tiny; routing all DB/storage writes through one webhook preserves the "DB writes in one place, in one runtime" boundary that made `video-generate.ts` reasonable to reason about. Treating the research Markdown as just another `client_kb_documents` row means **the extractor's UNION-merge stays the single synthesis seam** — no parallel `website_analysis` section to drift against doc-derived fields.
**Rejected.** (a) **Stay synchronous with extended Vercel function duration.** Brittle (extended duration is a Pro plan toggle, not a guarantee), no durable progress, no observability, no retries. (b) **D26's submit→cron pattern.** Designed for one async provider call with poll-based completion; KB build is three calls with internal phase transitions a cron poller cannot observe cleanly. (c) **Webhook per phase + direct DB writes from worker.** Duplicates the DB-write boundary; the `video-generate.ts` precedent already proved the "worker → webhook → DB" split works. (d) **Structured `website_analysis` section in `TraceableBrandKB`.** Duplicates the extractor's job and loses UNION-merge.
**Refines.** D13 (Trigger.dev is rented async infra, not self-hosted queue — the spirit of D13 is preserved; the parked item "Real queue infra (Redis/SQS/BullMQ + workers)" is unchanged). **Reuses.** D25 (graduation pattern from execution-scratchpad table into the durable versioned table). **Builds on.** D12 (Realtime push, not polling). **D11 unchanged** (the human still clicks Extract & Build — nothing auto-runs).
**Originated.** `2026-06-30-kb-build-trigger-website-research-design.md`.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md
git commit -m "docs(adr): D31 — KB build on Trigger.dev + website research"
```

---

## Self-review summary

**Spec coverage check (§ → task):**
- §4.1 architecture → Tasks 8, 9, 10 (webhook, action, worker)
- §4.2 schema → Task 1
- §4.3 worker → Task 10
- §4.3 smart phase messages → Tasks 4 (helper), 10 (use it)
- §4.4 lib functions → Tasks 5 (extraction), 6 (research)
- §4.5 research prompt → Task 6
- §4.6 webhook → Task 8
- §4.7 server action → Task 9
- §4.8 UI changes → Tasks 11 (hook), 12 (component)
- §4.9 re-research flow → Implicit; covered by existing delete-doc UI + Task 9 action
- §4.10 failure modes → Tasks 9 (idempotency error), 12 (stuck banner), 14 (manual verification)
- §7 files touched → All tasks
- §8 ADR D31 → Task 16

**Open implementer judgments (intentional):**
- Task 8 Step 2 — whether `uploadKBDocument` accepts a string or needs a sibling helper depends on the current D30 storage wrapper. The plan calls this out explicitly and shows the wrapper if needed.
- Task 9 Step 2 — whether to import the task's type or use a string trigger depends on TS module resolution. Both are acceptable.
- Task 11 Step 2 — the exact name of the browser Supabase helper. The plan calls this out.

These are localized and the plan tells the implementer what to look for in each case.
