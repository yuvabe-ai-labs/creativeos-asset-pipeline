# CreativeOS Moodboard Clipper (MV3)

Adds any right-clicked image to a CreativeOS **client moodboard**.

## Configure
- `APP_BASE_URL` in `config.js` points at **production** (`https://creativeos-yuvabe.vercel.app`)
  and normally needs no change — including while you develop locally. A moodboard item is just a
  row of URLs (D92), so a capture written through production shows up immediately in a localhost
  app reading the same Supabase project. If you ever do repoint it, change **both** `config.js`
  and the `host_permissions` entry in `manifest.json` — that entry is what grants the CORS
  exemption — then reload the extension at `chrome://extensions`.
- If you change it, add the same origin to `manifest.json` → `host_permissions` (e.g. `"https://your-app.example.com/*"`).

## Load
1. Chrome → `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select this `moodboard-extension/` folder.
3. Click the extension's toolbar icon to open the **side panel**.

## Use
1. In the side panel, choose a **client** then click a **board** — "Sending to: Client / Board" confirms the sticky target.
2. On any page, **right-click an image → "Add image to moodboard."** A green ✓ badge = added; red = not (check the app is running and a board is selected).
3. Open that board in the app's Gallery → **Moodboards** tab to see it; drag onto a canvas to use it.

Boards are created in the app, not here (v1).
