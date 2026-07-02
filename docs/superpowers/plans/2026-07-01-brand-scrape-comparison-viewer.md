# Brand Scrape Result Comparison Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Streamlit app at `brand-scrape-result-comparison/app.py` that shows a pre-written GPT-5 vs Gemini analysis on the homepage plus a brand grid, and renders side-by-side Markdown comparisons when a brand is clicked.

**Architecture:** Single `app.py` file; `st.session_state.selected_brand` drives homepage vs detail view. Data is loaded by scanning `research-output/` for paired `{slug}-openai.md` / `{slug}-gemini.md` files and parsing the optional metadata table at the top of each. No routing library, no multi-page setup.

**Tech Stack:** Python 3.12, Streamlit 1.37+, standard library only (no extra pip installs beyond streamlit).

---

## File Structure

**New files (all inside `brand-scrape-result-comparison/`):**
- `app.py` — the entire Streamlit app
- `research-output/` — copied .md files (10 files from `creativeos-mvp/research-output/`)
- `README.md` — setup + run instructions

---

## Task 1: Scaffold the folder + copy research files

**Files:**
- Create: `brand-scrape-result-comparison/` (directory)
- Create: `brand-scrape-result-comparison/README.md`
- Copy: `creativeos-mvp/research-output/*.md` → `brand-scrape-result-comparison/research-output/`

- [ ] **Step 1: Create the app directory and README**

```bash
mkdir brand-scrape-result-comparison
mkdir brand-scrape-result-comparison/research-output
```

Create `brand-scrape-result-comparison/README.md` with this content:

```markdown
# Brand Scrape Result Comparison Viewer

Compares GPT-5 vs Gemini 3.1 Pro Preview brand website research output side by side.

## Setup

```bash
pip install streamlit
```

## Run

```bash
streamlit run app.py
```

## Adding brands

1. Drop new `{slug}-openai.md` and `{slug}-gemini.md` files into `research-output/`
2. Add the slug to `BRAND_NAMES` and `BRAND_URLS` in `app.py`
```

- [ ] **Step 2: Copy the research output files**

From the repo root (`e:/CreativeOS/creativeos-mvp`), run:

```bash
cp research-output/*.md brand-scrape-result-comparison/research-output/
```

On Windows PowerShell:
```powershell
Copy-Item research-output\*.md brand-scrape-result-comparison\research-output\
```

- [ ] **Step 3: Verify all 10 files are present**

```bash
ls brand-scrape-result-comparison/research-output/
```

Expected output (10 files):
```
bevolve-ai-gemini.md
bevolve-ai-openai.md
buglerock-asia-gemini.md
buglerock-asia-openai.md
matrimandir-org-gemini.md
matrimandir-org-openai.md
prakritisattva-com-gemini.md
prakritisattva-com-openai.md
yuvabestudios-com-gemini.md
yuvabestudios-com-openai.md
```

---

## Task 2: Data loading module (functions in app.py)

**Files:**
- Create: `brand-scrape-result-comparison/app.py`

Write the data loading logic first. The app has two data structures:
- `BrandMeta` — parsed metadata from the table at the top of a file
- `BrandFile` — `{ meta: BrandMeta, body: str }` for one provider's file

- [ ] **Step 1: Create `app.py` with imports, constants, and data loading**

```python
import os
import re
import streamlit as st

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

RESEARCH_DIR = os.path.join(os.path.dirname(__file__), "research-output")

BRAND_NAMES = {
    "yuvabestudios-com":  "Yuvabe Studios",
    "bevolve-ai":         "Bevolve AI",
    "matrimandir-org":    "Matrimandir",
    "prakritisattva-com": "Prakriti Sattva",
    "buglerock-asia":     "BugleRock Capital",
}

BRAND_URLS = {
    "yuvabestudios-com":  "yuvabestudios.com",
    "bevolve-ai":         "bevolve.ai",
    "matrimandir-org":    "matrimandir.org",
    "prakritisattva-com": "prakritisattva.com",
    "buglerock-asia":     "buglerock.asia",
}

# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

def parse_file(path: str) -> dict:
    """
    Returns { "meta": dict, "body": str }.
    meta keys: elapsed, input_tokens, output_tokens, total_tokens,
               cost_usd, cost_inr, model  (all strings, may be "—")
    body: the research content below the first "---" separator
    """
    with open(path, encoding="utf-8") as f:
        content = f.read()

    meta = {
        "elapsed": "—", "input_tokens": "—", "output_tokens": "—",
        "total_tokens": "—", "cost_usd": "—", "cost_inr": "—", "model": "—",
    }

    # Parse markdown table rows like:  | Time taken | 129.1s |
    field_map = {
        "time taken":    "elapsed",
        "input tokens":  "input_tokens",
        "output tokens": "output_tokens",
        "total tokens":  "total_tokens",
        "cost (usd)":    "cost_usd",
        "cost (inr":     "cost_inr",   # matches "Cost (INR ≈84x)"
        "model":         "model",
    }
    for line in content.splitlines():
        if line.startswith("|"):
            parts = [p.strip() for p in line.strip("|").split("|")]
            if len(parts) >= 2:
                key_raw = parts[0].lower()
                val = parts[1].strip("`").strip()
                for pattern, meta_key in field_map.items():
                    if pattern in key_raw:
                        meta[meta_key] = val
                        break

    # Body = everything after the first "---" separator line
    sep_idx = content.find("\n---\n")
    if sep_idx != -1:
        body = content[sep_idx + 5:].strip()
    else:
        # No metadata table — strip the H1 line and use the rest
        lines = content.splitlines()
        body = "\n".join(lines[1:]).strip()

    return {"meta": meta, "body": body}


