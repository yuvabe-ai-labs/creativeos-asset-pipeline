# Script copilot · spec 4 — client review: the link, comments per part, activity, and approval

**8 October 2026 · product spec (the *what*) · spec 4 of 4 · no AI in this spec · revised 8 Oct 2026
to the answers in [the questions file](2026-10-08-script-copilot-open-questions.md)**
Branch: `worktree-script-copilot`. Parent spec: [2026-10-07-script-copilot-design.md](2026-10-07-script-copilot-design.md).
Spec 1: [2026-10-08-script-copilot-1-library-and-script-design.md](2026-10-08-script-copilot-1-library-and-script-design.md) ·
Spec 3: [2026-10-08-script-copilot-3-visualise-design.md](2026-10-08-script-copilot-3-visualise-design.md).
ADRs: D346–D355 (booked).
Explainer, with every decision that crosses specs: https://claude.ai/artifact/RLbXdnfrXHf6dYTbm7uN4k#decisions ·
Screen mockups (the client review board is the fourth stage): https://claude.ai/artifact/65cg8RQ1NgTFUCjgmgQ2dM

---

## 0. Where this sits

The script copilot is four specs (spec 1 §0): 1 · library, script and handoff; 2 · Generate;
3 · Visualise; **4 · Client review, this spec.**

Spec 4 owns the script's life from Visualise onward (spec 1 §7): **moving it to In review**,
**sharing** it with the client, **Approve**, which moves it to Approved and so puts it in the
canvas gallery's Scripts tab (spec 1 §5.1), and the move back to Visualise. It also owns the client
link, comments, versions and the activity history.

It reads, and never changes, what the other specs make: the script and its one script view
(spec 1 §2, §4), and the avatars and storyboard panels (spec 3).

**Soft dependency on spec 3.** Spec 3 builds the panels in parallel. Spec 4 works first with
comments on the context card, the shots and the cast, on the seeded Reel 01; panel comments and
the panel-level share attach to whatever panels exist.

## 1. Problem

The parent spec's third outcome is the reason this feature exists: **stop late changes to the
story** (parent spec §0). The client should sign off on the visual reel — every cast member's
avatar and a panel for every shot — while a change still costs a sentence. Its second outcome is
speed: one link, comments where they matter, one approval, instead of rounds of documents and
calls.

Today none of this exists for a script. A script reaches the client, if at all, as a document
outside CreativeOS, and the feedback comes back by message, detached from the shot it is about
(parent spec §1).

What exists is close, but for a different object:

- **Client review links (D309–D311)** let a client with no account open a link, type their name
  once, and leave comments on an uploaded video cut. There is no verdict, no reply and no version.
- **Review annotations (D239–D251)** let a senior pin notes to regions of an image, and the maker
  reads them on the same surface.
- **A client approval design for posts** (branch `approval`, unbuilt) adds the missing verdict: a
  link with Approve, and an approval bound to exactly what the client saw.

Spec 4 reviews a different thing — a script, its cast's avatars and its storyboard — with the same
idea (parent spec §8).

## 2. Who

- **A member of the content team** who has a final script, moves it to In review, shares it, reads
  the comments, revises and shares again (parent spec §3). Anyone on the team can do all of this.
- **The brand client**, who opens the link, reads the reel, comments on the parts that need it and
  approves the whole package. They are not a CreativeOS user and have no account: they type their
  name once.

## 3. The flow

```
VISUALISE ──team moves it──▶ IN REVIEW ──Share (v1, v2, …)──▶ client comments ──Approve──▶ APPROVED ──▶ Scripts tab
    ▲                            │  team keeps editing;                                          (spec 1 §5.1)
    └──── team moves it back ────┘  each share is a frozen version
```

1. At Visualise, once the script is final, the team **moves it to In review**, by hand. Only then
   does the **Share** action appear.
2. The team chooses **what the share includes**: the **script only**, the **script with avatars**,
   or the **script with avatars and panels**. Sharing works whatever the state of the visuals, but
   never before Mark final: the script the client reads is always complete (spec 2 §8).
3. **Each share is a version.** CreativeOS records what was shared: the script's text, the picked
   take of each panel included, and the avatar images. The client's link shows **that version,
   frozen**, until the next share. The team keeps editing in Visualise between shares, and none of
   it reaches the client until they share again.
4. The team gets **the link** to copy and send by whatever channel they already use. **The link
   stays the same across versions.**
5. The client opens the link and sees the version, read-only; comments on any part; and, on a
   full share, can **Approve**.
6. The comments appear in the team's Visualise view beside the part they are about.
7. The team revises and **shares again**: the next version goes on the same link, and the
   activity says what changed.
8. The client presses **Approve.** The script moves to **Approved** and appears in the canvas
   gallery's Scripts tab. Everything after that is spec 1 §5, unchanged.

