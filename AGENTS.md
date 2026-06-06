<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

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
- **Cards:** white, 1px `neutral-200` border, soft high blue-black shadow
  (`0 8px 20px rgba(11,15,25,.06)`), generous padding, radius 12–24px.
- **Motion:** easing `cubic-bezier(0.22,1,0.36,1)` only (no springs/bounce); 200/320/500ms.
  Card hover is barely-perceptible (`translateY(-2px) scale(1.006)`, no shadow change).
  Prefer CSS. For React orchestration the **`motion`** library (Framer Motion) is installed —
  import from `motion/react`. Always set `transition={{ ease: [0.22,1,0.36,1], duration: … }}`;
  never use Motion's default spring (it violates the system's "no springs/bounce" rule).
- **Elevation:** use the `shadow-card` / `shadow-md` / `shadow-lg` tokens (soft, high,
  blue-black-tinted) — not raw Tailwind shadow values. Resting cards use `shadow-card`.
- **Backgrounds:** the `.canvas-surface` signal grid for the editor; subtle, never flat noise.
- **Icons:** Lucide only, 1.5 stroke, no fills.
<!-- END:frontend-aesthetics -->

<!-- BEGIN:component-structure -->
# Component & UI structure

See **[docs/component-structure.md](docs/component-structure.md)** for the full guide:
folder ownership, component rules (one per file, named export, split at ~200 lines, no prop drilling), and shadcn/ui usage (Base UI registry — `render` prop, not `asChild`).
<!-- END:component-structure -->

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
