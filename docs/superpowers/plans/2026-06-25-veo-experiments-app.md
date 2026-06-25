# Veo 3.1 API Explorer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Python/Streamlit app at `e:\CreativeOS\veo-experiments\` that empirically tests all 7 Veo 3.1 image-input combinations using Prakriti Sattva brand content, records all API results, and presents findings to the lead.

**Architecture:** Four-tab Streamlit app. `lib/` holds all API/storage logic (image gen, video gen, Supabase upload, JSON DB). `presets/` holds preset definitions and brand prompts. `tabs/` holds the four Streamlit tab renderers. `app.py` is the entry point. All media stored in Supabase Storage; only URLs stored in `data/history.json`.

**Tech Stack:** Python 3.11+, Streamlit, `google-genai` SDK, `supabase` Python client, `requests`, `python-dotenv`, `Pillow`, `pytest`

---

## File Map

| File | Role |
|------|------|
| `e:\CreativeOS\veo-experiments\requirements.txt` | Create — all dependencies pinned |
| `e:\CreativeOS\veo-experiments\.env.example` | Create — env var template |
| `e:\CreativeOS\veo-experiments\data\history.json` | Create — empty JSON array |
| `e:\CreativeOS\veo-experiments\lib\__init__.py` | Create — empty package marker |
| `e:\CreativeOS\veo-experiments\lib\db.py` | Create — history.json read/write helpers |
| `e:\CreativeOS\veo-experiments\lib\supabase_client.py` | Create — Supabase init + upload |
| `e:\CreativeOS\veo-experiments\lib\image_gen.py` | Create — Gemini image gen + upload |
| `e:\CreativeOS\veo-experiments\lib\video_gen.py` | Create — Veo video gen + polling + upload |
| `e:\CreativeOS\veo-experiments\presets\__init__.py` | Create — empty package marker |
| `e:\CreativeOS\veo-experiments\presets\presets.py` | Create — 7 presets + 8 asset prompts |
| `e:\CreativeOS\veo-experiments\tabs\__init__.py` | Create — empty package marker |
| `e:\CreativeOS\veo-experiments\tabs\assets.py` | Create — Tab 2: generate brand images |
| `e:\CreativeOS\veo-experiments\tabs\generate.py` | Create — Tab 1: run video generation |
| `e:\CreativeOS\veo-experiments\tabs\history.py` | Create — Tab 3: browse run records |
| `e:\CreativeOS\veo-experiments\tabs\demo.py` | Create — Tab 4: findings summary |
| `e:\CreativeOS\veo-experiments\app.py` | Create — Streamlit entry point + tab routing |
| `e:\CreativeOS\veo-experiments\tests\__init__.py` | Create — empty |
| `e:\CreativeOS\veo-experiments\tests\test_db.py` | Create — unit tests for db.py |
| `e:\CreativeOS\veo-experiments\tests\test_presets.py` | Create — unit tests for presets.py |

---

## Task 1: Project scaffolding

**Files:**
- Create: `e:\CreativeOS\veo-experiments\requirements.txt`
- Create: `e:\CreativeOS\veo-experiments\.env.example`
- Create: `e:\CreativeOS\veo-experiments\data\history.json`
- Create: `e:\CreativeOS\veo-experiments\lib\__init__.py`
- Create: `e:\CreativeOS\veo-experiments\presets\__init__.py`
- Create: `e:\CreativeOS\veo-experiments\tabs\__init__.py`
- Create: `e:\CreativeOS\veo-experiments\tests\__init__.py`

- [ ] **Step 1: Create the directory tree**

```bash
mkdir -p e:\CreativeOS\veo-experiments\data
mkdir -p e:\CreativeOS\veo-experiments\lib
mkdir -p e:\CreativeOS\veo-experiments\presets
mkdir -p e:\CreativeOS\veo-experiments\tabs
mkdir -p e:\CreativeOS\veo-experiments\tests
```

- [ ] **Step 2: Create `requirements.txt`**

```
# e:\CreativeOS\veo-experiments\requirements.txt
streamlit>=1.35.0
google-genai>=1.16.0
supabase>=2.5.0
python-dotenv>=1.0.0
Pillow>=10.0.0
requests>=2.31.0
pandas>=2.2.0
pytest>=8.0.0
```

- [ ] **Step 3: Create `.env.example`**

```
# e:\CreativeOS\veo-experiments\.env.example
GOOGLE_GENAI_API_KEY=your_key_here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_BUCKET=veo-experiments
```

Copy this to `.env` and fill in real values before running.

- [ ] **Step 4: Create `data/history.json`**

```json
[]
```

- [ ] **Step 5: Create empty package markers**

All four files should contain only an empty string / no content:
- `e:\CreativeOS\veo-experiments\lib\__init__.py` — empty
- `e:\CreativeOS\veo-experiments\presets\__init__.py` — empty
- `e:\CreativeOS\veo-experiments\tabs\__init__.py` — empty
- `e:\CreativeOS\veo-experiments\tests\__init__.py` — empty

- [ ] **Step 6: Install dependencies**

```bash
cd e:\CreativeOS\veo-experiments
pip install -r requirements.txt
```

Expected: All packages install without error.

