/* Morgan · Action Items — frontend
 *
 * Two views in a single page:
 *   - actions: MC tasks grouped into 3 sections
 *   - agenda:  today's events across all calendars (cached)
 *
 * Boots the Telegram WebApp SDK, validates initData against the edge
 * function for every fetch, and uses Telegram's BackButton API for
 * navigation between views. */

const API_BASE = "https://jeqmvhxbjyzbozcipzlf.supabase.co/functions/v1/mc_actions_mini_app";
const API_LIST = `${API_BASE}/list`;
const API_AGENDA = `${API_BASE}/agenda`;
const API_TRANSITION = (id) => `${API_BASE}/tasks/${id}/transition`;
const MC_TASK_URL = (id) => `https://mc.buyerson.co/tasks/${id}`;

const SECTION_ORDER = [
  { key: "needs_decision", label: "Needs your decision", emoji: "🔴" },
  { key: "in_progress",    label: "Morgan is working on", emoji: "🟠" },
  { key: "review",         label: "Ready for your review", emoji: "🔵" },
];

const tg = window.Telegram?.WebApp;

const titleEl = document.getElementById("page-title");
const refreshBtn = document.getElementById("refresh");
const viewActionsEl = document.getElementById("view-actions");
const viewAgendaEl = document.getElementById("view-agenda");
const actionsBodyEl = document.getElementById("actions-body");
const agendaBodyEl = document.getElementById("agenda-body");
const agendaLinkEl = document.getElementById("agenda-link");
const agendaLinkSubEl = document.getElementById("agenda-link-sub");

let currentView = "actions";

/* ───────────────────────────── utilities ───────────────────────────── */

