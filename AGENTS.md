<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:architecture-decisions -->
# Architecture & decisions (ADR log)

Before making — or silently re-deciding — any architectural choice, consult the **ADR log**:
**[docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md](docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md) §7** (decisions **D1–D76** and growing).
It records *what* was chosen, *why*, and *what was rejected*, so decisions aren't quietly
re-litigated. Per-feature design specs live alongside it under
[docs/superpowers/specs/](docs/superpowers/specs/); the data-model "spine" is in
`2026-05-30-creativeos-architecture.md`.

**Keep one ADR log.** Append new decisions to §7 in place (Decision / Why / Rejected /
Refines / Originated → spec) — do not scatter ADRs across individual specs or this file.
<!-- END:architecture-decisions -->

<!-- BEGIN:frontend-aesthetics -->
# Frontend aesthetics — Yuvabe Studios design system

CreativeOS follows the **Yuvabe Studios design system**. The original export lives locally
in `ref/Yuvabe Studios Design System/` (gitignored — not in the repo). Its tokens are
**encoded in `src/app/globals.css`**, mapped onto the shadcn CSS variables, so that file is
the in-repo source of truth. Aesthetic: *"light editorial premium."*

- **Two font families only:** **Clash Display** (headings, via `font-display`) + **Gilroy**
  (body/UI, the default `font-sans`). Vendored in `src/fonts/`, loaded with `next/font/local`.
  Never introduce a third family.
- **Purple `#5829c7` is the single brand color — used SPARINGLY** (primary CTA, the brand
  mark, focus ring). **Never a large background fill.** Neutrals do the heavy lifting
  (`neutral-900` text, `neutral-500` metadata, `neutral-200` borders, `neutral-25/50` bg).
  Yellow `#ffca2d` only as a soft radial glow.
- **Drive everything through the shadcn CSS variables** in `globals.css` — never hardcode
  colors. Use the `.text-eyebrow` utility for tracked small-caps labels (not mono).
- **Hierarchy from weight / casing / tracking / color, not size.** ~3 type sizes per page.
- **Cards:** white, 1px `neutral-200` border, soft blue-black shadow
  (`shadow-card`: `0 1px 2px rgba(11,15,25,.08), 0 6px 14px rgba(11,15,25,.1)` — ambient
  halos run at half the original Yuvabe export so surfaces don't read as floating panels),
  generous padding, radius ~8–14px (`rounded-xl`–`rounded-3xl`; all steps derive from
  `--radius: 0.375rem` in `globals.css`).
- **Motion:** easing `cubic-bezier(0.22,1,0.36,1)` only (no springs/bounce); 200/320/500ms.
  Card hover is barely-perceptible (`translateY(-2px) scale(1.006)`, no shadow change).
  Prefer CSS. For React orchestration the **`motion`** library (Framer Motion) is installed —
  import from `motion/react`. Always set `transition={{ ease: [0.22,1,0.36,1], duration: … }}`;
  never use Motion's default spring (it violates the system's "no springs/bounce" rule).
- **Elevation:** use the `shadow-card` / `shadow-md` / `shadow-lg` tokens (soft, high,
  blue-black-tinted) — not raw Tailwind shadow values. Resting cards use `shadow-card`.
- **Backgrounds:** the `.canvas-surface` signal grid for the editor; subtle, never flat noise.
- **Icons:** Lucide only, 1.5 stroke, no fills.
- **It's a creative tool — give interactive affordances personality (sparingly).**
  Inline-editable text should *invite* editing: on hover, a **subtle dotted underline**
  (`underline decoration-dotted decoration-2 underline-offset-4`, transparent → `decoration-primary/50`)
  plus a faint `bg-primary/5` and `cursor-pointer` — keep it light so it doesn't shout under
  long paragraphs; never a sterile box outline around the field.
  "Add" actions are discoverable **dashed-border primary chips** (`border border-dashed
  border-primary/40`, `hover:bg-primary/5`), not faint text links — they must not be missable.
  Reference: `src/components/nodes/editable-field.tsx` and `script-document.tsx`.
<!-- END:frontend-aesthetics -->

<!-- BEGIN:component-structure -->
# Component & UI structure

See **[docs/component-structure.md](docs/component-structure.md)** for the full guide:
folder ownership, component rules (one per file, named export, split at ~200 lines, no prop drilling), and shadcn/ui usage (Base UI registry — `render` prop, not `asChild`).
<!-- END:component-structure -->

<!-- BEGIN:controls -->
# Controls — shadcn primitives only, never native