@st.cache_data
def load_brands() -> list[dict]:
    """
    Returns list of brand dicts, sorted by BRAND_NAMES key order.
    Each: { slug, name, url, openai: {meta, body}, gemini: {meta, body} }
    Missing file → provider entry is None.
    """
    brands = []
    seen = set()
    for fname in os.listdir(RESEARCH_DIR):
        if not fname.endswith("-openai.md"):
            continue
        slug = fname[: -len("-openai.md")]
        if slug in seen:
            continue
        seen.add(slug)

        openai_path = os.path.join(RESEARCH_DIR, f"{slug}-openai.md")
        gemini_path = os.path.join(RESEARCH_DIR, f"{slug}-gemini.md")

        brands.append({
            "slug": slug,
            "name": BRAND_NAMES.get(slug, slug.replace("-", " ").title()),
            "url":  BRAND_URLS.get(slug, slug),
            "openai": parse_file(openai_path) if os.path.exists(openai_path) else None,
            "gemini": parse_file(gemini_path) if os.path.exists(gemini_path) else None,
        })

    # Sort by the order in BRAND_NAMES; unknowns go last
    order = list(BRAND_NAMES.keys())
    brands.sort(key=lambda b: order.index(b["slug"]) if b["slug"] in order else 999)
    return brands
```

- [ ] **Step 2: Verify the file parses correctly by running a quick sanity check**

```bash
cd brand-scrape-result-comparison
python -c "
import app
brands = app.load_brands()
for b in brands:
    print(b['slug'], b['openai']['meta']['elapsed'], b['gemini']['meta']['elapsed'])
"
```

Expected output (times will vary):
```
yuvabestudios-com — —
bevolve-ai — —
matrimandir-org 112.0s 36.3s
prakritisattva-com ...
buglerock-asia 129.1s 37.4s
```

(yuvabestudios and bevolve don't have the metadata table in their files — that's correct, shows "—")

---

## Task 3: CSS + page config

**Files:**
- Modify: `brand-scrape-result-comparison/app.py` (append after the load_brands function)

- [ ] **Step 1: Add page config and CSS injection**

Append to `app.py`:

```python
# ---------------------------------------------------------------------------
# Page config + CSS
# ---------------------------------------------------------------------------

st.set_page_config(
    page_title="Brand Research Comparison",
    page_icon="🔍",
    layout="wide",
)

st.markdown("""
<style>
/* Max content width */
.block-container { max-width: 1200px; padding-top: 2rem; }

/* Brand card */
.brand-card {
    border: 1px solid #e0e0e0;
    border-radius: 10px;
    padding: 1.2rem 1.4rem;
    margin-bottom: 0.5rem;
    background: #fff;
    transition: box-shadow 0.15s;
}
.brand-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.08); }

/* Provider column header bars */
.openai-header {
    border-top: 4px solid #10a37f;
    border-radius: 6px 6px 0 0;
    padding: 0.6rem 1rem;
    background: #f0faf6;
    font-weight: 700;
    margin-bottom: 0.5rem;
}
.gemini-header {
    border-top: 4px solid #4285f4;
    border-radius: 6px 6px 0 0;
    padding: 0.6rem 1rem;
    background: #f0f4ff;
    font-weight: 700;
    margin-bottom: 0.5rem;
}

/* Verdict box */
.verdict-box {
    background: #fffbea;
    border-left: 4px solid #f59e0b;
    border-radius: 0 8px 8px 0;
    padding: 1rem 1.4rem;
    margin-top: 1rem;
}

/* Meta info row */
.meta-box {
    background: #f8f9fa;
    border-radius: 8px;
    padding: 0.8rem 1.2rem;
    font-size: 0.85rem;
    color: #444;
}
</style>
""", unsafe_allow_html=True)
```

- [ ] **Step 2: Verify the app starts without error**

```bash
cd brand-scrape-result-comparison
streamlit run app.py
```

Expected: App opens in browser, blank white page (no content rendered yet — that's fine). No Python errors in terminal.

---

## Task 4: Homepage — model comparison section

**Files:**
- Modify: `brand-scrape-result-comparison/app.py` (append)

- [ ] **Step 1: Add the render_homepage function with the analysis card**

Append to `app.py`:

```python
# ---------------------------------------------------------------------------
# Homepage
# ---------------------------------------------------------------------------