- [ ] **Step 7: Create `.gitignore`**

```
# e:\CreativeOS\veo-experiments\.gitignore
.env
__pycache__/
*.pyc
.pytest_cache/
data/history.json
```

Note: `history.json` is gitignored because it contains live run data with Supabase URLs. The `data/` directory itself and `data/.gitkeep` will be committed so the folder exists in the repo.

Create `data/.gitkeep` (empty file) and add to scaffold commit.

- [ ] **Step 8: Commit**

```bash
cd e:\CreativeOS\veo-experiments
git init
git add requirements.txt .env.example .gitignore lib/__init__.py presets/__init__.py tabs/__init__.py tests/__init__.py data/.gitkeep
git commit -m "chore: scaffold veo-experiments project structure"
```

---

## Task 2: `lib/db.py` — history read/write helpers

**Files:**
- Create: `e:\CreativeOS\veo-experiments\lib\db.py`
- Create: `e:\CreativeOS\veo-experiments\tests\test_db.py`

- [ ] **Step 1: Write the failing tests**

```python
# e:\CreativeOS\veo-experiments\tests\test_db.py
import json
import pytest
from pathlib import Path


def test_load_history_creates_empty_file(tmp_path):
    from lib.db import load_history
    f = tmp_path / "history.json"
    result = load_history(f)
    assert result == []
    assert f.exists()
    assert json.loads(f.read_text()) == []


def test_load_history_reads_existing(tmp_path):
    from lib.db import load_history
    f = tmp_path / "history.json"
    f.write_text('[{"id": "abc"}]')
    result = load_history(f)
    assert result == [{"id": "abc"}]


def test_append_run_and_load(tmp_path):
    from lib.db import load_history, append_run
    f = tmp_path / "history.json"
    append_run({"id": "r1", "status": "success"}, f)
    append_run({"id": "r2", "status": "failed"}, f)
    result = load_history(f)
    assert len(result) == 2
    assert result[0]["id"] == "r1"
    assert result[1]["id"] == "r2"


def test_update_note(tmp_path):
    from lib.db import append_run, update_note, load_history
    f = tmp_path / "history.json"
    append_run({"id": "x1", "note": "", "status": "success"}, f)
    update_note("x1", "interesting result", f)
    result = load_history(f)
    assert result[0]["note"] == "interesting result"


def test_update_note_unknown_id_is_noop(tmp_path):
    from lib.db import append_run, update_note, load_history
    f = tmp_path / "history.json"
    append_run({"id": "x1", "note": "original", "status": "success"}, f)
    update_note("does-not-exist", "ignored", f)
    result = load_history(f)
    assert result[0]["note"] == "original"


def test_new_run_has_all_required_fields():
    from lib.db import new_run
    run = new_run(
        preset_name="Start frame only",
        mode="preset",
        model="veo-3.1-generate-preview",
        aspect_ratio="16:9",
        duration_seconds=6,
        prompt="test prompt",
        start_frame_url="https://example.com/s.jpg",
        end_frame_url=None,
        reference_urls=[],
        status="success",
        video_url="https://example.com/v.mp4",
        error=None,
    )
    for field in ["id", "timestamp", "preset_name", "mode", "model", "aspect_ratio",
                  "duration_seconds", "prompt", "start_frame_url", "end_frame_url",
                  "reference_urls", "status", "video_url", "error", "note"]:
        assert field in run, f"missing field: {field}"
    assert run["note"] == ""
    assert run["status"] == "success"
    assert isinstance(run["id"], str) and len(run["id"]) == 36  # UUID
```

- [ ] **Step 2: Run tests — expect FAIL (ImportError)**

```bash
cd e:\CreativeOS\veo-experiments
pytest tests/test_db.py -v
```

Expected: `ImportError: No module named 'lib.db'`

- [ ] **Step 3: Implement `lib/db.py`**

```python
# e:\CreativeOS\veo-experiments\lib\db.py
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

_DEFAULT_DATA_FILE = Path(__file__).parent.parent / "data" / "history.json"


def load_history(data_file: Path | None = None) -> list[dict]:
    f = data_file or _DEFAULT_DATA_FILE
    if not f.exists():
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text("[]")
    return json.loads(f.read_text())


def append_run(run: dict, data_file: Path | None = None) -> None:
    f = data_file or _DEFAULT_DATA_FILE
    history = load_history(f)
    history.append(run)
    f.write_text(json.dumps(history, indent=2))


def update_note(run_id: str, note: str, data_file: Path | None = None) -> None:
    f = data_file or _DEFAULT_DATA_FILE
    history = load_history(f)
    for run in history:
        if run["id"] == run_id:
            run["note"] = note
            break
    f.write_text(json.dumps(history, indent=2))


def new_run(
    *,
    preset_name: str,
    mode: str,
    model: str,
    aspect_ratio: str,
    duration_seconds: int,
    prompt: str,
    start_frame_url: str | None,
    end_frame_url: str | None,
    reference_urls: list[str],
    status: str,
    video_url: str | None,
    error: str | None,
) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "preset_name": preset_name,
        "mode": mode,
        "model": model,
        "aspect_ratio": aspect_ratio,
        "duration_seconds": duration_seconds,
        "prompt": prompt,
        "start_frame_url": start_frame_url,
        "end_frame_url": end_frame_url,
        "reference_urls": reference_urls,
        "status": status,
        "video_url": video_url,
        "error": error,
        "note": "",
    }
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd e:\CreativeOS\veo-experiments
pytest tests/test_db.py -v
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/db.py tests/test_db.py
git commit -m "feat: add history.json read/write helpers"
```

