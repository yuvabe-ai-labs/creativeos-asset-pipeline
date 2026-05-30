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
- **Backgrounds:** the `.canvas-surface` signal grid for the editor; subtle, never flat noise.
- **Icons:** Lucide only, 1.5 stroke, no fills.
<!-- END:frontend-aesthetics -->

<!-- BEGIN:ui-components -->
# UI components — use shadcn/ui first

**Before creating ANY new UI primitive, check the shadcn catalog:
https://ui.shadcn.com/docs/components** — if it exists there, install it with
`npx shadcn@latest add <component>` instead of hand-rolling one. Only build a bespoke
component when shadcn genuinely has no equivalent (and say so).

Available components (as of this writing):
Accordion, Alert, Alert Dialog, Aspect Ratio, Avatar, Badge, Breadcrumb, Button,
Button Group, Calendar, Card, Carousel, Chart, Checkbox, Collapsible, Combobox, Command,
Context Menu, Data Table, Date Picker, Dialog, Drawer, Dropdown Menu, Empty, Field,
Hover Card, Input, Input Group, Input OTP, Item, Kbd, Label, Menubar, Native Select,
Navigation Menu, Pagination, Popover, Progress, Radio Group, Resizable, Scroll Area,
Select, Separator, Sheet, Sidebar, Skeleton, Slider, Sonner, Spinner, Switch, Table,
Tabs, Textarea, Toast, Toggle, Toggle Group, Tooltip, Typography.

**Project note — this install uses the Base UI registry**, not Radix. So composition is via
the **`render` prop**, not `asChild` (e.g. `<DialogTrigger render={<Button>…</Button>} />`,
`<Button render={<Link/>} nativeButton={false} />`). Installed primitives live in
`src/components/ui/`; read the existing ones before adding new variants.
<!-- END:ui-components -->
