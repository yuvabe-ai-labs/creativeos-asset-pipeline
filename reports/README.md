# Reports

Generated, read-only snapshots of live data. Nothing here is an input to the app —
regenerate rather than hand-edit.

## Client → canvases summary

```bash
npm run report:client -- <client-slug> [--env=production] [--out=reports/<slug>-<env>.json]
```

Backed by [`scripts/client-canvas-report.mjs`](../scripts/client-canvas-report.mjs).
It reads `.env.<name>` (default `production`) for `NEXT_PUBLIC_SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY` and queries with the service role, so it bypasses RLS —
**read-only, never run it against a DB you don't intend to read.**

What it reports, per client and per canvas:

- node mix by type, with `image-gen` / `video-gen` broken out and canvases ranked by
  the two combined
- how many gen nodes actually have an active output (`active_version_id`)
- `generations` rows by type / status / model, plus `cost_usd` and `credits_charged`
- `node_versions` count and approval state
- created date and last activity (max of canvas, node and generation timestamps)

Passing an unknown slug prints the list of available client slugs for that env.

### Reading the numbers

- **USD vs credits.** `credits_charged` only exists from migration `0019` onward, so
  pre-ledger runs show `0` credits while still carrying a real `cost_usd`. For anything
  historical, read the USD column.
- **Nodes vs runs.** A canvas can hold many `image-gen` nodes with zero generations
  (placed but never run), and a canvas with few nodes can have many runs (re-rolls).
  The ranking is by *nodes*, since that's what the question "which canvas has more
  image/video gen nodes" asks; `RUNS` is the activity signal.
- **`shot` nodes** appear in the type mix but are not in `ADD_NODE_OPTIONS` — they come
  from the guided/script flow, not the quick-add palette.

## Current snapshots

| Report | Env | Generated |
|---|---|---|
| [prakriti-sattva-final](prakriti-sattva-final-production.md) (+ [`.json`](prakriti-sattva-final-production.json)) | production | 2026-08-13 |
