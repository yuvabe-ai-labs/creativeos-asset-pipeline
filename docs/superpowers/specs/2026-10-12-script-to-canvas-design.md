# Approved script → its canvas

**12 October 2026 · product spec (the *what*) · builds on script copilot spec 1 (§5, a script lands on a canvas) and spec 4 (client review / approval)**
Branch: `script-to-canvas`. ADRs: D372 onward.

---

## 1. Problem

Once a client approves a script, the next step is always the same: make a canvas for the reel and
put the script on it. Today that takes four moves across three pages: leave the approved script, go
to the client's canvases, create a canvas, open the gallery and add the script. Nothing tells the
team which canvas a script went to, so a second canvas for the same reel is easy to make by
accident.

There is a second, smaller problem on the canvas itself. A script added from the gallery is parsed
straight away, but while that parse runs the Script node looks like an unparsed node: it says "Not
extracted", and opening it shows the empty upload screen. The person can act on a script that is
seconds away from being ready, and it looks broken rather than busy.

## 2. The flow

1. On an approved script's page (the team's view), next to the other approval actions, there is a
   **Create canvas** action.
2. It opens the same New canvas dialog the canvases page uses, on the script's page. The name is
   filled in with the script's title (for example "Reel 12 · Golu starts today") and can be changed.
3. Creating the canvas takes the person into it. The approved script is already there as a Script
   node, with the lead's avatar attached, exactly as when a script is added from the gallery today.
4. The script parses on its own. While it parses, the node shows **"Parsing script…"**. It can be
   opened at any time: opened mid-parse, it shows the script's skeleton labelled "Parsing script…",
   which turns into the parsed script the moment the parse finishes. Nothing opens by itself.
5. From then on, the approved script's action reads **Open canvas** and takes the person to that
   canvas. It never makes a second one.

## 3. Rules

- **One canvas per approved script.** Once a script has started a canvas, the action is Open
  canvas. If that canvas is later deleted, the action goes back to Create canvas.
- **The script on the canvas is a copy**, as today (spec 1 §5.4): reopening and re-approving the
  script later does not change the node already on the canvas.
- **Parsing state is honest everywhere a script is added.** The node's "Parsing script…" state, and
  the skeleton the person sees if they open it mid-parse, apply to every way an approved script
  reaches a canvas: this new action and the gallery's existing one. Opened mid-parse, the view never
  shows the empty upload screen.
- **A failed parse is not a dead end.** If the parse fails, the parsing state ends and the node
  opens to today's retry state ("open the node to parse it again"), with today's message.
- **Nothing is added twice.** Reloading the canvas, or going back and forward, after arriving from
  Create canvas never adds the script a second time.
- **Only approved scripts.** The action appears only on an approved script, as adding one from the
  gallery already requires.

## 4. Out of scope

- Opening the script's view automatically when the parse finishes.
- Creating a canvas from a script that is not yet approved.
- Several canvases for one script, or choosing an existing canvas to add the script to.
- Keeping the node in step with later re-approvals of the script.
- Anything on the client's review link: the action is for the team only.

## 5. Success

1. On an approved script with no canvas, Create canvas opens the New canvas dialog with the
   script's title filled in.
2. Creating it lands on the new canvas with the Script node and the lead's avatar on it.
3. While the script parses, the node reads "Parsing script…". Opening it then shows the skeleton
   labelled "Parsing script…", never the upload screen, and the skeleton becomes the parsed script
   when the parse ends, without closing and reopening. Nothing opened by itself.
4. Back on the approved script, the action now reads Open canvas and goes to that canvas.
5. Reloading the new canvas straight after arriving leaves exactly one Script node on it.
6. Adding an approved script from the gallery shows the same "Parsing script…" state.
7. A parse that fails leaves the node openable, on the retry state, with today's message.
8. Deleting the canvas turns Open canvas back into Create canvas.

## 6. Assumptions to confirm

Written into §3 and §4 above. Say if any is wrong:

- A1. If the canvas is deleted, the action goes back to Create canvas.
- A2. The action is for the team only, never on the client's review link.
