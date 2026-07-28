const clientSel = document.getElementById("client");
const boardsEl = document.getElementById("boards");
const currentEl = document.getElementById("current");
const statusEl = document.getElementById("status");
let clients = [];

function text(el, value) {
  el.textContent = value;
}

async function showCurrent() {
  const { target } = await chrome.storage.local.get("target");
  text(
    currentEl,
    target && target.boardId
      ? `Sending to: ${target.clientName} / ${target.boardName}`
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
    btn.className = "board";
    btn.textContent = b.name;
    btn.addEventListener("click", () => {
      chrome.storage.local.set(
        { target: { boardId: b.id, boardName: b.name, clientName: c.name } },
        showCurrent,
      );
    });
    boardsEl.appendChild(btn);
  }
}

async function load() {
  text(statusEl, "Loading…");
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
    renderBoards();
    text(statusEl, "");
  } catch (e) {
    text(statusEl, `Couldn't load. Is CreativeOS running at ${APP_BASE_URL}? (${e.message})`);
  }
  showCurrent();
}

clientSel.addEventListener("change", renderBoards);
document.getElementById("refresh").addEventListener("click", load);
load();
