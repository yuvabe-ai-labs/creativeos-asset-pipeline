const clientSel = document.getElementById("client");
const boardsEl = document.getElementById("boards");
const currentEl = document.getElementById("current");
const statusEl = document.getElementById("status");
let clients = [];
let currentTarget = null; // mirrors chrome.storage.local "target"

function text(el, value) {
  el.textContent = value;
}

function showCurrent() {
  text(
    currentEl,
    currentTarget && currentTarget.boardId
      ? `Sending to: ${currentTarget.clientName} / ${currentTarget.boardName}`
      : "No board selected — pick one below.",
  );
}

function renderBoards() {
  const c = clients[clientSel.value];
  boardsEl.replaceChildren();
  if (!c) return;
  if (!c.boards.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "No boards for this client yet — create one in the app.";
    boardsEl.appendChild(p);
    return;
  }
  for (const b of c.boards) {
    const btn = document.createElement("button");
    const selected = currentTarget && currentTarget.boardId === b.id;
    btn.className = "board" + (selected ? " is-selected" : "");
    btn.textContent = b.name;
    btn.addEventListener("click", () => {
      currentTarget = { boardId: b.id, boardName: b.name, clientName: c.name, clientSlug: c.slug };
      chrome.storage.local.set({ target: currentTarget });
      showCurrent();
      renderBoards(); // move the highlight
    });
    boardsEl.appendChild(btn);
  }
}

async function load() {
  text(statusEl, "Loading…");
  const { target } = await chrome.storage.local.get("target");
  currentTarget = target ?? null;
  try {
    const res = await fetch(`${APP_BASE_URL}/api/moodboards`);
    if (!res.ok) throw new Error("HTTP " + res.status);
    clients = (await res.json()).clients || [];
    clientSel.replaceChildren();
    clients.forEach((c, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = c.name;
      clientSel.appendChild(opt);
    });
    // Reopen on the client that owns the sticky target, not client #0.
    // (clientSlug was added to the stored target later — fall back to name.)
    const idx = clients.findIndex(
      (c) =>
        currentTarget && (c.slug === currentTarget.clientSlug || c.name === currentTarget.clientName),
    );
    if (idx >= 0) clientSel.value = String(idx);
    renderBoards();
    text(statusEl, "");
  } catch (e) {
    text(statusEl, `Couldn't load. Is CreativeOS running at ${APP_BASE_URL}? (${e.message})`);
  }
  showCurrent();
}

// The note rides exactly one clip: background.js reads pendingNote on a clip,
// sends it with the reference, then clears it.
const noteEl = document.getElementById("note");
noteEl.addEventListener("input", () => {
  chrome.storage.local.set({ pendingNote: noteEl.value.trim() });
});
chrome.storage.local.get("pendingNote").then(({ pendingNote }) => {
  if (pendingNote) noteEl.value = pendingNote;
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.pendingNote && changes.pendingNote.newValue === undefined) {
    noteEl.value = ""; // cleared after a successful clip
  }
  // A clip from the hover pill can change nothing here, but if another window's
  // panel switched the target, stay truthful.
  if (changes.target) {
    currentTarget = changes.target.newValue ?? null;
    showCurrent();
    renderBoards();
  }
});

// Which server this build talks to — fixed per folder (prod vs local), shown
// read-only so a mis-loaded build is visible at a glance.
text(document.getElementById("server"), `Server: ${APP_BASE_URL.replace(/^https?:\/\//, "")}`);

clientSel.addEventListener("change", renderBoards);
document.getElementById("refresh").addEventListener("click", load);
load();
