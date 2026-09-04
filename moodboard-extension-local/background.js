importScripts("config.js");

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "add-to-moodboard",
    title: "Add image to moodboard",
    contexts: ["image"],
  });
  // Page-level clip for content that isn't an <img> — reels, videos, articles.
  // The server classifies the URL and derives a preview (market ingest).
  chrome.contextMenus.create({
    id: "add-page-to-moodboard",
    title: "Add this page as reference",
    contexts: ["page", "video", "link"],
  });
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

// The one POST both entry points (context menu, hover pill) go through.
// Reads the sticky target; a note rides exactly one clip.
async function postReference(body) {
  const { target, pendingNote } = await chrome.storage.local.get(["target", "pendingNote"]);
  if (!target || !target.boardId) return { ok: false, reason: "no-target" };
  try {
    const res = await fetch(`${APP_BASE_URL}/api/moodboards/${target.boardId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, note: pendingNote || undefined }),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    await chrome.storage.local.remove("pendingNote");
    return { ok: true };
  } catch (e) {
    console.error("[moodboard] add failed:", e);
    return { ok: false };
  }
}

// ── hover pill (content script) ──────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "open-panel") {
    // Must run while the click's user gesture is still live — no awaits first.
    if (sender.tab && sender.tab.windowId != null) {
      chrome.sidePanel
        .open({ windowId: sender.tab.windowId })
        .catch((e) => console.error("[moodboard] side panel open failed:", e));
    }
    return;
  }
  if (msg.type === "clip") {
    // Permalink pill sends pageUrl; the generic image pill sends imageUrl —
    // mirror the two context-menu body shapes exactly.
    const body = msg.imageUrl
      ? { imageUrl: msg.imageUrl, sourceUrl: msg.sourceUrl }
      : { pageUrl: msg.pageUrl, sourceUrl: msg.sourceUrl };
    postReference(body).then(sendResponse);
    return true; // keep sendResponse alive across the async POST
  }
});

// ── context menu ─────────────────────────────────────────────────────────────
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const isImage = info.menuItemId === "add-to-moodboard" && info.srcUrl;
  const isPage = info.menuItemId === "add-page-to-moodboard";
  if (!isImage && !isPage) return;

  // Open the panel FIRST, synchronously, before any `await`. sidePanel.open() may
  // only be called while the click's user gesture is still live, and the first
  // await spends it — so awaiting storage before this call makes it silently fail.
  // Not awaited here for the same reason; Chrome's own sample does it this way.
  if (tab && tab.windowId != null) {
    chrome.sidePanel
      .open({ windowId: tab.windowId })
      .catch((e) => console.error("[moodboard] side panel open failed:", e));
  }

  // For a link context, clip the link's destination; otherwise the page itself.
  const pageUrl = isImage ? undefined : info.linkUrl || info.pageUrl;
  const body = isImage
    ? { imageUrl: info.srcUrl, sourceUrl: info.pageUrl }
    : { pageUrl, sourceUrl: info.pageUrl };

  const { ok, reason } = await postReference(body);
  if (ok) flashBadge("✓", "#16a34a");
  else flashBadge(reason === "no-target" ? "!" : "x", "#b91c1c");
});

function flashBadge(text, color) {
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2000);
}
