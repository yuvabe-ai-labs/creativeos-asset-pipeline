# Copilot journey: resume here (updated 2026-11-20, after piece 4.1 was built)

For the next conversation that picks up the copilot journey. Read this first, then the documents it points to.

## Where things are

- **Branch:** `feat/copilot-journey`, in the worktree `.claude/worktrees/copilot-journey` (links to its files need that prefix). The whole copilot is built on this one branch and merged once at the end (Cyril, 2026-11-13). **Nothing is pushed or merged without Cyril's say.**
- **Built and committed:** piece 1 (frame, tabs, guide, gates); piece 2 (brand KB chat, review walk, streaming D502/D503, change cards D505); D504 (images studied on send); D506 (a failed background job is said once in the thread); D507 (the review walk's own buttons are carried out by code). D508–D511 recorded; next free **D512**.
- **Migrations:** 0062, 0063, 0064, 0065 (0065: turn traces). Cyril applies migrations himself; never apply one.
- **Tests:** full suite passes except two known image-generate failures (`composite-generate` and `image-generate` route tests, "refuses a deprecated model"), plus one known type error in `src/app/api/nodes/[id]/image-generate/route.test.ts`. Not caused by this branch.

## Next step: piece 5 (the copilot acts at Visualise and client review): design pass

**Cyril parked piece 4.2 (the extra script steps) for the end of the journey (2026-11-20).** Next is piece 5, from `2026-11-19-copilot-piece-5-visualise-RESUME-HERE.md`. Then 3, 6, and 4.2 last.

**Piece 4.1 is built** (D511, plan with Outcome: `docs/superpowers/plans/2026-11-20-copilot-scripting-panel.md`; QA section 9). Next is a design pass and spec for **4.2**, then its plan, then the build, as before. One piece at a time, never in parallel (Cyril, 2026-11-20). Before 4.2, Cyril may want a look at 4.1's eight deferred minors (listed in its plan's Outcome); the one most likely to matter is the storyboard being squeezed on a laptop screen while the panel is unfolded.

What 4.1 was, in one line each (built):
- The Scripts tab's copilot guide offers **"Start a script"** (the same action as the page's "New script"; "Paste a script" while locked).
- The script's copilot panel is on the script's page at **every** stage (today it is only at Generate). At Visualise, In review and Approved it shows the saved conversation and what is waiting, with no message box yet.
- A link back to the client in the panel's header; "Waiting for you" lines per stage; one look with the client's panel.
- Nothing about how the copilot behaves at Generate changes.

Facts the 4.1 build relied on (kept for piece 5, which builds on the same panel):
- The script page (`src/app/clients/[id]/scripts/[scriptId]/page.tsx`) renders `GenerateWorkspace` only when `stage === "generate"`. There are **three** other layouts: `TeamReviewBoard`, `ApprovedReviewBoard`, and the plain `ScriptView` (an approved script with no review). All three need the panel.
- `loadGenerateState` / `getGenerateScript` do not filter by stage, so the server page can load the thread at any stage; `useGenerateState` takes `initialData` and does not poll. No new request is needed.
- `JourneyPanelShell` needs three things made adjustable: its fold key (hard-wired to the client), the rail's "Waiting for you:" prefix (it does not suit "Waiting for the client's review"), and its sticky offsets (they assume the client frame, which a script page does not have).
- The fold memory today is one flag per script (`src/hooks/use-copilot-collapsed.ts`, built on `use-stored-flag.ts`); the spec needs two per script.
- The script chat's cards (`copilot-chat-message.tsx`) have live buttons whose routes only write at Generate; the spec makes them read-only at later stages.
- Below `lg`, the client panel is hidden but the script chat stacks; the spec keeps Generate as it is and hides the panel at the later stages.

**After 4.1:** piece **4.2**, the extra script steps (needs its own spec; Cyril said the stand-in is fine for now: a confirmed one-sentence message, three hooks, an approved outline, checks after the draft). Then **piece 5** (visualise and client review) from `2026-11-19-copilot-piece-5-visualise-RESUME-HERE.md`. Then piece 3 (market research) and piece 6 (canvas). `2026-11-19-copilot-piece-4-scripting-RESUME-HERE.md` has the background on how scripting works today; where it disagrees with this file or the 4.1 spec, they win.

## Decisions Cyril made on 2026-11-20 (do not reopen)

