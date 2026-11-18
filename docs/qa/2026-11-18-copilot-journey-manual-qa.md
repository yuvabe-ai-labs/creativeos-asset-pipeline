# Copilot journey: manual QA plan

**For:** whoever runs manual QA on the copilot journey before it is merged.
**Build:** branch `feat/copilot-journey`. Kept up to date while the branch is built; the last section is the newest work.
**Last updated:** 2026-11-18.

## Before you start

- **Environment.** Staging, or a local run against the staging database with both `npm run dev` and `npx trigger dev` running. Background work (the KB build, collecting images, studying images, reading new documents) needs Trigger.dev. If it is not running, those steps never finish.
- **Database.** Migrations 0062, 0063 and 0064 must be applied. No other migration is needed.
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

## 5. Background jobs that fail

| # | Do | Expected |
|---|---|---|
| 5.1 | Stop `npx trigger dev` (local only), attach an image and send. | "Studying the images…" shows. Within about 5 minutes of restarting Trigger.dev it is cleared and the line says the study could not finish, with what to do. It never stays for good. |
| 5.2 | Use a website that cannot be read. | The build says so in a failure line with what to do, never "nothing found". |

## 6. Change cards on the brand KB *(being built: cases added as each part lands)*

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
| 6.17 | Use a document that cannot be read (for example a corrupted PDF). | A line "Could not read {file}. Try again from Source files." No card, nothing changed. |

## Known limits (not bugs)

- Locally, a background job started from your machine that dies can take up to 45 minutes to clear from the panel if the staging sweep is the only one running. On staging it clears within about 5 minutes.
- A teammate looking at the same client does not see the reply appear word by word; they see it when their panel next checks, within 20 seconds.
- Reloading the page in the middle of a reply shows your message without the reply until the panel next checks.
