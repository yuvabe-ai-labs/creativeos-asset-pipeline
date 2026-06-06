# Component structure — maintainability rules

## Folder ownership

| What | Where |
|---|---|
| React components (`.tsx`) | `src/components/<feature>/` |
| TypeScript types for a feature | `src/lib/<feature>/types.ts` |
| Constants, label maps, config | `src/lib/<feature>/constants.ts` |
| Pure helper functions | `src/lib/<feature>/utils.ts` |
| Reusable UI primitives | `src/components/ui/` |

**`src/components/<feature>/` contains only `.tsx` files.** No `types.ts`, `constants.ts`, or `utils.ts` inside a components folder — those always live in `src/lib/<feature>/`.

## Component rules

- **One component per file, named export only** — no default exports, no `index.ts` barrels.
- **Split when a file exceeds ~200 lines or holds more than one conceptual responsibility.** "Renders the list" and "manages staged upload state" are two responsibilities.
- **Sub-components used only by one parent** stay in the same feature folder, prefixed with the parent name (e.g. `kb-source-panel.tsx`, `kb-re-extract-overlay.tsx`). Promote to `components/ui/` only when genuinely reused across features.
- **State that must reset when a prop changes → use the `key` prop at the call site**, not `useEffect` + multiple `setState` calls. `<ReviewStep key={versionId} />` remounts cleanly; a `useEffect` doing the same triggers the cascading-renders lint error.
- **No prop drilling past two levels.** If a value or handler must travel more than two hops, lift into context or restructure.

## shadcn/ui — use it first

Before creating any new UI primitive, check the shadcn catalog at `https://ui.shadcn.com/docs/components`. If it exists, install it:

```bash
npx shadcn@latest add <component>
```

Only build a bespoke component when shadcn genuinely has no equivalent (and say so).

**This install uses the Base UI registry**, not Radix. Composition is via the **`render` prop**, not `asChild`:

```tsx
<DialogTrigger render={<Button>…</Button>} />
<Button render={<Link />} nativeButton={false} />
```

Installed primitives live in `src/components/ui/`. Read the existing ones before adding new variants.

Available components (as of this writing): Accordion, Alert, Alert Dialog, Aspect Ratio, Avatar, Badge, Breadcrumb, Button, Button Group, Calendar, Card, Carousel, Chart, Checkbox, Collapsible, Combobox, Command, Context Menu, Data Table, Date Picker, Dialog, Drawer, Dropdown Menu, Empty, Field, Hover Card, Input, Input Group, Input OTP, Item, Kbd, Label, Menubar, Native Select, Navigation Menu, Pagination, Popover, Progress, Radio Group, Resizable, Scroll Area, Select, Separator, Sheet, Sidebar, Skeleton, Slider, Sonner, Spinner, Switch, Table, Tabs, Textarea, Toast, Toggle, Toggle Group, Tooltip, Typography.
