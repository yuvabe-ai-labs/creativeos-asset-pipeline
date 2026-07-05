// sidepanel.js — renders the collected references and lets you remove them.
// (Push is added in the next task.)
const listEl = document.getElementById("list");
const statusEl = document.getElementById("status");

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return url || "unknown";
  }
}

function render(references) {
  listEl.innerHTML = "";
  if (references.length === 0) {
    listEl.innerHTML =
      '<p class="empty">Right-click any image and choose “Add reference”.</p>';
    return;
  }
  for (const ref of references) {
    const card = document.createElement("div");
    card.className = "card";

    const img = document.createElement("img");
    img.src = ref.srcUrl;
    img.alt = ref.pageTitle || "reference";
    card.appendChild(img);

    const meta = document.createElement("div");
    meta.className = "meta";
    const link = document.createElement("a");
    link.href = ref.pageUrl;
    link.target = "_blank";
    link.textContent = hostOf(ref.pageUrl);
    meta.appendChild(link);
    card.appendChild(meta);

    const remove = document.createElement("button");
    remove.className = "remove";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => removeRef(ref.id));
    card.appendChild(remove);

    listEl.appendChild(card);
  }
}

async function removeRef(id) {
  const { references = [] } = await chrome.storage.local.get("references");
  await chrome.storage.local.set({
    references: references.filter((r) => r.id !== id),
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.references) {
    render(changes.references.newValue ?? []);
  }
});

async function load() {
  const { references = [] } = await chrome.storage.local.get("references");
  render(references);
}

load();
