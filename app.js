/* Morgan · Action Items — frontend
 *
 * Boots the Telegram WebApp SDK, fetches the section list from the
 * mc_actions_mini_app edge function with the signed initData, and renders
 * three sections (needs decision / in progress / review). Tap a row to
 * expand and see the latest activity note. */

const API_BASE = "https://jeqmvhxbjyzbozcipzlf.supabase.co/functions/v1/mc_actions_mini_app";
const API_LIST = `${API_BASE}/list`;
const API_TRANSITION = (id) => `${API_BASE}/tasks/${id}/transition`;
const MC_TASK_URL = (id) => `https://mc.buyerson.co/tasks/${id}`;

const SECTION_ORDER = [
  { key: "needs_decision", label: "Needs your decision", emoji: "🔴" },
  { key: "in_progress",    label: "Morgan is working on", emoji: "🟠" },
  { key: "review",         label: "Ready for your review", emoji: "🔵" },
];

const tg = window.Telegram?.WebApp;
const appEl = document.getElementById("app");
const refreshBtn = document.getElementById("refresh");

function setState(html) {
  appEl.innerHTML = html;
}

function relativeTime(iso) {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function renderEmpty(text) {
  const tpl = document.getElementById("empty-template").content.cloneNode(true);
  tpl.querySelector("span").textContent = text;
  return tpl;
}

function renderTask(task) {
  const tpl = document.getElementById("task-template").content.cloneNode(true);
  const li = tpl.querySelector(".task");
  li.dataset.priority = task.priority ?? "medium";
  li.dataset.id = task.id;

  tpl.querySelector(".task-title").textContent = task.title;

  const noteTs = task.latest_note?.ts ?? task.updated_at;
  tpl.querySelector(".task-relative").textContent = relativeTime(noteTs);

  if (task.latest_note?.summary) {
    tpl.querySelector(".task-latest").textContent = task.latest_note.summary;
  } else {
    tpl.querySelector(".task-latest").remove();
  }

  if (task.description) {
    tpl.querySelector(".task-desc").textContent = task.description;
  } else {
    tpl.querySelector(".task-desc").remove();
  }

  tpl.querySelector(".task-mc-link").href = MC_TASK_URL(task.id);

  const row = tpl.querySelector(".task-row");
  const expand = tpl.querySelector(".task-expand");
  row.addEventListener("click", () => {
    const isOpen = li.classList.toggle("is-open");
    expand.hidden = !isOpen;
    try { tg?.HapticFeedback?.selectionChanged?.(); } catch {}
  });

  const doneBtn = tpl.querySelector(".task-action-done");
  doneBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    markDone(li, task, doneBtn);
  });

  return tpl;
}

async function markDone(li, task, btn) {
  btn.disabled = true;
  btn.querySelector(".task-action-label").textContent = "Marking…";
  try { tg?.HapticFeedback?.impactOccurred?.("medium"); } catch {}
  try {
    const initData = tg?.initData ?? "";
    const res = await fetch(API_TRANSITION(task.id), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-init-data": initData,
      },
      body: JSON.stringify({
        to_status: "done",
        note: `Marked done by John via mini app`,
      }),
    });
    const body = await res.json().catch(() => ({ ok: false, error: "bad_json" }));
    if (!res.ok || !body.ok) {
      throw new Error(body.error || `http_${res.status}`);
    }
    // Success → animate out, then remove + update section count + maybe show
    // the empty-state if this was the last task in the section.
    li.classList.add("is-removing");
    try { tg?.HapticFeedback?.notificationOccurred?.("success"); } catch {}
    setTimeout(() => collapseAfterRemoval(li), 400);
  } catch (e) {
    btn.disabled = false;
    btn.querySelector(".task-action-label").textContent = "Mark done";
    try { tg?.HapticFeedback?.notificationOccurred?.("error"); } catch {}
    alert(`Couldn't mark done: ${e.message}`);
  }
}

function collapseAfterRemoval(li) {
  const list = li.parentElement;
  const section = list?.closest(".section");
  li.remove();
  // Decrement section count + show empty state if list is now empty.
  if (section) {
    const remaining = list.querySelectorAll(".task:not(.task-empty)").length;
    const countEl = section.querySelector(".section-count");
    if (countEl) countEl.textContent = `${remaining}`;
    if (remaining === 0) {
      const sectionEmoji = section.querySelector(".section-emoji")?.textContent;
      const key = sectionEmoji === "🔴" ? "needs_decision"
        : sectionEmoji === "🟠" ? "in_progress"
        : sectionEmoji === "🔵" ? "review" : "default";
      list.innerHTML = "";
      list.appendChild(renderEmpty(emptyCopy(key)));
    }
  }
}

function renderSection({ key, label, emoji }, tasks) {
  const tpl = document.getElementById("section-template").content.cloneNode(true);
  tpl.querySelector(".section-emoji").textContent = emoji;
  tpl.querySelector(".section-label").textContent = label;
  tpl.querySelector(".section-count").textContent = `${tasks.length}`;
  const list = tpl.querySelector(".task-list");

  if (tasks.length === 0) {
    list.appendChild(renderEmpty(emptyCopy(key)));
  } else {
    tasks.forEach((t) => list.appendChild(renderTask(t)));
  }
  return tpl;
}

function emptyCopy(key) {
  switch (key) {
    case "needs_decision": return "Nothing waiting on you.";
    case "in_progress":    return "Morgan isn't actively working on anything.";
    case "review":         return "No items ready for review.";
    default:               return "Nothing here.";
  }
}

async function fetchList() {
  const initData = tg?.initData ?? "";
  if (!initData) {
    throw new Error("This page must be opened from Telegram.");
  }
  const res = await fetch(API_LIST, {
    method: "GET",
    headers: { "x-init-data": initData },
  });
  const body = await res.json().catch(() => ({ ok: false, error: "bad_json" }));
  if (!res.ok || !body.ok) {
    const code = body.error || `http_${res.status}`;
    throw new Error(code);
  }
  return body;
}

async function load() {
  setState(`<div class="state loading"><div class="spinner"></div><p>Loading…</p></div>`);
  refreshBtn.disabled = true;
  try {
    const data = await fetchList();
    const frag = document.createDocumentFragment();
    for (const meta of SECTION_ORDER) {
      const tasks = data.sections?.[meta.key] ?? [];
      frag.appendChild(renderSection(meta, tasks));
    }
    const footer = document.createElement("div");
    footer.className = "footer";
    const stamp = data.generated_at ? new Date(data.generated_at).toLocaleTimeString() : "";
    footer.textContent = `Updated ${stamp} · Morgan`;
    frag.appendChild(footer);
    appEl.innerHTML = "";
    appEl.appendChild(frag);
  } catch (e) {
    setState(`<div class="state error"><p><strong>Couldn't load action items.</strong></p><p>${e.message}</p><p style="margin-top:18px;"><button id="retry" style="padding:10px 18px;border-radius:8px;border:0;background:var(--accent);color:var(--accent-text);font:inherit;cursor:pointer;">Retry</button></p></div>`);
    document.getElementById("retry")?.addEventListener("click", load);
  } finally {
    refreshBtn.disabled = false;
  }
}

// Boot
if (tg) {
  tg.ready();
  tg.expand();
}

refreshBtn.addEventListener("click", () => {
  try { tg?.HapticFeedback?.impactOccurred?.("light"); } catch {}
  load();
});

load();
