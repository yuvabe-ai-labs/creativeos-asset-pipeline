// sidepanel.js — renders the collected references. Each card can be inserted onto
// the active canvas or removed; a global "Push to canvas" inserts them all at once.
const listEl = document.getElementById("list");
const statusEl = document.getElementById("status");

const EXT_FROM_MIME = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

function setStatus(msg) {
  statusEl.textContent = msg;
}

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

    const actions = document.createElement("div");
    actions.className = "actions";

    const insert = document.createElement("button");
    insert.className = "insert";
    insert.textContent = "Insert to canvas";
    insert.addEventListener("click", () => insertRef(ref.id));
    actions.appendChild(insert);

    const remove = document.createElement("button");
    remove.className = "remove";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => removeRef(ref.id));
    actions.appendChild(remove);

    card.appendChild(actions);
    listEl.appendChild(card);
  }
}

async function removeRef(id) {
  await removeFromStorage([id]);
}

async function removeFromStorage(ids) {
  const { references = [] } = await chrome.storage.local.get("references");
  await chrome.storage.local.set({
    references: references.filter((r) => !ids.includes(r.id)),
  });
}

// Resolve the active tab if it's a canvas page; otherwise set a hint and return null.
async function getActiveCanvasTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !/\/clients\/[^/]+\/canvases\/[^/]+/.test(tab.url)) {
    setStatus("Open the canvas you want to insert into, then try again.");
    return null;
  }
  return { tab, origin: new URL(tab.url).origin };
}

// Upload one reference to the canvas. Throws on failure.
async function ingestRef(ref, tab, origin, index = 0) {
  const imgResp = await fetch(ref.srcUrl);
  if (!imgResp.ok) throw new Error(`image fetch ${imgResp.status}`);
  const blob = await imgResp.blob();
  const ext = EXT_FROM_MIME[blob.type];
  if (!ext) throw new Error(`unsupported type ${blob.type}`);

  const form = new FormData();
  form.append("file", blob, `reference-${Date.now()}-${index}.${ext}`);
  form.append("canvasUrl", tab.url);
  form.append("sourceUrl", ref.pageUrl ?? "");

  const resp = await fetch(`${origin}/api/ingest-image`, {
    method: "POST",
    body: form,
  });
  if (!resp.ok) throw new Error(`ingest ${resp.status}`);
}

// Per-image action: insert just this reference, then reload the canvas tab.
async function insertRef(id) {
  const target = await getActiveCanvasTab();
  if (!target) return;
  const { references = [] } = await chrome.storage.local.get("references");
  const ref = references.find((r) => r.id === id);
  if (!ref) return;

  setStatus("Inserting…");
  try {
    await ingestRef(ref, target.tab, target.origin);
    await removeFromStorage([id]);
    await chrome.tabs.reload(target.tab.id);
    setStatus("Inserted.");
  } catch (e) {
    console.error("[reference-clipper] insert failed", ref.srcUrl, e);
    setStatus("Insert failed — see console.");
  }
}

// Global action: insert every reference, then reload the canvas tab once.
async function pushToCanvas() {
  const target = await getActiveCanvasTab();
  if (!target) return;
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
      await ingestRef(ref, target.tab, target.origin, i);
      pushedIds.push(ref.id);
    } catch (e) {
      failed++;
      console.error("[reference-clipper] push failed", ref.srcUrl, e);
    }
  }

  if (pushedIds.length > 0) {
    await removeFromStorage(pushedIds);
    await chrome.tabs.reload(target.tab.id);
  }
  setStatus(`Pushed ${pushedIds.length}${failed ? `, ${failed} failed` : ""}.`);
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
document.getElementById("push").addEventListener("click", pushToCanvas);
