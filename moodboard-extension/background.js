importScripts("config.js");

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "add-to-moodboard",
    title: "Add image to moodboard",
    contexts: ["image"],
  });
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "add-to-moodboard" || !info.srcUrl) return;

  const { target } = await chrome.storage.local.get("target");
  if (!target || !target.boardId) {
    if (tab && tab.windowId != null) {
      chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
    }
    flashBadge("!", "#b91c1c");
    return;
  }

  try {
    const res = await fetch(`${APP_BASE_URL}/api/moodboards/${target.boardId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: info.srcUrl, sourceUrl: info.pageUrl }),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
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
