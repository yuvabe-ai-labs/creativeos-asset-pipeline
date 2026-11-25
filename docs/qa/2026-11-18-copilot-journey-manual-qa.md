# Copilot journey: manual QA plan

**For:** whoever runs manual QA on the copilot journey before it is merged.
**Build:** branch `feat/copilot-journey`. Kept up to date while the branch is built; the last section is the newest work.
**Last updated:** 2026-11-23 (rows 8.1, 8.4–8.6, 8.9 and 10.1: no "Copilot is asking" mark, D528). Before that 2026-11-20 (section 10 added; rows 9.5–9.7, 9.10 and 9.11 corrected for 5.1).

## Before you start

- **Environment.** Staging, or a local run against the staging database with both `npm run dev` and `npx trigger dev` running. Background work (the KB build, collecting images, studying images, reading new documents) needs Trigger.dev. If it is not running, those steps never finish.
- **Database.** Migrations 0063, 0064, 0065 and 0066 must be applied (0066 only for section 7; without it every turn still works).
- **Trigger.dev deploy (staging only).** The `kb-propose` task, the 5-minute dead-job sweep and the daily `copilot-trace-sweep` must be deployed, or documents are never read and section 6.11 onwards cannot pass.
- **Clients.** You need three kinds:
  - **New client:** created for the test, no brand KB yet.
  - **Client in review:** a brand KB was built and not every field is reviewed yet.
  - **Approved client:** a brand KB that is marked ready.
- **Test files.** One brand PDF (a few pages: a brand guide works), one `.docx`, one PNG or JPG, and one `.exe` or `.zip` (for the "refused" check). Have a second brand document that says something different from the first, for example that a phrase is no longer allowed.
- **Two browser windows**, signed in as two different teammates of the same organisation, for the checks marked *(two people)*.
- **What "the panel" means.** The copilot is the panel on the left of a client's Brand KB, Market research and Scripts tabs. The page on the right is the Brand KB screen.

**How to report.** For each check write Pass or Fail. For a fail, write what you did, what you expected (from the "Expected" column) and what you saw, with a screenshot and the time it happened.

---

## 1. Finding your way around a client

| # | Do | Expected |
|---|---|---|
| 1.1 | Open any client. | A bar across the top reads "Clients › {client name}", with the tabs under it: Brand KB, Market research, Scripts, Canvases, Avatars, Brand assets. No second breadcrumb on the page. |
| 1.2 | Click through Brand KB, Market research and Scripts. | The panel stays still on the left; only the right side changes. The tabs and the page's content start at the same left edge on every tab. |
| 1.3 | Click Canvases. | The client's list of canvases, with no panel beside it. |
| 1.4 | On Scripts, open one script. | The client's tabs are gone. The page shows its own trail: Clients › client › Scripts › script title. |
| 1.5 | On a new client, look at the Market research and Scripts tabs. | Both show a lock. Clicking one still opens it, and the page says why it is locked. |
| 1.6 | Fold the panel, reload, open another tab. | It stays folded for that client. Unfolding it brings it back where it was. |

## 2. Brand KB chat before a build *(new client)*

| # | Do | Expected |
|---|---|---|
| 2.1 | Open the Brand KB tab. | The panel opens with "Let's build {client}'s brand KB. What is the brand's website?" |
| 2.2 | Type the website and send. | Your message shows at once, then "Saving the website…". The website appears in the form on the right before the reply finishes. The reply reads "Saved the website." followed by what comes next, with a "Start the build" button. |
| 2.3 | Send an Instagram handle (with or without @). | "Saving the handles…", then the handle appears in the form without the @ or the link. |
| 2.4 | Attach the PDF and the image in the chat (pick, drag in, or paste the image). Send. | Two chips while attaching; both appear in the form's lists. After sending, the message shows both by name, the image with a thumbnail. |
| 2.5 | Attach the `.exe`. | Refused on the chip, with the reason and the allowed types. |
| 2.6 | Attach a file, then remove its chip before sending. | It disappears from the form's list too. |
| 2.7 | Attach an image and remove it before sending. | No "Studying the images…" line appears. |
| 2.8 | Attach an image and send. | "Studying the images…" appears only after you send, and goes away when the study finishes. |
| 2.9 | Paste a few cells copied from a spreadsheet into the message box. | They paste as text; nothing is uploaded. |
| 2.10 | Type half a message, fold and unfold the panel. | The text is still there. |
| 2.11 | Type a different website in the form without saving it, then send a handle in the chat. | Your typed website is still in the form. |
| 2.12 | Turn the network off (DevTools → Network → Offline) and send a message. | An error message appears, and your text and chips come back in the box. |
| 2.13 | Ask "what do you still need from me?" | The reply appears word by word, not all at once. |
| 2.14 | Send a message and close the tab straight away. Reopen the client after 30 seconds. | The copilot's reply is in the thread. |

