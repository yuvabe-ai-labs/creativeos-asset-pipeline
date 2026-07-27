# Sāya — sample "ideal" brand pack

Three reference documents engineered to map cleanly onto the KB extraction
schema (`src/lib/kb/schema.ts`) via the extractor prompt
(`src/prompts/kb-extract.ts`). Upload all three together to exercise the
**multi-document UNION merge** path. Accepted upload types: `md, txt, pdf,
docx, pptx`.

These are written so nearly every field extracts at **`confidence: high`,
`evidence_type: explicit`** — the design goal of an "ideal" input.

## Field → document coverage

| Schema group | Fields | Where stated |
|---|---|---|
| `brand_profile` | brand_name, tagline, positioning, mission, personality, tone_of_voice, industry | Doc 1 |
| `visual_identity` | aesthetic, photography_style, colour_palette_primary/secondary/avoid, surface_palette, lighting, visual_mood, visual_benchmark, typography_style | Doc 2 |
| `target_audience` | age_range, gender, location, lifestyle, pain_points, desires, human_casting | Doc 2 |
| `creative_direction.image` | shot_style, composition, environment, subjects, feel | Doc 2 |
| `creative_direction.video` | motion_style, camera_movement, transition_style, atmosphere, pacing, text_system, music_direction | Doc 2 |
| `compliance` | preferred_verbs, preferred_phrases, never_use_words, never_use_claims, never_use_tone, disclaimers | Doc 3 |
| `image_analysis` | dominant_colors, visual_mood, aesthetic, subjects, … | *Not from docs — populated separately from uploaded brand **images**.* |

## Why these docs extract well

- **Hex codes on every colour** → `colour_palette_*` extracts specific, not vague.
- **Adjectives-only personality** → matches the prompt's "adjectives ONLY" rule.
- **Named benchmark brands (Aesop, Kinfolk)** → aesthetic peers, not competitors.
- **Casting states age + skin tone + expression + retouching stance** → the
  single most important field for downstream image generation.
- **Compliance lists spell out every inflection** (heal/heals/healed/healing) →
  the hard-block layer needs each form or it won't block it.
- **Music direction includes BPM + instruments + what to avoid** → feeds
  `VIDEO_PROMPT` word-for-word.
