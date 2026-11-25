# Handoff: piece 3 (market research agent + "Built from") — start here

**Written 2026-11-24** for a new conversation. Read this, then the spec and the plan. Nothing in
piece 3 is built yet.

## What to do next

1. **Make a new worktree for piece 3** (Cyril asked for one, 2026-11-24). Branch it from
   `feat/copilot-journey` at `5162854a` or later: that is `origin/staging` (`56d33e69`) plus the
   piece 3 spec and plan commits. Suggested name/branch: `.claude/worktrees/market-research`,
   `feat/market-research`.
   - Run `npm install` in the new worktree (never junction `node_modules`; Turbopack rejects it).
   - Copy `.env.local` from `.claude/worktrees/copilot-journey/.env.local`. **That copy has the new
     working Gemini key (`AQ.Ab8RN…yV5g`).** The main repo's `.env*` files still hold the old,
     depleted key (`…meIw`).
   - Don't run a second `next dev` from a worktree whose dev server is already running: both write
     the same `.next` folder and corrupt it (it happened on 2026-11-23 and caused a 404).
2. **Execute the plan natively** (Cyril chose "Native"): use `superpowers:executing-plans`, task by
   task, test-first, then **one** fresh whole-branch review on the most capable model, then one fix
   pass. Ledger in the plan's workspace.
   - Plan: `docs/superpowers/plans/2026-11-24-copilot-market-research.md` (13 tasks).
   - Spec (approved 2026-11-24): `docs/superpowers/specs/2026-11-24-copilot-market-research-design.md`.
3. Task 2 adds **migration 0067** (`moodboard_items.reading jsonb`). Cyril applies migrations
   himself. Never apply one; tell him when it is ready.
4. Nothing is pushed or merged without Cyril's say.

## Piece 3 in one paragraph

Once the brand KB is approved, the onboarding copilot (same panel and thread as the Brand KB tab)
helps fill market research **in steps the person reviews**: (1) it web-searches and proposes brands
in Direct/Adjacent as a card the person edits and confirms; (2) a background job brings in each
confirmed brand's recent Instagram posts as ordinary references; (3) a second job reads the posts
(video where archived) and drafts **signals** (signals are the themes) as cards to keep, edit or drop;
(4) a person approves market research. Scripts get a **"Built from"** line naming their signals: set
by the picked angle, editable, steering angles and draft; after the draft a change makes the copilot
offer a rewrite. Research asked for inside a script is handed to the market research agent.

## Decisions Cyril made on 2026-11-24 (do not reopen)

- The agent helps populate; research and theme creation happen in steps the user reviews and tweaks.
- Signals are the themes (no new kind of thing).
- A signal may describe creative patterns (hooks, formats, pacing, on-screen text) as well as where
  and when; still never claims, proof, health language, product uses or disclaimers (refines D255).
- "Built from" option A: follows the picked angle; signals set before the angles limit the angles.
- The script copilot uses the market research agent for research; findings go to market research.
- Confirmed competitors do **not** become tracked handles in this piece.
- Approach A (find → confirm → fetch → group), Native execution.

ADRs to append in plan Task 1: **D529–D532** (next free was D529; D538–D550 belong to the
permissions work, so D529–D537 are free for us).

## Where things stand (2026-11-24)

- `origin/staging` = `origin/feat/copilot-journey` = **`56d33e69`**. It includes the copilot journey
  pieces 1, 2, 4.1, 5.1; the QA fixes (`e6617e63` tripled fields, `85f2617d` D528 no "Copilot is
  asking" mark, `c6920792` Gemini key fingerprint log); staging's permissions/email work (merged
  `a9b5e6c9`); and the schema map up to 0066.
- Local-only on `feat/copilot-journey`: `1ab2ca98` (piece 3 spec), `5162854a` (piece 3 plan), and
  this handoff commit.
- Staging DB has migrations 0063–0066 (ours) and the permission work's paired 0062–0065.
- Untracked on purpose: `docs/superpowers/specs/2026-11-12-copilot-journey-problem-solution.md`
  (never `git add docs`), and `docs/qa/test-files/` (sample brand docs "Tamarind & Tide", for QA).

## Owed by Cyril (outside the code)

- Put the new Gemini key on the **deployed staging app** and the **staging Trigger.dev project**
  (they still use the depleted `…meIw`; the script copilot fails there with HTTP 402 until then).
  Also update the main repo's `.env`, `.env.local`, `.env.staging`, `.env.production`.
- Check the "Deploy staging" GitHub Actions run for `56d33e69` is green.
- QA on staging: https://claude.ai/artifact/UToPeePMU1WYob2yoUJQWm (131 checks; regenerate from
  `docs/qa/2026-11-18-copilot-journey-manual-qa.md` with the generator when the QA file changes).

## Still open after piece 3

- Pieces still to build: **5.2** (copilot at client review), **6** (canvas), **4.2** (extra script
  steps; parked last). Each: design pass → spec → plan → build.
- Open questions for Cyril: should every "Save changes" on the Brand KB write a thread line? 5.2:
  what the panel says once the client commented, and whether it proposes changes from comments.
  6: the canvas copilot's scope. 4.2: his own prompt or the stand-in. D503 (staging's KB redirect
  makes QA 1.5 fail): which behaviour stays.
- Production runbook entries (`docs/auth-production-migration.md`) owed for 0063–0066 (+0067).
- Older context: `docs/superpowers/specs/2026-11-19-copilot-journey-RESUME-HERE.md` (pieces 1–5.1).

## How Cyril works (short)

Frontend design engineer learning backend; wants the *why*, in plain language. One question at a
time, each with how it works today, the options and a recommendation; never decide a product
question silently (mark your own calls "my call"). Superpowers flow for anything new. Say "avatar",
not "presenter". shadcn primitives only. Add files by name. Commits end with
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Links to worktree files need the
`.claude/worktrees/<name>/` prefix.
