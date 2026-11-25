# Piece 3: the market research agent, and signals made visible in scripts

**Status:** design, for Cyril's approval (2026-11-24). Builds on the copilot journey design
(`2026-11-12-copilot-journey-design.md` §5.2, §5.3, §8.3) and the page-follows design (D520, D528).
**Branch:** `feat/copilot-journey`. Next free decision number: D529.

## 1. Why

Market research is the one stage of the journey the copilot does not help with. The Market research
tab is filled entirely by hand: someone finds competitors, saves their posts as references into
Direct and Adjacent (by hand or with the browser extension), and writes signals from them. Until that
is done and approved, a new client cannot start a script. So the slowest manual stage now sits in
front of everything else.

Signals also go quiet once they exist. The script copilot reads every signal when a script starts and
says once, in a chat card that scrolls away, which signals each angle drew on. After the draft,
nothing on the script says what it was built from, and the person cannot steer which signals a script
uses.

## 2. What we are building (Cyril, 2026-11-24)

1. **The agent helps populate market research.** It finds competitors, brings in their recent posts
   as references, and drafts signals from them. It does this **in steps, and the person reviews and
   tweaks each step before the next one starts.**
2. **Signals are the themes.** The agent adds no new kind of thing: what it drafts is an ordinary
   signal (name, tags, description, the references behind it), kept, edited or dropped like one made
   by hand.
3. **A script makes its signals obvious.** The script shows which signals it is built from, and the
   person can add or remove one.

### What a signal may be about (Cyril, 2026-11-24; refines D255)

A signal may describe **creative patterns** (how reels open, formats, pacing, on-screen text) as well
as **where and when** (place, time of day, season, occasion). It still **never supplies claims, proof,
health language, product uses or disclaimers**, and its text is still data, never an instruction to
the copilot. D255 and the script copilot's instructions are rewritten to match, as a new decision.
To describe a hook or a format, the agent looks at the posts themselves, not only their captions, so
Step 2 takes longer and costs more per post.

## 3. Goals, non-goals, anti-goals

**Goals**
- A new client's market research can be done in one sitting with the copilot, from an approved brand
  KB to approved research, with the person deciding at every step.
- Every reference the agent adds is a real post, by a named brand, that the person can open.
- When a script is written, anyone looking at it can see which signals it came from, and change that.

**Non-goals (this piece)**
- Tracked handles: confirmed competitors are **not** added to the Performance tab automatically
  (Cyril, 2026-11-24; §9, question 2).
- Platforms other than Instagram for fetching posts (*my call*). TikTok, YouTube and Pinterest
  references still come in by hand or by the extension, as today.
- Changing the Direct, Adjacent, Signals and Performance tabs, or the browser extension (decided
  2026-11-15).
- A specialised third-party research source. A general web search first (decided 2026-11-15).
- The canvas: a script's "Built from" does not carry into its canvas, and the canvas script node's
  own signal picker is unchanged (*my call*: the canvas is piece 6, and carrying signals over could
  apply them a second time to a script already written from them).

**Anti-goals (would make this a failure even if it works)**
- The agent writes signals or references the person never saw. Every saved signal was kept by a
  person; every reference it adds is visible on the page the moment it lands.
- The agent approves market research. Only a person approves (as today).
- A run that quietly costs money nobody asked for: fetching posts happens only after the person
  confirms who to fetch.
- Invented brand facts (journey principle 7): a competitor, a post or a claim in a signal comes from
  the web, the fetched posts or the person.

## 4. The flow

The copilot works in the panel beside the Market research tab, in the client's onboarding thread
(the same thread as the brand KB). The page follows it as it does on the Brand KB tab (D520): what it
adds comes into view and highlights when it lands; nothing is marked while it only asks (D528).

### Step 0: start
When the brand KB is approved, the panel offers **"Research the market"**. The person can also just
say who their competitors are, or keep working by hand: the agent is offered, never forced. On a
client whose research already has references or signals, the copilot says what is there and offers
to add to it.

### Step 1: who to look at (review: the list)
The copilot searches the web and proposes brands to look at, in two groups that match the tabs:
- **Direct:** brands selling to the same buyer in the same category.
- **Adjacent:** brands the same audience follows, or that do something worth borrowing.

Each brand has its Instagram handle and one line on why it is there. It **asks when unsure**, for
example whether a brand sells to the same buyer. The person keeps, drops, moves between groups,
corrects a handle, or adds their own ("add @brandY"), in the chat or with buttons on the list. Nothing
is fetched until the person confirms the list.

### Step 2: their posts (review: the references)
For each confirmed brand, the copilot brings in its recent Instagram posts as ordinary references in
Direct or Adjacent. They appear on the page as they arrive. A brand that cannot be fetched (wrong or
private handle) is named in the chat; the others carry on. When done, the copilot says what came in
("31 posts from 6 brands") and waits. The person can delete references on the page as today, ask for
more from one brand, or add a brand and fetch again. The person says when to move on.

