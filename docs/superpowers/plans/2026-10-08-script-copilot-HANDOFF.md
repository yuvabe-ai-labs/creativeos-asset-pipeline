# Script copilot · handoff — resume specs 2, 3 and 4 in fresh conversations

**Written 8 October 2026** at the end of a long session (id `d42859fd-dd6c-453f-8553-18789f5e6a13`,
run from the repo root). Read this first in any new conversation about the script copilot.

---

## 1. Where things stand

| Piece | State |
|---|---|
| Parent spec + map of how the four specs fit (§4a) | [2026-10-07-script-copilot-design.md](../specs/2026-10-07-script-copilot-design.md) |
| Spec 1 · library, script, handoff | **Built, reviewed, merged into local `staging` (356f567f), verified in the app by the user.** Not pushed. |
| Spec 2 · Generate | [spec](../specs/2026-10-08-script-copilot-2-generate-design.md) + [interaction model](../specs/2026-10-08-script-copilot-2-interaction-model.md) + [formats, slots and tools](../specs/2026-10-08-script-copilot-2-formats-slots-tools.md). Final. **Plan not written yet** (writer stopped; do it after specs 3 and 4). |
| Spec 3 · Visualise | [spec](../specs/2026-10-08-script-copilot-3-visualise-design.md). Final. **Plan written: 14 tasks, commit 370b8bb6 in sc-visualise.** One open question (§2a). |
| Spec 4 · Client review | [spec](../specs/2026-10-08-script-copilot-4-client-review-design.md). Final. **Plan written: 19 tasks, commits 0b5770fb + 7b571fe9 in sc-review; the user approved its six flagged gaps (team may reply and resolve after approval).** |
| Every product answer (59) | [questions file](../specs/2026-10-08-script-copilot-open-questions.md) |
| Explainer (shareable) | https://claude.ai/artifact/RLbXdnfrXHf6dYTbm7uN4k#decisions |
| Screen mockups | https://claude.ai/artifact/65cg8RQ1NgTFUCjgmgQ2dM |

**Staging database:** migration `0051_client_scripts.sql` is applied. Three scripts are seeded for
client slug `jackfruit-365`, all at stage `approved`: Reel 01 (UGC, 14 shots), Reel 06
(Founder-led, 11 shots), Reel 08 (UGC review first, 9 shots). Re-seed or change stage with
`node scripts/seed-script.mjs jackfruit-365 --file src/lib/scripts/fixtures/reel-01.json --stage visualise`
(idempotent: updates the same reel in place).

## 2. The three worktrees

All three were cut from local `staging` at **356f567f**, have their own `node_modules` and a copy
of `.env` / `.env.local`.

| Worktree folder | Branch | Spec | Plan file (in that worktree) | Migration | ADRs |
|---|---|---|---|---|---|
| `.claude/worktrees/sc-generate` | `worktree-sc-generate` | 2 · Generate | `docs/superpowers/plans/2026-10-08-script-copilot-2-generate.md` | `0052` | D327–D336 |
| `.claude/worktrees/sc-visualise` | `worktree-sc-visualise` | 3 · Visualise | `docs/superpowers/plans/2026-10-08-script-copilot-3-visualise.md` | `0053` | D337–D346 |
| `.claude/worktrees/sc-review` | `worktree-sc-review` | 4 · Client review | `docs/superpowers/plans/2026-10-08-script-copilot-4-client-review.md` | `0054` | D347–D356 |

**Were the plans finished?** Background agents in the old session were writing them. In each
worktree run `git log --oneline -3`: a commit adding the plan file means it is done. If there is
none, the new conversation writes it first (§4).

## 2a. Open before building

- **Spec 3:** the Avatar Studio lets a user upload their own sheet instead of generating one. The
  plan keeps the upload, and an upload replaces all four views. Ask the user: keep it, or drop
  uploads now that sheets are four generated views?
