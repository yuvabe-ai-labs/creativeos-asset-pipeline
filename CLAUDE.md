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

<!-- TRIGGER.DEV SKILLS START -->
## Trigger.dev agent skills

This project has Trigger.dev agent skills installed in `.claude/skills/`. Before writing or changing Trigger.dev code (background tasks, scheduled tasks, realtime, or chat.agent AI agents), load the most relevant skill: `trigger-authoring-chat-agent`.
<!-- TRIGGER.DEV SKILLS END -->
