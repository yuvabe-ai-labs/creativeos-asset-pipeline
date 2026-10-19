# The approved storyboard comes with the script onto the canvas

**16 October 2026 · product spec (the *what*) · builds on script copilot spec 3 (Visualise),
spec 4 (client review) and the script → canvas spec (2026-10-12, D372–D373)**
Branch: `storyboard-to-canvas`. ADRs: D380 onward.

---

## 1. Problem

In the script copilot, the team draws a storyboard panel for every shot, and the client approves
the reel with those panels in front of them. The framing of every shot has been worked out and
signed off before production starts.

None of that reaches the canvas. The script arrives as text, its shots are worked out again by the
canvas's own parse, and the panels stay behind in the copilot. The team starts each shot's picture
from a blank prompt and iterates towards a framing the client already approved. That is the
iteration the storyboard was meant to save.

Under it sits a second problem. The canvas parse does not keep track of *which* shot a row is. It
splits the text into rows, but a row has no name, so nothing on the canvas can say "this is shot 3".
That is true for every script, not only the copilot's: a script uploaded with "Shot 1, Shot 2…"
headings loses those names the same way.

## 2. The flow

1. **The shots keep their names.** When an approved script goes onto a canvas (Create canvas, or
   the gallery's Scripts tab), its text names every shot: S1, S2, S3…, in the approved order.
2. **The parse honours named shots.** Wherever a script names its shots — the copilot's S1, S2…, or
   an uploaded script's "Shot 1", "Scene 2", "CLIP 3" — every named shot becomes exactly one row,
   in the script's order, and the row keeps the name as written. A script that names no shots
   parses as today.
3. **Fan out brings each shot its panel.** When the person fans out the shots, every shot node
   whose shot has an approved panel gets that panel beside it, on the canvas, wired into the shot.
   On a Shot node the panel grounds the Shot Composer, as any image wired into a shot does today.
   On a Multishot node the panel is there to see; it feeds nothing yet (§3).
4. **The whole storyboard is in the gallery.** The gallery's References tab shows a **Storyboard**
   group for every copilot script on the canvas: all its approved panels in shot order, each
   labelled with its shot ("S3 · HOOK"). A panel can be added to the canvas from there like any
   reference.
5. **Everything past the shot is wired by hand.** Nothing is wired into the image prompt, Image
   Gen, the video prompt or Video Gen automatically. The person wires a panel onward where they want
   it, as with any image today.

## 3. Rules

- **The panel is the one the client approved.** It is the panel each shot had in the version the
  client approved — not one redrawn or re-picked since. A shot with no approved panel gets none.
- **Edits are allowed, and nothing warns.** The script on the canvas can be edited and parsed again
  as today. Rows keep their panels by their shot name. A shot that is removed, or whose name is
  changed, simply has no panel on the canvas; its panel is still in the gallery's Storyboard group.
- **A panel is never added twice.** Fanning out again, or parsing again, never adds a second panel
  beside a shot that already has one.
- **A Multishot node accepts an image.** A person can wire a panel, or any image, into a Multishot
  node. It shows there and changes nothing: the multishot prompt and Video Gen read it only when the
  person wires it onward to them. Whether the multishot prompt should read it directly is a later
  decision (§4).
- **Removing a panel from the canvas removes only that.** Deleting the panel's node never deletes
  the panel from the script, the copilot or the gallery.
- **Scripts without a storyboard are unchanged.** An uploaded script, or an approved script with no
  panels, gets the named-shot parse and nothing else.

## 4. Out of scope

- Wiring panels anywhere past the shot automatically: the image prompt, Image Gen, Composite, the
  video prompt or Video Gen. Deferred, to be decided once the team has used this.
- The multishot prompt reading a panel wired into a Multishot node.
- Supporting cast on the canvas. Only the lead's avatar crosses, as today, even when a panel shows
  two people.
- Bringing panels onto canvases made before this change, or onto a Script node added before it.
- Keeping the canvas in step when the script is reopened and approved again.
- Showing shot names on the Script node's rows.

## 5. Success

1. An approved copilot script added to a canvas reads S1, S2… against its shots in the Script node's
   text.
2. It parses to exactly one row per shot, in order, each row carrying its shot name — measured
   with real parses, by the existing script-writer probe extended to check names and order, not
   only the count.
3. An uploaded script that numbers its shots ("Shot 1…", "Scene 1…") parses to one row per numbered
   shot, in order, with those names. A script that names no shots parses as it does today.
4. Fanning out puts each shot's approved panel beside its Shot node, wired into it, and the Shot
   Composer sees it. A shot fanned out as a Multishot gets its panel the same way, and nothing reads
   it.
5. Fanning out again adds no second panel.
6. A shot whose panel was redrawn after approval gets the approved panel, not the new one.
7. The gallery's References tab shows the script's Storyboard group, in shot order, labelled by
   shot, and a panel added from it lands on the canvas as an image.
8. Editing the script text to drop a shot, then parsing and fanning out, leaves that shot without a
   panel on the canvas and with its panel still in the Storyboard group — and no warning.
9. A panel never reaches a paid generation unless the person wired it there.

## 6. Assumptions to confirm

Written into §2–§4 above. Say if any is wrong:

- A1. The shot names are S1, S2… in the approved order — short and outline-like — rather than the
  copilot's internal ids.
- A2. The Storyboard group shows in the References tab even when the client has no Drive folder
  linked (today that tab shows "no folder linked").
- A3. A canvas with two copilot scripts on it shows two Storyboard groups, one per script, named by
  the script's title. Removing a Script node removes its group.
- A4. A panel beside a shot is titled with its shot ("S3 · HOOK — storyboard").
- A5. Panels attach only to shot nodes that Fan out creates. A shot node that already existed
  before this change, or one the person deleted the panel from, is not given one again on a later
  fan-out.