The team may also **move the script back to Visualise** by hand, to say it is no longer with the
client. Client comments never change the stage.

Stage moves are only these: Visualise → In review, In review → Visualise, In review → Approved.
Spec 1's library filter "In review" lists exactly the scripts with the client.

## 4. What the client sees

One page with no app chrome, the same rule the video review links follow. From the mockup board:

- **A header**: who it is from and for ("Yuvabe Studios × Jackfruit365 · for your review"), the
  script's title, and "Version 2 · shared 10 Oct · read-only".
- **The reel, read-only**, in spec 1's one script view (spec 1 §4): the header and context card,
  the cast, and the shots in order with timecode, visual, voiceover, on-screen text and who is on
  screen. On a share with avatars, each cast member's four-view sheet and voice; on a share with
  panels, the picked panel beside each shot. The client sees the same layout as the team.
- **A comment action on every commentable part**, and a marker on each part that has comments.
- **A Comments column** listing the threads, each labelled with its part, with the team's replies
  and Resolved marks, and **Add a comment**.
- **An Activity list**: each share and what changed, comments, and the approval.
- **Approve reel**, on a full share only (§8).

The client cannot edit the script, regenerate anything or see the copilot. They see the version
that was shared, never work in progress.

The client may be on a phone: the video review page is mobile-first because clients open links
from WhatsApp. This page reads on a phone too, with the panel beside each shot stacking under it.

## 5. Comments

**Where a comment can go.** Whole parts, and only these:

- the **context card**;
- each **shot**;
- each **cast member's avatar**, and **each of its four views** (Front, Left, Right, Back), as the
  board shows;
- each **storyboard panel**, once spec 3 has made it and the share includes it.

A comment belongs to one part. There are no pins on spots inside an image and no painting.

**What a comment holds.** The text, the client's name and the time. The client types their name
once and is not asked again on that device.

**Threads.** The team **replies** under a comment and **marks the thread Resolved**; the client
sees the reply and the mark. Comments can be **edited, never deleted**. Known limit for now: with
no client login, anyone with the link can edit any comment; the later password or accounts (§10)
fix that.

**A comment belongs to the version it was made on.** When a later version removes, splits or
replaces the shot it was on, the comment stays, shown under **"On a removed shot"** with the shot's
last text; on a split, the first half keeps the shot's identity and its comments.

**After approval, no more comments** (§8).

**Everyone with the link sees every comment.**

## 6. What the team sees

In the **Visualise view** (spec 3), the same view they revise in:

- each commented part shows its comments beside it, so a note on shot 4 sits next to shot 4, and a
  note on a cast member's left view sits next to that view;
- the same **Comments** and **Activity** lists the client sees, with **Reply** and **Resolve**;
- **Move to In review** (at Visualise), then **Share** with its scope choice, **Share again**, and
  **Copy link**; and **Move back to Visualise**.

In the **Scripts library** the card shows the stage chip through spec 1's stage filter, and a
**count of client comments and approvals**, like the existing "Client feedback" chip on video
reviews. It is a total, not "new since you last looked"; a seen-state can come later. No email.

## 7. One link, versions and activity

**The link stays the same across versions.** The client bookmarks one link and returns to it.

**Each share is a version**: the first share is version 1, each later share the next. The page
shows the latest. Earlier versions survive as activity lines naming what changed; each line links
to the part ("S1 revised" jumps to S1). The client cannot open an earlier version or see a
highlighted diff; both can come later, and nothing is lost because spec 3 keeps every panel take.

**Activity** is the history of the review, oldest first:

- Shared, version 1, and what it included
- n comments, by whom
- which parts changed between versions, for example "S1, S4, S5 and the avatar revised"
- Shared again, version 2
- Moved back to Visualise, by the team (when it happens)
- Approved, by whom and when

Nothing in the activity is edited or removed later.

## 8. Approval

- **Approve appears only on a full share**: script, avatars and panels. A share of the script
  alone, or with avatars only, is for comments. The client approves **the whole package** in one
  action; there is no approving a shot or an avatar on its own (parent spec §10).
- **Anyone with the link can approve, under their typed name.** Stated limit: a typed name proves
  nothing, and a forwarded link can approve. The later password (§10) narrows this.