The brand's own recent posts are already brought in when the brand KB is built (the asset import);
the copilot reads those beside the competitors' when it drafts signals, rather than fetching them
again (*my call*). They are **context only**: they help it say what the brand already does or has not
tried, but a signal cites only references in Direct and Adjacent, so every reference behind a signal
is a competitor's or an adjacent brand's post the person can open (*my call*: the brand's own posts
live in brand assets, which a signal cannot link, and filing them under Direct or Adjacent would
mislabel them).

### Step 3: the signals (review: each signal)
The copilot groups the posts into draft signals, each with a name, tags, a description of the pattern
and the references behind it. It shows them as cards in the chat; each card can be kept, edited
(name, tags, description, which references) or dropped. A kept card becomes an ordinary signal on the
Signals tab, highlighted as it lands. The person can ask for more ("anything about hooks?") or to
merge or split drafts.

### Step 4: approve
The person approves market research with the existing button. That opens Scripts, as built in piece 2.
The copilot never approves.

### Later
Approval does not close the stage (journey §4.5). The person can ask the copilot to look again, add a
brand, or draft more signals at any time; new signals still arrive as cards to keep or drop, and
existing scripts are not touched.

## 5. Scripts: "Built from"

- **The script shows its signals.** A **"Built from"** line at the top of the script names the
  signals it uses, each removable, with an "Add a signal" chip (*my call: the top of the script*).
- **What it holds, and when (Cyril, 2026-11-24).** Before any angles, it reads "Set when you pick an
  angle". Picking an angle fills it with the signals that angle used. The person can add or remove
  signals before the draft, and the draft uses that set. If signals are set before the angles are
  asked for, the angles read only those; otherwise they read every signal, as today (D335). An angle
  the person blends or writes themselves takes the signals the copilot used for it, which may be
  none. "Built from" is the script's own set from then on, not just a record of the angle.
- **Angles name their signal.** Each angle the copilot offers says which signal it comes from
  ("from *Monsoon rituals*"), instead of a separate card.
- **The person can steer.** Before the draft, adding or removing a signal (on the line or in the chat:
  "use the office dry skin signal") changes what the angles and the draft draw on. After the draft,
  a change to "Built from" makes the copilot **offer** a rewrite as a change to approve, never rewrite
  on its own (*my call*; it is how every copilot change already works).
- **Where it shows.** At Generate and Visualise, and read-only In review and Approved (*my call*).
- **Research from a script goes through the market research agent** (Cyril, 2026-11-24). When the
  person asks the script copilot to research something, it hands the request to the market research
  agent. What the agent finds lands in market research as usual (references, then draft signals to
  keep or drop), and a kept signal can be added to the script's "Built from". A script keeps no
  research of its own, and what was researched for one script is there for the next. Searching the
  web still happens only when the person asks (journey §5.3). **This is part of this piece**: the
  script copilot gains a way to ask the market research agent, and nothing else to search with.

```
┌ Reel 4 · Monsoon ritual ──────────────────────────────┐
│ Built from  [Monsoon rituals ×] [Office dry skin ×]   │
│             [+ Add a signal]                           │
│ HOOK  …                                                │
```

## 6. Approaches considered

- **A. Find, confirm, fetch, group (chosen, Cyril 2026-11-24, in steps).** Web search proposes
  brands; the person confirms; their Instagram posts are fetched as references; signals are drafted
  from them. Real posts behind every signal, from tools the app already pays for (the web search the
  KB build uses, the Instagram scraper the asset import and Performance tab use, the media archive).
  Biggest build; each run costs scraping.
- **B. Web search only.** Cheaper, but references are whatever search turns up, not what competitors
  actually post. Rejected: weak for "what is the competition doing".
- **C. Group only what is already saved.** Smallest, but does not populate the screen, which is the
  point. Rejected.

## 7. Constraints

- Fetching posts is long, paid work: it runs in the background, survives the tab closing, and reports
  a failure only when it is final, never paying twice for one brand (performance rules 12).
- One run's cost is bounded: a small list of brands and a small number of recent posts each
  (*my call: about five per group and about ten posts per brand; the builder tunes the numbers*).
- Anyone who may edit the client may run the agent and keep signals, as for the brand KB (decided
  2026-11-15). The permission model merged into staging on 2026-11-23 applies.
- Loading the Market research tab or a script makes no extra request per reference or per signal
  (performance rule 1).
- Copy says "avatar", not "presenter"; controls are shadcn primitives; the page follows the copilot
  through the existing targets mechanism, not its own.

## 8. Left to the builder

How the steps are stored and resumed, which model and prompts, how the web search is run, how posts
are mapped to references and archived, how "Built from" is stored on a script, and the exact caps.
Each lands in the plan.

## 9. Open questions for Cyril

1. ~~Internet research inside a script: do the findings stay with that script or go to market
   research?~~ **Decided (Cyril, 2026-11-24):** the script copilot uses the market research agent for
   research; findings go to market research (§5).
2. ~~Tracked handles: should confirmed competitors also be added to the Performance tab?~~
   **Decided (Cyril, 2026-11-24):** not in this piece (each adds a recurring scraping cost).

## 10. Success

- A new client goes from approved brand KB to approved market research in one sitting, with at least
  a few signals each backed by real competitor posts.
- No signal or reference appears that the person did not see arrive or choose to keep.
- Looking at any script written after this ships, a person can say which signals it was built from
  without opening the chat.
