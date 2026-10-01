# Worktree: composite-node

**One job: build the Composite node (spec C).** Everything you need is listed here; read it
before anything else.

## What this worktree is

| | |
|---|---|
| Path | `.claude/worktrees/composite-node` |
| Branch | `worktree-composite-node` |
| Based on | `origin/staging` @ `0425cf3b` |
| Deps | `npm install` already run — a **real** `node_modules`, not a junction (Turbopack rejects the symlink) |
| Scope | the Composite node only. Not the Avatar, not the UGC prompt records |

## Read in this order

1. **The design spec** — `docs/superpowers/specs/2026-10-01-composite-node-design.md`. This is
   the thing to build.
2. **The illustrated guide** — https://claude.ai/artifact/5ZEEb4SWQp87e79aaPpayt. Section 03
   covers the avatar and where composites sit; the "How the canvas knows it is making a
   composite" figure is the wiring.
3. **The handoff** — `docs/superpowers/specs/2026-09-22-seedream-seedance-handoff.md`, §0.2 for
   the design and §0.3 for how the six specs divide. Only if you need the wider context.

## The one-paragraph version

A UGC shot needs a picture of the avatar **with the product, in a setting**. That picture belongs
to the shot, not to the avatar — the next shot wants a different product and room. So it is made
on the canvas by a **Composite node**: image references in, **a prompt typed on the node itself**,
one image out. It reuses the shipped image-gen execution path and providers; the only thing that
differs from Image Gen is that the prompt comes from the node instead of a connected Prompt node.

## State

**Nothing is built.** The spec is written and nothing in `src/` has been touched. `git log`
should show one docs commit on top of `origin/staging`.

## Decide before writing code

Both are in the spec's §9, with a recommendation:

1. **Does the typed line need an LLM pass**, or does it go to the image model behind a fixed
   preamble? *Recommended: fixed preamble.* Simpler, deterministic, and a composite is a utility
   asset rather than a hero frame.
2. **Does `avatar → composite` land here or in B1?** The `avatar` node type does not exist yet.
   Everything else in the spec builds and tests fine with File and Image Gen references.

## Watch out for

- **Controls are shadcn primitives only** (`src/components/ui/*`, Base UI — `render`, not
  `asChild`). The instruction field is `Textarea`. Anything inside a field uses `InputGroup`.
  See `CLAUDE.md`.
- **Do not change the Image Gen node.** The Composite node exists *because* that lane needs a
  separate Prompt node; leave it alone.
- **A composite is a reference, not a hero still.** Its prompt deliberately drops lens spec,
  lighting recipe and grade — D281 says a reference's lighting and framing are never carried into
  a beat, so styling it is effort the video writer is told to discard. Spec §4.
- **Preservation runs both ways**: the product unchanged *and* the person unaltered. A 2026-09-24
  probe had Seedance invent lettering on a shoe specified "no text, no logo".
- **ADR numbers.** The log is at **D284**; next free is **D285**. The Composite node needs an
  entry (Decision / Why / Rejected / Refines / Originated →), appended to
  `2026-05-30-creativeos-staging-roadmap.md` §7 — one log, not scattered.

## Related work, not in this worktree

| | Where |
|---|---|
| The rest of the UGC design | `worktree-video-gen-experiments`, merged to `origin/staging` |
| Spec A — Seedream image provider | **already shipped** (`src/lib/image-gen/providers/seedream.ts`) |
| Specs B1, B2, D, E | not started — handoff §0.3 |
