# Worktree: composite-node

**One job: build the Composite node (spec C).** Everything you need is listed here; read it
before anything else.

## What this worktree is

| | |
|---|---|
| Path | `.claude/worktrees/composite-node` |
| Branch | `worktree-composite-node` |
| Based on | `origin/staging` @ `610d66ea` (rebased 2026-10-06, after the avatar work landed) |
| Deps | a **real** `node_modules`, not a junction (Turbopack rejects the symlink). Re-run `npm install` after the rebase — staging moved a long way |
| Scope | the Composite node only. Not the Avatar (built), not the UGC prompt records (spec D) |

## Read in this order

1. **The design spec** — `docs/superpowers/specs/2026-10-01-composite-node-design.md`
   (rewritten 2026-10-06). This is the thing to build.
2. **The ADR** — D312 in `2026-05-30-creativeos-staging-roadmap.md` §7, and the two it refines:
   D298 (the Avatar node) and D290 (which model Seedance takes faces from). D299 is the pattern the
   avatar input reuses.
3. **The handoff** — `docs/superpowers/specs/2026-09-22-seedream-seedance-handoff.md` §0.2 — only
   for the wider UGC context.

## The one-paragraph version

One node makes a UGC shot's picture: the avatar, a background (image or just text) and a product
in — all optional — and an instruction typed on the node with `@`-mentions saying what each is
for, plus any camera, lighting or composition. One image out: a frame or a multi-angle sheet, as
the instruction asks. The avatar wires straight in; Seedream is the default model, the others
selectable with a note on where each can go. Edit works on the current version.

## State

**Built** on this branch (plan: `docs/superpowers/plans/2026-10-06-composite-node.md`). Not merged.

## Watch out for

- **Controls are shadcn primitives only** (`src/components/ui/*`, Base UI — `render`, not
  `asChild`). The instruction field is the existing `MentionInstructionEditor`. See `CLAUDE.md`.
- **Do not change the Image Gen node** or D299's presenter path.
- **Avatar images follow D308**: front under the Avatar node's id, fresh sheet under
  `avatarSheetId` — two entries, two chips. No change to shared `ref-binding.ts`.
- **Preservation runs both ways**: the product unchanged *and* the person unaltered. A 2026-09-24
  probe had Seedance invent lettering on a shoe specified "no text, no logo".
- **ADR numbers.** D312 is this node's. The log moves fast — check `origin/staging` before adding
  any new number.
