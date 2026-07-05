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

// --- Push to canvas ---
const EXT_FROM_MIME = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

function setStatus(msg) {
  statusEl.textContent = msg;
}

async function pushToCanvas() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !/\/clients\/[^/]+\/canvases\/[^/]+/.test(tab.url)) {
    setStatus("Open the canvas you want to push to, then Push.");
    return;
  }
  const origin = new URL(tab.url).origin;
  const { references = [] } = await chrome.storage.local.get("references");
  if (references.length === 0) {
    setStatus("Nothing to push.");
    return;
  }

  setStatus(`Pushing ${references.length}…`);
  const pushedIds = [];
  let failed = 0;

  // Sequential: the server staggers by node count, so requests must not race.
  for (let i = 0; i < references.length; i++) {
    const ref = references[i];
    try {
      const imgResp = await fetch(ref.srcUrl);
      if (!imgResp.ok) throw new Error(`image fetch ${imgResp.status}`);
      const blob = await imgResp.blob();
      const ext = EXT_FROM_MIME[blob.type];
      if (!ext) throw new Error(`unsupported type ${blob.type}`);

      const form = new FormData();
      form.append("file", blob, `reference-${Date.now()}-${i}.${ext}`);
      form.append("canvasUrl", tab.url);
      form.append("sourceUrl", ref.pageUrl ?? "");

      const resp = await fetch(`${origin}/api/ingest-image`, {
        method: "POST",
        body: form,
      });
      if (!resp.ok) throw new Error(`ingest ${resp.status}`);
      pushedIds.push(ref.id);
    } catch (e) {
      failed++;
      console.error("[reference-clipper] push failed", ref.srcUrl, e);
    }
  }

  if (pushedIds.length > 0) {
    const { references: current = [] } = await chrome.storage.local.get(
      "references",
    );
    await chrome.storage.local.set({
      references: current.filter((r) => !pushedIds.includes(r.id)),
    });
    await chrome.tabs.reload(tab.id);
  }
  setStatus(`Pushed ${pushedIds.length}${failed ? `, ${failed} failed` : ""}.`);
}

document.getElementById("push").addEventListener("click", pushToCanvas);