- **If threads are still open, a confirm names them** ("You have 1 open comment: 'Can she wear
  blue?' Approve anyway?") and the client decides.
- **Approval records who and when** in the activity.
- **Approval is of the version on screen.** Because the client only ever sees a frozen version,
  the approval binds to exactly what they saw, and the team's unshared edits are never approved by
  accident.
- **Approval moves the script to Approved**, which puts it in the canvas gallery's Scripts tab
  (spec 1 §5.1). That is the only way a script reaches the Scripts tab.
- **The client cannot withdraw an approval.** If a change is needed, the team **reopens** the
  script to Visualise and shares again on the same link for a new approval; the activity reads
  Approved › Reopened › Approved. Canvas nodes already made keep their copy (spec 1 §5.4).
- **After approval, the link is a read-only record** showing "Approved on …", and takes no more
  comments.

## 9. Constraint for the plan

Spec 4 keeps versions, comments and activity separate from the script document, keyed by script,
by version, and by the part commented on (context, shot id, cast member id and view, panel), and
changes stage only Visualise → In review → Visualise or Approved. A version records the script
text, the picked panel take per shot, and the avatar images it included.

## 10. Not in scope

| Item | Why |
|---|---|
| Approving parts separately, or approving a partial share | Whole-package approval, on a full share only |
| Sharing before Mark final | The script the client reads is always complete (spec 2 §8) |
| The client editing the script, regenerating avatars or panels | The view is read-only (parent spec §8) |
| Pins on a spot inside a panel or view, painting regions | A comment is on a whole part |
| The client opening an earlier version, or a highlighted diff | Later; activity names what changed |
| A link password, client accounts | Later; the password comes with the video review links' planned one, one scheme for both. Worth doing soon after the demo: the link shows real faces and unreleased claims |
| A "new since seen" state on the comment count; email or push notifications | Later |
| Internal senior sign-off before sharing | A different flow (the internal approval PRD) |
| Link expiry and revocation | None; deleting the script kills the link |
| Client comments after approval | The link becomes a record; a change goes through reopen |
| Anything after approval | Spec 1 §5, unchanged |

## 11. Success

Spec 4 is done when, for Jackfruit365's seeded Reel 01:

1. The team moves it to In review; the library shows **In review**; the Share action appears and
   offers script only, with avatars, or with avatars and panels.
2. A script-only share gives the team one link; a client with no account opens it on a phone and
   sees the context card, the cast and all 14 shots, read-only, with no Approve.
3. The client comments on the context card, on a shot, on a cast member's avatar and on one of its
   views. Each comment appears in the team's Visualise view beside that part; the team replies and
   resolves one.
4. The team edits a shot **without sharing**; the client's link does not change. The team shares
   again with avatars and panels; the **same link** shows version 2, the activity names what
   changed, and the comment on the edited shot is still there.
5. The library card shows the count of client comments.
6. The client presses Approve with one thread still open; a confirm names it; on confirming, the
   script shows **Approved**, appears in the canvas gallery's Scripts tab, the activity records who
   and when, and the link becomes a read-only record that takes no more comments.
7. The team reopens the approved script to Visualise and shares again; the client can approve
   version 3 on the same link.

These are parent spec §9 criterion 4, extended to every commentable part and to versions.

## 12. Risks

- **Anyone can approve and claim any name.** It is the trust model of emailing a PDF, not proof of
  identity. The link also carries an unreleased campaign and, for a Specific avatar, a real face.
  The password is the first follow-up.
- **A partial share read as the whole.** A client shown the script alone may think that is all
  there is. The page says what the share includes and what is still to come.
- **Comments on moving ground.** Spec 2 splits and rewrites shots, so a comment's shot may be gone
  after a revision; §5's version binding and "On a removed shot" keep it readable.
- **Versions that only the team can see.** The client cannot open version 1 after version 2 is
  shared; if that is missed, earlier versions can be exposed later, since everything is kept.
- **Panels arrive late.** Spec 3 builds in parallel. A script-only share can go out first for
  comments, but approval waits for a full share, so the client never signs off on words alone.

## 13. Decisions (8 Oct 2026)

Every question this spec's draft raised was answered on 8 Oct; the answers, with the options and
reasons, are in [the questions file](2026-10-08-script-copilot-open-questions.md), section Spec 4.
In one line each:

| # | Decision |
|---|---|
| 4.1 | A version is each share; the link shows the latest; activity names what changed, linking to the part |
| 4.2 | The link shows the frozen version that was shared; the team keeps editing between shares |
| 4.3 | The team moves the script into and out of In review by hand; editing stays allowed in In review; comments never change the stage |
| 4.4 | Anyone on the team can share; the share is script only, with avatars, or with avatars and panels; only after Mark final; Approve only on a full share; Share appears only in In review |
| 4.5 | Anyone with the link can approve, under their typed name; the limit is stated |
| 4.6 | The client cannot withdraw; the team reopens and shares again on the same link |
| 4.7 | No comments after approval; the link becomes a record |
| 4.8 | No account or password for now; the password comes with the video review links' |
| 4.9 | An in-app count of comments and approvals on the card and the script; no email |
| 4.10 | Team replies and resolves; comments edited, never deleted |
| 4.11 | Comments on a removed shot stay, under "On a removed shot"; a split's first half keeps them |
| 4.12 | No spot pins; a comment is on a whole part, including each avatar view |
| 4.13 | Approve with open threads, after a confirm that names them |

**Still open:** none.
