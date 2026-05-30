<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:frontend-aesthetics -->
# Frontend aesthetics

CreativeOS is an internal **tool** (a node-canvas editor for a creative studio), not a
marketing site — aim for a distinctive, cohesive, genuinely "designed" feel without
gratuitous flourish. Avoid the generic "AI-slop" look.
(Ref: Anthropic cookbook — *coding-prompting-for-frontend-aesthetics*.)

- **Commit to one cohesive aesthetic.** Drive everything through the shadcn CSS variables in
  `src/app/globals.css` — never hardcode colors. A dominant color with a sharp accent beats a
  timid, evenly-distributed palette.
- **Typography with character.** Avoid Inter / Roboto / Arial / system defaults. Choose a
  distinctive pairing (e.g. a grotesk or display face + a mono) loaded via `next/font`. Build
  real hierarchy with extreme weight contrast and large size jumps — not 400-vs-600 or 1.5×
  steps. (We currently ship Geist from the scaffold; swap for something with more character
  when we polish the UI.)
- **Purposeful motion, not confetti.** It's a tool used for hours: prioritise smooth, fast
  canvas/node interactions and at most one tasteful load/reveal. Prefer CSS; reach for the
  Motion library only when React animation genuinely needs it.
- **Give surfaces depth.** The canvas should read as a real workspace (subtle grid/gradient
  texture), not flat gray. Layer backgrounds intentionally.
- **Avoid clichés:** purple-on-white gradients, characterless card grids, cookie-cutter
  layouts. Make choices specific to a creative-studio asset tool.
- **Legibility first.** High contrast and sensible density — this is a working tool, not a
  hero section.
<!-- END:frontend-aesthetics -->
