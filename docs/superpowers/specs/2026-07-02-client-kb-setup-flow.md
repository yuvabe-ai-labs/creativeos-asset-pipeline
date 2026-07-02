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
│  Team uploads brand materials                                        │
│    • Brand docs (PDF, DOCX, PPTX, MD, TXT) — up to 20 MB total     │
│    • Brand images (JPG, PNG, WebP) — up to 50 MB total             │
│    • Brand website URL (optional)                                    │
│                                                                      │
│  ──── clicks "Extract & Build KB" ────                               │
│                                                                      │
│  System queues a background job (Trigger.dev)                        │
│    │                                                                 │
│    ├─ [researching]  Scrapes & summarises the brand website (if any) │
│    ├─ [extracting]   AI reads all docs + images, fills 40+ fields    │
│    └─ [finalizing]   Saves the KB version, marks status "in review"  │
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

- **Brand documents** — brand guidelines, tone-of-voice decks, campaign briefs, or any written brand assets (PDF, DOCX, PPTX, Markdown, plain text). Total limit: 20 MB.
- **Brand images** — product photos, campaign imagery, mood boards (JPG, PNG, WebP). Total limit: 50 MB.
- **Brand website** — an optional URL. The system will scrape and summarise it automatically.

At least one document or a website URL is required to proceed.

### What happens in the background

Clicking **Extract & Build KB** triggers a background job. The UI immediately enters a loading state showing the current phase in plain English ("Researching brand website…", "Extracting brand knowledge…"). The team can safely close the tab — the job continues running and the page reflects the latest state when reopened.

The job runs three phases in sequence:

| Phase | What happens |
|---|---|
| Researching | Fetches and summarises the brand website into a structured Markdown document |
| Extracting | AI reads all documents and analyses all images in parallel, then fills every KB field |
| Finalizing | Saves a versioned KB snapshot, stores the research document, sets the client status to "in review" |

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
