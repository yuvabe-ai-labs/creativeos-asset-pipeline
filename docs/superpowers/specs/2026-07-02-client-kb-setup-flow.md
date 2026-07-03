# Client KB Setup — how it works end to end

**Date:** 2026-07-02
**Status:** Implemented
**Area:** Client onboarding → Brand Knowledge Base

---

## What is the KB?

The Brand Knowledge Base (KB) is a structured profile of a client's brand — roughly 40+ fields covering voice, visual identity, audience, image direction, video direction, and compliance rules. Once approved, it powers every piece of AI-generated content for that client. Setting it up is a one-time onboarding step done by the internal team.

---

## Flow overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  PHASE 1 — UPLOAD & BUILD                                           │
│                                                                      │
│  Team adds brand materials                                           │
│    • Brand website URL         ← optional, but recommended          │
│    • Brand documents (PDF, DOCX, PPTX…) ← optional*               │
│    • Brand images (JPG, PNG, WebP)       ← always optional          │
│    * website URL OR at least one doc is required to proceed          │
│                                                                      │
│  ──── clicks "Extract & Build KB" ────                               │
│                                                                      │
│  System queues a background job (Trigger.dev)                        │
│    │                                                                 │
│    ├─ [researching]  Scrapes website → saves as a Markdown doc       │
│    │                 (stored so team can audit what AI saw)           │
│    │                                                                 │
│    ├─ [extracting]   Runs in parallel:                               │
│    │    ├── Doc extraction  — reads docs + research → fills ~40 fields│
│    │    └── Image analysis  — reads images → fills Image Analysis     │
│    │                         (skipped if no images uploaded)          │
│    │                                                                 │
│    └─ [finalizing]   Merges results → saves versioned KB snapshot    │
│                      → sets client status to "in review"             │
│                                                                      │
│  UI shows a live progress indicator — safe to close the tab          │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PHASE 2 — REVIEW & APPROVE                                         │
│                                                                      │
│  Team reviews the extracted KB field by field across 7 modules:     │
│    Brand Voice · Visual Identity · Image Analysis · Audience        │
│    Image Direction · Video Direction · Compliance Rules             │
│                                                                      │
│  For each field the team can:                                        │
│    ✓ Approve — AI got it right                                       │
│    ✎ Edit    — correct the value, then approve                       │
│    ✗ Reject  — mark as not applicable                                │
│    ↻ Re-ask  — prompt the AI to try again with a comment             │
│                                                                      │
│  Every field must be reviewed before "Mark KB Ready" unlocks.       │
│                                                                      │
│  ──── clicks "Mark KB Ready" ────                                    │
│                                                                      │
│  KB status flips to "ready" → available to all canvas nodes          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1 — Upload & Build

### What the team does

On the client's KB setup page, the team adds brand materials in three slots:

| Input | Required? | Formats | Limit |
|---|---|---|---|
| Brand website URL | Optional | — | — |
| Brand documents | Optional* | PDF, DOCX, PPTX, MD, TXT | 20 MB total |
| Brand images | Optional | JPG, PNG, WebP | 50 MB total |

**Minimum to proceed:** a website URL **or** at least one document — one of the two is required. Images are always optional.

In practice the recommended starting point is a brand URL + a brand book (PDF). Images add visual analysis but the KB builds fine without them.

### What happens in the background

Clicking **Extract & Build KB** triggers a background job (runs on Trigger.dev, outside the app server). The UI immediately enters a loading state showing the current phase in plain English ("Researching brand website…", "Extracting brand knowledge…"). The team can safely close the tab — the job keeps running and the page picks up where it left off when reopened.

The job runs three phases in sequence:

#### Phase 1 — Researching (only if a website URL was provided)

The system scrapes the brand website and asks the AI to summarise it into a structured Markdown document. This research doc is then **saved to storage as a first-class document** alongside any uploaded files. It is committed to the database at the end of the job so the team can see exactly what was pulled from the web before extraction ran — no mystery about what the AI had access to.

#### Phase 2 — Extracting (always)

Two things run **in parallel** at the same time:

- **Document extraction** — the AI reads all uploaded documents plus the website research Markdown (if any) and fills the ~40 brand KB fields (voice, identity, audience, direction, compliance).
- **Image analysis** — the AI visually analyses all uploaded brand images and fills the Image Analysis module separately (dominant colours, composition, lighting, mood, etc.). If no images were uploaded this step is skipped — Image Analysis fields are left empty and marked for review.

Running these in parallel cuts build time roughly in half when both documents and images are present.

#### Phase 3 — Finalizing

The two extraction results are merged into one KB object, a versioned snapshot is saved to the database, the website research doc is stored and linked to the version, and the client's KB status is set to `in_review` so the review step unlocks.

---

If the job takes longer than 10 minutes without a status update, the UI surfaces a **Clear stuck build** button so the team can reset and retry.

---

## Phase 2 — Review & Approve

### What the team sees

Once the build completes, the KB opens in review mode. Fields are organised into 7 tabs (modules):

| Module | What it covers |
|---|---|
| Brand Voice | Name, tagline, positioning, mission, personality, tone, industry |
| Visual Identity | Aesthetic, photography style, colour palette, lighting, typography |
| Image Analysis | What the AI observed directly from uploaded brand images |
| Audience & Casting | Demographics, lifestyle, pain points, desires, casting guidance |
| Image Direction | Shot style, composition, environment, subjects, feel |
| Video Direction | Motion, camera movement, transitions, pacing, music |
| Compliance Rules | Preferred language, blocked words, blocked claims, disclaimers |

Each field shows the AI's extracted value alongside a confidence indicator (high / medium / low) and whether the value was stated explicitly or inferred.

### Field actions

Every field has four actions:

- **Approve** — confirms the value is correct as-is.
- **Edit** — opens the field for direct editing; saving marks it as "edited" (also reviewed).
- **Reject** — marks the field as not applicable for this brand.
- **Re-ask** — lets the team type a comment ("this brand is vegan, not luxury") and asks the AI to re-extract just that field with the extra context.

The **Approve all** shortcut in each module approves every unreviewed field in one click — useful for modules where the AI performed well.

### Updating source materials

During review the team can open a **Source files** drawer to add or remove documents and images. Changes are staged (not applied immediately) and confirmed with a **Save & Re-analyze** action, which re-runs the full extraction with the updated sources. Any review progress resets.

### Completing the KB

Once every field across all 7 modules has been approved, edited, or rejected, the **Mark KB Ready** button unlocks. Clicking it sets the KB status to `ready`, making the brand profile available to all canvas nodes for content generation.

---

## Re-extraction (post-setup)

After the KB is live, the team can return to it at any time to:

- Add or remove source documents/images and trigger a fresh extraction.
- Re-ask the AI on any individual field without rebuilding the whole KB.
- Manually edit any field directly.

The KB always shows the most recently approved version. A new extraction creates a new version; the previous one is preserved in history.
