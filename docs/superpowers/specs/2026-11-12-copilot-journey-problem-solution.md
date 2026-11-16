# Copilot journey: the problems and how each is solved

**Status:** draft for review (2026-11-12). Not approved; nothing is built.
**Companion to:** [2026-11-12-copilot-journey-design.md](2026-11-12-copilot-journey-design.md), which holds the full experience, the build order and the open questions. This document adds no decisions of its own.
**Mockups:** design canvas "CreativeOS Copilot Autopilot" (https://claude.ai/artifact/VP7fUPMcBEbvyt1mKHwe4C, private to Cyril). Each artboard carries a problem note and a solution note that match the sections below.

## The journey in one paragraph

One copilot panel sits on the left of every client screen. It takes a person through five stops: brand audit, market research, scripting, visualise and client review, and the canvas. At each stop it asks for what is missing, does the work it can do, and stops at the approval. The person can fold the panel at any time, work by hand, and hand control back. The copilot never approves, never sends anything to a client and never presses Generate.

## The problems, and what solves each

### 1. Nothing connects the screens

**Problem.** CreativeOS has every piece needed to go from a website address to a finished reel: brand KB, market references, avatars, the script copilot, visualise, client review and the canvas. A person has to know which screen comes next.

**Solution.** Stage tabs across the top (Brand KB, Market research, Scripts) show the order and where the client stands. Inside a script, a second row shows its steps: Write, Visualise, Client review, Canvas. The panel on the left leads from one to the next.

**Seen on:** the stage tabs artboard, and the top of every screen.

### 2. Nothing says when work is ready to move on

**Problem.** There is no moment at which the brand KB or the market research is declared done, so the next screen can be started on unfinished ground.

**Solution.** Stages are gated by approval. Market research opens when the brand KB is approved; scripts open when market research is approved. A gate card in the panel names the next approval, what it unlocks, and why the copilot cannot give it.

**Seen on:** brand audit ("Mark KB ready"), market research ("Approve market research"), visualise ("Next stop: client review").

### 3. Every screen starts cold

**Problem.** Each screen begins without what the previous ones produced. A person writing the fifth script for a known client brings the brand, the research and the avatars back in by hand.

**Solution.** Each stage starts with the approved work before it already in hand. Script angles are drawn from the approved themes and the brand's own posts. Suggested avatars match the audience in the brand KB.

**Seen on:** scripting.

### 4. A new client begins with an empty brand KB

**Problem.** A teammate onboarding a client has no cue for what to do first.

**Solution.** The copilot asks for the website address in the chat, reads the site, collects images and video from the site and socials, and fills the brand KB. It asks only when the site is ambiguous or silent. The person approves or edits each part.

**Seen on:** brand audit.

### 5. Market research is filled entirely by hand

**Problem.** Today every reference on the market screen is added by a person, and the screen has no approval.

**Solution.** The copilot asks who the competition is, or finds them, then shows what the brand has been posting and what the competition is doing, grouped into themes with the references behind each. The person keeps or drops each theme, can still add references by hand, and approves the research.

**Seen on:** market research.

### 6. A missing input sends the person to another screen

**Problem.** When a step lacks something, for example a product image for a shot, the person has to leave, find the right screen, supply it and come back.

**Solution.** Anything missing is asked for in the chat and taken there, including attached images and files.

**Seen on:** visualise (the product image for shot 3).

### 7. Half-finished work is hard to return to

**Problem.** Someone coming back to a client or a script cannot see what is waiting for them, or where.

**Solution.** Threads are saved and reopen where they stopped. One onboarding thread covers the brand KB, market research and the first script; every later script has its own thread. A "Waiting for you" marker names the one thing the person has to do next, and still shows when the panel is folded.

**Seen on:** scripting (script cards and the link back to onboarding), canvas (the folded rail).

### 8. Each shot on the canvas is set up by hand

**Problem.** Before a shot can be generated, its references have to be connected and its prompt written.

**Solution.** The copilot goes shot by shot: it connects the references a shot needs, writes the prompt and says the shot is ready. The person presses Generate on the node and approves the image; the copilot then moves to the video and the next shot. The panel folds so the canvas is not blocked.

**Seen on:** canvas.

### 9. Guidance must not take control away

**Problem.** A guide that approves, sends or spends credits on its own would remove the person's judgement. A guide that cannot be put aside would slow down people who already work fast by hand.

**Solution.** A person always approves. Spending credits is treated like an approval. The panel folds to a narrow rail and every screen works as it does today. The copilot notices what was changed by hand and picks up from there, without redoing or overwriting it.

**Seen on:** visualise ("I can't send or approve it for you"), canvas ("you press Generate on the node").

## What success looks like

- A person new to CreativeOS takes a brand from a website address to a first approved script without being told which screen comes next.
- A new script for an onboarded client starts with the brand, the research and suggested avatars already present, with nothing re-entered.
- At any moment the panel, open or folded, says what is waiting for the person.
- A person who folds the panel and works by hand can do everything they can do today.
- Nothing is approved, sent to a client or generated without a person's click.

## Not settled here

The open product questions, and the places where the mockups and the design spec still disagree, stay with the design spec (section 8).