## 3. The build *(new client, continuing from section 2)*

| # | Do | Expected |
|---|---|---|
| 3.1 | Press "Start the build". | "Starting the build…", then status lines for what is running: reading the website, reading documents, collecting images and video. The page on the right switches to the build view. |
| 3.2 | Type a message while the build runs. | The copilot answers briefly, says the build is still running, and asks nothing. |
| 3.3 | Close the tab and come back during the build. | The same thread and the same status lines. |
| 3.4 | Wait for the build to finish. | Each line turns into a done line. A short account of what was found and what it was unsure of, then the first question about one field, with likely answers as buttons. |
| 3.5 | If collecting images is still running when the KB lands. | The copilot says the KB is ready to review while images are still coming in. |

## 4. The review *(client in review)*

| # | Do | Expected |
|---|---|---|
| 4.1 | Answer a question in your own words. | "Saving your answer…", the field on the right updates and is marked as coming from you, then a short acknowledgement and the next question. |
| 4.2 | Press one of the suggested answers. | Same as 4.1. |
| 4.3 | Answer five questions. | The copilot offers to keep asking or to stop. "Keep asking" continues; otherwise it points to what is left. |
| 4.4 | Ask "skip this one". | It moves on; the field is left for you on the right. |
| 4.5 | Review a field by hand on the right, press "Save changes". | A line "Manual edits saved: 1 field." appears in the thread. The copilot never asks about that field. |
| 4.6 | Edit a field on the right, then press "Discard changes". | The field goes back to its saved value. |
| 4.7 | Look at the panel while fields are left. | "Review N fields", with links to the tabs that still have fields. Each link opens that tab. |
| 4.8 | Fold the panel. | The rail shows what the copilot is waiting for. |
| 4.9 | Review every field. | The approve card appears: "Approve the brand KB… Approving it opens market research… Only a person can approve it." |
| 4.10 | Press the approve card's button. | A line "Approved by {your name}", the Market research tab unlocks. The page header's "Mark KB ready" does the same. |
| 4.11 | *(two people)* Both approve at the same moment. | One approval line, not two. |
| 4.12 | On a question with a value, press "Yes, that's right". Do this for five questions in a row. | Every time: the field is marked reviewed on the right, the reply reads "Marked {field} as right.", and the **next** question follows. The same question is never asked twice. |
| 4.13 | On an empty field's question, press "There is none". Then on the next, press "Skip this one". | "There is none": the field is marked reviewed, empty. "Skip this one": "Skipped. It stays for you to review on the right.", the field stays unreviewed, and the next question follows. |
| 4.14 | Type "yes, that's right but make it 30 to 45" as an answer. | The copilot reads it (not treated as the button): the field gets "30 to 45". |
| 4.15 | Watch any reply made of two sentences. | The sentences are separated ("Got it." never runs into the previous sentence with no space). |
| 4.16 | While a question about a *different* field waits, type "edit the mission statement to: you tell us what you need, we do the rest" (pick any field not reviewed yet). | The reply reads "Saved {field}." and the field on the right shows your words, marked as coming from you. It never says it "can only save your wording as a new answer". |
| 4.17 | Wait for a question about a field the build left empty (it says "I could not find this in the sources"). Tap one of the likely answers. | Up to 4 likely answers show before "There is none" and "Skip this one", and the question says they are guesses. Tapping one saves it at once (no "thinking"), the field on the right shows it, and the next question follows. A question about an inferred value has no likely answers. |

## 5. Background jobs that fail

