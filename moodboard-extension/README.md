# CreativeOS Moodboard Clipper (MV3)

Clips references into a CreativeOS **client moodboard** — hover an Instagram post
or YouTube Short and click **+ CreativeOS**, or right-click any image/page.

## Two builds, two folders
- **This folder is the PRODUCTION build** — it talks to `https://creativeos-yuvabe.vercel.app`
  (shown read-only at the bottom of the side panel) and is what ships to clients. Nothing here
  is runtime-configurable on purpose.
- **`../moodboard-extension-local/`** is the identical extension pointed at a localhost dev
  server. Load that one for development; never ship it.
- The folders are plain copies: **any code change must be applied to both** (everything except
  `config.js` and `manifest.json` is meant to stay byte-identical).

## Load
1. Chrome → `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select this `moodboard-extension/` folder.
3. Click the extension's toolbar icon to open the **side panel**.

## Use
1. In the side panel, choose a **client** then click a **board** — "Sending to: Client / Board" confirms the sticky target.
2. **Instagram / YouTube Shorts:** hover a feed post, a profile-grid tile, a post
   detail page, or a Short — a **+ CreativeOS** pill fades in (top-right). Click it:
   "Adding…" → "✓ Added" (or "Pick a board →", which opens the side panel). The pill
   clips the post/short **permalink**, so the server can classify it and derive a
   preview. Sites' own right-click menus are irrelevant to this path.
3. **Anywhere else:** right-click an image → "Add image to moodboard", or
   right-click the page → "Add this page as reference". Green ✓ badge = added.
4. Open that board in the app's Gallery → **Moodboards** tab to see it; drag onto a canvas to use it.

Boards are created in the app, not here (v1).

## Server requirement for page/permalink clips
The hover pill and "Add this page as reference" send a **pageUrl**, which only the
market-signals ingest API understands. Until that branch is merged and deployed,
production (and a `main`-checkout dev server) answers 400 "imageUrl is required" —
the pill shows "✗ Failed". Test page clips against the **worktree dev server**
(the local build, pointed at its port). Image clips (right-click an image) work
against any server.

## Manual test checklist (after Load unpacked / reload)
- IG feed: hover a post → pill appears; click → ✓; item lands on the target board with the post's `/p/…` or `/reel/…` URL (not the feed URL).
- IG profile grid: hover a tile → pill clips that tile's permalink.
- IG detail page (`/p/…`): pill clips the address-bar URL.
- YouTube `/shorts/…`: pill appears below the player's top-right controls; clips the current short; scrolling to the next short hides it until re-hover, then clips the **new** URL.
- Regular YouTube watch page: no pill (context menu still works there).
- No board selected: click shows "Pick a board →" and the side panel opens.
- Scrolling hides the pill (it must never drift off its post).
