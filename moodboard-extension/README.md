# CreativeOS Moodboard Clipper (MV3)

Adds any right-clicked image to a CreativeOS **client moodboard**.

## Configure
- Set `APP_BASE_URL` in `config.js` to where CreativeOS runs (default `http://localhost:3000`).
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
