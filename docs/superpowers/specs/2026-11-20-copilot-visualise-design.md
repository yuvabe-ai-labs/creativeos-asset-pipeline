# The copilot at Visualise (piece 5.1)

**Status:** approved by Cyril, 2026-11-20 ("go ahead", with both builder-check answers as recommended). Plan next.
**Part of:** the copilot journey (`2026-11-12-copilot-journey-design.md`), piece 5, on the same branch, merged once with the rest. Piece 5 is built in two parts *(my call)*: **5.1, this spec: the copilot at Visualise**, and **5.2: the copilot at client review** (what it says while the client reviews, and what it does with the client's comments), which gets its own spec. Stands on 4.1 (D511): the script's panel is already on the Visualise page, read-only.

## 1. Problem

Once a script is marked final, the storyboard needs work in a set order: an avatar for every character, pictures for locations and products, the panels drawn, and then a send to the client. Today:

1. **The copilot falls silent at Visualise.** Since 4.1 its panel is on the page, but it has no message box and cannot act. The person has to know the order of the storyboard work and find each control themselves.
2. **Nothing says what is still missing before the client sees it.** A board can be shared with shots that have no panel, and nothing points it out.
3. **Some changes need a detour.** Adding, removing or reordering a shot means reopening the script and taking it back to writing (D489), even for one extra shot.

## 2. Decided by Cyril

- **The copilot can do everything the person can do on the page it sits beside** (2026-11-20). At Visualise: change the script and its shots, cast avatars, set locations and products, pick between panel versions, reopen the script.
- **Two things stay a person's click** (2026-11-20): drawing panels, which costs money, and sending the board for client review. The copilot puts the button in the thread; the person presses it. The copilot never sends the board.
- **It leads** (2026-11-20, option A). From the moment the script is marked final, the copilot takes the person through the storyboard one step at a time, each step worked out by code from the board as it stands, with buttons. Doing a step by hand on the page moves it on. Typed requests are answered in between.
- **Cast, locations and products change at once** when asked, and the page shows them land (2026-11-20, option A).
- **Changes to the script's words and shots work as while writing** (2026-11-20; clarified the same day, option A): a change to one shot or one field applies at once, a change across several shots comes as a before-and-after card.
- **Missing pictures come before drawing** (2026-11-20, option A): the walk asks for location and product pictures before the draw, because adding one after drawing means paying to redraw; "Draw without them" is always offered.
- **Adding, removing or reordering shots is accepted right at Visualise**, on the copilot's card, with no reopen (2026-11-20, option A). A new shot arrives with no panel. **This relaxes D489 for the copilot's cards only;** the page's own controls are unchanged.
- **The send card is always available** (2026-11-20, option B). When something is missing it names it ("2 shots have no panel; the client will see them as text only"). Pressing it does what the page's Share does. The page's Share is unchanged.
- **A picture attached in the chat goes where the page would put it** (2026-11-20, option A): onto the product or location it is for, kept with this script, not added to brand assets. This replaces the earlier plan (parent spec §8 item 1), which was never confirmed. An "Also add to brand assets" button may come later; not in this piece.
- **Built as an extension of the writing copilot** (2026-11-20, approach A in §4): the same thread, the same message route, the same edits and the same before-and-after cards, now allowed at Visualise.
- Standing: nothing is approved, sent to a client or generated without a person's click (parent spec §9). A script's steps stay Write, Visualise, Client review, Canvas. The page shows the copilot's work (D508). Every copilot shows its work as it happens (D502).

## 3. What changes

### 3.1 The message box at Visualise
At Visualise the script's panel gets its message box and suggestions back, as at Generate. The panel shows the same saved thread; nothing is moved or copied. A message typed here goes to the same copilot that wrote the script, which now knows the script is at Visualise and what the board holds (which characters have an avatar ready to draw, which shots have a current panel, which locations and products have a picture).

- *(My call)* **In review and Approved stay read-only in 5.1.** Their message box arrives with 5.2, together with what the copilot can do there. A box nothing answers misleads (4.1's anti-goal).
- *(My call)* **At Visualise the panel starts open.** 4.1 starts it folded after Generate, because nothing could happen in it; now the copilot leads there. Folding is still remembered per script, and In review and Approved still start folded unless the person unfolded it. The rail's "Waiting for you" line is the walk's current step (§3.6), so a folded panel still shows what is next.

### 3.2 The walk: the copilot leads, one step at a time
At Visualise, the bottom of the thread always shows **the current step**: one card written by code, worked out fresh from the board each time the thread is read, never stored *(my call, from approach A: a stored message would go stale the moment a step is done by hand)*. Doing a step on the page or through the copilot changes the board, and the card moves on at once.

*(My call)* **The card is as fresh as the board on screen.** The Visualise page does not follow a teammate's changes live today, and this piece does not add that: a change made in another browser moves the card when the page next loads, as it does for the board itself. Following the board live (one channel for the screen) is a separate piece of work.

The steps, in order. The card shows the first that applies:

1. **A character has no avatar ready to draw.** One character at a time, lead first. A character who is on screen in no shot (a narrator, a voice) is left out *(my call: it is what drawing a panel needs; the page's readiness line keeps counting the whole cast, as today)*.
   - **No avatar yet:** "Who plays Meenakshi?" with the client's avatars as buttons. Pressing one casts it at once.
   - **The chosen avatar is not ready to draw** (it has no four views yet, or is still being made): the card says so and points to that character's cast slot on the page. Making an avatar or its views costs money, so it is never started by the copilot *(my call, by the "paid work is a person's click" rule)*.
   - When other shots could already be drawn, the card also offers **"Draw the N panels I can draw now"**, so an uncast character never blocks the whole board.
2. **Locations and products in the shots still to draw have no picture** (Cyril, 2026-11-20, option A). A location's or product's picture is part of what a panel is drawn from, so adding one after drawing puts every panel it appears in out of date, and redrawing costs money again. The card says so ("The café and the bottle have no picture. Panels drawn now would need redrawing once they do."), and gives each item what the page offers for it: attach a picture in the chat, pick from the brand kit (products), or draw the location (a button with its credits). Below them: **"Draw N panels without them"**, so the board is never blocked and the walk has nothing to remember.
3. **Shots need a panel** (never drawn, out of date after a change, or failed), and every location and product they use has a picture. The card offers **"Draw N panels"** with the same count and the same credit estimate as the page's Generate all ("Redraw" when every one was drawn before).
4. **Panels are being drawn.** The card says so ("Drawing 6 panels…") and the page shows each panel as it is drawn. No button.
5. **Every shot has a current panel.** The send card (§3.5).

A pending change card waits in the thread as at Generate; the current step still shows beneath it.

### 3.3 What the copilot does when asked
Typed requests at Visualise go to the copilot, which answers in words and acts as follows:

| Asked to… | What happens |
|---|---|
| cast an avatar to a character, change who leads | at once; the page shows it land |
| add, change or remove a location or product (by name and description) | at once; the page shows it land |
| pick a different panel version for a shot | at once *(my call: nothing is lost, the other versions stay)* |
| change the script's words in one shot or one field | at once, as while writing and as typing on the board; the page shows it land, and that shot's panel goes out of date (Cyril, 2026-11-20) |
| change the script's words across several shots | a before-and-after card, accepted at Visualise, as while writing |
| add, remove, split or reorder shots | a before-and-after card, accepted at Visualise (§3.4) |
| add, remove, rename or redescribe a character | a before-and-after card *(my call: it rewrites the shots they are in, and a character's name and description are drawn, so their panels go out of date)* |
| the reel's notes or open items | refused, with a "Reopen the script" button *(my call: D489 keeps the notes behind a reopen)* |
| replace the whole script (a pasted script) | refused, with a "Reopen the script" button *(my call: a new script has new shots, so every panel on the board would be lost)* |
| draw or redraw panels | a "Draw N panels" button in its reply; the person presses it |
| make an avatar, its views, or a location's picture | points to the place on the page; the person starts it |
| send the board to the client | the send card (§3.5); the person presses it |
| reopen the script | a "Reopen the script" button in its reply *(my call: it takes the script back a stage, so it stays the person's click)* |

The copilot never sets a picture from its own words (as at Generate, D447); pictures come from the person's attachments (§3.7), the page, or the client's libraries.

*(My call)* **One message, one outcome.** When one request mixes changes that apply at once with changes that need a card, the whole request comes as one card, so nothing is half done.

*(My call)* The avatars offered as buttons are the client's avatars that are ready to draw. One still being made is reached from the character's cast slot on the page.

### 3.4 Shot changes at Visualise
A card that adds, removes, splits or reorders shots is accepted at Visualise and the script stays at Visualise.
- Shots the card does not touch keep their panels and versions.
- A new shot arrives with no panel, and the walk moves to "Draw 1 panel".
- A removed shot's panel leaves the board.
- A shot whose words change keeps its panel, which is marked out of date as when its text is edited on the page today.
- The page's own controls are unchanged: adding or removing a shot by hand still needs a reopen (D489, the second entry of that number in the log; the log has two D489s, and new numbers must not repeat it).

### 3.5 The send card
Pressing the send card does exactly what the page's Share does today: the script moves to client review and the client link is made, in one press. It is shown:
- as the walk's last step, once every shot has a current panel;
- **at any time when the person asks** ("send it to the client"), whatever the board's state.

When something is missing, the card names it before the button: shots with no panel ("the client will see them as text only"), panels being drawn, characters with no avatar, and a change card still waiting. It never blocks the send. *(My call: the exact wording of each line.)*

### 3.6 "Waiting for you" at Visualise
4.1 said one line for the whole stage ("finish the storyboard and send it for review"). At Visualise the line now follows the walk *(my calls, the exact lines)*:

| The walk is at… | The panel and rail say |
|---|---|
| a character without an avatar | Waiting for you: choose who plays Meenakshi |
| an avatar not ready to draw | Waiting for you: finish Meenakshi's avatar |
| locations or products without a picture | Waiting for you: add the missing pictures |
| shots needing a panel | Waiting for you: draw 6 panels |
| panels being drawn | nothing waiting (the rail reads "Copilot") |
| everything drawn | Waiting for you: send the storyboard for client review |
| a change card waiting | Waiting for you: review the change |
| while the copilot is answering | nothing (the rail reads "Copilot") |

In review and Approved keep 4.1's lines.

### 3.7 Pictures attached in the chat
At Visualise the message box takes pictures, like the brand KB's composer. A picture sent is attached to the product or location it is for, kept in the script's own folder exactly as an upload on the page, and the page shows it land. *(My call)* The sent picture shows in the thread with its message, as in the brand KB, and stays there after a reload.
- When the message or the board makes the target clear (the message names it, or exactly one item is missing a picture), it is attached there.
- Otherwise the copilot asks with buttons: one per product and location.
- *(My call)* Pictures are not taken at Generate in this piece: the copilot does not set pictures while writing (D447).
- *(My call)* A picture of a person is not turned into an avatar; making an avatar stays on the cast slot.

### 3.8 The page shows the copilot's work
Per D508: the cast slots, location and product chips and storyboard panels are what the copilot can work on. When it asks about one (the walk's "Who plays Meenakshi?"), the page shows that slot. When it changes one, the change lands with a highlight, as on the brand KB. *(My call)* While the turn runs, the line under the message is the one Generate shows today ("Working on it…" and its sequence); naming the exact action ("Casting Meenakshi…") would mean streaming the copilot's decisions as they are made, which the script copilot does not do yet.

## 4. Approaches

- **A. Extend the writing copilot to Visualise (chosen, Cyril 2026-11-20).** Same thread, route, edits and before-and-after cards. Code decides, by stage, which edits apply at once and which go on a card; nothing it can produce draws or sends. One new edit (pick a panel version) and a Visualise part of its instructions describing the board, used only at Visualise. The walk is code, read fresh. *Trade-off:* reuses the tuned writing copilot and keeps one place that changes a script; its instructions grow, so Generate must be protected from drift.
- **B. A separate Visualise copilot on the shared agent loop (rejected).** Tools for casting, locations, shot changes. Cleaner on paper, and turn traces nearly free, but it re-implements and re-checks edits the writing copilot already makes, gives two code paths that change one script, and two copilots answering in one thread.
- **C. The walk only, typed requests later (dropped).** Cyril decided typed requests act at Visualise.

## 5. Goals, non-goals, anti-goals

**Goals**
- From Mark final to the send, a person can be led through the storyboard by the copilot and finish it without hunting for controls.
- Everything the person can do on the Visualise page can be asked of the copilot, with drawing and sending kept as the person's click.
- Before the client sees the board, the person is told what is missing.

**Non-goals (this piece)**
- Client review (5.2): the message box In review and Approved, what the copilot says once the client has commented, and what it does with comments.
- Saving attached pictures to brand assets.
- Turn traces for script turns (they come with the shared loop).
- Word-by-word streaming of the script copilot's replies; it works at Visualise as it does at Generate.
- Whether the client sees on-screen text and who is on screen; removing the unused shot-only panel view (D465 leftovers): not copilot work, kept on their own list.
- The extra script steps (4.2), the canvas (6).
- Moving panel drawing into the background. Today the page's Generate all draws in this browser and stops if the tab is closed; the copilot's "Draw N panels" does exactly the same, and changing that is its own piece of work.
- Following a teammate's board changes live (§3.2).

**Anti-goals: it fails if…**
- Panels are drawn, an avatar, its views or a location picture is made, or the board is sent, without the person pressing a button.
- Anything the copilot does at Generate changes: its steps, wording, cards, drafting or saved messages.
- Accepting a shot card loses the panel or versions of a shot it did not touch.
- The walk's card says something that is no longer true after a change made by hand in the same browser.
- A picture attached in the chat ends up in brand assets.
- Opening the Visualise page costs extra requests or polling that grow with the number of shots or characters.

## 6. Constraints

- AGENTS.md: shadcn primitives only; the design system; TanStack Query three layers; performance rules (nothing per item, one load per screen, no new polling, paid work in the background and a person's click).
- The script's thread stays in its existing store; nothing is migrated.
- The draw and send buttons do exactly what the page's own Generate all and Share do: the same counts, credits, checks and results.
- A change the copilot makes at once is checked by the same rules as the page's own control for it.
- The copilot's writing at Generate is protected: the Visualise part of its instructions is included only at Visualise.

## 7. Left to the builder

How the stage decides at once versus a card; how the walk's step is worked out and where; how the board's state reaches the copilot's instructions; how the draw and send buttons reuse the page's actions; how an attachment reaches the script's folder; which page targets the copilot names; the exact layout of the step card.

## 8. Success

Cyril marks a script final. On the Visualise page the panel is open and the copilot asks "Who plays Meenakshi?" with the client's avatars. He presses one and the cast slot fills. The card moves on: the café has no picture, and panels drawn now would need redrawing. He attaches a photo in the chat and it lands on the café; the card moves to "Draw 6 panels · about 400 credits". He types "add a closing shot of the product on the counter", accepts the card, and the walk says "Draw 7 panels". He draws, the panels appear on the page, and the copilot offers the send card with nothing missing. He presses it and the script moves to client review.