---

## Task 3: `presets/presets.py` — preset definitions + asset prompts

**Files:**
- Create: `e:\CreativeOS\veo-experiments\presets\presets.py`
- Create: `e:\CreativeOS\veo-experiments\tests\test_presets.py`

- [ ] **Step 1: Write the failing tests**

```python
# e:\CreativeOS\veo-experiments\tests\test_presets.py
from presets.presets import PRESETS, ASSET_PROMPTS, MODELS, BASE_PROMPT


def test_exactly_seven_presets():
    assert len(PRESETS) == 7


def test_preset_required_fields():
    required = {"name", "active_inputs", "model", "duration_seconds", "aspect_ratio", "prompt"}
    for p in PRESETS:
        assert required <= set(p.keys()), f"Preset '{p.get('name')}' missing fields: {required - set(p.keys())}"


def test_preset_valid_duration_seconds():
    valid = {4, 6, 8}
    for p in PRESETS:
        assert p["duration_seconds"] in valid, (
            f"Preset '{p['name']}' has invalid duration {p['duration_seconds']}"
        )


def test_preset_valid_aspect_ratios():
    valid = {"16:9", "9:16"}
    for p in PRESETS:
        assert p["aspect_ratio"] in valid


def test_preset_active_inputs_are_known_keys():
    valid_keys = {"start_frame", "end_frame", "ref_1", "ref_2", "ref_3"}
    for p in PRESETS:
        for key in p["active_inputs"]:
            assert key in valid_keys, f"Unknown active_input key '{key}' in preset '{p['name']}'"


def test_preset_names_are_unique():
    names = [p["name"] for p in PRESETS]
    assert len(names) == len(set(names))


def test_exactly_eight_asset_prompts():
    assert len(ASSET_PROMPTS) == 8


def test_asset_prompts_have_label_and_prompt():
    for a in ASSET_PROMPTS:
        assert "label" in a, "Asset prompt missing 'label'"
        assert "prompt" in a, "Asset prompt missing 'prompt'"
        assert a["prompt"].strip(), "Asset prompt is empty"


def test_models_list_has_three_entries():
    assert len(MODELS) == 3


def test_base_prompt_is_non_empty():
    assert len(BASE_PROMPT) > 50
```

- [ ] **Step 2: Run tests — expect FAIL (ImportError)**

```bash
cd e:\CreativeOS\veo-experiments
pytest tests/test_presets.py -v
```

Expected: `ImportError: No module named 'presets.presets'`

- [ ] **Step 3: Implement `presets/presets.py`**

```python
# e:\CreativeOS\veo-experiments\presets\presets.py

BASE_PROMPT = (
    "Slow cinematic reveal of premium Ayurvedic skincare. "
    "Turmeric root on pale marble, a rose petal falls in slow motion, "
    "amber oil drops against dark background, full product range on aged linen "
    "in warm afternoon light. Shallow depth of field, slow movement, no text, no cuts."
)

MODELS = [
    "veo-3.1-generate-preview",
    "veo-3.1-fast-generate-preview",
    "veo-3.1-lite-generate-preview",
]

PRESETS = [
    {
        "name": "Start frame only",
        "active_inputs": ["start_frame"],
        "model": "veo-3.1-generate-preview",
        "duration_seconds": 6,
        "aspect_ratio": "16:9",
        "prompt": BASE_PROMPT,
    },
    {
        "name": "End frame only",
        "active_inputs": ["end_frame"],
        "model": "veo-3.1-generate-preview",
        "duration_seconds": 8,
        "aspect_ratio": "16:9",
        "prompt": BASE_PROMPT,
    },
    {
        "name": "Reference images only",
        "active_inputs": ["ref_1", "ref_2", "ref_3"],
        "model": "veo-3.1-generate-preview",
        "duration_seconds": 8,
        "aspect_ratio": "16:9",
        "prompt": BASE_PROMPT,
    },
    {
        "name": "Start + End",
        "active_inputs": ["start_frame", "end_frame"],
        "model": "veo-3.1-generate-preview",
        "duration_seconds": 8,
        "aspect_ratio": "16:9",
        "prompt": BASE_PROMPT,
    },
    {
        "name": "Start + Refs",
        "active_inputs": ["start_frame", "ref_1", "ref_2"],
        "model": "veo-3.1-generate-preview",
        "duration_seconds": 8,
        "aspect_ratio": "16:9",
        "prompt": BASE_PROMPT,
    },
    {
        "name": "End + Refs",
        "active_inputs": ["end_frame", "ref_1", "ref_2"],
        "model": "veo-3.1-generate-preview",
        "duration_seconds": 8,
        "aspect_ratio": "16:9",
        "prompt": BASE_PROMPT,
    },
    {
        "name": "Start + End + Refs",
        "active_inputs": ["start_frame", "end_frame", "ref_1"],
        "model": "veo-3.1-generate-preview",
        "duration_seconds": 8,
        "aspect_ratio": "16:9",
        "prompt": BASE_PROMPT,
    },
]

ASSET_PROMPTS = [
    {
        "label": "Turmeric root",
        "prompt": "Turmeric root freshly split, golden interior, side-lit on pale marble surface, macro lens, shallow depth of field, no text",
    },
    {
        "label": "Rose petal",
        "prompt": "Single dried rose petal on pale marble, slow-motion fall implied, warm ambient light, editorial product photography, no text",
    },
    {
        "label": "Amber oil drop",
        "prompt": "Amber-coloured oil drop suspended mid-fall, soft dark background, backlit, macro, no text",
    },
    {
        "label": "Product arrangement",
        "prompt": "Prakriti Sattva skincare product range on aged linen, warm afternoon window light from left, luxury editorial, no text",
    },
    {
        "label": "Hands with oil",
        "prompt": "Mature elegant hands applying oil to skin, natural texture, warm golden light, 35+ audience, editorial, no text",
    },
    {
        "label": "Ingredient flat lay",
        "prompt": "Ayurvedic ingredients flat lay: turmeric, rose petals, sandalwood powder on white marble, overhead shot, no text",
    },
    {
        "label": "Oil pour",
        "prompt": "Amber oil being poured from a dropper bottle, dark background, golden backlight, macro, no text",
    },
    {
        "label": "Product close-up",
        "prompt": "Single amber glass dropper bottle, Prakriti Sattva, white marble surface, sharp product label, soft shadow, no text",
    },
]
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd e:\CreativeOS\veo-experiments
pytest tests/test_presets.py -v
```