| # | Do | Expected |
|---|---|---|
| 5.1 | Stop `npx trigger dev` (local only), attach an image and send. | "Studying the images…" shows. Within about 5 minutes of restarting Trigger.dev it is cleared, and one red line appears in the thread: "Could not study the images. You can run it again from the Image Analysis tab." It never stays for good. |
| 5.2 | Use a website that cannot be read. | The build says so in a failure line with what to do, never "nothing found". |
| 5.3 | Make a collection fail (for example a private Instagram account), then send two more messages. | One red line "Could not collect images and video from Instagram. You can try again from Brand assets." appears in the thread where it happened. It does **not** follow you to the bottom: after your next messages it stays above them, and it never sits between a question and its reply buttons. |
| 5.4 | Reload the page after 5.3, and open the client in another browser. | The red line is still in the same place in the history, once. Nothing about it shows at the bottom of the panel. |
| 5.5 | After 5.3, ask the copilot "why are there no Instagram images?" | It knows the collection failed and says you can try again from Brand assets. |

## 6. Change cards on the brand KB

Change cards are how the copilot changes a field someone has already reviewed: it shows each field before and after, where the new value came from, and lets you keep or drop each one before approving. Nothing changes until a person approves.

| # | Do | Expected |
|---|---|---|
| 6.1 | *(two people)* Both press Approve on the same card at the same moment. | The change is applied once. The second person sees "That change was already settled." |
| 6.2 | Leave a card pending, change one of its fields by hand on the right and save, then approve the card. | That field keeps what you typed. The card says it was changed by hand since and was left as it is. The other fields are applied. |
| 6.3 | Approve a card with some fields unticked. | Only the ticked fields change. The card shows "Approved by {name}: {k} of {n} changed." The KB stays approved; Market research stays open. |
| 6.4 | Discard a card. | Nothing on the right changes. The card shows "Discarded by {name}." |
| 6.5 | *(approved client)* In the chat: "we no longer say chemical-free". | "Preparing the change…", then "Here is the change. Nothing changes until you approve it." and a card listing the affected fields, each with Before, After and "You, in this chat". Nothing on the right has changed yet. |
| 6.6 | *(approved client)* Ask for a field to be set to what it already says. | No card. The copilot says it already says that. |
| 6.7 | *(approved client)* "Change the tone of voice" without saying to what. | No card. The copilot asks what it should be. |
| 6.8 | *(client in review)* Answer a question about a field nobody has reviewed yet. | Filled at once, no card (as in 4.1). |
| 6.9 | *(client in review)* Ask to change a field you have already approved on the right. | A card, not a direct change. |
| 6.10 | Reload the page while a card is pending, and open the client in another browser. | The card is still there, still pending, in both. |
| 6.11 | *(approved client)* Attach the second brand document in the chat and send. | The copilot says it will read it. A line "Reading {file}…" shows while it runs, then a card whose fields name that file as the source. The KB stays approved the whole time. |
| 6.12 | Discard that card. Attach the same document again and send. | Nothing from it is proposed again: the copilot says nothing in it changes the brand KB. |
| 6.13 | Attach a document that agrees with the KB. | No card: "Read {file}. Nothing in it changes the brand KB." |
| 6.14 | *(approved client)* In Source files, add a document and press "Save & re-analyze". | The dialog says nothing is rebuilt and no review is lost. After saving, "Saved. The copilot is reading the changes." The page does not go back to "in review"; no review is lost. A card follows in the panel. |
| 6.15 | *(approved client)* In Source files, remove a document and press "Save & re-analyze". | A card listing the fields nothing else supports any more ("No remaining source supports it"), or a line saying everything is still supported. Nothing is wiped. |
| 6.16 | *(new client)* Attach a document before any build. | No card: it is just a source for the build. |
| 6.17 | Use a document that cannot be read (for example a corrupted PDF). | A red line (a cross, not a tick) "Could not read {file}. Try again from Source files." No card, nothing changed. |
| 6.18 | Fold the panel while a card is pending. | The rail reads "Approve the change" (or "Approve 2 changes"). It clears once the card is settled. |
| 6.19 | *(client in review)* With a question waiting, ask for a change to an approved field. | The card appears; once you answer or the copilot asks again, the rail follows the latest thing it is waiting on. |
| 6.20 | Leave a card pending; in another window change one of its fields on the right and save. Wait 20 seconds in the first window. | Without reloading, that field on the card is marked as changed by hand since and its Keep box is off and disabled. |
| 6.21 | Look at a pending card. | Each field shows its name, Before (struck through), After, the source, and a ticked Keep box. The button reads "Approve N changes" for the ticked count; untick all and it reads "Approve" and is disabled. A list shows as comma-separated items; an empty value shows as "none". |
| 6.22 | Press Approve or Discard. | Both buttons disable while it saves. The card then shows its footer and no buttons. The right side updates without a reload. |
| 6.23 | Check the card at phone width and in dark mode. | Long values wrap inside the card; nothing runs off the side. Text stays readable. |
| 6.24 | Hover any field on the Brand KB screen. | No sparkle "Refine with AI" button. Editing by typing, the approve tick on an empty field, Reject and Restore still work. |
| 6.25 | Open Source files. | The text says the copilot shows what the change would do, for you to approve; it no longer says the KB is rebuilt. |
| 6.26 | *(approved client whose Image Analysis has an approved written field, such as Aesthetic or Photography Style)* Upload several different-looking images on the form. | When the study finishes: that field on the Image Analysis tab still says what was approved. A card in the thread ("The new images read differently for a field you reviewed. Nothing changes until you approve.") shows it before and after, from "Image study". A line "Studied the images again. Changed: …" names only fields that were not reviewed. |
| 6.27 | *(client in review)* In one message, ask to change an approved field and a field nobody has reviewed yet. | The card holds the approved field. The other field is saved at once as your answer (the reply starts "Saved {field}."), and is not on the card. It never shows a sentence like "Use answer_field". |
| 6.28 | *(approved client)* Attach two PDFs at once and send. | One card. Each field names the PDF it came from, by its real file name. |
| 6.29 | *(approved client)* Attach a document that only adds information. | No field on the card goes to "none": new documents never clear a field. |
| 6.30 | Approve the image-study card from 6.26. | The Image Analysis tab shows the new value, approved, without a reload. |
| 6.31 | Upload more images so an image-study card appears, do not answer it, then upload again. | The first card reads "The images were studied again after this was proposed, so it no longer applies." and has no buttons. Only the newest card can be approved. |
| 6.32 | Discard an image-study card. Upload one more similar image. | No card comes back for the same reading. (A clearly different batch of images may propose a different value.) |
| 6.33 | Rewrite an Image Analysis field by hand and save. Upload different-looking images. | That field keeps your words and is on no card. |
| 6.34 | *(new client in first review, nothing reviewed on the Image Analysis tab)* Upload images. | Image Analysis fills in directly. No card. |
| 6.35 | After any upload, look at the counted fields (format mix, purpose mix, colours). | Their numbers move, a review on them stays, and they are never on a card. |
| 6.36 | *(approved client with approved written Image Analysis fields)* Upload one more image much like the ones already there. | No card: the study keeps the approved words. (If a card appears whose "after" only rewords the "before", report it as a fail with both texts.) |

