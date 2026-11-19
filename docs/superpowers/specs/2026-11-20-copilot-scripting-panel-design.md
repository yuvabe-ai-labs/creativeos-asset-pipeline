# Scripting in the panel, part 1: the script's copilot stays with the script (piece 4.1)

**Status:** approved by Cyril, 2026-11-20 (the recommended way: the panel on every script page now; the message box and abilities at Visualise arrive with piece 5). **Next: write its plan.**
**Part of:** the copilot journey (`2026-11-12-copilot-journey-design.md`), piece 4. Built on the same branch. Piece 4 is built in two parts (Cyril, 2026-11-20): **4.1, this spec**, and **4.2, the extra script steps** (a confirmed one-sentence message, three hooks, an approved outline, checks after the draft), which gets its own spec. A tool for the copilot to bring things in (4.3 in the map) is **not** part of piece 4: the script copilot is already given the client's market signals and brand KB, and internet search arrives with market research (piece 3).

## 1. Problem

The journey is meant to be one copilot panel the whole way, from the brand KB to the canvas. For scripts it breaks in three places.

1. **Starting a script is outside the copilot.** On the Scripts tab the panel only shows a static guide. A person starts a script with the page's "New script" button; the copilot does not offer it.
2. **The script's copilot disappears as soon as the script is written.** It is shown only while a script is at Generate. Once the script is marked final and moves to Visualise, client review, or approved, the page has no copilot panel at all. The conversation that produced the script is gone from view, and there is nowhere for later guidance (piece 5) to be said.
3. **Inside a script there is no way back in the panel.** The client's thread and the script's thread are separate, and nothing in the panel says so or links them.

## 2. Decided by Cyril

- The client's thread only **offers to start** a script. Every script, the first included, asks its questions (format, occasion, who leads, angles) in its own thread, as today. (2026-11-20, option A; narrows the 2026-11-15 "lead-in" decision.)
- Two saved threads stay: one per client, one per script. Nothing is migrated. (2026-11-15)
- The script copilot keeps its steps in an order decided by code; its engine is not rebuilt. (2026-11-15)
- A script's steps stay Write, Visualise, Client review, Canvas. Inside a script there are no client tabs. (2026-11-15, 2026-11-16)
- Pasting an existing script skips the gates. (2026-11-12)
- **The copilot can do everything the person can do on the page it sits beside** (2026-11-20). At Visualise that means changing the script and its shots, casting, locations, products and picking takes, and reopening the script. Two things stay a person's click, by the journey's standing rule: drawing panels (it costs money) and sending the board to the client. For those the copilot puts the button in the thread and the person presses it. The copilot's changes to script text and shots come as before-and-after cards the person accepts, as at Generate. **This spec only puts the panel there; piece 5 gives the copilot those abilities** (see §3.2).

## 3. What changes

### 3.1 The Scripts tab: the copilot offers to start a script
On the client's Scripts tab, the panel's guide gains the action itself.

- **Scripts are open** (market research is approved): the guide says scripts are open and shows a **"Start a script"** button. Pressing it does exactly what the page's "New script" button does: an empty script is created and opened.
- **Scripts are locked** (market research not approved): the guide says why, as today, and offers **"Paste a script"**, which is what the page's own button offers while locked.
- The page's own button stays. The two do the same thing.
- *(My call)* The Scripts tab's panel stays a guide, not a chat: there is no message box, because no agent answers on this tab. The offer is a line and a button written by code.
- *(My call)* The button reads "Start a script" whether or not the client has scripts already.
- *(My call)* The button appears wherever the Scripts guide appears: the guide is also shown on the Avatars and Brand assets tabs while scripts are the client's current stage. While locked, the guide keeps its "Go to market research" link beside "Paste a script".

### 3.2 Inside a script: the copilot panel is there at every step
The script's copilot panel is shown on the script's page at **every** stage, not only at Generate.

