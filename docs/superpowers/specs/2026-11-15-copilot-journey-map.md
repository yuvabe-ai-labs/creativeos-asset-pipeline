# Copilot journey: how the pieces fit

**Date:** 2026-11-15
**Parent spec:** [2026-11-12-copilot-journey-design.md](2026-11-12-copilot-journey-design.md)
**Status:** decisions A and B in section 5 were made by Cyril on 2026-11-15. The rest awaits his review. Lines marked *(my call)* are technical calls I made and can be overruled. Lines marked **Question** are yours to decide; nothing is built on a guess about them.

The journey is built as six pieces on one branch and merged once. Each piece gets its own spec and its own detailed plan when we reach it. This document is the part that is planned for all of them now: what is built once and shared, what each piece adds, where one piece hands over to the next, and which open questions block which piece.

It is the one place in this set of documents that names tables and files, because the connections between pieces are made of them.

## 1. The picture

```
 STAGE PAGES (client level)                       INSIDE ONE SCRIPT
 ┌───────────┐   ┌────────────────┐   ┌─────────┐   ┌───────┐  ┌───────────┐  ┌────────┐  ┌────────┐
 │ Brand KB  │──▶│ Market research│──▶│ Scripts │──▶│ Write │─▶│ Visualise │─▶│ Review │─▶│ Canvas │
 └───────────┘   └────────────────┘   └─────────┘   └───────┘  └───────────┘  └────────┘  └────────┘
   piece 2, 2b        piece 3           piece 4      piece 4       piece 5      piece 5     piece 6
       │  approve KB      │ approve research  │ script created            client approves board
       ▼                  ▼                   ▼                                    ▼
   opens market       opens scripts      thread changes                      canvas is created

 ◀──────────── the onboarding thread ────────────▶◀──────────── that script's own thread ───────────▶
          one per client, saved (new)                     one per script, saved (exists today)
```

One panel on the left the whole way. Which thread it shows depends on where the person is: a stage page shows the client's onboarding thread, a script shows that script's thread.

## 2. Built once, used by every piece