- **Spec 3:** apply migration  on staging (Supabase SQL editor, by the user) before its in-app checks.
- **Spec 4:** apply migration  the same way before its in-app checks.
- **Spec 2 must honour (from spec 3's plan):** an edited shot keeps its id; a split shot's first
  half keeps the original id, because panels and takes are keyed by shot id.

## 3. Rules every build follows

- Superpowers flow: the plan is reviewed by the user **before** any code; then
  `superpowers:subagent-driven-development` or `superpowers:executing-plans`; TDD throughout; a
  whole-branch review at the end.
- Each spec keeps its own data keyed by script and shot; **only spec 2 writes the script's text**.
  Shared files (`src/lib/scripts/schema.ts`, `src/components/scripts/script-view.tsx`,
  `src/components/clients/client-settings-menu.tsx`) are extended additively, never restructured;
  each plan names its merge points.
- Spec 3 and spec 4 build against seeded Reel 01 at stage `visualise`, without spec 2.
  Spec 4 stubs spec 3's "picked panel per shot" until spec 3 merges.
- Stage ownership (parent §4a.2): spec 2 Mark final (Generate → Visualise); spec 3 Reopen
  (Visualise → Generate); spec 4 the manual moves into and out of In review, Share, and Approve.
- Words: "avatar" is the asset only, never "presenter" in user-facing text, never a format name;
  the founder format is "Founder-led". The carry rule: a beat's VO line and card sit on its first
  shot and carry across its split shots.
- Project rules in root `CLAUDE.md` / `AGENTS.md`: shadcn Base UI primitives only (never native
  controls; `InputGroup` for anything inside a field), route helpers, design tokens, Lucide 1.5,
  read `node_modules/next/dist/docs/` before Next.js code.
- Check migration and ADR numbers against `origin/staging` at merge time; D319 was taken once.
- Commit only specific files; never `git stash` (shared across worktrees); never push without the user.

## 4. Paste-ready prompts — one fresh conversation per worktree

Start each conversation **from inside its worktree folder** (open that folder in VS Code, or
`cd` there before `claude`). The session is then saved under that folder's project, so
`claude --resume` from the same folder finds it later.

### Spec 3 · Visualise (build first — merges first)

```
Resume the script copilot work. Read docs/superpowers/plans/2026-10-08-script-copilot-HANDOFF.md
first (on staging; it is in this worktree too). This worktree is .claude/worktrees/sc-visualise,
branch worktree-sc-visualise, for spec 3 (Visualise).
1. The plan is committed here: docs/superpowers/plans/2026-10-08-script-copilot-3-visualise.md
   (14 tasks). Read it and the spec docs/superpowers/specs/2026-10-08-script-copilot-3-visualise-design.md.
2. Ask me the open question in the handoff §2a (the Studio's sheet upload) and update the plan
   with my answer. Then summarise the plan and wait for my go-ahead.
3. After I approve, execute it with superpowers:subagent-driven-development, then the
   whole-branch review. Do not merge or push.
```

### Spec 4 · Client review (build second)

```
Resume the script copilot work. Read docs/superpowers/plans/2026-10-08-script-copilot-HANDOFF.md
first. This worktree is .claude/worktrees/sc-review, branch worktree-sc-review, for spec 4
(Client review).
1. If docs/superpowers/plans/2026-10-08-script-copilot-4-client-review.md is not committed here,
   write it with superpowers:writing-plans from docs/superpowers/specs/2026-10-08-script-copilot-4-client-review-design.md,
   following the handoff §3 (migration 0054, ADRs D347–D356; stub spec 3's picked-panel interface).
2. Summarise the plan for me and wait for my review.
3. After I approve, execute it with superpowers:subagent-driven-development, then the
   whole-branch review. Do not merge or push.
```

### Spec 2 · Generate (build third — merges last)

```
Resume the script copilot work. Read docs/superpowers/plans/2026-10-08-script-copilot-HANDOFF.md
first. This worktree is .claude/worktrees/sc-generate, branch worktree-sc-generate, for spec 2
(Generate, the copilot).
1. If docs/superpowers/plans/2026-10-08-script-copilot-2-generate.md is not committed here, write
   it with superpowers:writing-plans from docs/superpowers/specs/2026-10-08-script-copilot-2-generate-design.md
   and its two companions, following the handoff §3 (migration 0052, ADRs D327–D336; the writing
   model is chosen by a probe on Reel 04 as an early task).
2. Summarise the plan for me and wait for my review.
3. After I approve, execute it with superpowers:subagent-driven-development, then the
   whole-branch review. Do not merge or push.
```

## 5. Integrating — one more conversation, from the repo root

```
Integrate the script copilot builds. Read docs/superpowers/plans/2026-10-08-script-copilot-HANDOFF.md.
Merge into local staging in this order, one at a time, running tsc and the tests after each:
worktree-sc-visualise, then worktree-sc-review (replace spec 4's spec-3 stub with the real
interface), then worktree-sc-generate. Before each merge, check migration numbers (0052–0054) and
ADR numbers against origin/staging and renumber if taken. Resolve the named merge points in
src/lib/scripts/schema.ts, src/components/scripts/script-view.tsx and the cast slot. Do not push
until I say so.
```

## 6. Still owed

- **Push** local staging to origin (user's call; 24+ commits ahead).
- Deferred minors from spec 1's review: timecodes round per step to 0.1 s; the cross-client
  filter is not exercised at the database layer; `useRefreshScripts` returns a new closure each
  render; the seed never sets `created_by`.
- Avatars are not auto-linked yet (by design: spec 2 links, spec 3 makes). Jackfruit 365 has three
  avatars named James (`d338f374` AI ready, `917b16f3` Specific ready, `a5a25d93` draft).
- Legal to confirm the likeness-consent wording covers panels and client review (spec 3).