- **One piece at a time**, spec by spec, never in parallel.
- **Piece 4 is two parts:** 4.1 (the panel and "Start a script") and 4.2 (the extra steps). **No tool or research part in piece 4:** the script copilot is already given the client's market signals and the brand KB; internet search arrives with market research (piece 3). So script turns are not on the shared loop yet and are not in turn traces.
- **The client's thread only offers to start a script.** Every script, the first included, asks its questions in its own thread.
- **Principle: the copilot can do everything the person can do on the page it sits beside**, including at Visualise (change the script and its shots, cast, locations, products, pick takes, reopen). **Two things stay a person's click:** drawing panels (paid) and sending the board to the client; the copilot puts the button in the thread. Its changes to script text and shots come as before-and-after cards. Piece 5 builds this; 4.1 only puts the panel there.
- **Image Analysis (piece 2b):** approach A, and after the review, option 1: the study is shown what the team approved and keeps those words unless the images differ.

## Built on 2026-11-19 and 2026-11-20 (all committed, nothing pushed)

- `69dc1d3b`: words for an unreviewed field are saved even when the model reaches for a change card (QA 4.16).
- **Turn traces (D509).** Plan with Outcome: `docs/superpowers/plans/2026-11-19-copilot-turn-traces.md`. A "Turns" switch in the copilot panel. Needs migration **0065** and the `copilot-trace-sweep` Trigger task.
- **The page shows the copilot's work (D508).** Plan with Outcome: `docs/superpowers/plans/2026-11-19-copilot-page-follows.md`.
- **Image Analysis through a change card (D510)**, plus the follow-up (summary prompt 1.2.0). Plan with Outcome: `docs/superpowers/plans/2026-11-20-copilot-image-analysis-card.md`. No migration.
- None of it has been run in a browser or against the live model. QA plan sections 6.26–6.36, 7 and 8, and check 4.16.
- Each plan's Outcome lists the minor review findings left for later.
- **Piece 4.1, scripting in the panel, part 1 (D511).** Plan with Outcome: `docs/superpowers/plans/2026-11-20-copilot-scripting-panel.md`. No migration. QA section 9.
- **Next free ADR number: D512.**

## Waiting on Cyril

1. **Apply migration 0065** and **deploy the Trigger.dev tasks** (`kb-propose`, the 5-minute dead-job sweep, the daily `copilot-trace-sweep`). Cyril applies migrations himself; never apply one.
2. **Browser and live-model testing** of everything built so far (see "Built" above).
3. **One open part-2 question:** should every "Save changes" write a line in the thread? (Filling a field the copilot did not ask about is built and fixed; a chat answer against an unsaved edit is settled by D508.)
4. **Piece 4.2:** Cyril may still supply his own prompt for the extra script steps; the stand-in is approved for now.
5. **Piece 3:** do internet research findings stay with that script or also go to market research?
6. **Piece 5:** the open questions in its resume doc (casting and locations at once or as a card; what the panel says once the client has commented; the gate before the client).
7. **Piece 6:** the canvas copilot's scope. Unconfirmed readings: chat images go to brand assets; the canvas panel carries over the old copilot's actions.

## Owed before the one merge

- **Migration numbers collide:** origin/staging has `0062_client_review_versions.sql`; this branch's 0062–0065 must be renumbered when origin/staging is brought in.
- Deploy `copilot-trace-sweep` (daily) with the other Trigger.dev tasks.

- Trigger.dev deploy to staging (the `kb-propose` task; the 5-minute dead-job sweep, which now also writes failure lines).
- Browser and live-model testing. QA checklist: https://claude.ai/artifact/UToPeePMU1WYob2yoUJQWm (private; out of date: the repo copy now has many more checks, through section 8; repo copy `docs/qa/2026-11-18-copilot-journey-manual-qa.md`). Regenerate it from the markdown with the scratchpad generator, or rebuild one, after the QA file changes.
- Bring origin/staging into the branch (it has moved ahead).
- The problem-solution spec picked up by mistake is still in history at `bb222f62` (untracked since `28e0385a`): leave it, or rewrite history before the push. Cyril's call.
- A staging check that a reply is saved when the tab closes right after sending.

## Pieces still to build

5 (visualise and client review), 3, 6, then 4.2 (the extra script steps, parked to the end by Cyril 2026-11-20) (visualise and client review: the copilot acts there), 3 (market research agent), 6 (canvas). Each follows: design pass, spec, plan, build. Each adds its targets to the page-follows mechanism instead of its own.

## Open findings from the context rebuild (for after traces exist)

The model was told everything it needed on the turn where it said "Confirmed that field." and called no tool. Likely causes, not proven: the history keeps the model's words but not which tools it called; rules for other stages are still sent on every turn; calling a tool is optional (`tool_choice: auto`); the waiting field is named only after the 43 field lines. Page: https://claude.ai/artifact/HAt3HzDgp7L1V7YQpARpzN

## Records to keep updated

- **ADR log:** `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` §7, append in place (the file is CRLF).
- **Team design journal:** https://claude.ai/artifact/7yU5A2TiWyxDLTwgaXpjHC (29 entries). Append an entry on every copilot decision and republish.
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
