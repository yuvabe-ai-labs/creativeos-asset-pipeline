@AGENTS.md

## Controls — shadcn primitives only, never native

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

<!-- TRIGGER.DEV SKILLS START -->
## Trigger.dev agent skills

This project has Trigger.dev agent skills installed in `.claude/skills/`. Before writing or changing Trigger.dev code (background tasks, scheduled tasks, realtime, or chat.agent AI agents), load the most relevant skill: `trigger-authoring-chat-agent`.
<!-- TRIGGER.DEV SKILLS END -->