def render_homepage(brands: list[dict]) -> None:
    st.title("🔍 Brand Research Viewer")
    st.caption("GPT-5 vs Gemini 3.1 Pro Preview — how do they compare on real brand websites?")
    st.divider()

    # ── Model comparison card ──────────────────────────────────────────────
    st.subheader("Model Comparison")

    col_oai, col_gem = st.columns(2)

    with col_oai:
        st.markdown('<div class="openai-header">GPT-5 &nbsp;·&nbsp; gpt-5</div>', unsafe_allow_html=True)
        st.markdown("""
**✅ Advantages**
- Crawls 10–14 pages per brand (vs 5–7 for Gemini)
- Rich verbatim quotes pulled directly from the site
- Every claim has an inline source citation `([domain](url))`
- Thorough compliance section — catches SEBI reg numbers, tax clauses, footer disclaimers
- Picks up specific operational details: dates, pricing tiers, CIN numbers

**❌ Disadvantages**
- Slow — 112–129s average per brand
- Very high token usage — 60k–88k input tokens per brand
- Higher cost — ~$0.06–0.08 per brand (~₹5–7)
""")

    with col_gem:
        st.markdown('<div class="gemini-header">Gemini &nbsp;·&nbsp; gemini-3.1-pro-preview</div>', unsafe_allow_html=True)
        st.markdown("""
**✅ Advantages**
- 3–4× faster — 36–37s average per brand
- ~70% cheaper per brand (~$0.018–0.020 / ₹1.5–1.7)
- Clean narrative prose — easier to read and share
- Better structural formatting — clear bold headers and bullet hierarchies
- Low token usage — 700–1,600 input tokens per brand

**❌ Disadvantages**
- Crawls fewer pages — misses sub-pages (e.g. BugleRock PMS portfolio detail)
- Paraphrases more than quoting verbatim
- Social links sometimes listed without actual URLs
- Compliance section thinner — misses specific regulatory identifiers
""")

    st.markdown("""
<div class="verdict-box">
<strong>Verdict:</strong> Use <strong>GPT-5</strong> when you need forensic-level detail and compliance accuracy
— e.g. feeding into the CreativeOS KB where missing a blocked word causes a brand violation.
Use <strong>Gemini</strong> when you need a fast, clean, readable brief — a first-pass overview
or something to share with a client or stakeholder.
</div>
""", unsafe_allow_html=True)

    st.divider()
```

- [ ] **Step 2: Verify in browser**

```bash
streamlit run app.py
```

Expected: Two-column model comparison card renders with green/blue header bars and a yellow verdict box. No brand grid yet.

---

## Task 5: Homepage — brand grid

**Files:**
- Modify: `brand-scrape-result-comparison/app.py` (append inside `render_homepage`, after the verdict box)

- [ ] **Step 1: Add the brand grid section inside render_homepage**

Append inside `render_homepage`, after the `st.divider()` at the end of Task 4:

```python
    # ── Brand grid ────────────────────────────────────────────────────────
    st.subheader("Brands")

    cols = st.columns(3)
    for i, brand in enumerate(brands):
        with cols[i % 3]:
            st.markdown(f"""
<div class="brand-card">
  <strong>{brand['name']}</strong><br>
  <span style="color:#888;font-size:0.85rem">{brand['url']}</span>
</div>
""", unsafe_allow_html=True)
            if st.button("View Comparison →", key=f"brand_{brand['slug']}"):
                st.session_state.selected_brand = brand["slug"]
                st.rerun()
```

- [ ] **Step 2: Verify brand cards render**

```bash
streamlit run app.py
```

Expected: 5 brand cards in a 3-column grid beneath the analysis. Clicking "View Comparison →" should rerun (detail view not yet implemented — blank page is fine).

---

## Task 6: Brand detail view

**Files:**
- Modify: `brand-scrape-result-comparison/app.py` (append new function)

- [ ] **Step 1: Add render_brand_detail function**

Append to `app.py`:

```python
# ---------------------------------------------------------------------------
# Brand detail view
# ---------------------------------------------------------------------------

