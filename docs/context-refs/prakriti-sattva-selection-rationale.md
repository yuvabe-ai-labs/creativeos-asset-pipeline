# Selection rationale — reel parse schema & KB context

**Purpose:** explain *how* we chose (a) the reel-brief parse schema and (b) the client KB
context, so the team can reason about and refine them. Pairs with `prakriti-sattva-kb.md`
(the KB content) and `src/prompts/brief-parse.ts` (the live prompt + schema).

**Inputs reviewed:** intake questionnaire, the 53-reel scripts doc ("Master Creative
Direction" + per-reel scripts), tagline guidelines (`docs/context-refs/Prakriti - satva/`),
and prakritisattva.com.

---

## A. Reel parse schema — why these fields

The schema is **read straight off the reel-scripts doc**: all 53 reels share one rigid
structure, so we mirror it. Each field is justified by (1) being present in every reel and
(2) what it feeds **downstream** in CreativeOS.

| Field | Why it's in the schema | Downstream use |
|---|---|---|
| `title`, `type` (VISUAL/VO/TEXT), `duration` | Every reel header has them; `type` drives duration band & whether VO/text dominates | Routing + Video Gen duration |
| `schedule {date, post_time, category, theme}` | Present per reel (calendar-driven campaign) | Planning/calendar (not generation) |
| `strategic_objective` | Stated per reel; the "why" | Guides prompt tone/intent |
| `ai_production_type` | Each reel specifies how it's produced | Image/Video Gen approach |
| `visual_script.shots[] {description, duration}` | **The core** — every reel is a shot list with per-shot timing | **Each shot → one Image Gen node prompt** |
| `visual_script.execution_refinement` | Recurring "extend shots, slow macro, final hold" note | Image/Video Gen guidance |
| `on_screen_text {intro, body[], outro}` | The fixed text system (intro/body/outro) | Text overlays |
| `voiceover` | Present (or "No voiceover") | Audio/VO step |
| `music_sound` | Per-reel sound design direction | Audio step |
| `caption`, `cta`, `thumbnail_hook` | Every reel ships these for the post | Post copy / publishing |
| `qc_notes[]` | Repeated compliance/quality checklist | Review/eval gate |
| `product_links[]` | Product URLs appear in many reels | Linking / commerce |

**Deliberately left out of the schema:**
- The **brand-level** "Master Creative Direction" (brand feeling, visual benchmark, editing
  rhythm, compliance, hashtags) — that's **not per-reel**; it's *client context* (KB), so it
  lives in the KB, not the parse output.
- The campaign-wide **content split / 53-reel plan** — planning metadata, not a single
  asset's structure.

**Refinement levers (talk to the team):**
- Should `type` be an enum we enforce, or free text? (Currently enum incl. `""`.)
- Do we want `hashtags[]` as its own field vs. inside `caption`? (Reels embed them in caption.)
- `shots[].duration` is a string ("3s") — keep human, or normalize to seconds?

## B. KB context — why these items (and not others)

The KB block (`prakriti-sattva-kb.md`) is filtered to **only what changes how an asset is
generated**. Rule of thumb: *if it doesn't steer a prompt, image, caption, or compliance
check, it's not in the context block.*

**Included — and why it steers generation:**
- **Compliance (use/avoid words, disclaimer)** — highest priority; directly constrains every
  caption/VO/text. The questionnaire *and* the reel doc both stress avoiding cure/heal/treat.
- **Tone of voice** ("calm practitioner, not commercial") — shapes copy + VO style.
- **Visual benchmark + editing rhythm** — shapes image/video prompts (lighting, macro, slow,
  no glitch).
- **Tagline + on-screen text system** — defines outros and structure.
- **Audience (35+, female, US; dry/Vata/mature/sensitive)** — shapes who the copy speaks to
  and the casting of any human elements ("mature, elegant hands").
- **Products + hero ingredients + dosha** — grounds claims in real ingredients; prevents
  inventing benefits.
- **Hashtags** — required, always `#prakritisattva`.

**Excluded — and why:**
- Delivery format, scheduling, the 53-reel split, pricing, certification checkboxes → logistics
  that don't steer a single asset's generation (and risk diluting the context window).
- Long ingredient monographs from the questionnaire → summarized to hero ingredients; the full
  text belongs in a future structured `client_kb_items`, selected per node, not pasted whole.

## C. Open questions / flags for the team
1. **Tagline discrepancy:** reels/tagline-guidelines use **"Nature's Intelligence, Bottled."**;
   the **site** uses "The Art of Conscious Radiance" / "Rooted in tradition. Modern in
   approach." We defaulted reels to the campaign tagline — confirm.
2. **Certifications:** questionnaire marks Cruelty-Free / Vegan / "Natural (no certification)";
   site says "100% safe / all natural." Decide which claims are safe to surface.
3. **Audience knowledge level** was marked across beginner→well-informed — we assume "mixed,
   lean educational." Confirm.
4. **Prakriti/dosha framing** (Vata/Pitta) is strong on-site & in products — should the reel
   schema carry an explicit `dosha` field? (Currently it lives inside objective/theme.)
