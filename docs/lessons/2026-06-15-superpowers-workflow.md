# Lesson — Superpowers: Structured Development with Claude Code

**Date:** 2026-06-15
**Topic:** How to use the Superpowers skills framework to build features systematically — from idea to merged branch

---

## What it is

[Superpowers](https://github.com/obra/superpowers) is a structured development methodology for coding agents. It wraps Claude Code in a 7-stage workflow that enforces **design before code** — preventing the most common agent failure mode: writing confident, wrong code that misunderstands the requirement.

The key shift: instead of Claude immediately writing code when you describe a feature, Superpowers gates every feature behind a **brainstorm → plan → implement** cycle. Each stage has its own slash command.

---

## Installation

```bash
# In a terminal (not inside the VSCode extension — it doesn't have this command)
claude plugin install superpowers@claude-plugins-official
```

Scope is `user`, so the plugin is available across all your projects. Restart Claude Code after installing.

---

## The mental model

> **A coding agent without structure is fast at building the wrong thing.**

The most expensive bug is one where the code is technically correct but the feature was misunderstood. Superpowers front-loads the hard thinking (what are we building, why, and how) before any implementation starts.

Each stage produces an artifact that the next stage consumes:

```
Idea
  ↓  /superpowers:brainstorming
Spec doc  (docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md)
  ↓  /superpowers:writing-plans
Plan file  (2-5 min tasks, exact file paths, no ambiguity)
  ↓  /superpowers:subagent-driven-development
Working code  (on an isolated git worktree branch)
  ↓  /superpowers:tdd + /superpowers:code-review
Verified, reviewed code
  ↓  /superpowers:finish-development-branch
PR / merge
```

You can enter the pipeline at any stage. Already have a clear spec? Skip brainstorming and go straight to writing-plans.

---

## The 7 stages

### 1. Brainstorming — `/superpowers:brainstorming`

**Purpose:** Turn a vague idea into an approved design spec.

The skill asks clarifying questions one at a time, proposes 2-3 approaches with trade-offs, presents the design in sections for your approval, then writes a spec file and commits it.

**Hard gate:** It will not write any code or invoke any other skill until you've approved the design. This is intentional.

```bash
# Trigger it with your idea
/superpowers:brainstorming I want to add a thumbnail generation step to the brief flow
```

**Output:** `docs/superpowers/specs/2026-06-15-thumbnail-generation-design.md` committed to git.

**When to use:** Any time a feature has ambiguity — which is most features. Even a "simple" change often has hidden decisions (where does state live? what happens on error?). The design can be 3 sentences for trivial work, 2 pages for complex features.

---

### 2. Using Git Worktrees — `/superpowers:using-git-worktrees`

**Purpose:** Create an isolated branch + workspace before touching any code.

Sets up a clean git worktree on a new branch, verifies the test baseline is green before you start, so you know exactly what you broke (vs. what was already broken).

**When to use:** Before every non-trivial feature. Skip for tiny one-line fixes directly on your working branch.

---

### 3. Writing Plans — `/superpowers:writing-plans`

**Purpose:** Break the approved spec into a task list so granular that each task takes 2-5 minutes and has zero ambiguity.

Each task specifies: exact file path, exact function/component to change, what the acceptance criteria is. No "update the UI" — it's "add a `thumbnailUrl` prop to `BriefNode` in `src/components/nodes/brief-node.tsx` and render it below the title."

**Output:** A plan file in `docs/superpowers/plans/`.

**Why this matters:** Subagent-driven development dispatches a fresh agent per task. A fresh agent has no context — the task description must be self-contained. Vague tasks produce vague code.

---

### 4. Subagent-Driven Development — `/superpowers:subagent-driven-development`

**Purpose:** Execute the plan by spawning a separate agent per task, then running a two-stage review on each result.

- **Stage 1 review:** Did the agent follow the spec? (No scope creep, no invented abstractions)
- **Stage 2 review:** Is the code quality good? (Naming, edge cases, consistency with codebase)

The agent that reviews is different from the agent that wrote — this catches the "I wrote what I thought was asked" error.

**When to use:** For the implementation phase of any planned work.

---

### 5. Test-Driven Development — `/superpowers:tdd`

**Purpose:** Enforce RED → GREEN → REFACTOR on every task.

The agent writes the failing test first, confirms it fails for the right reason, then writes the implementation, confirms it passes, then refactors only if needed. It blocks completion if tests weren't written before the implementation.

**Key rule:** No test, no merge.

---

### 6. Requesting Code Review — `/superpowers:requesting-code-review`

**Purpose:** Review the completed branch against the original plan and spec.

Flags: anything that doesn't match the spec, anything that's a critical code quality issue. Non-critical notes are surfaced but don't block. The review output is a structured report.

---

### 7. Finishing Development Branch — `/superpowers:finish-development-branch`

**Purpose:** Final verification before merge.

Runs the full test suite, confirms everything is green, then presents your options: merge to main, open a PR, or continue working.

---

## The two skills you'll use most

**Brainstorming** and **writing-plans** are the leverage points. They're where you prevent future debugging sessions. The rest of the pipeline (implementation, TDD, review) is mechanical given a good plan.

If you're short on time and want to use Superpowers partially: at minimum run brainstorming for any feature with design questions, and writing-plans before any implementation. Even if you write the code yourself, having a plan file means you know when you're done and what "done" means.

---

## Key patterns to know

**Scope decomposition:** If your idea is "build a platform with X, Y, and Z," brainstorming will flag this as too large and help you decompose into sub-projects — each with its own spec → plan → implementation cycle. Don't try to fit a multi-week feature into one plan file.

**Visual companion:** During brainstorming, you'll be offered a browser-based visual companion for mockups and diagrams. It's opt-in per session and per-question. Use it when the question is genuinely visual (layout options, architecture diagrams) — not for conceptual questions that are faster to answer in text.

**Entering mid-pipeline:** If you already have a clear spec (written or in your head), skip brainstorming and start with writing-plans. If you have a plan but it's too vague, rerun writing-plans with more constraints before implementing.

**The spec lives in git:** Superpowers commits the spec doc and plan file. This means future sessions can read what was decided and why — the "why" is the part that's otherwise lost.

---

## Takeaways

1. **The hard gate is the point.** Brainstorming refusing to write code isn't a limitation — it's preventing the most common wasted-work pattern.
2. **Tasks must be 2-5 minutes.** If a task in the plan file takes longer, it wasn't specific enough. Break it down.
3. **Each stage produces a committed artifact.** Spec → plan → code → review. If you skip the artifact, the next stage has no foundation.
4. **Install in the terminal, not the VSCode extension.** The `/plugin` command only works from the CLI (`claude plugin install ...`).
5. **You can use individual skills without the full pipeline.** `/superpowers:brainstorming` works standalone even if you hand-write the code after.
