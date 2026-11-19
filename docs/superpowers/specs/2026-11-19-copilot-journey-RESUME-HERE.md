# Copilot journey: resume here (2026-11-19)

For the next conversation that picks up the copilot journey. Read this first, then the documents it points to.

## Where things are

- **Branch:** `feat/copilot-journey`, in the worktree `.claude/worktrees/copilot-journey` (links to its files need that prefix). The whole copilot is built on this one branch and merged once at the end (Cyril, 2026-11-13). **Nothing is pushed or merged without Cyril's say.**
- **Built and committed:** piece 1 (frame, tabs, guide, gates); piece 2 (brand KB chat, review walk, streaming D502/D503, change cards D505); D504 (images studied on send); D506 (a failed background job is said once in the thread); D507 (the review walk's own buttons are carried out by code). Next ADR numbers: **D508** reserved for page-follows, **D509** for turn traces, next free **D510**. D509 recorded.
- **Migrations:** 0062, 0063, 0064, 0065 (0065: turn traces). Cyril applies migrations himself; never apply one.
- **Tests:** full suite passes except two known image-generate failures (`composite-generate` and `image-generate` route tests, "refuses a deprecated model"), plus one known type error in `src/app/api/nodes/[id]/image-generate/route.test.ts`. Not caused by this branch.

## Next step (order set by Cyril, 2026-11-19): turn traces, then page-follows

1. **Done:** `69dc1d3b`, words for an unreviewed field are saved even when the model reaches for a change card (QA 4.16).
2. **Done: turn traces (D509)**, commits `15b2339`..`50d362e4`, reviewed once and fixed. Plan with its Outcome: `docs/superpowers/plans/2026-11-19-copilot-turn-traces.md`. A "Turns" switch in the copilot panel shows every turn's trace. Needs migration **0065** applied and the `copilot-trace-sweep` Trigger task deployed; until 0065 is applied, turns work and just log "could not keep the trace".
3. **Next: page-follows** (below). Its plan still needs Cyril's read; keeps ADR **D508**.

## Then: build "the page shows the copilot's work"

- **Spec (approved):** `docs/superpowers/specs/2026-11-19-copilot-page-follows-design.md`. A general principle: whatever the copilot changes on the page, the page shows it happening (go there, "Copilot is asking", working shimmer, landed highlight). First applied to the brand KB: review fields, the pre-build form's website and handles, the source list.
- **Plan (reworked to the general version, awaiting Cyril's read):** `docs/superpowers/plans/2026-11-19-copilot-page-follows.md`. 8 tasks. Execution: inline (native), test first, then one independent whole-branch review on the most capable model, then one fix pass. Cyril confirms the plan before building.
- **Cyril's decisions in it:** the page always follows (B), even mid-edit; the copilot's change wins over an unsaved edit of the same field (A); built as a general principle now (A), with an AGENTS.md rule and ADR D508.

## Waiting on Cyril

1. **Read the page-follows plan** (see below), then build it.
2. **Two open part-2 questions:** may the copilot fill any unreviewed field the person talks about, not only the one it asked? Should every "Save changes" write a line in the thread? (The third, "a chat answer against an unsaved edit", is settled by the page-follows spec §3.2.)
3. **Piece 4:** do internet research findings stay with that script or also go to market research? Cyril owes a prompt for the extra script steps.
4. **Piece 6:** the canvas copilot's scope. Also unconfirmed readings: chat images go to brand assets; the canvas panel carries over the old copilot's actions.

## Owed before the one merge

- **Migration numbers collide:** origin/staging has `0062_client_review_versions.sql`; this branch's 0062–0065 must be renumbered when origin/staging is brought in.
- Deploy `copilot-trace-sweep` (daily) with the other Trigger.dev tasks.

- Trigger.dev deploy to staging (the `kb-propose` task; the 5-minute dead-job sweep, which now also writes failure lines).
- Browser and live-model testing. QA checklist: https://claude.ai/artifact/UToPeePMU1WYob2yoUJQWm (private; 74 checks; repo copy `docs/qa/2026-11-18-copilot-journey-manual-qa.md`). Regenerate it from the markdown with the scratchpad generator, or rebuild one, after the QA file changes.
- Bring origin/staging into the branch (it has moved ahead).
- The problem-solution spec picked up by mistake is still in history at `bb222f62` (untracked since `28e0385a`): leave it, or rewrite history before the push. Cyril's call.
- A staging check that a reply is saved when the tab closes right after sending.

## Pieces still to build

2b (Image Analysis through a change card), 3 (market research agent), 4 (scripting in the panel), 5 (visualise and review guidance), 6 (canvas guidance). Each follows: design pass, spec, plan, build. Each adds its targets to the page-follows mechanism instead of its own.

## Open findings from the context rebuild (for after traces exist)

The model was told everything it needed on the turn where it said "Confirmed that field." and called no tool. Likely causes, not proven: the history keeps the model's words but not which tools it called; rules for other stages are still sent on every turn; calling a tool is optional (`tool_choice: auto`); the waiting field is named only after the 43 field lines. Page: https://claude.ai/artifact/HAt3HzDgp7L1V7YQpARpzN

## Records to keep updated

- **ADR log:** `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` §7, append in place (the file is CRLF).
- **Team design journal:** https://claude.ai/artifact/7yU5A2TiWyxDLTwgaXpjHC (24 entries). Append an entry on every copilot decision and republish.
- **QA plan:** add checks as each piece is built.

## How Cyril likes to work

- Superpowers flow every time: spec (what, not how), then plan, then build test-first, then one review, then one fix pass. No feature code without an approved plan.
- Questions one at a time: how it works today, the options, a recommendation. Never decide a product question silently; flag your own decisions as "my call".
- Plain language; say "avatar", not "presenter". Show the *why*.

## Practical traps on this machine

- Writing JS or TS through a bash heredoc turns `\n` inside strings into real newlines: write files directly, or build the backslash with `String.fromCharCode(92)`.
- Many files are CRLF: normalise to `\n` to match, and restore CRLF when writing.
- The Kling test can time out on a cold run: re-run it alone before investigating.
- `npx tsx` scripts that need `@/` imports and `@supabase/supabase-js` must run from inside the worktree, wrapped in an `async main()` (no top-level await).