## 7. Turn traces (D521) *(client in review unless marked)*

| # | Do | Expected |
|---|---|---|
| 7.1 | In the panel header, turn on "Turns". Then turn it off. | On: "Chat" and "Turns" tabs appear under the header, and copilot replies get a "Trace" button. Off: the panel is exactly as before. The choice is remembered after a reload, in this browser only. |
| 7.2 | With a question waiting, type "yes" (typed, so the model handles it, not the button). Open the Turns tab. | The newest line shows your message, the tools called and how long it took. If the model saved nothing, the line is marked "Question left unanswered" (and "Asked again" when the same question came back). If it saved, no mark. |
| 7.3 | Open that line. | In order: what came in (your words, the waiting field, the state); what the agent was given (model name; Instructions, Conversation and Tools, each folded); each round (the words, each tool call with its arguments and what it returned); what code did (fields written, what it added after); how it ended (the reply, total time). |
| 7.4 | Press "Yes, that's right" on a question. Open its trace. | "No model was asked: a reply button, carried out by code." The tool and its sentence are shown. No rounds. |
| 7.5 | In Chat, press "Trace" under a copilot reply. | The same trace opens in place under that reply. "Hide trace" closes it. |
| 7.6 | *(approved client)* Ask to change a reviewed field to the value it already has. | The line is marked "Refused"; opened, the refusal sentence is tinted red. |
| 7.7 | Stop the model locally (an invalid OpenAI key), send a message, restore it. | The turn's line is marked "Failed", and its trace shows the error. The panel showed its usual failure reply. |
| 7.8 | *(two people)* The second person turns on Turns. Then open a trace URL (`/api/clients/{client of another organisation}/copilot/traces/{id}`). | The second person sees the same lines. The other organisation's trace is refused. |
| 7.9 | With Turns off, open DevTools → Network, reload, and send a message. | No request to `/copilot/traces`. With Turns on, one request on load and one about 1.5 seconds after each turn; none in between. |
| 7.10 | Before 0066 is applied (local), send a message. | The turn answers normally. The server log shows "could not keep the trace". |

