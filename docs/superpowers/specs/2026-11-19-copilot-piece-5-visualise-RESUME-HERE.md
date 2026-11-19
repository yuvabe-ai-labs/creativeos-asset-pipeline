# Copilot journey, piece 5 (visualise and client review): resume here

For the conversation that picks up piece 5. Read this, then `2026-11-19-copilot-journey-RESUME-HERE.md` (the whole branch), then the documents named below. **Nothing here is a spec yet.** The next step is a design pass with Cyril, then a spec, then a plan, then the build.

## What piece 5 is

Guidance from the copilot through the Visualise and Client review steps of one script, in that script's own thread. From the parent spec (`2026-11-12-copilot-journey-design.md` §5.4) and the journey map (`2026-11-15-copilot-journey-map.md`):

- **The copilot** casts the lead, sets the location, checks the products and draws the storyboard panels.
- **The person** checks the board and sends it for client review. The copilot shows that step and what is still outstanding, and cannot send it.
- **Stays as today:** the visualise screen, the client review link, comments and versions, the client's approval.
- The map adds: attachments inside a script's thread (such as a product image), and a gate card before sending to the client.

That is all that is written. What "guidance" means on this screen, turn by turn, is not designed.

## Decided by Cyril (do not reopen)

- **The copilot can do everything the person can do on the page it sits beside** (2026-11-20: "the idea is that the copilot does everything that the user can do today"). At Visualise: change the script and its shots, cast avatars, set locations and products, pick between takes, reopen the script. It keeps its message box at Visualise, client review and approved.
- **Two things stay a person's click** (2026-11-20, the recommended path): drawing panels (paid) and sending the board for client review. The copilot prepares them and puts the button in the thread ("Draw 6 panels", "Send for client review"); the person presses it.
- **The copilot's changes to script text and shots come as before-and-after cards** the person accepts, as while writing.
- Piece 4.1 (`2026-11-20-copilot-scripting-panel-design.md`) only puts the panel on these pages, read-only. **This piece adds the message box and the abilities.**

- A script's steps stay Write, Visualise, Client review, Canvas. No internal review. (2026-11-15)
- Nothing is approved, sent to a client or generated without a person's click (parent spec §9). The copilot never sends the board to the client.
- An image attached in the chat is saved to the client's brand assets, so later scripts can use it (parent spec §8 item 1). The memory notes this as Claude's reading of a "yes": confirm it once before building on it.
- A script's thread stays with it through visualise, client review and the canvas.
- The whole copilot is built on one branch and merged once.

## Open, for Cyril (ask one at a time: how it works today, the options, a recommendation)

1. **Settled 2026-11-20** (see Decided): the copilot does everything that only changes the team's own work; drawing and sending are prepared as a button the person presses. Still open under it: whether casting, locations and products change at once when asked, or also come as a card to accept.
2. **What starts it.** Does the copilot speak when the script is marked final and Visualise opens, or only when asked?
3. **Readiness.** The screen already shows what is outstanding (cast, panels). Is the copilot's "what is left" the same list said in the thread, with the same "Waiting for you" on the rail as the brand KB?
4. **The gate before the client.** What the gate card says and checks before "send for client review", and whether it replaces or sits beside the existing review action.
5. **Client comments** (also: what the panel says while a script is in review once the client has commented; 4.1 says "Waiting for the client's review" for the whole stage). When the client comments or asks for changes, does the copilot say so in the thread, and does it propose changes (a change card) or only point to them?
6. **Attached images in a script.** A product image attached in the chat: where it goes (brand assets, per the earlier answer) and what the copilot does with it (offer it for a product slot?).
7. **Two open items from earlier work** (memory, Visualise storyboard sheet, D465/D466): a "client on-screen-text call", and a "dead shot-only panel view". Ask Cyril whether either belongs in this piece.

## How visualise and review work today

- **Script stages:** `generate`, `visualise`, `in_review`, `approved` (`src/lib/scripts/constants.ts`).
- **Visualise screen:** `src/components/visualise/` (`visualise-view.tsx`, `visualise-readiness.tsx`, `storyboard-grid.tsx`, the cast slots, the panel dialog, `generate-all-dialog.tsx`, `reopen-dialog.tsx`). Logic in `src/lib/scripts/visualise/` (`state.ts` works out readiness; `queue.ts`, `run-panel.ts`, `panel-prompt.ts` draw panels; `kits.ts`, `cast.ts`).
- **Routes:** `src/app/api/clients/[id]/scripts/[scriptId]/visualise`, `panels`, `cast`, `locations`, `mark-final`, `reopen`.
- **Client review:** routes under `.../review` (`share`, `stage`, `comments`); the client's page is `/r/[token]` (D310, D311). Review annotations: D239–D251.
- **Specs to read:** `2026-10-08-script-copilot-3-visualise-design.md`, `2026-10-08-script-copilot-4-client-review-design.md`, `2026-11-02-visualise-storyboard-sheet-design.md` (D465, D466), `2026-10-30-script-products-and-locations-design.md`, `2026-09-30-client-review-share-design.md`, `2026-10-16-storyboard-to-canvas-design.md` (D380–D386).
- **Related rule:** a review beat in a script comes only when the person asks (D464).

## What piece 5 stands on

- **Piece 4** (`2026-11-19-copilot-piece-4-scripting-RESUME-HERE.md`): the script's thread shown in the shared panel. Without it there is no panel on the visualise screen to guide from. **Piece 4 is not built.**
- **From piece 2, already built:** the thread composer with attachments (`thread-composer.tsx`, `use-thread-attachments.ts`), the gate card (`thread-gate-card.tsx`, with "Waiting for you" worked out fresh each read, D500), status lines, change cards (D505).
- **Turn traces (D509):** any agent turn here is traced. The traces table and marks are brand-KB shaped today, so a script turn needs them widened (piece 4 may do this first).
- **The page shows the copilot's work (D508):** name the visualise screen's targets (a cast slot, a location, a product, a storyboard panel), wrap them in `CopilotTarget`, call `useFollowCopilot` once on the page, and report changes by target id. This piece is a natural fit: "the copilot is drawing panel 4" is exactly a target being written.
- **Streaming (D502)** and background work: drawing panels is long and paid, so it runs in Trigger.dev and reports through status lines, never inside the request (AGENTS.md performance rule 12).

## Working in parallel with piece 4

Two conversations building in the same worktree will overwrite each other, and this piece needs piece 4's panel. The design pass and the spec for piece 5 can be done now, in parallel. The build should wait for piece 4's panel work to land, or run in its own worktree branched from this branch after that. Each piece takes its own ADR numbers: check the log's last number first (D509 was the last recorded; D508 is also taken).

## How Cyril likes to work

- Superpowers flow every time: design pass, spec (what, not how), plan, build test-first, one independent review, one fix pass. No feature code without an approved plan.
- Questions one at a time. Never decide a product question silently; mark your own decisions "my call".
- Plain language. Say "avatar", not "presenter". Show the why.
- Mockups and UI questions for the script copilot go on the design canvas as artboards (the journey mockups: https://claude.ai/artifact/VP7fUPMcBEbvyt1mKHwe4C, which has a "visualise and review" artboard).
- Records to keep: the ADR log (`2026-05-30-creativeos-staging-roadmap.md` §7, CRLF), the team journal (https://claude.ai/artifact/7yU5A2TiWyxDLTwgaXpjHC, an entry per decision), the QA plan (`docs/qa/2026-11-18-copilot-journey-manual-qa.md`).
- Practical traps on this machine are listed at the end of the branch's RESUME-HERE doc.