| Shared thing | What it is | Built in | Used by |
|---|---|---|---|
| Frame, stage tabs, gates | The tabs across the top, locked and approved states | Piece 1 (done) | All |
| Panel shell and rail | The card on the left, the fold, the rail that shows "waiting for you" | Piece 1 (done), made reusable in piece 2 part 1 | All; the script copilot moves into it in piece 4 |
| Onboarding thread store | One saved thread per client | Piece 2 part 1 | Pieces 2, 2b, 3, and the lead-in to a first script in piece 4 |
| Message shape | Every message has the same parts: who said it, text, an optional card, reply choices, attachments | Piece 2 part 1 | Both thread stores |
| Status line | "Reading the website", then "Read the website" | Piece 2 part 1 | All |
| Question with reply choices | One question, likely answers as buttons | Piece 2 part 1 | All |
| Composer with attachments | The input, with pick, drop and paste | Piece 2 part 1 | Pieces 2, 3, 5 (a product image for a shot) |
| Waiting for you | The one thing the person must do next, also on the rail | Piece 2 part 2 | All |
| Gate card | The next approval and what it opens | Piece 2 part 2 | Pieces 2, 3, 5 |
| Who approved | A record of the person who approved a stage or a card | Piece 2 part 2 | Pieces 2, 2b, 3 |
| Change card | Before and after, keep or drop each item, approve or discard, out of date if edited by hand | Piece 2 part 3 | Pieces 2, 2b, 3 |
| Agent loop | The small loop that lets a model call tools, with the model passed in | Piece 2 part 1 | Pieces 2, 3 and 4 (the script copilot's steps use it for optional tool calls) |

**The rule this table sets:** a shared thing is built generic the first time, in the piece that needs it first. It is named after the journey or the thread, never after the brand KB. A stage supplies only what is its own: its agent's instructions, its tools, what counts as "running", and the content of its cards.

## 3. What each piece adds of its own

- **Piece 2, brand KB chat.** The KB agent (tools: save the website, save the handles, start the build; later, answer a field and propose a change). KB status lines read from the real build. Parts 2 and 3 add the review walk and KB change cards.
- **Piece 2b, Image Analysis card.** No new shared thing. A re-study of the images produces a change card instead of writing.
- **Piece 3, market research.** The research agent and its tools. Market status lines. The gate card and "who approved" for market research. Change cards for research added after approval.
- **Piece 4, scripting in the panel.** The script copilot keeps its fixed steps and gains optional tool calls inside a step, on the shared loop (decided 2026-11-15). It is shown inside the shared shell and starts with the approved KB and research in hand. The hand-over from the onboarding thread to a script's thread.
- **Piece 5, visualise and review.** Guidance in the script's thread. Attachments in a script's thread. A gate card for sending to the client.
- **Piece 6, canvas.** The panel appears in the canvas editor showing the script's thread. The old canvas copilot is retired.

## 4. Hand-overs between pieces

| When | What happens | Already exists? |
|---|---|---|
| The brand KB is marked ready | Market research unlocks | Yes, piece 1 |
| Market research is approved | Scripts unlock | Yes, piece 1 |
| An approved change card is applied | The one live KB (or research) changes; the next turn on any script reads it | Piece 2 part 3 |
| A script is created | The panel switches from the onboarding thread to that script's thread, with a link back | Piece 4 |
| The client approves the storyboard | The canvas is created and the script's thread follows it there | Creation exists; the panel in the canvas is piece 6 |

What flows forward as data: the brand KB (one live copy per client), the approved research, and the audience section of the KB, which later drives avatar suggestions.

## 5. The riskiest connection: two places a thread is saved

Today a script's conversation is saved per script (`client_script_messages`). It cannot hold a message unless a script exists. The onboarding thread starts before any script, so it needs its own store (`client_copilot_messages`). That gives two stores.

*(My call)* Keep both, and make them look the same from the outside:

- The onboarding thread lives in the new per-client store.
- A script's thread stays where it is today. Nothing is migrated.
- Both return messages in the same shape, so the panel, the cards and the composer do not care which store a message came from.

Rejected: moving every script's conversation into the new store. It would move live data for no change the person can see. The script copilot keeps its engine (decision B below), so its saving stays as it is.

**Decided by Cyril on 2026-11-15:**

- **A. The onboarding thread carries only the lead-in to the first script** (what the reel is for, the angle, who leads). The script is then created and the drafting happens in the script's own thread, with a link back. The first script behaves like every later one.
- **B. The script copilot keeps its path decided by code, and gains optional tool calls.** The order of steps stays fixed, as today. Inside a step the model may call a tool when it needs something brought in, such as research or a brand KB fact, and then finishes the step. Cyril first chose a full rebuild as a free tool-calling agent, then settled on this middle ground the same day.

What decision B asks of the shared pieces:

- The agent loop built in piece 2 part 1 must be usable inside a single step: the model may call tools, and then must end with the strict structured answer that step expects (three angles, a draft). The brand KB chat ends with plain words, so the loop has to allow both endings.
- The loop must not assume one model provider. Scripts are drafted by a different model from the one that drives the brand KB chat, so the model stays something that is passed in.
- The script copilot's tools only bring things in. Anything that changes the script still goes through the steps and the before-and-after card the code already owns.
- The before-and-after card the script copilot has today and the change card built in piece 2 part 3 should end up as one card.

**Decided with B:** inside a script, the copilot has a research tool. By default it brings in research the client already has. It searches the internet only when the person says so.

What that leaves open, for piece 4's spec: whether something found on the internet is used for that one script only, or is also offered to the client's market research (which would need a before-and-after card and an approval, by the rule in the parent spec section 4.5).

For the record, the questions as they were asked:

**Question A (piece 4): where does the conversation about writing the first script live?** The parent spec says the onboarding thread "covers writing the client's first script" and also that it "ends once that first script is created". These pull apart, because today a script is created at the start of writing, not the end.

- *Option 1:* the onboarding thread carries the lead-in only (what the reel is for, the angle, who leads). The script is then created and the drafting happens in the script's own thread, as it does today. A link at the top leads back.
- *Option 2:* the whole first draft is written inside the onboarding thread, and the script's own thread starts at visualise.

I recommend option 1. It matches "ends once the first script is created", it leaves the script copilot's saving untouched, and the first script behaves like every later one. Option 2 means the script copilot has to save to two different places depending on whether a script is the client's first. Nothing in pieces 2, 2b or 3 depends on the answer.

**Question B (piece 4): does the script copilot become a tool-calling agent?** You decided on one agent per stage with tool calling. The script copilot today is not that: it is a fixed sequence of steps, and it works. Piece 4 can move it into the shared panel and give it the approved KB and research without changing its engine. I recommend leaving the engine alone. Rebuilding it as a tool-calling agent is a separate decision with its own risk to script quality.

## 6. Where an agent runs

*(My call)* The agent loop does not know where it runs. Each stage picks:

- **Brand KB:** inside the request. Its tools are quick saves. The long work, the build, already runs in the background and writes into the thread when it lands.
- **Market research:** in the background. Researching competitors is long and paid, and the project rule is that long or paid work never runs inside the browser's request. The agent writes its status lines and results into the thread as it goes, the same way the KB build does.

- **Scripting:** as today. Its steps and where they run do not change.

So the thread store must accept messages from a background job as well as from a person's turn. The KB build already does this in part 1, which proves the path before piece 3 needs it.

## 7. Open questions, by the piece they block

None of these blocks piece 2 or 2b.

| Piece | Question |
|---|---|
| 3 | Who may approve market research: any teammate, or a named role? (Parent spec, question 2) |
| 3 | How do the copilot's themes relate to the Signals tab, and do Direct, Adjacent, Signals and Performance stay as they are? (Question 3) |
| 3 or 4 | Is "what kind of stories" part of market research, part of scripting, or its own step? (Question 4) |
| 4 | Is research found on the internet from inside a script kept for that script only, or also offered to market research through a change card? |
| 4 | Which extra steps would make scripts more consistent, interesting and detailed? (Question 5) |
| 5 | Is an image attached in a script's chat saved to brand assets for later scripts, or kept with that one script? (Question 1) |
| 5 | Where does the planned internal approval sit in a script's steps? (Question 7) |
| 6 | What does the copilot do on the canvas beyond references and prompts, and do the "next node" buttons stay? (Question 6) |

## 8. What this changes in the piece 2 part 1 plan

Checking the plan against sections 2, 5 and 6 found four things named or shaped for the brand KB that every stage will use. The plan is not changed yet. Once this map is approved, the plan is corrected to match:

1. **The message shape and the thread store's types** were named after the KB. They become the thread's, in their own folder.
2. **The message, status lines, composer and attachment chip components** were KB components. They become thread components; the KB panel only wires them to the KB agent and the KB upload.
3. **Reading the thread** had a KB route and a KB cache key. Market research will read the same thread, and the same data must not be cached twice. There will be one thread read and one key. Sending a turn stays per stage, because each stage has its own agent.
4. **The decision record for the agent (D497)** said stage agents run inside the request. It will say the loop runs wherever the stage puts it, per section 6.
