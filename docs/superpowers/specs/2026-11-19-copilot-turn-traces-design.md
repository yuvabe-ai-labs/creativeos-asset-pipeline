# Copilot turn traces: see what the agent did on every turn

**Status:** Approved, 2026-11-19. Cyril chose A: a trace keeps exactly what the model was sent (§3.1).
**Part of:** the copilot journey (`2026-11-12-copilot-journey-design.md`). Built on the same branch.

## 1. Problem

When the copilot does something wrong, nobody can see why. On 2026-11-19 Cyril pressed "Yes, that's right" on a review question about *Compliance Rules · Never Use Claims*. The copilot replied "Confirmed that field." and then asked the same question again. Working out what happened took a long trace through the database by hand. The answer was that the model had written the words and called no tool, so nothing was saved, and code asked again because the field was still unreviewed.

Nothing records what the agent did on a turn: what it was told, which tools it called, with what, what each tool answered, and what code did around it. Every bug like this one is solved by guessing. More agents are coming (market research, scripting, canvas), and each will have the same blind spot.

## 2. Who it is for

Everyone on the team who builds, tests or supports the copilot (Cyril decided 2026-11-19: everyone can see traces). Mostly Cyril while building and testing, and whoever runs manual QA when they report a fail.

## 3. What it does

### 3.1 A trace for every agent turn

Each time the brand KB copilot runs a turn through the agent (a typed message, or a reply button pressed), a trace of that turn is kept. A trace shows, in order:

- **What came in:** the person's message and attachments, which question was waiting, and the client's state as the agent saw it (built or not, in review or approved, what was running).
- **What the agent was given, exactly as it was sent** (Cyril, 2026-11-19: A, not a summary): the model's name, the instructions, the conversation, and the tools it was offered with their descriptions. A summary is written before anyone knows which detail will matter; both bugs so far turned on such a detail (where the waiting question sat in the instructions; the exact sentence a tool sent back). It is shown folded, since it is long.
- **Each round with the model:** the words it wrote; each tool it called, with the arguments; what each tool answered, refusals included; how long the round took.
- **What code did around the model:** which fields were written; what code added after the reply (the next question, a question asked again, a change card, the "that is everything" line).
- **How it ended:** the reply that was stored, how long the whole turn took, and the error if it failed.

A turn that failed is traced too: those are the ones most worth seeing. A turn whose browser was closed half-way is traced like any other.

### 3.2 Where it is seen: a Turns view in the copilot panel

Cyril decided 2026-11-19: inside the copilot panel, behind a developer switch.

- **The developer switch** is in the panel. Anyone can turn it on; it is a way to keep the panel tidy, not a permission. Off, the panel looks exactly as it does today. *(My call: the switch is remembered per person, in their browser.)*
- **With the switch on, each of the copilot's replies can be opened** to show the trace of the turn that produced it, in place in the thread.
- **A Turns list** shows the client's recent turns newest first, one line each: when, what the person sent, the tools called, how long it took, and whether it failed. Opening a line shows that turn's whole trace.
- **What matters stands out.** Four marks, each shown on the list line so a turn can be spotted without opening it. The bug in §1 should be visible from the list line alone. *(My call, 2026-11-19: the marks are about what the turn achieved, not which tools it touched. Many correct turns call no tool, such as answering a question about the KB, so "called no tool" alone would mark them all. The reply-buttons tool saves nothing, so it would also hide the §1 bug.)*
  - **Question left unanswered:** a question was waiting, and the turn neither saved anything, nor skipped it, nor stopped the questions.
  - **Asked again:** code asked the same question again after the reply.
  - **Refused:** a tool refused something the model asked for.
  - **Failed:** the turn ended in an error.

### 3.3 How long traces are kept

30 days (Cyril, 2026-11-19). Older traces are removed on their own.

## 4. Goals, non-goals, anti-goals

**Goals**
- Any wrong turn can be explained from its trace, without reading the database by hand.
- The cause of the §1 bug is visible in one look.
- A new agent built on the same loop is traced without extra work.

**Non-goals (this piece)**
- **Evals:** running fixed test cases against the agent and scoring them. A trace keeps what a test case would need, so "save this turn as a test case" can come later.
- **The script copilot**, which does not use the shared agent loop today.
- **Things the copilot writes without the model:** the build's own messages, failed-job lines (D506), "Manual edits saved" notes, approvals. They are already in the thread, and no agent decided them.
- **Editing or replaying a turn** from its trace.
- Cost per turn in money. *(Token counts may be shown if the model reports them; left to the builder.)*

**Anti-goals: it fails if...**
- The person waits longer for a reply because of tracing.
- A turn fails, or its reply is lost, because its trace could not be kept.
- The panel becomes slower to load or to poll for people who never turn the switch on.
- It shows anything to someone outside the client's organisation.

## 5. Constraints

- **AGENTS.md performance rules apply.** In particular: no added wait on the turn (the trace is kept after the reply is on its way); the panel's regular check for new messages does not read traces; the Turns list never downloads whole traces, only what each line shows, and a trace is loaded when it is opened; reads are limited to one client's own turns.
- **A failure to keep a trace never fails the turn** and never shows the person an error.
- **Same database as everything else.** No third-party tracing service (Cyril, 2026-11-19: built inside CreativeOS).
- **Who can see a trace:** the same people who can see the client's copilot thread.
- **Design system:** the panel's existing look; shadcn primitives only, never native controls (AGENTS.md).

## 6. Left to the builder

How a trace is stored and read, how the agent loop reports its rounds, how old traces are removed, the exact layout of the Turns view, and whether token counts are shown.

## 7. Success

Cyril repeats the §1 steps on a client in review, turns the switch on, and sees from the Turns list, without opening anything, that the turn called no tool. Opening it shows the waiting field, the model's words, the empty list of tool calls, and code asking the question again.

A second case of the same kind (2026-11-19): Cyril typed "edit the mission statement to …" for a field not reviewed yet. The copilot reached for a change card, was refused, and told Cyril it "can only save your wording as a new answer" without saving. Fixed in code the same day, but it is the shape of bug traces are for: the Turns list line is marked **Refused**, and opened, it shows the change-card call, the refusal sentence, and no save.
