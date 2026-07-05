// background.js — a right-click "Add reference" menu that collects the clicked
// image into chrome.storage.local. The side panel reads that collection.
const MENU_ID = "creativeos-add-reference";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Add reference",
    contexts: ["image"],
  });
  // Clicking the toolbar icon opens the side panel.
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !info.srcUrl) return;
  const ref = {
    id: crypto.randomUUID(),
    srcUrl: info.srcUrl,
    pageUrl: info.pageUrl ?? tab?.url ?? "",
    pageTitle: tab?.title ?? "",
    capturedAt: Date.now(),
  };
  const { references = [] } = await chrome.storage.local.get("references");
  references.push(ref);
  await chrome.storage.local.set({ references });
});
