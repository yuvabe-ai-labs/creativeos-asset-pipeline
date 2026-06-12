# Stage 2 Progress — Prompt Generation Pipeline
**Updated:** 2026-06-12
**Milestone:** End-to-end pipeline from Brand KB → Script → Prompt generation

---

## Pipeline

```
Brand KB  →  Script Node  →  Visual Script Node(s)  →  Prompt Node  →  (Image Gen — Stage 3)
                                                             ↑
                                                    File Node(s) / Note Node
```

---

## ✅ Completed

### Canvas
- [x] Create, save, load canvas per client
- [x] Add, move, delete, duplicate nodes
- [x] Connect and disconnect nodes
- [x] Context menu on canvas and nodes
- [x] Connection rules — only valid pairs allowed

### Brand KB Node
- [x] Shows brand knowledge base on the canvas
- [x] Links to the Brand KB editor
- [x] KB context flows into Script and Prompt nodes automatically

### Script Node
- [x] Upload or paste a reel script
- [x] AI parses it into a structured format (shots, voiceover, caption, CTA, etc.)
- [x] Editable — all fields can be adjusted after parsing
- [x] Brand KB context influences the parse (tone, compliance, personality)
- [x] Every AI parse saved to version history

### File Node
- [x] Attach images, documents, or text files to the canvas
- [x] LLM extraction — pull a description out of any file for use as context
- [x] Images are sent visually to the AI (not just as text)

### Note Node
- [x] Free-text block for adding context or directions directly on the canvas

### Prompt Node
- [x] Combines Brand KB + connected Script / Files / Notes into one generation context
- [x] Select which brand knowledge areas to include (visual style, casting, tone, etc.)
- [x] Write a custom instruction to guide the prompt
- [x] Generate — AI produces a ready-to-use image prompt
- [x] Output is editable; save when satisfied
- [x] Re-generate anytime with updated instruction or context
- [x] Every generation saved to version history

---

## 🔲 Pending (to close this milestone)

### Visual Script Node *(design agreed, build not started)*

**The problem it solves:** A reel script has multiple shots. You cannot write one image prompt that covers all of them — each shot needs its own. Until now there was no way to work per-shot on the canvas.

**The solution:** When a Script node is on the canvas, it can be split into individual Visual Script nodes — one per shot. These nodes auto-populate from the script and auto-connect back to the Script node. Each Visual Script node then connects to its own Prompt node, giving the operator one focused prompt per shot.

- [ ] Visual Script node type on the canvas
- [ ] Auto-populate from connected Script node (one node per shot)
- [ ] Auto-connect to the Script node
- [ ] Each node shows the shot description and visual direction
- [ ] Connects to a Prompt node — one image prompt per shot

### Prompt Version History UI *(infrastructure done, UI not built)*

Every generation is already recorded behind the scenes. What's missing is surfacing this in the UI so the operator can see past attempts, compare them, and switch the active version.

- [ ] List of past generations inside the Prompt focus view
- [ ] Show which version is currently active
- [ ] Switch to a previous version with one click

---

## Handoff Notes

- All core connections work end-to-end today: Script → Prompt, File → Prompt, Note → Prompt, KB → Prompt.
- The Visual Script node is the priority before moving to Stage 3 (Image Gen) — it defines the per-shot structure that Image Gen will operate on.
- Version history UI can follow in parallel; it does not block Stage 3.
