# CreativeOS — Kickoff One-Pager

> **CreativeOS** · *one canvas. every reel asset.*  *(working name — let's lock it today)*
> Kickoff — 2026-06-01 · ~10 min · for the team + leadership
>
> *Each `---` section below is one slide. The arc: the pain → the bet (what **and** how
> we build it) → why our own → the plan → working together.*

---

## 1 · The pain we all feel

Making **one reel** today means hopping between GPT, Claude, Gemini, OpenArt —
pasting the same brief into each, then losing track of which prompt made which
image, and which image became which clip.

**The context dies in browser tabs.** Every project, we start the juggling over.

---

## 2 · The bet — and how we build it

> **CreativeOS: brief → prompt → image → video → archive, on one canvas we own.**

Not another subscription. **Our** tool — the whole pipeline in one place, where nothing
falls between the tools.

**How it's built — the technical approach:**

- **A stack we own.** Next.js + React Flow (the canvas) + Supabase, behind a private
  internal link. Deliberately standard foundations — no vendor lock-in, nothing to renew.
- **Nothing is ever overwritten.** Every brief, prompt, and generation attempt is saved
  as immutable history — so we can always trace how an asset was made, and the studio
  *learns from every attempt instead of resetting.*
- **One reusable spine.** The same node machinery — gather inputs → compile → run →
  save a version — powers every step: brief, prompt, image, video. That's why each
  milestone ships fast and behaves consistently.

---

## 3 · Why build our *own*

- **It bends to us, not us to it.** Designed around our workflow, not a vendor's roadmap.
- **A capability, not a one-off.** The studio investing in itself — it compounds (that's
  the append-only history above), instead of resetting every project.

*Deliberately lean to start:* text briefs first, a private internal link, no heavy
automation. We ship real value fast — not boiling the ocean.

---

## 4 · The plan — 5 milestones (and where we are)

**Each milestone is usable the week it ships.** No three-month disappearing act; every
stage replaces a real tool-switch *now*.

```
  brief  →  prompt  →  image  →  video  →  archive
   (1)       (2)        (3)       (4)        (5)
```

1. **Briefs that never get lost** — paste or drop a brief; CreativeOS parses it; every
   version saved. *Demo:* paste → parse → scroll its history.
2. **Connect the dots** — wire the brief together with notes and references; CreativeOS
   writes the image prompt. *Demo:* connect a brief + a reference → a ready-to-use prompt.
3. **Brief → image** — generate on-canvas, approve the keeper, reject the rest (all
   remembered). *Demo:* a prompt → three attempts → mark the keeper.
4. **Image → video** — turn the keeper into a clip without leaving the canvas; it lands
   when it's ready. *Demo:* approved image → a clip appears when done.
5. **Nothing lost** — open a finished project and trace any asset back to its brief.
   *Demo:* finished project → trace any asset → its brief.

**Where we are:** the canvas runs today. **Milestone 1 is being designed now**; the rest
are queued. Near-term and real — not a someday idea.

---

## 5 · Working together — roles, ownership, the loop

**Who owns what**

- **Product (Cyril, Anupama, Priya)** sets direction and priorities — what each milestone needs to nail.
- **Build (the dev team, Anupama and Team)** ships one milestone at a time and runs the weekly demo.
- **Designers ( Vanchi and team   )** own real use — on real reels, with the briefs you actually work from.

**How we stay in sync**

- A **weekly demo** of whatever just shipped, plus **one feedback channel** (not scattered
  DMs) where every rough edge goes.

**The loop:** we **build** → you **use it for real** → we **learn** from exactly what you
hit, and sharpen what's next. Every cycle, the product gets sharper — so honest feedback
is what makes this work.

> **By the end of this, the way we make reels is *ours*.**

---

*Revised 2026-06-03 — tightened from 7 sections to 5 (cut repeated points: "compounding"
stated once, "your part" + "the loop" merged), and woven in the four kickoff items: the
name, the technical approach, the delivery plan, and roles/ownership.*