Expected: All 10 tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
pytest -v
```

Expected: All 16 tests (6 db + 10 presets) PASS.

- [ ] **Step 6: Commit**

```bash
git add presets/presets.py tests/test_presets.py
git commit -m "feat: add 7 presets and 8 Prakriti Sattva asset prompts"
```

---

## Task 4: `lib/supabase_client.py` — Supabase upload helper

**Files:**
- Create: `e:\CreativeOS\veo-experiments\lib\supabase_client.py`

No unit tests — requires live Supabase credentials. Manual verify in Task 7 (Assets tab smoke test).

- [ ] **Step 1: Implement `lib/supabase_client.py`**

```python
# e:\CreativeOS\veo-experiments\lib\supabase_client.py
import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

_client: Client | None = None


def get_supabase() -> Client:
    global _client
    if _client is None:
        url = os.environ["SUPABASE_URL"]
        key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        _client = create_client(url, key)
    return _client


def upload_bytes(path: str, data: bytes, content_type: str) -> str:
    """Upload bytes to Supabase Storage and return the public URL."""
    bucket = os.environ["SUPABASE_BUCKET"]
    client = get_supabase()
    client.storage.from_(bucket).upload(
        path,
        data,
        file_options={"content-type": content_type, "upsert": "true"},
    )
    return client.storage.from_(bucket).get_public_url(path)
```

- [ ] **Step 2: Verify `.env` is in place**

The `.env` file at `e:\CreativeOS\veo-experiments\.env` must exist with real values:
```
GOOGLE_GENAI_API_KEY=...
SUPABASE_URL=https://...supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_BUCKET=veo-experiments
```

Also ensure the Supabase bucket `veo-experiments` exists and has public read access. Create it in the Supabase dashboard under Storage if needed.

- [ ] **Step 3: Commit**

```bash
git add lib/supabase_client.py
git commit -m "feat: add Supabase upload helper"
```

---

## Task 5: `lib/image_gen.py` — Gemini image generation

**Files:**
- Create: `e:\CreativeOS\veo-experiments\lib\image_gen.py`

No unit tests — requires live API. Manual verify in Task 7.

- [ ] **Step 1: Implement `lib/image_gen.py`**

```python
# e:\CreativeOS\veo-experiments\lib\image_gen.py
import os
import time
from dotenv import load_dotenv
from google import genai
from google.genai import types
from lib.supabase_client import upload_bytes

load_dotenv()


def _get_client() -> genai.Client:
    return genai.Client(api_key=os.environ["GOOGLE_GENAI_API_KEY"])


def generate_and_upload_image(prompt: str, label: str = "custom") -> tuple[bytes, str]:
    """
    Generate an image with Gemini, upload to Supabase, return (raw_bytes, public_url).
    label is used in the storage path to make assets identifiable.
    """
    client = _get_client()
    response = client.models.generate_images(
        model="gemini-3.1-flash-image-preview",
        prompt=prompt,
        config=types.GenerateImagesConfig(number_of_images=1),
    )
    image_bytes = response.generated_images[0].image.image_bytes

    safe_label = label.replace(" ", "_").replace("/", "_").lower()
    ts = int(time.time())
    path = f"assets/{safe_label}_{ts}.png"
    url = upload_bytes(path, image_bytes, "image/png")
    return image_bytes, url