## 8. The page shows the copilot's work (D520)

| # | Do | Expected |
|---|---|---|
| 8.1 | *(client in review)* Answer five review questions with the buttons, without touching the page. | Each time the page is already on the field's tab with the field in view. The field asked about carries no mark (D528). Each answer sweeps, then lands with a short highlight; the page moves on to the next field. |
| 8.2 | *(client in review)* Go to another tab on the right. Type an answer for the waiting field. | The page switches to that field's tab, the field sweeps, and the answer lands. |
| 8.3 | *(client in review)* Edit the waiting field on the page and do not save. Edit a second field too. Answer the waiting field in the chat. | The waiting field shows the chat answer. Pressing Save does not bring your edit of it back. Your unsaved edit of the second field is still there. |
| 8.4 | *(client in review)* With a question waiting, go to another tab and ask "what is our tone of voice?" | The page does not move. |
| 8.5 | *(two people)* B watches the Brand KB page while A answers questions. | B's page never moves by itself. B sees A's answers land in the fields (within about 20 seconds). |
| 8.6 | *(client in review)* Reload with a question waiting. Then open Brand KB from the client's Canvases tab. | Both times the page lands on the waiting field. |
| 8.7 | *(new client)* Send the website in the chat, then "instagram is @acme". | Each form field comes into view, sweeps, and the value lands with a highlight. |
| 8.8 | *(new client)* Attach a PDF in the chat. | It appears in the form's document list with the highlight. |
| 8.9 | Turn on "reduce motion" in the operating system and repeat 8.1. | No sweep and no animated scroll. The highlight still shows when an answer lands. |
| 8.10 | *(approved client)* Approve a change card. | The page does not move. Changed fields that are on screen highlight briefly. |
| 8.11 | *(client in review)* Stop the model (an invalid key) and type an answer. | No sweep is left running after the failure reply. |

## 9. Scripting in the panel (D523)

| # | Do | Expected |
|---|---|---|
| 9.1 | *(market research approved)* On the Scripts tab, press "Start a script" in the copilot panel. | An empty script opens, its copilot asking the first question exactly as with the page's "New script". |
| 9.2 | *(market research not approved)* Open the Scripts tab, then Avatars and Brand assets. | The guide says scripts are locked and offers "Paste a script" beside "Go to market research", on all three tabs. |
| 9.3 | Inside a script at Generate, press "‹ {client}" in the panel header. | You land on the client's Scripts tab. |
| 9.4 | At Generate, watch the folded rail through a script: answering questions, a change card, open items, nothing open. Then send a message and watch it while the copilot answers. | It reads "answer the copilot", "review the change", "settle the open items", "mark the script final" in turn; while answering, "Copilot". |
| 9.5 | Mark a script final. | *(Changed by 5.1, see section 10.)* On Visualise the panel is there and **open**, with the whole conversation and a message box. Section 10 covers what it does there. |
| 9.6 | On that Visualise page, look at the old Generate cards in the thread (angles, confirmation, a proposal left pending). | No buttons on them: they belong to Generate. A decided proposal still says "Applied" or "Not applied". |
| 9.7 | Leave the panel open at Visualise, send for review, then approve. | It stays open In review ("Waiting for the client's review") and Approved ("Waiting for you: create the canvas"; nothing once the canvas exists), with no message box at either. (Visualise, In review and Approved share one fold choice; if you never touch it, In review and Approved start folded, as in 10.16.) |
| 9.8 | Open an approved script with no review (the plain read-only view). | The panel is there, folded; the script keeps its usual width beside it. |
| 9.9 | Reopen a script from Visualise. | Back at Generate the message box is back, the fold is whatever you chose at Generate, and a still-pending proposal has its buttons again. |
| 9.10 | Make the window narrower than the panel's breakpoint at each stage. | At Generate and Visualise the chat stacks above the page. In review and Approved: no panel; the storyboard has the page. |
| 9.11 | At Visualise, open DevTools → Network and reload. Then send one message. | No request for the script's copilot thread on load (the page brings it). Sending makes one `/turn` request, then the board is read again once. |

