// Hover-to-clip pill for Instagram posts and YouTube Shorts.
//
// One shared <button> lives on document.documentElement, OUTSIDE the host app's
// DOM tree — React would reconcile away anything we injected inside a post — and
// is repositioned over whichever post/short is under the cursor. Clicking it
// messages background.js, which POSTs through the same ingest path as the
// context-menu clip.
//
// What gets clipped is always a PERMALINK (never image bytes):
//   - IG feed post          → the post's timestamp anchor  (a[href*="/p/"], /reel/)
//   - IG profile grid tile  → the tile itself is that anchor
//   - IG detail page        → location.href                (/p/…, /reel/…, /tv/…)
//   - YouTube Short         → location.href                (updates as you scroll)
// If no permalink is derivable for a hovered element, the pill stays hidden —
// clipping the wrong post silently would be worse than no pill.

const HOST = location.hostname;
const IS_IG = HOST.endsWith("instagram.com");
const IS_YT = HOST.endsWith("youtube.com");

// ── sticky target cache ───────────────────────────────────────────────────────
// Mirrors the side panel's selection so a click can branch on "no board picked"
// without an async round-trip first — chrome.sidePanel.open() must be reached
// while the click's user gesture is still live, and one storage read spends it.
let target = null;
chrome.storage.local.get("target").then(({ target: t }) => {
  target = t ?? null;
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.target) target = changes.target.newValue ?? null;
});

// ── the pill ──────────────────────────────────────────────────────────────────
const pill = document.createElement("button");
pill.type = "button";
pill.className = "cos-clip-pill";
pill.textContent = "+ CreativeOS";
document.documentElement.appendChild(pill);

let clipUrl = null; // permalink the pill will send when clicked
let anchorEl = null; // element the pill is visually attached to
let busy = false; // a clip is in flight — freeze position + ignore hovers

function stripQuery(href) {
  const u = new URL(href, location.origin);
  return u.origin + u.pathname;
}

function show(rect, url, topOffset) {
  clipUrl = url;
  pill.style.top = `${Math.max(rect.top + topOffset, 8)}px`;
  pill.style.right = `${Math.max(window.innerWidth - rect.right + 12, 8)}px`;
  pill.classList.add("is-visible");
}

function hide() {
  if (busy) return;
  anchorEl = null;
  clipUrl = null;
  pill.classList.remove("is-visible");
}

function setState(text, cls) {
  pill.textContent = text;
  pill.classList.remove("is-success", "is-error");
  if (cls) pill.classList.add(cls);
}

// ── per-site: what post is under the cursor? ─────────────────────────────────

// Both Instagram permalink shapes — classic /reel/<id> AND the newer
// username-prefixed /<username>/reel/<id>. Returns the canonical classic form
// (username stripped) or null; /reels/ (browse) and /stories/ can't match.
const IG_PERMALINK = /^\/(?:[^/]+\/)?(p|reel|tv)\/([^/]+)/;

function igPermalink(href) {
  try {
    const u = new URL(href, location.origin);
    const m = u.pathname.match(IG_PERMALINK);
    return m ? `${u.origin}/${m[1]}/${m[2]}/` : null;
  } catch {
    return null;
  }
}

function findInstagramTarget(el) {
  // Profile grid: the hovered tile IS the permalink anchor (either URL shape).
  const tile = el.closest('a[href*="/p/"], a[href*="/reel/"]');
  const tileUrl = tile && igPermalink(tile.getAttribute("href"));
  if (tileUrl) return { container: tile, url: tileUrl };

  // Feed: the post's <article>, permalink on its timestamp anchor.
  const article = el.closest("article");
  if (article) {
    const link = article.querySelector('a[href*="/p/"], a[href*="/reel/"]');
    const linkUrl = link && igPermalink(link.getAttribute("href"));
    if (linkUrl) return { container: article, url: linkUrl };
  }

  // Detail page (/p/…, /reel/…, username-prefixed included): the address bar IS
  // the permalink. Reel pages render without an <article>, so fall back to <main>.
  const pageUrl = igPermalink(location.href);
  if (pageUrl) {
    const container = article ?? el.closest("main");
    if (container) return { container, url: pageUrl };
  }
  return null;
}

function findYouTubeTarget(el) {
  // Shorts only — a regular watch page's URL identifies a video MR probably
  // isn't referencing, and the context menu still covers it.
  if (!location.pathname.startsWith("/shorts/")) return null;
  const player = el.closest("ytd-reel-video-renderer, #shorts-player, #shorts-container");
  if (!player) return null;
  // The address bar tracks the active short as you scroll, so it is the permalink.
  return { container: player, url: stripQuery(location.href) };
}

// ── hover wiring (event delegation — survives SPA re-renders) ────────────────
document.addEventListener(
  "mouseover",
  (e) => {
    if (busy || e.target === pill) return;
    const found = IS_IG ? findInstagramTarget(e.target) : IS_YT ? findYouTubeTarget(e.target) : null;
    if (found) {
      anchorEl = found.container;
      // YT Shorts stack CC/menu/fullscreen in the top-right corner — sit below them.
      show(found.container.getBoundingClientRect(), found.url, IS_YT ? 56 : 12);
    } else if (anchorEl && !anchorEl.contains(e.target)) {
      hide();
    }
  },
  true,
);

// Positions are viewport-fixed, so any scroll invalidates them. Hide rather
// than chase the post — the pill reappears on the next hover.
window.addEventListener("scroll", hide, { passive: true, capture: true });

// ── click → clip ─────────────────────────────────────────────────────────────
function onPillClick() {
  if (busy || !clipUrl) return;

  // Reloading the extension orphans content scripts already injected into open
  // tabs — their chrome.runtime is dead and every sendMessage fails silently.
  // Detect it and say so instead of doing nothing.
  if (!chrome.runtime || !chrome.runtime.id) {
    setState("Reload this page ↻", "is-error");
    return;
  }

  if (!target || !target.boardId) {
    // Single synchronous hop keeps the user gesture alive for sidePanel.open().
    chrome.runtime.sendMessage({ type: "open-panel" });
    setState("Pick a board →", "is-error");
    setTimeout(() => setState("+ CreativeOS"), 2000);
    return;
  }

  busy = true;
  setState("Adding…");
  chrome.runtime.sendMessage({ type: "clip", pageUrl: clipUrl, sourceUrl: clipUrl }, (res) => {
    const err = chrome.runtime.lastError;
    const ok = !err && res && res.ok;
    if (!ok) console.warn("[moodboard] clip failed:", err ? err.message : res);
    setState(ok ? "✓ Added" : "✗ Failed", ok ? "is-success" : "is-error");
    setTimeout(() => {
      busy = false;
      setState("+ CreativeOS");
      hide();
    }, 1600);
  });
}

// Listen on window in the CAPTURE phase, not on the pill: IG and YT register
// capture-phase handlers on document that can stopPropagation before an event
// reaches an element their app doesn't know about. Window capture runs before
// document capture, so the pill always hears its click — and stopping the event
// here keeps the site from ALSO acting on it (opening the post, toggling
// play/pause under the pill).
window.addEventListener(
  "click",
  (e) => {
    if (e.target !== pill) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    onPillClick();
  },
  true,
);
// Swallow the paired down/up too — YouTube's player reacts to those on its own.
for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup"]) {
  window.addEventListener(
    type,
    (e) => {
      if (e.target === pill) e.stopImmediatePropagation();
    },
    true,
  );
}