Every interactive control in JSX MUST be a shadcn primitive from
`src/components/ui/*` (Base UI registry — https://ui.shadcn.com). **Never** use a
raw `<button>`, `<textarea>`, `<input>`, `<select>`, `<option>`, checkbox, radio,
switch, or slider. Use `Button`, `Textarea`, `Input`, `Select`, etc. — Base UI
components compose via the `render` prop (not `asChild`). If the primitive you
need doesn't exist yet, add it to `src/components/ui/` rather than dropping to a
native element. Non-interactive elements (`span`/`div`/`p` for labels, badges,
and layout) are fine.

**This holds for anything *inside* a control too.** An icon, unit label, or button
sitting in a field — a show/hide password eye, a search icon, a "https://" prefix,
a clear button — is composed with `InputGroup` / `InputGroupInput` /
`InputGroupAddon` / `InputGroupButton` from `src/components/ui/input-group.tsx`.
It is **never** a raw `<button>` absolutely positioned over an `Input`. The group
owns the field's focus ring, disabled and invalid states, so an overlaid element
sits on top of that styling instead of participating in it, and the seam shows the
moment the field is focused or errors.

Before hand-rolling any control arrangement, check whether the registry already
composes it (https://ui.shadcn.com) and whether the primitive is already vendored
in `src/components/ui/`. `input-group.tsx` is the one most often missed, because it
solves a layout problem rather than naming a control.
<!-- END:controls -->

<!-- BEGIN:api-routes -->
# API routes

See **[docs/api-routes.md](docs/api-routes.md)** for the full guide.
Helpers live in `src/lib/api/route-helpers.ts`. Key rules:
- Use `apiError` / `apiOk` — never `NextResponse.json(...)` directly.
- Use `withClient` for every route under `src/app/api/clients/[id]/`.
- Use `withTryCatch` for any OpenAI call or multi-step async handler.
- Use `parseFormFile` / `validateFileExtension` / `validateFileSize` for uploads.
<!-- END:api-routes -->

<!-- BEGIN:react-flow -->
# React Flow (`@xyflow/react`)

Ground all React Flow work — implementation **and** explanations — in the official docs at
**https://reactflow.dev/learn**. Follow the Learn path from the top (Quick Start → Core
Concepts → Customization → …). Prefer the documented patterns over guesses.

Tailwind v4 note: the docs say import React Flow's stylesheet **after** `@import
"tailwindcss"` in the global CSS (not inside a component), so Tailwind's base doesn't
override it.
<!-- END:react-flow -->

<!-- BEGIN:reusability -->
# Reusability — don't re-declare what already exists

Before writing any constant, utility function, or helper, **search the module first.**

## Canonical sources — import from these, never redefine locally

| What | Canonical location |
|---|---|
| Status sets, size limits, extension sets | `src/lib/<feature>/constants.ts` |
| Pure utilities (`formatBytes`, `formatDate`, `buildChangeSummary`, …) | `src/lib/<feature>/utils.ts` |
| Type factory helpers (`emptyKBField`, `defaultEmptyImageAnalysis`, …) | `src/lib/<feature>/schema.ts` |
| Shared system prompt text | The canonical provider file (e.g. `src/prompts/kb-extract.ts`), exported |
| API helpers (`apiError`, `apiOk`, `withClient`, …) | `src/lib/api/route-helpers.ts` |

## Rules

- **Import, don't redefine.** If a value or function already exists in the module, import it. Declaring a local copy is a bug waiting to diverge.
- **Check before creating.** Before adding to `constants.ts` or `utils.ts`, grep the file — it may already be there.
- **Provider pairs share prompts.** When two providers (e.g. OpenAI + Gemini) use the same system prompt, export the text from the canonical file and import in the variant. If they differ by one sentence, extract the shared body and compose.
- **Two call sites = extract. One = leave inline.** Don't abstract speculatively; wait for a real second consumer.
- **Narrower sets are intentional.** A subset (e.g. binary-only extensions) that is intentionally smaller than the canonical set is not a duplicate — leave it separate and name it clearly.
<!-- END:reusability -->

<!-- BEGIN:data-fetching -->
# Data fetching — TanStack Query, three layers

Browser-side reads and writes against our own API routes go through **TanStack Query**
(`@tanstack/react-query` v5, D300). Never hand-roll a cache, a context that loads a list, or a
`useEffect` + `useState` fetch for data the server owns. The one `QueryClient` is provided in
`src/components/layout/query-provider.tsx`, inside the root layout. Server Components keep
fetching directly, without TanStack Query.

Every resource is split into three layers, and nothing skips one:

1. **API file:** `src/services/<feature>.service.ts`. Plain async functions (or the existing
   service-class methods) that call one route each and return typed data through `readJson`.
   No React, no caching, no toasts.
2. **Query file:** `src/hooks/queries/<resource>.ts`. The resource's **query-key factory**
   (`avatarKeys.list(clientId)`, `avatarKeys.detail(clientId, id)`, …) and its consumer hooks:
   `useQuery` wrappers for reads (`useAvatars(clientId)`) and `useMutation` wrappers for writes
   (`useArchiveAvatar(clientId)`), which update or invalidate the keys they change. Keys are
   only ever built through the factory, never written inline.
3. **Consumers:** components and feature hooks call the query file's hooks. They never call
   a service for data a query owns, and never call `fetch` directly.

- **One owner per resource.** When a resource moves to TanStack Query, every reader of it
  moves in the same change; never cache the same data two ways.
- **Seed details from lists.** A detail query whose row is already in a cached list uses that
  row as `initialData`, so opening an item never refetches what is on screen.
- **Existing hand-rolled hooks** (`useAvatarGeneration`, `useAvatarStudio` and the like) move
  to this pattern when they are next substantially changed, not in passing.
- **Polling** uses `refetchInterval` (a function returning `false` once the work is done),
  not `setInterval`.
<!-- END:data-fetching -->

<!-- TRIGGER.DEV SKILLS START -->
## Trigger.dev agent skills

This project has Trigger.dev agent skills installed in `.claude/skills/`. Before writing or changing Trigger.dev code (background tasks, scheduled tasks, realtime, or chat.agent AI agents), load the most relevant skill: `trigger-authoring-chat-agent`.
<!-- TRIGGER.DEV SKILLS END -->