function relativeTime(iso) {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function fmtTime(iso, allDay) {
  if (allDay) return "All day";
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function fmtLongDate(iso) {
  const d = iso ? new Date(`${iso}T12:00:00`) : new Date();
  return d.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

async function jsonFetch(url, opts = {}) {
  const initData = tg?.initData ?? "";
  if (!initData) throw new Error("Open this from Telegram.");
  const res = await fetch(url, {
    ...opts,
    headers: {
      ...(opts.headers ?? {}),
      "x-init-data": initData,
    },
  });
  const body = await res.json().catch(() => ({ ok: false, error: "bad_json" }));
  if (!res.ok || !body.ok) throw new Error(body.error || `http_${res.status}`);
  return body;
}

/* ──────────────────────────── view routing ─────────────────────────── */

function showView(view) {
  currentView = view;
  if (view === "actions") {
    viewActionsEl.hidden = false;
    viewAgendaEl.hidden = true;
    titleEl.textContent = "Action Items";
    if (tg?.BackButton) tg.BackButton.hide();
  } else if (view === "agenda") {
    viewActionsEl.hidden = true;
    viewAgendaEl.hidden = false;
    titleEl.textContent = "My Agenda";
    if (tg?.BackButton) {
      tg.BackButton.onClick(() => showView("actions"));
      tg.BackButton.show();
    }
  }
  window.scrollTo(0, 0);
}

/* ───────────────────────────── actions view ────────────────────────── */

function renderEmpty(text) {
  const tpl = document.getElementById("empty-template").content.cloneNode(true);
  tpl.querySelector("span").textContent = text;
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
    await jsonFetch(API_TRANSITION(task.id), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        to_status: "done",
        note: "Marked done by John via mini app",
      }),
    });
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

async function loadActions() {
  actionsBodyEl.innerHTML = `<div class="state loading"><div class="spinner"></div><p>Loading…</p></div>`;
  refreshBtn.disabled = true;
  try {
    const data = await jsonFetch(API_LIST);
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
    actionsBodyEl.innerHTML = "";
    actionsBodyEl.appendChild(frag);
  } catch (e) {
    actionsBodyEl.innerHTML = `<div class="state error"><p><strong>Couldn't load action items.</strong></p><p>${e.message}</p><p style="margin-top:18px;"><button id="retry-actions" style="padding:10px 18px;border-radius:8px;border:0;background:var(--accent);color:var(--accent-text);font:inherit;cursor:pointer;">Retry</button></p></div>`;
    document.getElementById("retry-actions")?.addEventListener("click", loadActions);
  } finally {
    refreshBtn.disabled = false;
  }
}

/* ───────────────────────────── agenda view ─────────────────────────── */

function renderAgendaEvent(ev) {
  const tpl = document.getElementById("agenda-event-template").content.cloneNode(true);
  const li = tpl.querySelector(".event");

  tpl.querySelector(".event-start").textContent = fmtTime(ev.start, ev.all_day);
  if (!ev.all_day && ev.end) {
    const endText = fmtTime(ev.end, false);
    tpl.querySelector(".event-end").textContent = `→ ${endText}`;
  } else {
    tpl.querySelector(".event-end").remove();
  }

  tpl.querySelector(".event-title").textContent = ev.summary || "(no title)";

  const sourceEl = tpl.querySelector(".event-source");
  const source = ev.source_label || ev.source_account || "Personal";
  sourceEl.textContent = source;
  sourceEl.dataset.source = source;

  if (ev.location) {
    tpl.querySelector(".event-location").textContent = ev.location;
  } else {
    tpl.querySelector(".event-location").remove();
  }

  return tpl;
}

function renderAgendaGroup(title, events) {
  if (events.length === 0) return null;
  const wrap = document.createElement("section");
  wrap.className = "agenda-group";
  const h = document.createElement("h2");
  h.className = "agenda-group-title";
  h.textContent = title;
  wrap.appendChild(h);
  const list = document.createElement("ul");
  list.className = "event-list";
  events.forEach((ev) => list.appendChild(renderAgendaEvent(ev)));
  wrap.appendChild(list);
  return wrap;
}

function freshnessLabel(generatedAt) {
  if (!generatedAt) return { text: "Never refreshed", stale: true };
  const ageMin = (Date.now() - new Date(generatedAt).getTime()) / 60000;
  const isStale = ageMin > 90; // > 1h30m → flag as stale
  const text = `Updated ${relativeTime(generatedAt)}`;
  return { text, stale: isStale };
}

async function loadAgenda() {
  agendaBodyEl.innerHTML = `<div class="state loading"><div class="spinner"></div><p>Loading agenda…</p></div>`;
  refreshBtn.disabled = true;
  try {
    const data = await jsonFetch(API_AGENDA);
    const events = Array.isArray(data.events) ? data.events : [];

    const allDay = events.filter((e) => e.all_day);
    const timed = events.filter((e) => !e.all_day)
      .sort((a, b) => new Date(a.start) - new Date(b.start));

    const head = document.createElement("div");
    head.className = "agenda-head";
    const date = document.createElement("p");
    date.className = "agenda-date";
    date.textContent = fmtLongDate(data.day_iso);
    head.appendChild(date);

    const fresh = freshnessLabel(data.generated_at);
    const pill = document.createElement("span");
    pill.className = `agenda-freshness fresh-dot${fresh.stale ? " stale" : ""}`;
    pill.textContent = fresh.text;
    head.appendChild(pill);

    agendaBodyEl.innerHTML = "";
    agendaBodyEl.appendChild(head);

    if (events.length === 0) {
      const empty = document.createElement("div");
      empty.className = "event-empty";
      empty.innerHTML = `<span class="emoji">☕</span>Nothing on the calendar today.`;
      agendaBodyEl.appendChild(empty);
    } else {
      const allDayGroup = renderAgendaGroup("All day", allDay);
      if (allDayGroup) agendaBodyEl.appendChild(allDayGroup);
      const timedGroup = renderAgendaGroup("Scheduled", timed);
      if (timedGroup) agendaBodyEl.appendChild(timedGroup);
    }

    const footer = document.createElement("div");
    footer.className = "footer";
    const sources = (data.source_accounts ?? []).join(" · ");
    footer.textContent = `From ${sources || "(no accounts)"} · cached by hourly sweep`;
    agendaBodyEl.appendChild(footer);

    // Update the link-on-actions-view subtext too, so when John navigates
    // back the "My Agenda" tile reflects the same freshness.
    if (data.generated_at) {
      const f = freshnessLabel(data.generated_at);
      agendaLinkSubEl.textContent = `${events.length} event${events.length === 1 ? "" : "s"} · ${f.text.toLowerCase()}`;
    }
  } catch (e) {
    agendaBodyEl.innerHTML = `<div class="state error"><p><strong>Couldn't load agenda.</strong></p><p>${e.message}</p><p style="margin-top:18px;"><button id="retry-agenda" style="padding:10px 18px;border-radius:8px;border:0;background:var(--accent);color:var(--accent-text);font:inherit;cursor:pointer;">Retry</button></p></div>`;
    document.getElementById("retry-agenda")?.addEventListener("click", loadAgenda);
  } finally {
    refreshBtn.disabled = false;
  }
}

/* ────────────────────────────── boot ───────────────────────────────── */

if (tg) {
  tg.ready();
  tg.expand();
}

agendaLinkEl.addEventListener("click", () => {
  try { tg?.HapticFeedback?.impactOccurred?.("light"); } catch {}
  showView("agenda");
  loadAgenda();
});

refreshBtn.addEventListener("click", () => {
  try { tg?.HapticFeedback?.impactOccurred?.("light"); } catch {}
  if (currentView === "agenda") loadAgenda();
  else loadActions();
});

// Initial load: actions view + lazy agenda freshness prefetch for the tile.
showView("actions");
loadActions();

// Prefetch agenda metadata so the "My Agenda" tile's subtext shows the
// real freshness immediately, without waiting for John to tap it.
(async () => {
  try {
    const data = await jsonFetch(API_AGENDA);
    const events = Array.isArray(data.events) ? data.events : [];
    const f = freshnessLabel(data.generated_at);
    agendaLinkSubEl.textContent = `${events.length} event${events.length === 1 ? "" : "s"} · ${f.text.toLowerCase()}`;
  } catch {
    // Silent — the tile already has fallback copy.
  }
})();