- **At Generate:** as today. The conversation, the cards, the message box, the suggestions.
- **At Visualise, In review and Approved:** the same panel, showing the same saved thread, so the person can read how the script came to be. This covers all three pages a script has after Generate: the storyboard with the team's review, the approved version with its review, and the plain read-only script (an approved script with no review). It gets its **message box at these stages in piece 5**, together with the abilities behind it (the principle in §2): a box nothing answers misleads, and until piece 5 the script copilot can only act at Generate. The whole copilot is merged once, so nobody is ever shown the in-between. Under the thread it says what stage the script is at and what is waiting (§3.4).
- **A script that was pasted** has a thread too (the import), and is shown the same way.
- **A script reopened** from Visualise goes back to Generate and gets its message box back, as today.
- **Cards in the thread are read-only after Generate** *(my call)*. The angle, confirmation, proposal and import cards keep showing what they showed, with no working buttons: their actions only apply while the script is at Generate. A proposal or import still waiting when the script was marked final is shown as it was, without buttons; it becomes live again if the script is reopened.
- The panel folds to the rail at every stage. *(My call)* Folding is remembered per script in this browser in **two** memories: one for Generate, which starts open as today, and one for the later stages, which starts folded. Unfolding at Visualise stays unfolded through In review and Approved; reopening the script brings back whatever was chosen at Generate.
- *(My call)* On a narrow screen nothing changes at Generate (the chat stacks above the script, as today). At the later stages the panel is not shown on a narrow screen, so the storyboard keeps the page.

### 3.3 The way back
- The panel's header inside a script carries a link back to the client's Scripts tab, where the client's own copilot is. *(My call: it reads "‹ {client name}".)*
- The page's own trail (Clients › client › Scripts › script) stays as it is.

### 3.4 "Waiting for you" in a script
The panel and its folded rail say what the person is waited on, worked out fresh each time from the script as stored, as on the brand KB (D500). *(My calls, the exact lines:)*

| The script is… | The panel and rail say |
|---|---|
| at Generate, not written yet (the copilot is asking for the format, the occasion, who leads, an angle, or to confirm) | Waiting for you: answer the copilot |
| at Generate, empty, on a client whose scripts are locked | Waiting for you: paste your script |
| at Generate, a pasted script asks who plays whom | Waiting for you: answer the copilot |
| at Generate, a change or an import card is waiting | Waiting for you: review the change |
| at Generate, written, with open items left (things the script still needs before it can be final) | Waiting for you: settle the open items |
| at Generate, written, nothing open | Waiting for you: mark the script final |
| while the copilot is answering | nothing (the rail reads "Copilot") |
| at Visualise | Waiting for you: finish the storyboard and send it for review |
| in review | Waiting for the client's review *(my call: one line for the whole stage here; what the copilot says once the client has commented is decided in piece 5)* |
| approved, no canvas yet | Waiting for you: create the canvas |
| approved, with a canvas | nothing waiting |

### 3.5 One look
The script's panel and the client's panel are one panel: the same card, header, fold, rail and message styles, so moving from the Scripts tab into a script does not change the copilot's shape. The script copilot's own cards (angles, market research, confirmation, proposals, import) keep working as they do.

## 4. Goals, non-goals, anti-goals

**Goals**
- A person can start a script from the copilot.
- The script's conversation is on screen at every step of the script.
- Piece 5 (visualise and review guidance) has a panel to speak in.

**Non-goals (this piece)**
- The extra script steps (4.2).
- Anything the copilot says or does at Visualise and Client review beyond the "waiting" line, including its message box there (piece 5, by the principle in §2).
- Tools, internet search, turn traces for script turns (they come with the shared loop, with piece 3).
- Merging the script's before-and-after card with the brand KB change card.
- A chat on the Scripts tab, or showing the client's thread inside a script.
- The page following the copilot inside a script (D508 targets for script beats): a later piece.
- The canvas (piece 6).

**Anti-goals: it fails if…**
- Any script copilot behaviour at Generate changes: its steps, wording, cards, drafting, or saved messages.
- A script's saved thread is moved, copied or rewritten.
- A message box is shown where nothing answers yet.
- The Visualise, review or approved pages lose width they need for the storyboard or the comments (the panel folds, and starts folded when the page needs the room *(my call: it starts folded at Visualise, In review and Approved, open at Generate)*).
- A script page makes a second request for the thread on load, or polls for it where it did not before.

## 5. Constraints

- No new request: the script page already loads the script's thread on the server at any stage and hands it to the page; the later stages use that, with no polling.

- AGENTS.md: shadcn primitives only; the design system; one look per concept; TanStack Query three layers; performance rules (nothing per item; no new polling).
- The script's thread stays in its existing store, read through its existing route.
- Streaming (D502) already holds for the script copilot at Generate and is not changed.

## 6. Left to the builder

How the script's panel comes to share the client panel's shell; how the thread is loaded at the stages that do not load it today; where the "waiting" line is worked out; the exact layout of the back link.

## 7. Success

Cyril opens a client whose market research is approved, goes to Scripts, and presses "Start a script" in the copilot. The script opens with its copilot asking the first question, exactly as today. He writes the script and marks it final: on the Visualise page the copilot panel is still there, folded, and unfolding it shows the whole conversation and "Waiting for you: finish the storyboard and send it for review". From the panel he goes back to the client with one click.
