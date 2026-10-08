# Script copilot · spec 4 — client review: the link, comments per part, activity, and approval

**8 October 2026 · product spec (the *what*) · spec 4 of 4 · no AI in this spec**
Branch: `worktree-script-copilot`. Parent spec: [2026-10-07-script-copilot-design.md](2026-10-07-script-copilot-design.md).
Spec 1: [2026-10-08-script-copilot-1-library-and-script-design.md](2026-10-08-script-copilot-1-library-and-script-design.md).
ADRs: D346–D355 (booked).
Explainer, with every decision that crosses specs: https://claude.ai/artifact/RLbXdnfrXHf6dYTbm7uN4k#decisions ·
Screen mockups (the client review board is the fourth stage): https://claude.ai/artifact/65cg8RQ1NgTFUCjgmgQ2dM

---

## 0. Where this sits

The script copilot is four specs (spec 1 §0): 1 · library, script and handoff; 2 · Generate;
3 · Visualise; **4 · Client review, this spec.**

Spec 4 owns two stage moves and nothing else in the script's life (spec 1 §7): **Send to client**,
which moves a script from Visualise to In review, and **Approve**, which moves it to Approved and so
puts it in the canvas gallery's Scripts tab (spec 1 §5.1). It also owns the client link, comments,
versions and the activity history (spec 1 §7, §9).

It reads, and never changes, what the other specs make: the script and its one script view
(spec 1 §2, §4), and the avatars and storyboard panels (parent spec §7; spec 3).

**Soft dependency on spec 3.** Spec 3 builds the panels in parallel. Spec 4 must work first with
comments on the context card, the shots and the cast, using the seeded Reel 01 at Visualise
(spec 1 §6). Panel comments attach to whatever panels exist.

## 1. Problem

The parent spec's third outcome is the reason this feature exists: **stop late changes to the
story** (parent spec §0). The client should sign off on the visual reel — every cast member's avatar
and a panel for every shot — while a change still costs a sentence. Its second outcome is speed:
one link, comments where they matter, one approval, instead of rounds of documents and calls.

Today none of this exists for a script. A script reaches the client, if at all, as a document
outside CreativeOS, and the feedback comes back by message, detached from the shot it is about
(parent spec §1).

What exists is close, but for a different object:

- **Client review links (D309–D311)** let a client with no account open a link, type their name
  once, and leave comments on an uploaded video cut. The comments land on the canvas node that
  holds the cut. There is no verdict, no reply and no version: a new cut is a new node
  (`2026-09-30-client-review-share-design.md` §1; staging roadmap §7 D309, D311).
- **Review annotations (D239–D251)** let a senior pin notes to regions of an image or a paused video
  frame when requesting changes, and the maker reads them on the same surface, read-only
  (`2026-09-03-review-annotations-design.md` §1, §3).
- **A client approval design for posts** (branch `approval`,
  `2026-08-03-post-client-approval-design.md`, unbuilt) adds the missing verdict: a link with
  Approve, a comment thread, and an approval bound to exactly what the client saw (its §5, D111).

Spec 4 reviews a different thing — a script, its cast's avatars and its storyboard — with the same
idea (parent spec §8).

## 2. Who

- **A member of the content team** who has a script at Visualise, sends it, reads the comments,
  revises and re-sends (parent spec §3).
- **The brand client**, who opens the link, reads the reel, comments on the parts that need it and
  approves the whole package. They are not a CreativeOS user: like the D309 reviewer, they have no
  account *(assumed — open question 8)*.

## 3. The flow

```
VISUALISE ──Send to client──▶ IN REVIEW ──client approves──▶ APPROVED ──▶ Scripts tab (spec 1 §5.1)
    ▲                             │
    └──── changes needed ─────────┘
          (team revises in Visualise, then Re-sends on the same link)
```

1. At Visualise, the team member presses **Send to client.** The script moves to **In review**, and
   the team member gets **the link** to copy and send by whatever channel they already use, as with
   D309's Copy link (`2026-09-30-client-review-share-design.md` §5).
2. The client opens the link and sees the reel, read-only.
3. The client comments on any part: the context card, a shot, a cast member's avatar, a storyboard
   panel.
