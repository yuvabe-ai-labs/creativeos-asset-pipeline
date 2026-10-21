# Collapsible shots — design

**Date:** 2026-10-21 · **Decision:** D387 · **Prototype:** https://claude.ai/artifact/8EocnLoekvjTW7jHYJ9Kp8

## Goal

Let the operator collapse the shots they are not working on, so a canvas of many shots stays
readable. Collapsing hides a shot's own pipeline (prompt, Image Gen, motion prompt, Video Gen,
and any input file only that shot uses). It never deletes or changes content, and it survives
reload.

## Behavior

"Shot" below means either lane's root: a **Shot** (one take) or a **Multishot** (a cut sequence).
Fan-out makes one or the other per generation and the Script's toggle flips between them (D229), so
both collapse the same way. A Multishot hides its Multishot prompt → Video Gen → Dubbing lane and
its own panel. A flip lands expanded: the converters rebuild the node's data and the flip already
drops its outgoing lane, so there is nothing left to hide.

- Each Shot header has a **Collapse** button; once collapsed it reads **Expand**.
- A collapsed Shot stays where it is and looks like a small stack of cards, with a "N hidden"
  chip naming how much is inside.
- **Collapse all / Expand all** sit in a small panel at the bottom-left, next to the zoom
  controls. They appear only when the canvas has shots.
- Expanding restores everything exactly as it was: nodes never move when hidden.
- Read-only viewers see the lock holder's collapsed state; the buttons are disabled for them.

## Persistence

`shot.data.collapsed: true` on the Shot node, saved by the normal autosave. Expanding removes the
key. Which nodes are hidden is **derived at render time and never stored**, so the store's
`nodes`/`edges` are never rewritten to hide anything and nothing extra is autosaved.

A duplicated Shot starts expanded (its copy has no pipeline to hide).

## Ownership (`src/lib/canvas/shot-collapse.ts`)

A node's **owners** are the Shot nodes nearest upstream of it, by shortest path. A multi-source
breadth-first walk starts from every Shot at distance 0; a node reached at the same distance from
two shots has both as owners. The walk never enters a Shot (a Shot owns only itself).

- Shot 2's Image Gen is 2 hops from Shot 2 and 3 hops from Shot 1 (through Shot 1's Image Gen
  used as a reference), so Shot 2 owns it alone.
- A Composite that two shots both feed as context (D320) has both as owners, and so does what it
  feeds.

**Input nodes** (File, Draw) that no Shot reaches take the union of the owners of the nodes they
feed. If any node they feed has no owner, they have none. A file wired only into Shot 1's nodes
(or into Shot 1 itself, like a storyboard panel) is owned by Shot 1; a file used by Shots 1 and 2
is **shared**.

**The one rule:** a node is hidden iff it is not a Shot, has exactly one owner, and that Shot is
collapsed. Everything with several owners stays visible, including shared files, even when every
shot using them is collapsed.

## Edges (display only)

Each edge endpoint maps to its visible representative: itself, or its owner Shot if hidden.

- Both ends on the same node → dropped (it was inside the collapsed shot).
- Several edges landing on the same pair → one edge.
- An edge into a collapsed Shot enters through a top handle (`collapsed`) rendered only while
  collapsed and not connectable. An edge out of a collapsed Shot uses its normal right handle.
- A rerouted edge whose original ends belong to two different shots is labelled with the two
  original nodes' ref handles, e.g. `IMG-A3F9 → IMG-B2C1` (Case 1 of the prototype).
- Rerouted edges have synthetic ids (`collapsed:<source>-><target>`), are not selectable,
  deletable or focusable, and so can never produce a store change.
- Highlighting runs on the real edges; a rerouted edge lights up when any edge it stands for does.

## Guards (`useShotCollapseGuards`)

Hiding only ever happens because someone collapsed a shot:

- **Collapse deselects:** when the collapsed set changes, hidden nodes that were selected are
  deselected, so Delete and Ctrl+D cannot act on invisible nodes.
- **Nothing is born hidden:** when a node becomes hidden while the collapsed set did *not* change
  (a node added by Guided next, the composer or the copilot; a new wire that moves a node into a
  collapsed shot), its owner expands.
- **Targets reveal:** when `focusedNodeId` names a hidden node (Generation Tray, review drawer,
  copilot `open_node`, playbook runner) or a hidden node becomes selected (copilot highlight), its
  owner expands, so the focus view can mount.

## Performance

Ownership is O(N+E) and memoised on a structure key (node ids + types, and the edges array), not
on positions, so dragging does not recompute it. With nothing collapsed, `nodes` and `edges` pass
through untouched. No network calls, no per-node subscriptions; Shot nodes read their hidden count
from one context.

## Testing

Unit tests for `shot-collapse.ts` (Case 1, Case 2, ties, shared file with all shots collapsed,
internal edges dropped, dedupe, labels, highlight mapping) and for the store's
`setShotsCollapsed` (no-op when nothing changes, key removed on expand).
