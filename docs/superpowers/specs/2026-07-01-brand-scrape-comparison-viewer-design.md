# Brand Scrape Result Comparison Viewer — Design Spec

**Date:** 2026-07-01
**Status:** Approved for implementation

---

## 1. Overview

A standalone Streamlit app (`brand-scrape-result-comparison/app.py`) that:

1. **Homepage** — pre-written GPT-5 vs Gemini 3.1 Pro Preview analysis (advantages, disadvantages, verdict) + a grid of brand cards.
2. **Brand detail view** — side-by-side rendered Markdown comparison for a selected brand, with a metadata row showing cost/speed/tokens for each provider.

Navigation is session-state driven (`st.session_state.selected_brand`). No routing library, no multi-page setup. One file, `streamlit run app.py`.

---

## 2. File Structure

```
brand-scrape-result-comparison/
├── app.py
├── research-output/          # copied from creativeos-mvp/research-output/
│   ├── yuvabestudios-com-openai.md
│   ├── yuvabestudios-com-gemini.md
│   ├── bevolve-ai-openai.md
│   ├── bevolve-ai-gemini.md
│   ├── matrimandir-org-openai.md
│   ├── matrimandir-org-gemini.md
│   ├── prakritisattva-com-openai.md
│   ├── prakritisattva-com-gemini.md
│   ├── buglerock-asia-openai.md
│   └── buglerock-asia-gemini.md
└── README.md
```

`research-output/` sits inside the app folder so the app is fully self-contained and shareable.

---

## 3. Data Loading

On startup, `app.py` scans `research-output/` for `*-openai.md` files, derives the slug, and pairs each with its `*-gemini.md` counterpart.

**Slug → display name mapping** (hardcoded dict, falls back to slug with hyphens replaced by spaces and title-cased):

```python
BRAND_NAMES = {
    "yuvabestudios-com":   "Yuvabe Studios",
    "bevolve-ai":          "Bevolve AI",
    "matrimandir-org":     "Matrimandir",
    "prakritisattva-com":  "Prakriti Sattva",
    "buglerock-asia":      "BugleRock Capital",
}
```

**Slug → URL mapping** (hardcoded dict):

```python
BRAND_URLS = {
    "yuvabestudios-com":  "yuvabestudios.com",
    "bevolve-ai":         "bevolve.ai",
    "matrimandir-org":    "matrimandir.org",
    "prakritisattva-com": "prakritisattva.com",
    "buglerock-asia":     "buglerock.asia",
}
```

**Metadata parsing** — each file optionally has a `| Field | Value |` table between the H1 and the `---` separator. Parse these fields:

| File field | Key |
|---|---|
| `Time taken` | `elapsed` |
| `Input tokens` | `input_tokens` |
| `Output tokens` | `output_tokens` |
| `Total tokens` | `total_tokens` |
| `Cost (USD)` | `cost_usd` |
| `Cost (INR ≈84x)` | `cost_inr` |
| `Model` | `model` |

**Body extraction** — everything after the first `---` line is the research body (rendered as Markdown). If no `---` exists, use the full file content after the H1 line.

---

## 4. Homepage

### 4.1 Header

```
Brand Research Viewer
GPT-5 vs Gemini 3.1 Pro Preview — how do they compare on real brand websites?
```

### 4.2 Model Comparison Card

A single `st.container` with two `st.columns(2)` inside. Pre-written, hardcoded content — does not read files.

**Left column — GPT-5:**

✅ **Advantages**
- Crawls 10–14 pages per brand (vs 5–7 for Gemini)
- Rich verbatim quotes pulled directly from the site
- Every claim has an inline source citation `([domain](url))`
- Thorough compliance section — catches SEBI reg numbers, tax clauses, footer disclaimers
- Picks up specific operational details: dates, pricing tiers, CIN numbers

❌ **Disadvantages**
- Slow — 112–129s average per brand
- Very high token usage — 60k–88k input tokens per brand
- Higher cost — ~$0.06–0.08 per brand

**Right column — Gemini 3.1 Pro Preview:**

✅ **Advantages**
- 3–4× faster — 36–37s average per brand
- ~70% cheaper per brand
- Clean narrative prose — easier to read and share
- Better structural formatting — clear bold headers and bullet hierarchies
- Low token usage — 700–1,600 input tokens per brand

❌ **Disadvantages**
- Crawls fewer pages — misses sub-pages (e.g. BugleRock PMS portfolio detail)
- Paraphrases more than quoting verbatim
- Social links sometimes listed without actual URLs
- Compliance section thinner — misses specific regulatory identifiers

**Verdict block** (below both columns, full width):

> **Use GPT-5** when you need forensic-level detail and compliance accuracy — e.g. feeding into the CreativeOS KB where missing a blocked word causes a brand violation. **Use Gemini** when you need a fast, clean, readable brief — a first-pass overview or something to share with a client or stakeholder.

### 4.3 Brand Grid

`st.columns(3)` repeating. Each brand card:

```
┌────────────────────────┐
│  Yuvabe Studios        │  ← st.subheader
│  yuvabestudios.com     │  ← st.caption
│                        │
│  [View Comparison →]   │  ← st.button, on_click sets session_state
└────────────────────────┘
```

Clicking the button sets `st.session_state.selected_brand = slug` and triggers a rerun.

---

## 5. Brand Detail View

Shown when `st.session_state.selected_brand` is set.

### 5.1 Back button + title

```python
st.button("← Back", on_click=lambda: st.session_state.pop("selected_brand"))
st.title(f"{brand_name} — {brand_url}")
```

### 5.2 Metadata comparison row

Single row with two `st.columns(2)`. Each column shows a `st.metric`-style summary for that provider:

```
GPT-5                          Gemini 3.1 Pro Preview
Model: gpt-5                   Model: gemini-3.1-pro-preview
Time: 129.1s                   Time: 37.4s
Tokens: 83,803 / 4,878         Tokens: 1,634 / 1,238
Cost: $0.0772 / ₹6.48          Cost: $0.0181 / ₹1.52
```

Rendered as a styled `st.info` block or a small markdown table per column. Falls back to "—" for any missing field.

### 5.3 Side-by-side Markdown

Two `st.columns(2)`. Left = OpenAI body, right = Gemini body. Each rendered with `st.markdown(body)`.

A thin `st.divider()` separates the metadata row from the content columns.

---

## 6. Styling

Minimal custom CSS injected via `st.markdown("<style>...</style>", unsafe_allow_html=True)`:

- Max content width: 1200px
- Column headers (GPT-5 / Gemini) styled with a coloured top border — blue for OpenAI, green for Gemini
- Brand cards: subtle border + hover shadow via CSS
- Verdict block: light yellow background `#fffbea`, left border accent

No external CSS files. All inline in `app.py`.

---

## 7. State Management

Single session state key: `st.session_state.selected_brand` (string slug or absent).

- Absent → render homepage
- Set → render brand detail view for that slug

No other state needed.

---

## 8. README

Short `README.md` in the app folder:

```markdown
# Brand Scrape Result Comparison Viewer

Compares GPT-5 vs Gemini 3.1 Pro Preview brand website research output.

## Setup
pip install streamlit

## Run
streamlit run app.py

## Adding brands
Drop new `{slug}-openai.md` and `{slug}-gemini.md` files into `research-output/`
and add the slug to BRAND_NAMES and BRAND_URLS in app.py.
```

---

## 9. Out of Scope

- Authentication — internal tool, no auth needed
- Re-running the research script from the UI
- Editing or saving notes on brands
- Deploying to Streamlit Cloud (can be added later trivially)