4. The comments appear in the team's Visualise view beside the part they are about.
5. If changes are needed, the script goes back to **Visualise** *(what moves it — open question 3)*.
   The team revises there.
6. The team presses **Send to client** again. The script returns to In review on **the same link**,
   now as the next version *(what a version is — open question 1)*.
7. The client presses **Approve.** The script moves to **Approved** and appears in the canvas
   gallery's Scripts tab. Everything after that is spec 1 §5, unchanged.

Stage moves are only these: Visualise → In review, In review → Visualise, In review → Approved.

## 4. What the client sees

One page with no app chrome, the same rule D309 follows for `/r/*`
(`2026-09-30-client-review-share-design.md` §3). From the mockup board:

- **A header**: who it is from and for ("Yuvabe Studios × Jackfruit365 · for your review"), the
  script's title, and a line such as "Version 2 · sent 10 Oct · read-only"
  *(version numbering assumed from the mockup — open question 1)*.
- **The reel, read-only**, in spec 1's one script view (spec 1 §4): the header and context card, the
  cast with each person's avatar, and the shots in order with timecode, visual, voiceover,
  on-screen text and who is on screen. Beside each shot sits its storyboard panel, where one exists.
  Each cast member's avatar is shown as its sheet. The client sees the same layout as the team
  (spec 1 §4, "the client sees the same layout as the team").
- **A comment action on every commentable part**, and a marker on each part that has comments.
- **A Comments column** listing the threads, each labelled with its part, and **Add a comment**.
- **An Activity list**: what was sent, commented, changed and re-sent, and when it was approved.
- **One Approve action** for the whole reel ("Approve reel").

The client cannot edit the script, regenerate anything or see the copilot. They see the version that
was sent *(assumed — open question 2)*.

The client may be on a phone: D309's page is mobile-first because clients open links from WhatsApp
(`2026-09-30-client-review-share-design.md` §1, §4). This page should read on a phone too, with the
panel beside each shot stacking under it.

## 5. Comments

**Where a comment can go.** Four kinds of part, and only these:

- the **context card**;
- each **shot**;
- each **cast member's avatar** (spec 1 §8: "Spec 4 lets the client comment on each cast member's
  avatar");
- each **storyboard panel**, once spec 3 has made it.

A comment belongs to one part. Whether it can point at a spot within a part is open
*(open question 12)*.

**What a comment holds.** The text, the client's name and the time. Like D309, the client types
their name once and is not asked again on that device
(`2026-09-30-client-review-share-design.md` §4).

**Threads.** The mockup shows team replies under a client comment and a thread marked **Resolved**.
D309 and D239–D251 both have no replies. Whether the team replies and resolves is not settled
*(open question 10)*.

**Everyone with the link sees every comment**, as in D309 (staging roadmap §7 D309).

## 6. What the team sees

In the **Visualise view** (parent spec §7; spec 3), the same view they revise in:

- each commented part shows its comments beside it, so a note on shot 4 sits next to shot 4, and a
  note on a cast member's avatar sits next to that avatar;
- the same **Comments** list and **Activity** list the client sees;
- the **Send to client** action, which becomes **Re-send** once a version has been sent, and **Copy
  link** once the link exists.

This mirrors D244: the maker reads feedback on the same surface where the fix is made
(`2026-09-03-review-annotations-design.md` §3), and D309's drawer, which lets the designer read
feedback while working (`2026-09-30-client-review-share-design.md` §5).

In the **Scripts library** the card shows the stage chip, In review or Approved, through spec 1's
existing stage filter (spec 1 §3). How the team learns of new comments is open *(open question 9)*.

## 7. One link, versions and activity

**The link stays the same across revisions** (parent spec §8). The client bookmarks one link and
returns to it.

**Each send is a version** *(assumed from the mockup — open question 1)*: the first send is
version 1, each re-send the next. The page shows the latest.

**Activity** is the history of the review, oldest first, as in the mockup:

- Sent for review (version 1)
- n comments, by whom
- which parts changed between versions, for example "S1, S4, S5 revised"
- Re-sent as version 2
- Approved, by whom and when

The activity is a record. Nothing in it is edited or removed later, the same posture as D309's
comments, which can be edited but never deleted (staging roadmap §7 D309).

## 8. Approval

- **One action for the whole package.** Comments are per part; approval is not (parent spec §8).
  There is no approving a shot or an avatar on its own (parent spec §10).