```

- [ ] **Step 2: Commit**

```bash
git add lib/image_gen.py
git commit -m "feat: add Gemini image generation helper"
```

---

## Task 6: `lib/video_gen.py` — Veo video generation + polling

**Files:**
- Create: `e:\CreativeOS\veo-experiments\lib\video_gen.py`

This is the core of the research tool. It passes ALL provided inputs to the API without filtering — the purpose is to test and record what the API accepts or rejects.

- [ ] **Step 1: Implement `lib/video_gen.py`**

```python
# e:\CreativeOS\veo-experiments\lib\video_gen.py
import os
import time
import requests as _requests
from dotenv import load_dotenv
from google import genai
from google.genai import types
from lib.supabase_client import upload_bytes

load_dotenv()

VALID_DURATIONS = {4, 6, 8}


def _get_client() -> genai.Client:
    return genai.Client(api_key=os.environ["GOOGLE_GENAI_API_KEY"])


def _fetch_image(url: str) -> types.Image:
    """Fetch image bytes from a URL and wrap in types.Image."""
    r = _requests.get(url, timeout=30)
    r.raise_for_status()
    mime = r.headers.get("content-type", "image/jpeg").split(";")[0].strip()
    return types.Image(image_bytes=r.content, mime_type=mime)


def generate_video(
    *,
    prompt: str,
    model: str,
    duration_seconds: int,
    aspect_ratio: str,
    start_frame_url: str | None = None,
    end_frame_url: str | None = None,
    reference_urls: list[str] | None = None,
) -> str:
    """
    Call Veo API with all provided inputs. Returns public Supabase URL of uploaded video.

    NOTE: This function does NOT filter incompatible combinations — all inputs are passed
    as-is so that API acceptance/rejection can be recorded empirically.

    Raises:
        ValueError: if duration_seconds is not in {4, 6, 8}
        Exception: propagates any API error so callers can record it in history.json
    """
    if duration_seconds not in VALID_DURATIONS:
        raise ValueError(f"duration_seconds must be one of {VALID_DURATIONS}, got {duration_seconds}")

    client = _get_client()
    api_key = os.environ["GOOGLE_GENAI_API_KEY"]

    source_kwargs: dict = {"prompt": prompt}

    if start_frame_url:
        source_kwargs["image"] = _fetch_image(start_frame_url)

    if end_frame_url:
        source_kwargs["last_frame"] = _fetch_image(end_frame_url)

    if reference_urls:
        source_kwargs["reference_images"] = [
            types.VideoGenerationReferenceImage(
                reference_image=_fetch_image(url),
                reference_type="STYLE",
            )
            for url in reference_urls
        ]

    source = types.GenerateVideosSource(**source_kwargs)
    config = types.GenerateVideosConfig(
        duration_seconds=duration_seconds,
        aspect_ratio=aspect_ratio,
        number_of_videos=1,
    )

    operation = client.models.generate_videos(model=model, source=source, config=config)
    while not operation.done:
        time.sleep(10)
        operation = client.operations.get(operation)

    video_uri = operation.result.generated_videos[0].video.uri
    video_bytes = _requests.get(
        video_uri,
        headers={"X-Goog-Api-Key": api_key},
        timeout=120,
    ).content

    ts = int(time.time())
    safe_model = model.replace(".", "-").replace("/", "_")
    path = f"videos/{safe_model}_{ts}.mp4"
    return upload_bytes(path, video_bytes, "video/mp4")
```

- [ ] **Step 2: Verify unit tests still pass**

```bash
cd e:\CreativeOS\veo-experiments
pytest -v
```

Expected: All 16 tests PASS (no new tests here — video_gen requires live API).

- [ ] **Step 3: Commit**

```bash
git add lib/video_gen.py
git commit -m "feat: add Veo video generation with polling and Supabase upload"
```

---

## Task 7: `tabs/assets.py` — Tab 2

**Files:**
- Create: `e:\CreativeOS\veo-experiments\tabs\assets.py`

- [ ] **Step 1: Implement `tabs/assets.py`**

```python
# e:\CreativeOS\veo-experiments\tabs\assets.py
import streamlit as st
from lib.image_gen import generate_and_upload_image
from presets.presets import ASSET_PROMPTS


def render_assets_tab() -> None:
    st.header("Assets")
    st.caption(
        "Generate Prakriti Sattva brand images using Gemini Flash. "
        "Copy URLs to paste into the Generate tab."
    )

    st.subheader("Brand prompts")
    for item in ASSET_PROMPTS:
        col_text, col_btn = st.columns([4, 1])
        with col_text:
            st.markdown(f"**{item['label']}**")
            st.caption(item["prompt"])
        with col_btn:
            if st.button("Generate & Upload", key=f"asset_btn_{item['label']}"):
                with st.spinner(f"Generating {item['label']}…"):
                    try:
                        image_bytes, url = generate_and_upload_image(item["prompt"], item["label"])
                        _save_asset(item["label"], image_bytes, url)
                        st.success("Done")
                    except Exception as e:
                        st.error(str(e))

    st.divider()
    st.subheader("Custom prompt")
    custom_prompt = st.text_area("Prompt", placeholder="Describe your image…", key="custom_asset_prompt")
    if st.button("Generate & Upload", key="custom_asset_gen"):
        if not custom_prompt.strip():
            st.warning("Enter a prompt first.")
        else:
            with st.spinner("Generating…"):
                try:
                    image_bytes, url = generate_and_upload_image(custom_prompt, "custom")
                    _save_asset("Custom", image_bytes, url)
                    st.success("Done")
                except Exception as e:
                    st.error(str(e))

    assets = st.session_state.get("generated_assets", [])
    if assets:
        st.divider()
        st.subheader(f"Generated this session ({len(assets)})")
        cols = st.columns(3)
        for i, asset in enumerate(assets):
            with cols[i % 3]:
                st.image(asset["bytes"], caption=asset["label"], use_container_width=True)
                st.code(asset["url"], language=None)


