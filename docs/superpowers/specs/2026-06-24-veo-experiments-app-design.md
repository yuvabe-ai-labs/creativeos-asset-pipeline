# Veo 3.1 API Explorer — Streamlit Experiment App

**Goal:** Empirically test all Veo 3.1 image input combinations using Prakriti Sattva brand content, record actual API behaviour, and present findings to the lead to inform CreativeOS video generation UX decisions.

**Architecture:** Standalone Python/Streamlit app in `e:\CreativeOS\veo-experiments\`. Uses Google GenAI Python SDK for image and video generation, Supabase Python client for asset storage, and a local `data/history.json` as the run database.

**Tech Stack:** Python 3.11+, Streamlit, `google-genai` Python SDK, `supabase` Python client, `python-dotenv`, `Pillow`

---

## Folder Structure

```
veo-experiments/
├── app.py                  # Streamlit entry point, tab routing
├── requirements.txt
├── .env                    # GOOGLE_GENAI_API_KEY, SUPABASE_URL, SUPABASE_KEY
├── data/
│   └── history.json        # All generation runs (append-only)
├── lib/
│   ├── image_gen.py        # Gemini Flash image generation + Supabase upload
│   ├── video_gen.py        # Veo video generation + polling + Supabase upload
│   ├── supabase_client.py  # Supabase init + upload helpers
│   └── db.py               # history.json read/write helpers
├── presets/
│   └── presets.py          # 7 preset definitions + Prakriti Sattva prompts
└── tabs/
    ├── generate.py         # Tab 1: Generate
    ├── assets.py           # Tab 2: Assets
    ├── history.py          # Tab 3: History
    └── demo.py             # Tab 4: Demo