def render_brand_detail(brand: dict) -> None:
    if st.button("← Back to Home"):
        del st.session_state.selected_brand
        st.rerun()

    st.title(f"{brand['name']} — {brand['url']}")
    st.divider()

    # ── Metadata row ──────────────────────────────────────────────────────
    meta_col_oai, meta_col_gem = st.columns(2)

    def fmt_meta(provider_data: dict | None, label: str, model: str) -> str:
        if provider_data is None:
            return f"**{label}** — file not found"
        m = provider_data["meta"]
        return (
            f"**{label}** &nbsp;·&nbsp; `{m['model'] if m['model'] != '—' else model}`  \n"
            f"⏱ {m['elapsed']} &nbsp;·&nbsp; "
            f"🔢 {m['input_tokens']} in / {m['output_tokens']} out &nbsp;·&nbsp; "
            f"💰 {m['cost_usd']} / {m['cost_inr']}"
        )

    with meta_col_oai:
        st.markdown(
            f'<div class="meta-box">{fmt_meta(brand["openai"], "GPT-5", "gpt-5")}</div>',
            unsafe_allow_html=True,
        )

    with meta_col_gem:
        st.markdown(
            f'<div class="meta-box">{fmt_meta(brand["gemini"], "Gemini", "gemini-3.1-pro-preview")}</div>',
            unsafe_allow_html=True,
        )

    st.divider()

    # ── Side-by-side content ──────────────────────────────────────────────
    content_col_oai, content_col_gem = st.columns(2)

    with content_col_oai:
        st.markdown('<div class="openai-header">GPT-5 Research</div>', unsafe_allow_html=True)
        if brand["openai"]:
            st.markdown(brand["openai"]["body"])
        else:
            st.warning("OpenAI file not found.")

    with content_col_gem:
        st.markdown('<div class="gemini-header">Gemini Research</div>', unsafe_allow_html=True)
        if brand["gemini"]:
            st.markdown(brand["gemini"]["body"])
        else:
            st.warning("Gemini file not found.")
```

- [ ] **Step 2: Verify in browser**

Click any brand card on the homepage. Expected:
- Back button appears top-left
- Brand name + URL as page title
- Two metadata boxes (cost, time, tokens)
- Two columns of rendered Markdown side by side
- Back button returns to homepage

---

## Task 7: Main entrypoint — wire everything together

**Files:**
- Modify: `brand-scrape-result-comparison/app.py` (append at the bottom)

- [ ] **Step 1: Add the main block**

Append to the very end of `app.py`:

```python
# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    brands = load_brands()

    if "selected_brand" in st.session_state:
        slug = st.session_state.selected_brand
        brand = next((b for b in brands if b["slug"] == slug), None)
        if brand:
            render_brand_detail(brand)
        else:
            st.error(f"Brand '{slug}' not found.")
            del st.session_state.selected_brand
            st.rerun()
    else:
        render_homepage(brands)


main()
```

- [ ] **Step 2: Full end-to-end test**

```bash
cd brand-scrape-result-comparison
streamlit run app.py
```

Check all of these:
1. Homepage loads — analysis card + 5 brand cards visible
2. Click "View Comparison → " on Yuvabe Studios — detail view loads
3. Both columns show rendered Markdown
4. Metadata row shows times/costs where available, "—" where not
5. Click "← Back to Home" — returns to homepage, all 5 cards visible
6. Repeat for one more brand (e.g. BugleRock) — metadata row shows real values

- [ ] **Step 3: Commit**

```bash
cd ..
git add brand-scrape-result-comparison/
git commit -m "feat: brand scrape result comparison Streamlit viewer"
```

---

## Self-Review Notes

**Spec coverage check:**
- ✅ Standalone folder `brand-scrape-result-comparison/` — Task 1
- ✅ Data loading with metadata parsing + body extraction — Task 2
- ✅ Fallback for files without metadata table (yuvabestudios, bevolve) — Task 2 `parse_file`
- ✅ `BRAND_NAMES` + `BRAND_URLS` dicts — Task 2
- ✅ CSS (card hover, provider header bars, verdict box, meta box) — Task 3
- ✅ Homepage: two-column analysis card — Task 4
- ✅ Advantages / disadvantages hardcoded — Task 4
- ✅ Verdict block with yellow background — Task 4
- ✅ Brand grid 3 columns, click → session state — Task 5
- ✅ Detail view: back button, title, metadata row, side-by-side Markdown — Task 6
- ✅ Session state routing in main() — Task 7
- ✅ README — Task 1
- ✅ `@st.cache_data` on load_brands — Task 2

**Type/name consistency check:**
- `parse_file` → returns `{"meta": dict, "body": str}` — used as `brand["openai"]["meta"]` and `brand["openai"]["body"]` in Task 6 ✅
- `load_brands` → returns `list[dict]` with keys `slug, name, url, openai, gemini` — used consistently in Tasks 5, 6, 7 ✅
- `render_homepage(brands)` and `render_brand_detail(brand)` — called correctly in `main()` ✅
- Session state key `selected_brand` — set in Task 5, read and deleted in Tasks 6+7 ✅
