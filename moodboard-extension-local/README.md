# CreativeOS Moodboard Clipper — LOCAL DEV build

Identical to `../moodboard-extension/` (the production build that ships to clients),
except it clips to a **localhost dev server**. The active server shows read-only at
the bottom of the side panel.

- `config.js` points at `http://localhost:3000`. If your `next dev` printed **3001**
  (it does when 3000 is busy), change the port in `config.js` — `:3001` is already in
  `host_permissions` — and reload at `chrome://extensions`.
- **Point it at the dev server running the `worktree-market-signals` branch.** The
  hover pill sends a `pageUrl`, which only this branch's items API accepts — a
  `main`-checkout server (and prod, until merge) answers 400 and the pill shows
  "✗ Failed".
- Load via `chrome://extensions` → Developer mode → **Load unpacked** → this folder.
  It appears as "… (Local)" so both builds can be installed side by side.
- **Do not ship this folder to clients.**

The folders are plain copies: **any code change must be applied to both** (everything
except `config.js` and `manifest.json` stays byte-identical). Usage and the manual
test checklist live in `../moodboard-extension/README.md`.