```

---

## Data Model (`history.json`)

Each run is one JSON object appended to a top-level array:

```json
{
  "id": "uuid",
  "timestamp": "2026-06-24T10:30:00Z",
  "preset_name": "Start + End",
  "mode": "preset | manual",
  "model": "veo-3.1-generate-preview",
  "aspect_ratio": "16:9",
  "duration_seconds": 8,
  "resolution": "720p",
  "prompt": "...",
  "start_frame_url": "https://...",
  "end_frame_url": "https://...",
  "reference_urls": ["https://..."],
  "status": "success | failed",
  "video_url": "https://...",
  "error": null,
  "note": "User-added observation"
}
```

---

## Tab 1 — Generate

**Layout:** Two columns. Left: inputs. Right: result.

**Left panel:**
- Mode toggle: `Preset` | `Manual`
- **Preset mode:** Dropdown of 7 presets. Selecting one auto-fills: prompt, model, duration, aspect ratio, resolution, and which image URL fields are active. User pastes their Supabase asset URLs into the pre-activated fields.
- **Manual mode:** All fields editable from scratch.
- Params: Model selector, Aspect Ratio (16:9 / 9:16), Duration (4 / 6 / 8), Resolution (720p / 1080p / 4k — model-dependent)
- Image inputs:
  - Start frame URL (text input)
  - End frame URL (text input)
  - Ref image URL 1 (text input)
  - Ref image URL 2 (text input)
  - Ref image URL 3 (text input)
- Generate button

**Right panel:**
- While generating: spinner with elapsed time (Veo polling is synchronous, ~1–6 min)
- On success: `st.video()` player + ✅ Success badge + video URL
- On failure: ❌ Failed badge + full error message in expandable block
- Note field (text area): user types observation → Save Note button → persists to history.json

---

## Tab 2 — Assets

**Purpose:** Generate and store Prakriti Sattva test images using `gemini-3.1-flash-image-preview`.

**Layout:** Two sections.

**Section A — Pre-built brand prompts (8 prompts):**

| # | Label | Prompt |
|---|---|---|
| 1 | Turmeric root | "Turmeric root freshly split, golden interior, side-lit on pale marble surface, macro lens, shallow depth of field, no text" |
| 2 | Rose petal | "Single dried rose petal on pale marble, slow-motion fall implied, warm ambient light, editorial product photography, no text" |
| 3 | Amber oil drop | "Amber-coloured oil drop suspended mid-fall, soft dark background, backlit, macro, no text" |
| 4 | Product arrangement | "Prakriti Sattva skincare product range on aged linen, warm afternoon window light from left, luxury editorial, no text" |
| 5 | Hands with oil | "Mature elegant hands applying oil to skin, natural texture, warm golden light, 35+ audience, editorial, no text" |
| 6 | Ingredient flat lay | "Ayurvedic ingredients flat lay: turmeric, rose petals, sandalwood powder on white marble, overhead shot, no text" |
| 7 | Oil pour | "Amber oil being poured from a dropper bottle, dark background, golden backlight, macro, no text" |
| 8 | Product close-up | "Single amber glass dropper bottle, Prakriti Sattva, white marble surface, sharp product label, soft shadow, no text" |

Each row has a `Generate & Upload` button. On click:
1. Calls Gemini Flash image gen API with the prompt
2. Uploads result PNG to Supabase Storage bucket `veo-experiments/assets/`
3. Shows the image + public URL with a `Copy URL` button

**Section B — Custom prompt:** Text area + Generate & Upload button.

All generated assets shown in a grid below with copy buttons. URLs stay available for pasting into Generate tab.

---

## Tab 3 — History

**Layout:** Full-width table + detail panel.

**Table columns:** Timestamp | Preset | Model | Inputs used (icons: 🖼️ S/E/R) | Duration | Status | Note

- Filter bar: Status (All / Success / Failed), Preset (All / [list])
- Click any row → detail panel slides in below showing: full params, error message, embedded video (if success), note

---

## Tab 4 — Demo

**Purpose:** Present findings cleanly to the lead.

**Layout:**

**Section A — Summary stats:**
- Total runs | Success count | Failure count | Models tested

**Section B — Findings table:**

| Combination | Model | Duration | Aspect Ratio | Result | Error | Note |
|---|---|---|---|---|---|---|
| Start frame only | Veo 3.1 Lite | 6s | 16:9 | ✅ | — | — |
| End frame only | Veo 3.1 | 8s | 16:9 | ✅ | — | — |
| ... | ... | ... | ... | ... | ... | ... |

Rows are the actual recorded runs from history.json, grouped by combination type.

**Section C — Export:** `Download CSV` button.

---

## Presets — Prakriti Sattva

All 7 presets share this base prompt (from Reel #1):

> *"Slow cinematic reveal of premium Ayurvedic skincare. Turmeric root on pale marble, a rose petal falls in slow motion, amber oil drops against dark background, full product range on aged linen in warm afternoon light. Shallow depth of field, slow movement, no text, no cuts."*

| # | Preset Name | Active inputs | Model | Duration | Aspect Ratio |
|---|---|---|---|---|---|
| 1 | Start frame only | start_frame | Veo 3.1 Lite | 6s | 16:9 |
| 2 | End frame only | end_frame | Veo 3.1 | 8s | 16:9 |
| 3 | Reference images only | ref_1, ref_2, ref_3 | Veo 3.1 | 8s | 16:9 |
| 4 | Start + End | start_frame, end_frame | Veo 3.1 | 8s | 16:9 |
| 5 | Start + Refs | start_frame, ref_1, ref_2 | Veo 3.1 | 8s | 16:9 |
| 6 | End + Refs | end_frame, ref_1, ref_2 | Veo 3.1 | 8s | 16:9 |
| 7 | Start + End + Refs | start_frame, end_frame, ref_1 | Veo 3.1 | 8s | 16:9 |

---

## Video Generation Flow

1. Fetch each image URL (start/end/refs) → read raw bytes → wrap as `types.Image(image_bytes=raw_bytes, mime_type="image/jpeg")`
2. Build `types.GenerateVideosConfig(duration_seconds=int, aspect_ratio=str, number_of_videos=1)`
3. Build `types.GenerateVideosSource(prompt=str, image=types.Image(...), last_frame=types.Image(...), reference_images=[types.VideoGenerationReferenceImage(...)])`
4. Call `client.models.generate_videos(model=model_name, source=source, config=config)` → returns long-running operation
5. Poll `client.operations.get(operation)` every 10s; check `operation.done` — when `True`, read `operation.result.generated_videos[0].video.uri`
6. Fetch video bytes from URI with `Authorization: Bearer {api_key}` header → upload to Supabase Storage `veo-experiments/videos/`
7. Return public URL
8. Append run record to `history.json`

---

## Environment Variables (`.env`)

```
GOOGLE_GENAI_API_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_BUCKET=veo-experiments
```

---

## Python SDK Reference (Verified)

**Package:** `pip install google-genai` (NOT `google-generativeai`)

**Client init:**
```python
from google import genai
from google.genai import types
client = genai.Client(api_key=GOOGLE_GENAI_API_KEY)
```

**Image models (assets tab):**
```python
response = client.models.generate_images(
    model="gemini-3.1-flash-image-preview",
    prompt=prompt,
    config=types.GenerateImagesConfig(number_of_images=1),
)
image_bytes = response.generated_images[0].image.image_bytes
```

**Video generation:**
```python
source = types.GenerateVideosSource(
    prompt=prompt,
    image=types.Image(image_bytes=bytes, mime_type="image/jpeg"),        # start frame (optional)
    last_frame=types.Image(image_bytes=bytes, mime_type="image/jpeg"),   # end frame (optional)
    reference_images=[                                                    # reference images (optional)
        types.VideoGenerationReferenceImage(
            reference_image=types.Image(image_bytes=bytes, mime_type="image/jpeg"),
            reference_type="STYLE",
        )
    ],
)
config = types.GenerateVideosConfig(
    duration_seconds=8,       # int, must be 4/6/8
    aspect_ratio="16:9",      # str
    number_of_videos=1,       # int
    # resolution="1080p",     # str, optional
    # negative_prompt="...",  # str, optional
    # enhance_prompt=True,    # bool, optional
    # seed=42,                # int, optional
)
operation = client.models.generate_videos(
    model="veo-3.1-generate-preview",
    source=source,
    config=config,
)
```

**Polling:**
```python
import time
while not operation.done:
    time.sleep(10)
    operation = client.operations.get(operation)

video_uri = operation.result.generated_videos[0].video.uri
```

**Fetching video bytes:**
```python
import requests
r = requests.get(video_uri, headers={"X-Goog-Api-Key": GOOGLE_GENAI_API_KEY})
video_bytes = r.content
```

**Known constraints:**
- `reference_images` is mutually exclusive with `image` and `last_frame`
- `last_frame` requires `duration_seconds=8`
- `reference_images` requires `duration_seconds=8`
- `reference_images` + `aspect_ratio="9:16"` → known API bug (rejected)
- Valid `duration_seconds`: exactly `4`, `6`, or `8` — no other values

---

## Key Design Decisions

- **Synchronous polling** in Streamlit with `st.spinner` — Veo takes 1–6 min, blocking the UI is acceptable for a research tool
- **No pre-labelling of expected outcomes** — all 7 combinations run openly; the actual API response is the finding
- **Supabase for all media** — images and videos uploaded immediately after generation; history.json only stores URLs, not binary data
- **Append-only history.json** — never overwrite; each run gets a UUID
- **Model-aware resolution options** — Lite shows 720p/1080p only; Fast/Quality show 720p/1080p/4k