## 10. The copilot at Visualise (D524–D527)

| # | Do | Expected |
|---|---|---|
| 10.1 | Mark a script final whose characters have no avatar. | Visualise opens with the panel open. At the foot of the thread: "Who plays {lead}?" with the client's avatars as buttons; the lead's cast slot on the board carries no mark (D528). The rail reads "Waiting for you: choose who plays {lead}". |
| 10.2 | Press an avatar on that card. | The cast slot fills and highlights; the card moves to the next character, or on. |
| 10.3 | With a location used by shots still to draw and no picture. | The card: "The café has no picture. Panels drawn now would need redrawing once it does.", with Attach a picture and Draw it, and "Draw N panels without them". |
| 10.4 | Press Attach a picture on that card and choose an image. Send with no words. | The picture shows in the thread; the copilot answers "Added it to the café." with no model wait; the café chip shows the picture and highlights. It is in the script's folder, not in Brand assets. |
| 10.5 | Attach a picture with the paperclip and send "here you go" on a script with two products and a location, all without pictures. | "Which is this for?" with one button each; picking one uploads it there and sends the message. |
| 10.6 | Type "add a closing shot of the product on the counter". | A before-and-after card; nothing changes on the board. Accept: the new shot appears with no panel, other panels unchanged; the card at the foot says "Draw 1 panel" (or the new count). |
| 10.7 | Type "make the hook line shorter". | It changes at once; that shot's panel shows Out of date; no card. |
| 10.8 | Type "call the husband Ravi". | A card showing every shot he is in; accept: his name changes, those panels go Out of date. |
| 10.9 | Type "draw them". | The reply offers the board's Generate all with its count and credits; pressing it asks the same confirmation as the page. |
| 10.10 | Draw all. | The card says "Drawing N panels…"; the rail has no waiting line while it runs; panels appear on the board. |
| 10.11 | Type "use the first version of S2" on a shot with two versions. | S2's panel switches to version 1. |
| 10.12 | Type "send it to the client" with two shots undrawn. | The send card lists "2 shots have no panel; the client will see them as text only." and Move to In review; pressing it moves the script exactly as the page's button. |
| 10.13 | Type "confirm the open items" or paste a whole script. | Refused in one sentence, with a Reopen button; nothing changes. |
| 10.14 | *(two tabs)* Type into a shot in tab A while the copilot is changing the same shot from tab B. | The copilot leaves your text and says so; nothing is overwritten. |
| 10.15 | Send for review in tab A, then send a message in tab B still on Visualise. | The copilot says the script has moved on from Visualise; nothing changes. |
| 10.16 | Open the script In review. | The panel is folded, read-only, "Waiting for the client's review"; offers in the thread are one-line notes. |
| 10.17 | Open a script at Generate. | Everything as before 5.1: same steps, wording, cards and drafting. |

## 11. Market research agent and "Built from" (D529–D532) *(client with an approved brand KB and market research pending)*

Before you start: migration 0067 is applied; the staging Trigger.dev project has the `market-fetch` and `market-draft` tasks deployed, and `APIFY_TOKEN`, the OpenAI key and the Gemini key set.

