# Copilot journey: one guided panel from brand audit to canvas

**Status:** draft for review (2026-11-12). Not approved; nothing is built.
**Mockups:** design canvas "CreativeOS Copilot Autopilot" (https://claude.ai/artifact/VP7fUPMcBEbvyt1mKHwe4C, private to Cyril), six artboards: brand audit, market research, scripting, visualise and review, canvas, stage tabs.
**Scope of this document:** what the experience is and what it must do. How it is built (data, routes, agent runtime) belongs to the implementation plans.

## 1. Problem

CreativeOS has every piece needed to take a brand from a website address to a finished reel: brand KB, market references, avatars, a script copilot, visualise, client review and the canvas. Nothing connects them. A person has to know which screen comes next, what the next screen needs from the previous one, and when something is ready to move on. Each screen starts cold.

The copilot journey is a layer over those screens. One panel on the left takes a person through the whole pipeline, asks for what is missing, does the work it can do, and stops at every approval. The person can step in at any point, work by hand, and hand control back.

It is not a replacement for the existing screens, and it does not approve or spend on anyone's behalf.

## 2. Who it is for

- **A teammate onboarding a new client**, who today has to learn the order of the tools before producing anything.
- **A teammate writing the fifth script for a known client**, who wants the brand, the research and the avatars already in the room when the script starts.
- **Anyone returning to half-finished work**, who needs to see what is waiting for them and where.

People who already work fast by hand must lose nothing: the panel folds away and every screen works as it does today.

## 3. Principles

1. **A layer, not a rewrite.** The right-hand side of every stage is the existing screen. Little changes in how people work today.
2. **The panel is always on the left and always foldable.** Folded, it is a narrow rail that still shows whether the copilot is waiting for the person.
3. **Stages are gated by approval.** Market research opens when the brand KB is approved. Scripts open when market research is approved.
4. **A person always approves.** The copilot never approves a stage, never sends anything to a client, and never presses Generate. Spending credits is treated like an approval.
5. **Anything missing is asked for in the chat.** The copilot asks in the thread and takes the answer there, including attached images and files. It does not send the person to another screen to supply an input.
6. **One agent per stage.** Each stage has its own agent with its own tools. The person sees one continuous panel.
7. **The copilot never invents brand facts.** What it shows comes from the site, the research or the person, and each item can be kept, edited or dropped.

## 4. The shape of the experience

### 4.1 The shell

Every client screen shares one frame:

- **Stage tabs** across the top: Brand KB, Market research, Scripts. Each shows whether it is approved, in progress or locked.
- **Avatars and Brand assets** sit beside the stage tabs as two more tabs. They are not stages: they have no approval and are never locked.
- **Inside a script**, a second row shows that script's steps: Write, Visualise, Client review, Canvas.
- **The copilot panel** on the left, with the stage's screen on the right.

### 4.2 Threads

- **The onboarding thread** covers the brand KB, market research and writing the client's first script. It ends once that first script is created.
- **Every script after the first is its own thread.** A new script starts a new chat, with a link back to the onboarding thread.
- A script's thread stays with it through visualise, client review and the canvas. The first script carries on in a script thread of its own from visualise onwards.
- Threads are saved. Coming back to a client or a script reopens its thread where it stopped.

### 4.3 What the panel says

The panel uses five kinds of message beyond plain conversation, the same in every stage:

- **Status line:** what the copilot has done or is doing ("Read the website", "Exploring the competition").
- **Question with reply choices:** one question at a time, with the likely answers as buttons and free text always allowed.
- **Waiting for you:** a marker naming the one thing the person has to do next. It also shows on the folded rail.
- **Gate card:** the next approval, what it unlocks, and why the copilot cannot do it for the person.
- **Change card:** a before and after of something new on an approved stage, with approve and discard.

### 4.4 Stepping in and out

- The person can fold the panel at any time and work on the screen by hand.
- The copilot notices what changed by hand and picks up from there. It does not redo or overwrite the person's work.
- The person can ask the copilot to carry on, to explain a choice, or to change something it did.

### 4.5 After a stage is approved

- Approval does not close a stage. The person can add documents to an approved brand KB, or more research to approved market research, at any time, in the chat or on the screen.
- Anything new the copilot reads or proposes is surfaced in the chat. The copilot shows what it would change as a before and after, and asks for approval.
- Only changes the copilot makes need approval. An edit the person makes by hand on the screen applies at once, as today.
- Nothing the copilot proposes counts as approved until the person approves it. The copilot never folds new material in silently.
- A change waiting for approval locks nothing. Scripts keep working from the approved version. Once the change is approved, new scripts use it; scripts that already exist are not touched.

## 5. Stage by stage

### 5.1 Brand audit (Brand KB)

- **Starts with** the website address, asked for in the chat.
- **The copilot** reads the site, collects images and video from the site and socials, and fills the brand KB: brand profile, visual identity, audience, creative direction and compliance.
- **It asks** when the site is ambiguous or silent, for example which of two colour sets is the main palette.
- **The person** reviews each part of the KB, approves or edits it, and marks the KB ready. That approval opens market research.
- **Audience** is the client's demographic. It is part of the brand KB, separate from avatars, and it informs which avatars are suggested later.
- **Stays as today:** the KB itself, its per-field review states, the build that runs in the background.

### 5.2 Market research

- **Starts when** the brand KB is approved.
- **The copilot** asks who the competition is, or finds them itself, then researches on its own: what this brand has been posting, and what the competition is doing, grouped into themes with the references behind each.
- **It asks** when unsure, for example whether a competitor sells to the same buyer.
- **The person** keeps or drops each theme, can add a reference by hand, and approves the research. That approval opens scripts.
- **New:** research done by the copilot, and an approval state for market research. Today the market screen is filled entirely by hand and has no approval. This reverses the Market Signals V1 decision that there is no AI in market research.
- **Stays as today:** adding references by hand and through the browser extension.

### 5.3 Scripting

- **Starts when** market research is approved.
- **The copilot** asks what the reel is for, offers angles drawn from the approved themes and the brand's own posts, asks who leads and suggests avatars that match the audience, then drafts the script with the person.
- **The person** edits, asks for changes, and marks the script final.
- **Stays as today:** the script document, formats, the write-with-copilot flow, pasting an existing script.
- **Changes:** the script copilot starts with the approved brand KB and research already in hand, and moves into the shared panel.
- **Pasting an existing script skips the gates.** It can be done before the brand KB or market research is approved.

### 5.4 Visualise and client review

- **The copilot** casts the lead, sets the location, checks the products and draws the storyboard panels.
- **It asks** for anything missing, for example a product image for a shot, and takes the image in the chat.
- **The person** checks the board and sends it for client review. The copilot shows that step and what is still outstanding, and cannot send it.
- **Stays as today:** the visualise screen, the client review link, comments and versions, the client's approval.

### 5.5 Canvas

- **Starts when** the client has approved the storyboard and the canvas is created from the script.
- **The copilot** goes shot by shot: connects the references a shot needs, writes its prompt, and tells the person the shot is ready.
- **The person** presses Generate on the node, approves an image, and the copilot moves to the video and then the next shot.
- **The panel folds** so the canvas is not blocked.
- **Retired:** the existing canvas copilot (the floating panel on the right). The new panel replaces it.
- **Not yet settled:** how much more the copilot does in production. This stage is designed as a harness that later help can be added to. See the open questions.

## 6. What changes for people today

- Client screens gain the stage tabs and the left panel.
- Market research and scripts are locked until the stage before them is approved. This applies to new clients only: every client that exists when this ships is treated as already approved at both stages.
- Market research gains an approval.
- The canvas copilot on the right goes away.

Everything else works as it does now.

## 7. Proposed build order

This is too large for one plan. Proposed as six pieces, each with its own plan, each usable when it lands:

1. **The shell:** shared frame, stage tabs, the foldable guide panel (no chat yet) and the approval gates.
2. **Brand audit agent** in the onboarding thread, with saved threads, the five message kinds and attachments in the chat.
   - **2b. Image Analysis through a change card:** a re-study of the images is proposed as a before and after, not written. Split from piece 2 on 2026-11-13.
3. **Market research agent** and the market research approval.
4. **Scripting** moved into the panel, starting from the approved brand KB and research.
5. **Visualise and review** guidance in the script's thread.
6. **Canvas** guidance, and retiring the old canvas copilot.

The order is a proposal. The first plan would cover piece 1 only.

## 8. Open questions

These are product decisions. None is assumed in this document. Each belongs to a later piece of the build order and does not block the shell.

1. Is an image attached in the chat saved to the client's brand assets for later scripts, or kept with that one script?
2. Who may approve market research: any teammate, or a named role? (Brand KB: any teammate, decided 2026-11-13.)
3. The market screen has Direct, Adjacent, Signals and Performance tabs. How do the copilot's themes relate to Signals, and do those tabs stay as they are?
4. The first sketch had a step "what kind of stories". Is that part of market research, part of scripting, or its own step?
5. Which extra steps would make scripts more consistent, interesting and detailed?
6. On the canvas, what does the copilot do beyond references and prompts? What replaces the retired "image for a shot" guided run, and do the existing "next node" buttons stay?
7. An internal approval before client review is planned separately. Where does it sit in a script's steps?

### Decided on 2026-11-12 (Cyril)

- Existing clients are treated as approved at both stages.
- Avatars and Brand assets are added as tabs beside the stage tabs.
- Pasting an existing script skips the gates.
- The onboarding thread runs through to creating the first script.
- An approved stage stays open: the person can add documents or research at any time. Anything new is shown in the chat as a before and after and waits for approval (section 4.5).
- Only changes the copilot makes need approval. Edits made by hand on the screen apply at once.
- A change waiting for approval locks nothing. Scripts keep working from the approved version; once the change is approved, new scripts use it and existing scripts are not touched.

## 9. Success

- A person new to CreativeOS can take a brand from a website address to a first approved script without being told which screen comes next.
- A new script for an onboarded client starts with the brand, the research and suggested avatars already present, with nothing re-entered.
- At any moment the panel, open or folded, says what is waiting for the person.
- A person who folds the panel and works by hand can do everything they can do today.
- Nothing is approved, sent to a client or generated without a person's click.

## 10. Out of scope

- The copilot approving, sending or generating on its own.
- Changes to how the existing screens look or work, beyond the frame around them.
- Publishing or scheduling finished reels.
