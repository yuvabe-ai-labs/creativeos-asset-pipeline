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

  const { target, pendingNote } = await chrome.storage.local.get(["target", "pendingNote"]);
  if (!target || !target.boardId) {
    flashBadge("!", "#b91c1c");
    return;
  }

  // For a link context, clip the link's destination; otherwise the page itself.
  const pageUrl = isImage ? undefined : info.linkUrl || info.pageUrl;
  const body = isImage
    ? { imageUrl: info.srcUrl, sourceUrl: info.pageUrl, note: pendingNote || undefined }
    : { pageUrl, sourceUrl: info.pageUrl, note: pendingNote || undefined };

  try {
    const res = await fetch(`${APP_BASE_URL}/api/moodboards/${target.boardId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    await chrome.storage.local.remove("pendingNote"); // a note rides exactly one clip
    flashBadge("✓", "#16a34a");
  } catch (e) {
    flashBadge("x", "#b91c1c");
    console.error("[moodboard] add failed:", e);
  }
});

function flashBadge(text, color) {
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2000);
}