def _save_asset(label: str, image_bytes: bytes, url: str) -> None:
    if "generated_assets" not in st.session_state:
        st.session_state.generated_assets = []
    st.session_state.generated_assets.append({"label": label, "bytes": image_bytes, "url": url})
```

- [ ] **Step 2: Smoke test (manual)**

```bash
cd e:\CreativeOS\veo-experiments
streamlit run app.py
```

Wait — `app.py` doesn't exist yet. Create a temporary minimal `app.py` for smoke testing only:

```python
# TEMPORARY — replace in Task 11
import streamlit as st
from tabs.assets import render_assets_tab
render_assets_tab()
```

Open `http://localhost:8501`. Verify:
- 8 brand prompt rows render with labels and prompts
- "Custom prompt" text area appears
- No Python errors in terminal

- [ ] **Step 3: Commit**

```bash
git add tabs/assets.py app.py
git commit -m "feat: add Assets tab (brand image generation)"
```

---

## Task 8: `tabs/generate.py` — Tab 1

**Files:**
- Create: `e:\CreativeOS\veo-experiments\tabs\generate.py`

- [ ] **Step 1: Implement `tabs/generate.py`**

```python
# e:\CreativeOS\veo-experiments\tabs\generate.py
import time
import streamlit as st
from lib.video_gen import generate_video
from lib.db import new_run, append_run, update_note
from presets.presets import PRESETS, MODELS


def render_generate_tab() -> None:
    st.header("Generate")

    col_left, col_right = st.columns([1, 1])

    with col_left:
        mode = st.radio("Mode", ["Preset", "Manual"], horizontal=True, key="gen_mode")

        if mode == "Preset":
            preset_name = st.selectbox(
                "Preset", [p["name"] for p in PRESETS], key="gen_preset"
            )
            preset = next(p for p in PRESETS if p["name"] == preset_name)
            prompt = preset["prompt"]
            model = preset["model"]
            duration_seconds = preset["duration_seconds"]
            aspect_ratio = preset["aspect_ratio"]
            active = set(preset["active_inputs"])
        else:
            preset_name = "manual"
            prompt = st.text_area("Prompt", key="gen_prompt")
            model = st.selectbox("Model", MODELS, key="gen_model")
            duration_seconds = st.selectbox("Duration (s)", [4, 6, 8], index=1, key="gen_duration")
            aspect_ratio = st.selectbox("Aspect Ratio", ["16:9", "9:16"], key="gen_ratio")
            active = {"start_frame", "end_frame", "ref_1", "ref_2", "ref_3"}

        if mode == "Preset":
            st.info(
                f"Model: `{model}` · Duration: {duration_seconds}s · Aspect: {aspect_ratio}  \n"
                f"Active inputs: {', '.join(sorted(active))}"
            )

        st.markdown("**Image inputs**")
        start_frame_url = st.text_input(
            "Start frame URL", disabled="start_frame" not in active, key="gen_start"
        )
        end_frame_url = st.text_input(
            "End frame URL", disabled="end_frame" not in active, key="gen_end"
        )
        ref1_url = st.text_input(
            "Ref image URL 1", disabled="ref_1" not in active, key="gen_ref1"
        )
        ref2_url = st.text_input(
            "Ref image URL 2", disabled="ref_2" not in active, key="gen_ref2"
        )
        ref3_url = st.text_input(
            "Ref image URL 3", disabled="ref_3" not in active, key="gen_ref3"
        )

        generate_clicked = st.button("Generate", type="primary", key="gen_btn")

    with col_right:
        if generate_clicked:
            ref_urls = [u for u in [ref1_url, ref2_url, ref3_url] if u.strip()]
            t0 = time.time()
            with st.spinner("Generating video… (this can take 1–6 minutes)"):
                try:
                    video_url = generate_video(
                        prompt=prompt,
                        model=model,
                        duration_seconds=int(duration_seconds),
                        aspect_ratio=aspect_ratio,
                        start_frame_url=start_frame_url or None,
                        end_frame_url=end_frame_url or None,
                        reference_urls=ref_urls or None,
                    )
                    elapsed = int(time.time() - t0)
                    run = new_run(
                        preset_name=preset_name,
                        mode=mode.lower(),
                        model=model,
                        aspect_ratio=aspect_ratio,
                        duration_seconds=int(duration_seconds),
                        prompt=prompt,
                        start_frame_url=start_frame_url or None,
                        end_frame_url=end_frame_url or None,
                        reference_urls=ref_urls,
                        status="success",
                        video_url=video_url,
                        error=None,
                    )
                    append_run(run)
                    st.session_state.last_run = run
                    st.success(f"✅ Done in {elapsed}s")
                    st.video(video_url)
                    st.code(video_url, language=None)

                except Exception as e:
                    elapsed = int(time.time() - t0)
                    run = new_run(
                        preset_name=preset_name,
                        mode=mode.lower(),
                        model=model,
                        aspect_ratio=aspect_ratio,
                        duration_seconds=int(duration_seconds),
                        prompt=prompt,
                        start_frame_url=start_frame_url or None,
                        end_frame_url=end_frame_url or None,
                        reference_urls=ref_urls,
                        status="failed",
                        video_url=None,
                        error=str(e),
                    )
                    append_run(run)
                    st.session_state.last_run = run
                    st.error("❌ Generation failed")
                    with st.expander("Error details"):
                        st.code(str(e))

        last_run = st.session_state.get("last_run")
        if last_run:
            st.divider()
            note = st.text_area(
                "Observation note",
                value=last_run.get("note", ""),
                key="gen_note",
                placeholder="Add your observation about this result…",
            )
            if st.button("Save Note", key="gen_save_note"):
                update_note(last_run["id"], note)
                last_run["note"] = note
                st.success("Note saved.")
```