- **Approval records who and when.** The client's typed name and the time go in the activity
  *(who may approve — open question 5)*.
- **Approval moves the script to Approved**, which puts it in the canvas gallery's Scripts tab
  (spec 1 §5.1). That is the only way a script reaches the Scripts tab.
- **Approval is of the version on screen.** The post approval design binds an approval to exactly
  what the client saw, so a later edit cannot slip through unapproved
  (`2026-08-03-post-client-approval-design.md` §5, D111) *(assumed — open question 2)*. Spec 1 already covers what happens if an
  approved script is reopened and approved again: canvas nodes keep their copy (spec 1 §5.4)
  *(whether approval can be withdrawn — open question 6)*.

## 9. Constraint for the plan

Spec 4 keeps comments, versions and activity separate from the script document, keyed by script
and by the part commented on (context, shot id, cast member id, panel), and changes stage only
visualise → in_review → visualise/approved.

## 10. Not in scope

| Item | Why |
|---|---|
| Approving parts separately, or approval rounds as separate links | Whole-package approval on one link (parent spec §10) |
| The client editing the script, regenerating avatars or panels | The view is read-only (parent spec §8) |
| Painting regions on a panel or avatar sheet | D309 rejected frame painting for clients on phones (staging roadmap §7 D309) |
| Internal senior sign-off before sending | A different flow; the internal approval PRD excludes client-facing approval (branch `approval`, `2026-08-19-internal-approval-workflow-prd.md` §5) |
| Email or push notifications | Neither D309 nor the post approval design has them (`2026-08-03-post-client-approval-design.md` §9) |
| Link expiry and revocation | D309 has none; deleting the source kills the link (`2026-09-30-client-review-share-design.md` §1) |
| Anything after approval | Spec 1 §5, unchanged |
| Client review of a video cut | Exists as D309; this spec reviews a script |

## 11. Success

Spec 4 is done when, for Jackfruit365's seeded Reel 01 loaded at Visualise (spec 1 §6):

1. The team sends it; it shows **In review** in the library, and the team has one link to copy.
2. A client, with no CreativeOS account, opens the link on a phone and sees the context card, the
   cast with avatars, and all 14 shots, read-only, with panels beside the shots that have them.
3. The client comments on the context card, on a shot, on a cast member's avatar and, where one
   exists, on a panel. Each comment appears in the team's Visualise view beside that part.
4. The team revises a shot and re-sends. The **same link** shows the revision, and its activity
   shows the comments, the change and the re-send.
5. The client approves. The script shows **Approved**, appears in the canvas gallery's Scripts tab,
   and the activity records who approved and when.

These are parent spec §9 criterion 4, extended to every commentable part.

## 12. Risks

- **The client reviews the wrong thing.** If the link shows the team's edits in progress, the client
  can approve, or comment on, a half-made revision. The post approval design names the same risk:
  "approve → nudge the headline → publish" ships something the client never saw
  (`2026-08-03-post-client-approval-design.md` §5). Open questions 1 and 2 decide this.
- **Guessable links.** D311 made review links guessable by operator decision, with password
  protection planned (staging roadmap §7 D311). A script link carries an unreleased campaign, and
  here anyone holding it can also approve. Open question 8.
- **Anyone can approve and claim any name.** The post approval design states this honestly: it is
  the trust model of emailing a PDF, not proof of identity
  (`2026-08-03-post-client-approval-design.md` §6). Open question 5.
- **Comments orphaned by revision.** Spec 2 splits and rewrites shots, so a comment's shot may be
  gone or renumbered after a revision. Open question 11.
- **Panels arrive late.** Spec 3 builds in parallel. If the first sends go out with few panels, the
  client signs off on words again, which is the problem the parent spec exists to solve
  (parent spec §1). Open question 4.

## 13. Open questions

1. **What is a version, and what does the client see of earlier ones?**
   (a) A version is each send; the link shows only the latest, and earlier versions survive only as
   activity entries naming what changed. (b) The client can open any earlier version, read-only.
   (c) The client sees what changed, highlighted, between the last version and this one.
   *Recommendation: (a).* D309 has no versions at all (a new cut is a new node), and the post
   approval design kept history out of V1 (its §13 Q2); the mockup's "S1, S4, S5 revised" entry
   already tells the client where to look.

