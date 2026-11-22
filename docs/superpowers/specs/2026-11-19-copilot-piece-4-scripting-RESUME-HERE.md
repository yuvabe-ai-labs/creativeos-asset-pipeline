# Copilot journey, piece 4 (scripting in the panel): resume here

For the conversation that picks up piece 4. Read this, then `2026-11-19-copilot-journey-RESUME-HERE.md` (the whole branch), then the documents named below. **Nothing here is a spec yet.** The next step is a design pass with Cyril, then a spec, then a plan, then the build.

## What piece 4 is

The script copilot moves into the shared copilot panel, so a person goes from the client's stage pages into a script without the copilot changing shape. From the journey map (`2026-11-15-copilot-journey-map.md`, approved 2026-11-15):

- The script copilot is shown inside the shared panel shell.
- It keeps its steps in an order decided by code. Inside a step, the model may call a tool to bring something in, on the shared agent loop.
- It has a research tool: by default it brings in research the client already has; it searches the internet only when the person says so.
- When a script is created, the panel switches from the client's onboarding thread to that script's own thread, with a link back.
- The script copilot's before-and-after card and the brand KB change card should end up as one card.

## Decided by Cyril (do not reopen)

- The onboarding thread carries only the lead-in to the first script (what the reel is for, the angle, who leads). Every script, the first included, is drafted in its own thread. (2026-11-15)
- The script copilot keeps its code-decided steps; it is not rebuilt as a free agent. (2026-11-15)
- Research inside a script: the client's existing research by default; the internet only when asked. (2026-11-15)
- Two saved thread stores stay: one per client (new), one per script (as today). Nothing is migrated. Both look the same to the panel.
- A script's steps stay Write, Visualise, Client review, Canvas. No internal review.
- Pasting an existing script skips the gates.
- The whole copilot is built on one branch and merged once.

## Open, for Cyril (ask one at a time: how it works today, the options, a recommendation)

1. **The extra script steps.** Cyril said he would supply a detailed prompt. Until then the stand-in (Claude's call, 2026-11-15, parent spec §8 item 5) is: (a) a confirmed one-sentence message after the angle; (b) three hook options before the draft; (c) a short outline approved before the draft (hook, message, proof, call to action, length and platform); (d) after the draft, the copilot checks the spoken length, whether the first three seconds state the point, and the compliance words. Ask whether to build on the stand-in or wait for his prompt.
2. **Internet findings.** Do they stay with that one script, or are they also offered to the client's market research through a change card and an approval?
3. **The lead-in in the onboarding thread.** What exactly is asked there before the script exists, and what the hand-over looks like (the moment the script is created and the panel switches thread).
4. **One card.** Whether merging the script's proposal card with the brand KB change card is part of this piece or left for later.
5. **Order against piece 3.** The map has the two research tools built in piece 3 (market research) and reused here. Piece 3 is not built. Options: build piece 3 first; build the "read existing research" tool here; or ship piece 4 without research tools and add them when piece 3 lands.

## How scripting works today

- **Page:** `src/app/clients/[id]/scripts/[scriptId]/page.tsx`. Inside a script there are no client tabs (decided while testing piece 1).
- **Its own chat panel:** `src/components/scripts/generate/` (`copilot-chat.tsx`, `copilot-composer.tsx`, the cards, `copilot-rail.tsx`, `generate-workspace.tsx`). It folds with the same hook as the journey panel (`useCopilotCollapsed`), and was built to look like the journey shell.
- **The steps:** `src/lib/scripts/copilot/brief.ts` (`nextStep`): ask format, ask occasion, ask who leads, offer angles, show the confirmation card, confirm, then edit. `turn.ts` runs a turn; `draft.ts` / `draft-call.ts` write the draft; `import-turn.ts` handles a pasted script. Prompt: `src/prompts/script-copilot.ts`.
- **Its turn route:** `src/app/api/clients/[id]/scripts/[scriptId]/turn/route.ts`. It streams newline-delimited JSON (D337), the pattern the brand KB chat copied.
- **Its saved thread:** `client_script_messages` (`src/lib/db/script-generate.ts`).
- **It does not use the shared agent loop** (`src/lib/journey/agent.ts`). The brand KB turn is the only caller today.
- **Earlier script copilot specs:** `2026-10-07-script-copilot-design.md` and the `2026-10-08-script-copilot-*` files; ADRs D328, D337, D360–D373.

## What piece 4 gets from what is already built

- **The panel shell and rail:** `src/components/journey/journey-panel-shell.tsx`, and the thread parts beside it (`thread-message.tsx`, `thread-composer.tsx`, `thread-status-lines.tsx`).
- **The agent loop** with tools, a strict final answer, streaming, and a trace sink: `src/lib/journey/agent.ts`.
- **Turn traces (D521):** pass a `traceRecorder()` to `runAgent` and store the row after the answer has gone. The traces table and marks are brand-KB shaped today (`thread in ('onboarding')`, `kb-copilot/trace.ts`), so a script turn needs the table and the marks widened. AGENTS.md "Turn traces".
- **The page shows the copilot's work (D520):** name the script's targets (a beat, a field, a cast slot), wrap them in `CopilotTarget`, call `useFollowCopilot` once on the page, and report changes by target id. AGENTS.md "The page shows the copilot's work".
- **Change cards (D517):** `src/components/journey/thread-change-card.tsx`, `src/lib/kb/changes/`.
- **Streaming rule (D514)** and the rule that code, not the model, carries out fixed choices (D513, D519, and the 2026-11-19 `propose_change` fix): a tool that knows the right action does it, and never asks the model to try again.

## Constraints from the map

- The loop must not assume one model provider: scripts are drafted by a different model from the brand KB chat.
- The script copilot's tools only bring things in. Anything that changes the script still goes through the steps and the before-and-after card the code owns.
- Script quality was tuned over many rounds; the steps and prompts carry that tuning. Changing their order or wording is a product decision, not a refactor.

## Working in parallel with piece 5

Piece 5 (visualise and review guidance) stands on this piece: it needs the script's thread in the shared panel. Two conversations building in the same worktree will overwrite each other. Either build piece 4 first, or give piece 5 its own worktree branched from this branch once piece 4's panel work has landed. Each piece takes its own ADR numbers: check the log's last number first (D521 was the last recorded; D520 is also taken).

## How Cyril likes to work

- Superpowers flow every time: design pass, spec (what, not how), plan, build test-first, one independent review, one fix pass. No feature code without an approved plan.
- Questions one at a time. Never decide a product question silently; mark your own decisions "my call".
- Plain language. Say "avatar", not "presenter". Show the why.
- Records to keep: the ADR log (`2026-05-30-creativeos-staging-roadmap.md` §7, CRLF), the team journal (https://claude.ai/artifact/7yU5A2TiWyxDLTwgaXpjHC, an entry per decision), the QA plan (`docs/qa/2026-11-18-copilot-journey-manual-qa.md`).
- Practical traps on this machine are listed at the end of the branch's RESUME-HERE doc.