- [ ] **Step 2: Smoke test (manual)**

Update the temporary `app.py` to include this tab:

```python
# TEMPORARY — replace in Task 11
import streamlit as st
from tabs.generate import render_generate_tab
render_generate_tab()
```

```bash
streamlit run app.py
```

Verify:
- Mode toggle switches between Preset and Manual
- Selecting a preset populates the info banner with correct model/duration/aspect
- In preset mode, only active input fields are enabled (e.g. "Start frame only" → only Start frame URL enabled)
- Manual mode enables all fields
- Generate button is clickable (don't run it yet — costs API credits)
- No Python errors in terminal

- [ ] **Step 3: Commit**

```bash
git add tabs/generate.py
git commit -m "feat: add Generate tab (preset + manual video generation)"
```

---

## Task 9: `tabs/history.py` — Tab 3

**Files:**
- Create: `e:\CreativeOS\veo-experiments\tabs\history.py`

- [ ] **Step 1: Implement `tabs/history.py`**

```python
# e:\CreativeOS\veo-experiments\tabs\history.py
import pandas as pd
import streamlit as st
from lib.db import load_history, update_note


def render_history_tab() -> None:
    st.header("History")
    history = load_history()

    if not history:
        st.info("No runs yet — go to Generate to start.")
        return

    df = pd.DataFrame(history)

    col1, col2 = st.columns(2)
    with col1:
        status_filter = st.selectbox("Status", ["All", "success", "failed"], key="hist_status")
    with col2:
        preset_options = ["All"] + sorted(df["preset_name"].dropna().unique().tolist())
        preset_filter = st.selectbox("Preset", preset_options, key="hist_preset")

    if status_filter != "All":
        df = df[df["status"] == status_filter]
    if preset_filter != "All":
        df = df[df["preset_name"] == preset_filter]

    df = df.copy()
    df["inputs"] = df.apply(_format_inputs, axis=1)

    display_cols = ["timestamp", "preset_name", "model", "inputs", "duration_seconds", "status", "note"]
    st.dataframe(
        df[display_cols].rename(columns={
            "timestamp": "Time",
            "preset_name": "Preset",
            "model": "Model",
            "inputs": "Inputs",
            "duration_seconds": "Duration",
            "status": "Status",
            "note": "Note",
        }),
        use_container_width=True,
        height=320,
    )

    st.divider()
    st.subheader("Run detail")
    run_ids = df["id"].tolist()
    if not run_ids:
        st.info("No runs match the current filters.")
        return

    def _run_label(rid: str) -> str:
        row = df[df["id"] == rid]
        return f"{row['preset_name'].values[0]}  ·  {row['timestamp'].values[0][:19]}"

    selected_id = st.selectbox("Select run", run_ids, format_func=_run_label, key="hist_select")
    run = next(r for r in history if r["id"] == selected_id)

    with st.expander("Full params", expanded=True):
        st.json({k: v for k, v in run.items() if k not in ("note",)})

    if run.get("video_url"):
        st.video(run["video_url"])

    if run.get("error"):
        st.error(run["error"])

    note = st.text_area("Note", value=run.get("note", ""), key="hist_note")
    if st.button("Save Note", key="hist_save_note"):
        update_note(selected_id, note)
        st.success("Saved.")


def _format_inputs(row: pd.Series) -> str:
    parts = []
    if row.get("start_frame_url"):
        parts.append("🖼️S")
    if row.get("end_frame_url"):
        parts.append("🖼️E")
    refs = row.get("reference_urls") or []
    if refs:
        parts.append(f"🖼️R×{len(refs)}")
    return " ".join(parts) if parts else "prompt only"
```

- [ ] **Step 2: Smoke test (manual)**

```python
# TEMPORARY app.py
import streamlit as st
from tabs.history import render_history_tab
render_history_tab()
```

```bash
streamlit run app.py
```

Verify: Either "No runs yet" message appears (if history.json is empty), or the table renders if runs exist.

- [ ] **Step 3: Commit**

```bash
git add tabs/history.py
git commit -m "feat: add History tab with filter and run detail panel"
```

---

## Task 10: `tabs/demo.py` — Tab 4

**Files:**
- Create: `e:\CreativeOS\veo-experiments\tabs\demo.py`

- [ ] **Step 1: Implement `tabs/demo.py`**

```python
# e:\CreativeOS\veo-experiments\tabs\demo.py
import pandas as pd
import streamlit as st
from lib.db import load_history


def render_demo_tab() -> None:
    st.header("Demo — Veo 3.1 Findings")
    st.caption("Summary of all recorded runs for presenting findings.")

    history = load_history()
    if not history:
        st.info("No runs recorded yet. Run experiments in the Generate tab first.")
        return

    df = pd.DataFrame(history)

    # Summary stats
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Total runs", len(df))
    col2.metric("Successes", int((df["status"] == "success").sum()))
    col3.metric("Failures", int((df["status"] == "failed").sum()))
    col4.metric("Models tested", df["model"].nunique())

    st.divider()
    st.subheader("Findings table")

    findings = df[["preset_name", "model", "duration_seconds", "aspect_ratio", "status", "error", "note"]].copy()
    findings["status"] = findings["status"].apply(lambda s: "✅" if s == "success" else "❌")
    findings["error"] = findings["error"].fillna("—")
    findings["note"] = findings["note"].fillna("—")
    findings = findings.rename(columns={
        "preset_name": "Combination",
        "model": "Model",
        "duration_seconds": "Duration (s)",
        "aspect_ratio": "Aspect Ratio",
        "status": "Result",
        "error": "Error",
        "note": "Note",
    })

    st.dataframe(findings, use_container_width=True)

    st.divider()
    csv = df.to_csv(index=False).encode("utf-8")
    st.download_button(
        label="Download CSV",
        data=csv,
        file_name="veo-experiments.csv",
        mime="text/csv",
    )
```

- [ ] **Step 2: Commit**

```bash
git add tabs/demo.py
git commit -m "feat: add Demo tab with summary stats and CSV export"
```

---

## Task 11: `app.py` — entry point + final smoke test

**Files:**
- Rewrite: `e:\CreativeOS\veo-experiments\app.py`

- [ ] **Step 1: Write the final `app.py`**

```python
# e:\CreativeOS\veo-experiments\app.py
import streamlit as st
from tabs.generate import render_generate_tab
from tabs.assets import render_assets_tab
from tabs.history import render_history_tab
from tabs.demo import render_demo_tab

st.set_page_config(
    page_title="Veo 3.1 API Explorer",
    page_icon="🎬",
    layout="wide",
)
st.title("Veo 3.1 API Explorer — Prakriti Sattva")

tab_generate, tab_assets, tab_history, tab_demo = st.tabs([
    "🎬 Generate",
    "🖼️ Assets",
    "📋 History",
    "📊 Demo",
])

with tab_generate:
    render_generate_tab()
with tab_assets:
    render_assets_tab()
with tab_history:
    render_history_tab()
with tab_demo:
    render_demo_tab()
```

- [ ] **Step 2: Final smoke test (manual)**

```bash
cd e:\CreativeOS\veo-experiments
streamlit run app.py
```

Open `http://localhost:8501`. Verify all four tabs:

**Generate tab:**
- Mode toggle works
- Preset dropdown shows all 7 presets
- Selecting "Reference images only" disables start_frame and end_frame inputs
- Selecting "Start + End" disables all three ref inputs
- Manual mode enables all 5 inputs

**Assets tab:**
- 8 brand prompt rows render
- Custom prompt area renders

**History tab:**
- "No runs yet" message if history.json is `[]`
- Status and Preset filter dropdowns present

**Demo tab:**
- "No runs recorded yet" message if history.json is `[]`

**No Python errors in terminal.**

- [ ] **Step 3: Run full test suite one final time**

```bash
pytest -v
```

Expected: All 16 tests PASS.

- [ ] **Step 4: Final commit**

```bash
git add app.py
git commit -m "feat: complete Veo 3.1 API Explorer app"
```

---

## Manual End-to-End Verification (after all tasks complete)

Follow this flow to verify the app works end-to-end with real API calls:

1. **Generate an asset:** Go to Assets tab → click "Generate & Upload" on "Turmeric root". Verify the image appears and a URL is shown.

2. **Copy the URL** from the Assets tab.

3. **Run Preset 1 (Start frame only):** Go to Generate tab → select "Start frame only" → paste the URL into Start frame URL → click Generate. Wait ~1–6 min. Verify video plays and history.json has a new record.

4. **Add a note:** Type a note in the Observation field → click Save Note. Verify it persists after page refresh.

5. **Check History tab:** Verify the run appears in the table with correct preset name, status, and note.

6. **Check Demo tab:** Verify total runs = 1, successes/failures count is correct.

7. **Run a combination expected to fail** (e.g. Preset 5 "Start + Refs" — start_frame + reference_images together): observe the API error is recorded in history with status "failed" and the error message shown.

8. **Download CSV** from Demo tab and verify all columns are present.