2. **Between sends, does the link show the version that was sent, or the team's live work?**
   (a) The version sent, frozen until the next send. (b) Live: every team edit shows at once.
   *Recommendation: (a).* The post approval design binds approval to exactly what the client saw
   (D111); live edits would let a client approve a half-made revision.

3. **What moves a script from In review back to Visualise?**
   (a) Any client comment. (b) The team, with one action when it starts revising. (c) An explicit
   client "Request changes" action. *Recommendation: (b).* D309 comments never change any state, a
   comment can be a question rather than a change, and spec 1 §2's "when the client comments" is an
   example, not a rule.

4. **Who can send to the client, and must every part be visualised first?**
   (a) Anyone on the team; send whatever exists. (b) Anyone; every cast member must have an avatar
   and every shot a panel. (c) Senior or owner only. *Recommendation: (b) once spec 3 lands, (a)
   until then.* The post approval design lets any role send (its §8), and parent spec §0 says the
   client signs off on the visual reel, which an incomplete storyboard does not show.

5. **Who can approve, and how is the approver recorded?**
   (a) Anyone with the link, under their typed name. (b) Only a client contact named by the team at
   send. (c) (a), plus a team member recording an offline approval, labelled as recorded.
   *Recommendation: (a).* It is D309's trust model, and the post approval design accepts it with the
   limit stated (its §6); the recorded fallback (its §7) can follow if clients approve by phone.

6. **Can an approval be withdrawn, and what happens to the link afterwards?**
   (a) The client cannot withdraw; the team can reopen the script to Visualise and re-send on the
   same link. (b) The client can withdraw until the script is first dragged onto a canvas.
   (c) Approval is final; changes need a new script. *Recommendation: (a).* Spec 1 §5.4 already
   handles re-approval (canvas nodes keep their copy), and the post approval design keeps every
   round append-only (D111).

7. **Can the client comment after approval?**
   (a) No; the link becomes a read-only record showing "Approved on …". (b) Yes, but comments do not
   change the stage. *Recommendation: (a).* Comments after sign-off are the late changes the
   parent spec exists to stop (parent spec §0).

8. **Does the client need an account or a password?**
   (a) Neither: the name typed once, as in D309. (b) A password on the link, the follow-up D311
   already plans. (c) Client accounts. *Recommendation: (a) now, (b) when it lands for D309 links
   too.* The post approval design rejected client accounts for the pilot (its §2 C), and one
   password scheme should cover both kinds of link.

9. **How does the team learn there is something new?**
   (a) Nothing beyond the stage chip; they open the script. (b) An in-app count of new comments and
   approvals, on the library card and the script, like D310's "Client feedback" chip. (c) Email.
   *Recommendation: (b).* D310 shows a total count in-app with no seen-state, and neither D309 nor
   the post approval design sends email (its §9).

10. **Does the team reply in a thread and mark comments resolved, and can comments be edited or
    deleted?** (a) As the mockup: team replies, the team marks a thread Resolved; comments edited
    by anyone, never deleted, as D309. (b) The team reads only, as D309 and D244. (c) Resolve
    without replies. *Recommendation: (a).* The mockup shows it, it is how the client sees a comment
    was acted on, and D309's edit-not-delete rule carries over unchanged.

11. **What happens to comments on a part that was deleted, split or replaced?**
    (a) They stay, shown under "on a removed shot" with the shot's last text. (b) They move to the
    context card. (c) They are dropped. *Recommendation: (a).* D309 never deletes a comment, and
    D244 keeps old annotations attached to the version they were made on rather than overlaying
    them on newer output.

12. **Can a comment point at a spot on a panel or an avatar sheet?**
    (a) No; a comment is on the whole part. (b) A tap-to-place pin, with no painting.
    (c) A painted region, as D239–D251. *Recommendation: (a).* D309 rejected painting for clients on
    phones, and the post approval design called anchored pins a V2 (its D112).

13. **Can the client approve while comments are unresolved?**
    (a) Yes. (b) Yes, after a confirm that names the open threads. (c) No.
    *Recommendation: (b).* The client owns the verdict, and approval is of the whole package; a
    confirm stops an approval that contradicts the client's own open comment.
