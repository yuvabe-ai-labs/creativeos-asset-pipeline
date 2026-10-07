# Brand KB — Image Analysis from every brand image (D312–D317)

**Date:** 2026-10-07 · **Branch:** `feat/kb-image-analysis` · **Design page:** [Image Analysis Design](https://claude.ai/artifact/9bWUQdF1eZP4YxCDL1CrDB)

## 1. What changes

The Brand KB's **Image Analysis** tab used to be one AI call over the **uploaded** images only, made
during the KB build. It is now written from **every brand still image** — uploads and the images
imported from the website, Instagram and Facebook (D302) — in two steps:

1. **One card per image.** Each image is read once by Gemini into a stored card (format, purpose, colours,
   composition, lighting, people, text overlay…). A refresh only reads new images.
2. **The tab from the cards.** Format mix, purpose mix and colours are tallied in code from the cards; Gemini
   writes the other fields from the tallies and the cards.

Video analysis and concepts are deferred (see the reel benchmark: video to Gemini is the approach).

## 2. The tab's fields (14)

`content_mix` (Format Mix), `purpose_mix`, `dominant_colors` (tallied) · `aesthetic`, `visual_mood`, `subjects`,
`product_presentation`, `composition_style`, `lighting_character`, `settings_backgrounds`,
`people_casting`, `text_overlay_style`, `recurring_motifs`, `brand_consistency_notes` (written).
Seven are new: format mix, purpose mix, product presentation, settings & backgrounds, people & casting, text overlay
style (Vanchi's overlay and outro colours), recurring motifs. Shown in that order
(`MODULE_LEADING_FIELDS`). Older KBs show the new fields once a run rewrites the section.

## 3. The card

`src/lib/image-analysis/card-schema.ts`, on two fixed axes (D314), the same for every brand:

- **format**, what it looks like: product_shot · flat_lay · in_use · detail · people · text_graphic ·
  behind_the_scenes · logo_brand_mark · **third_party_or_ui** · other.
- **purpose**, why it was posted: educate · promote · inspire · entertain · connect.

Counted fields take fixed choices too (D317, `CARD_VOCAB`): shot type (macro · close up · medium ·
wide), angle (eye level · high · low · top down), framing (centred · rule of thirds · symmetrical ·
off centre), lighting (studio · natural daylight · warm indoor · dramatic · flat graphic), background
(plain · textured · real scene · pattern · gradient), and for text on images font (sans · serif ·
script · handwritten · display), placement (top · centre · bottom · corner · full frame) and
treatment (plain · boxed · outlined · shadowed · on band). Lighting, background and font each keep a
short note for the detail.

Then: summary,
subjects, product {visible, presentation}, setting, background, composition {shot_type, angle,
framing}, lighting, colours [{name, hex, share}], mood, style_tags, people {count, description},
text_overlay {present, text, font_style, colours_hex, placement, treatment}, logo_visible, polish.

## 4. Combining rules

- **Third-party or interface images are left out** of every tally and the summary (retailer badges,
  app icons). On J365, 3 of 8 sampled website images were marketplace rating badges.
- **Uploads weigh 3×** an imported image for colours and come first in the summary input. The format
  and purpose mixes are plain counts.
- **Colours** cluster when near-identical (RGB distance < 28) or same-named and close (< 96): two
  "yellow"s merge, cream and white stay apart.
- **Large brands (D316):** the summary reads at most 1,000 cards. Above that, `sample.ts` keeps the
  mix: uploads up to a third of the places, the rest by format and source in proportion, at least 3
  per group, spread evenly. The counts always cover every card; card reads page past 1,000 rows.
- Every written field returns to **needs review**; confidence follows how many images back it
  (≥20 high, ≥6 medium).

## 5. How it runs

- A background job (`background_jobs`, kind `image-analysis`, D306; Trigger task `image-analysis`),
  one live per client. It reads images without a current card six at a time, in rounds (images added
  mid-run are picked up), then rewrites the section on the **active** KB version.
- **Started by:** an upload (both upload routes), an import that saved assets, a KB build landing
  (the webhook), a re-extract, and the tab's own Analyse / Refresh button (Refresh confirms).
- **The KB build no longer analyses images.** It writes an empty section; the run started when the
  build lands fills it. Re-extract carries the current section over and starts a run.
- **Safe writes.** The section is replaced by the `set_kb_image_analysis` database function
  (`jsonb_set`), never by read-modify-write, so it cannot clash with the review screen's Save. The
  review screen polls the status (4 s while running, 30 s otherwise) and takes a new section into
  both its draft and its saved baseline, keeping other unsaved edits.
- Deleting an image removes its card (cascade); the tab is rewritten on the next run.

## 6. Model and cost

`gemini-3.5-flash-lite` for cards (D313). Measured on J365: 546 image tokens at medium resolution,
~1.5 s per image, no reasoning tokens; 16 cards in 4.4 s concurrently. About $0.0016 per card,
~$0.30 for a brand's first ~190 images.

`gemini-3.8-flash` for the summary (D315): one call over every card. On 1,200 cards (105k tokens)
it took ~23 s with ~1.6k reasoning tokens, a few cents, and wrote far more specific fields than
Flash-Lite on the same input.

## 7. Testing

Unit: tallies and colour clustering (`aggregate.test.ts`), summary input and KB field assembly
(`summarize.test.ts`), the run (rounds, a bad image, no KB yet, plain failure; `run.test.ts`).
Live: the real reader and summary on 16 J365 images (website + Instagram) — results in §4 and §6.