| # | Do this | Expect |
|---|---|---|
| 11.1 | Open the Market research tab of a client whose brand KB was just approved. | The copilot panel is there (same thread as the Brand KB tab), with a "Research the market" choice. The rail waits on "Approve market research". |
| 11.2 | Open the Market research tab of a client whose brand KB is still in review. | The stage guide shows, not the copilot. |
| 11.3 | Press "Research the market". | "Searching the web…", then a brands card in two groups, Direct and Adjacent, each brand with its @handle, name and one line on why, a switch per brand, and "Fetch their posts (n)". At most 5 per group. The client's own handle is not on it. Nothing is fetched. |
| 11.4 | Type "drop @x, move @y to Adjacent, add @brandy to Direct". | The same card updates: @x switched off, @y under Adjacent, @brandy added ("Added by you."). |
| 11.5 | Type "add @a, @b, @c, @d, @e, @f to Direct" on a card with 5 Direct brands. | The copilot refuses the ones over 5 and says to drop one first. |
| 11.6 | Ask to research again while a card is waiting. | A new card appears; the older one reads "Replaced by a newer list." and has no controls. |
| 11.7 | Switch one brand off and press "Fetch their posts". | The card reads "Bringing in their posts…"; a live line "Bringing in posts from N brands…" shows in the panel; references appear in Direct and Adjacent as they arrive, each highlighted once. |
| 11.8 | *(double click / second tab)* Press "Fetch their posts" in two tabs at once. | One fetch runs; the second tab shows the card already fetching, and no second set of posts arrives. |
| 11.9 | Include a handle that does not exist or is private. | The closing line names it ("I could not bring in posts from @x…"); posts from the others still come in. |
| 11.10 | Use a list where every handle is wrong. | A failed line says it could not finish bringing in posts; the card goes back to waiting, so "try again" works. |
| 11.11 | When the fetch ends. | "N posts from M brands are in Direct and Adjacent. Delete any you don't want, then tell me to draft signals." with a "Draft signals" choice. Each reference's note reads "@handle · caption". |
| 11.12 | Ask to fetch the same brands again. | No post already in Direct or Adjacent is added twice (also when the first copy was clipped by hand as a /reel/ link). |
| 11.13 | Press "Draft signals". | "Reading the posts…" then up to 6 draft signal cards, each with a name, tags, a description and the thumbnails of the posts behind it (at least 2 each), then "Here are N signals from M posts. Keep, edit or drop each one." No draft names a claim, proof, health statement or product use. |
| 11.14 | Press Keep on a draft. | The card reads "Kept as a signal."; the Market page switches to Signals and the new signal lands highlighted. |
| 11.15 | Press Edit on a draft, change the name and tags, remove one post, then Keep. | The saved signal has the edited name, tags and only the posts left. |
| 11.16 | *(double click / second tab)* Press Keep twice. | One signal is saved. |
| 11.17 | Press Drop on a draft. | The card reads "Dropped."; no signal is saved. |
| 11.18 | Delete a reference on the page, then ask for more signals. | No draft cites the deleted post. |
| 11.19 | Ask the copilot to approve market research. | It says only a person can; nothing changes. Press "Approve market research" on the gate card. |
| 11.20 | After 11.19. | "<you> approved market research. That opens scripts." in the thread; the Scripts tab opens. |
| 11.21 | Start a script and get to the angles. | Each angle says "from <signal>" where it used one; there is no separate research card. The "Built from" line at the top of the script reads "Set when you pick an angle". |
| 11.22 | Before the angles, type "use the Monsoon rituals signal". | "Built from" shows Monsoon rituals; the angles that follow draw only on it. |
| 11.23 | Pick an angle. | "Built from" shows that angle's signals. Remove one with its ×, add one with "Add a signal". |
| 11.24 | Write the draft, then change "Built from". | "Built from changed. Want me to rewrite the script with these signals?" with a "Rewrite with these signals" choice; no shot changed. Pressing it proposes the rewrite as a change to approve. |
| 11.25 | Delete a signal on the Market page that a script is built from, then open the script. | The line no longer shows it; the next turn and the draft ignore it; nothing errors. |
| 11.26 | Open a script In review and an approved script. | "Built from" shows the names with no ×, no "Add a signal". |
| 11.27 | In a script, type "research what competitors post for Diwali". | The script copilot says it asked market research and where to review it. The onboarding thread gets "From <script>: research what competitors post for Diwali" and a brands card focused on it. |
| 11.28 | In a script, type something with no research in it. | Nothing new appears in the onboarding thread. |
| 11.29 | Open the canvas for an approved script built from signals. | The canvas script node's signal picker is unchanged; the script's "Built from" is not carried over. |

## Known limits (not bugs)

- A pending change card hides the "Approve the brand KB" card until it is settled, since it may change fields the approval covers.
- A pending card older than the newest 200 messages in the thread drops out of view.
- Pressing Save in Source files when only images changed shows no message; the images are studied as usual.
- A collection or image study that failed before 2026-11-19 is not written into the thread; it simply stops showing at the bottom of the panel.

- Locally, a background job started from your machine that dies can take up to 45 minutes to clear from the panel if the staging sweep is the only one running. On staging it clears within about 5 minutes.
- A teammate looking at the same client does not see the reply appear word by word; they see it when their panel next checks, within 20 seconds.
- Reloading the page in the middle of a reply shows your message without the reply until the panel next checks.
