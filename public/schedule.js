/* ── selectors ── */
const dbStatus = document.getElementById("db-status");
const userRoleBadge = document.getElementById("user-role-badge");
const btnLogout = document.getElementById("btn-logout");
const btnRefresh = document.getElementById("btn-refresh");

const scheduleTable = document.getElementById("schedule-table");
const scheduleTbody = document.getElementById("schedule-tbody");
const scheduleLoading = document.getElementById("schedule-loading");
const scheduleError = document.getElementById("schedule-error");
const scheduleEmpty = document.getElementById("schedule-empty");
const schedActionHeading = document.getElementById("sched-action-heading");

const createSessionCard = document.getElementById("create-session-card");
const sessionForm = document.getElementById("session-form");
const selGroup = document.getElementById("sel-group");
const selDate = document.getElementById("sel-date");
const selStart = document.getElementById("sel-start");
const selEnd = document.getElementById("sel-end");
const selLocation = document.getElementById("sel-location");
const repeatWeekly = document.getElementById("repeat-weekly");
const repeatCount = document.getElementById("repeat-count");
const sessionError = document.getElementById("session-error");
const btnAddSession = document.getElementById("btn-add-session");

const createGroupCard = document.getElementById("create-group-card");
const groupForm = document.getElementById("group-form");
const groupName = document.getElementById("group-name");
const groupLevel = document.getElementById("group-level");
const groupError = document.getElementById("group-error");

let currentUser = null;
let sessionsById = new Map();

/* ── helpers ── */
function show(el) {
  el.classList.remove("hidden");
}
function hide(el) {
  el.classList.add("hidden");
}

function getToken() {
  return localStorage.getItem("swimsyncToken");
}

function clearSession() {
  localStorage.removeItem("swimsyncToken");
  localStorage.removeItem("swimsyncUser");
}

function redirectToLogin() {
  clearSession();
  window.location.href = "/";
}

function escHtml(str) {
  return String(str || "—")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showErr(el, msg) {
  el.textContent = msg;
  show(el);
}

function formatDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatTime(t) {
  if (!t) return "—";
  const [h, m] = t.split(":");
  const hr = Number(h);
  return `${hr % 12 || 12}:${m} ${hr < 12 ? "AM" : "PM"}`;
}

function toDateInputValue(d) {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

function toTimeInputValue(t) {
  if (!t) return "";
  return String(t).slice(0, 5);
}

async function safeJson(res) {
  const text = await res.text();
  if (!text || !text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function apiFetch(url, options = {}) {
  const token = getToken();
  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${token}`,
  };
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    redirectToLogin();
    throw new Error("Session expired");
  }
  return response;
}

/* ── health check ── */
async function checkHealth() {
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    dbStatus.textContent = `✓ DB connected — ${new Date(data.dbTime).toLocaleTimeString()}`;
    dbStatus.className = "badge ok";
  } catch {
    dbStatus.textContent = "✗ DB connection failed";
    dbStatus.className = "badge fail";
  }
}

/* ── load groups into select ── */
async function loadGroups() {
  try {
    const res = await apiFetch("/api/practice-groups");
    const groups = await res.json();
    selGroup.innerHTML = groups.length
      ? groups
          .map(
            (g) =>
              `<option value="${g.id}">${escHtml(g.group_name)} (${escHtml(g.level || "—")})</option>`,
          )
          .join("")
      : `<option value="">No groups yet — create one below</option>`;
  } catch {
    selGroup.innerHTML = `<option value="">Failed to load groups</option>`;
  }
}

/* ── load schedule ── */
async function loadSchedule() {
  hide(scheduleError);
  hide(scheduleEmpty);
  hide(scheduleTable);
  show(scheduleLoading);
  btnRefresh.disabled = true;

  try {
    const res = await apiFetch("/api/schedule");
    const sessions = await res.json();
    scheduleTbody.innerHTML = "";
    sessionsById = new Map();

    if (!sessions.length) {
      hide(scheduleLoading);
      show(scheduleEmpty);
      return;
    }

    const canEdit =
      currentUser &&
      (currentUser.role === "admin" || currentUser.role === "coach");

    sessions.forEach((s, i) => {
      sessionsById.set(String(s.id), s);
      const action = canEdit
        ? `<div class="table-actions">
             <button class="btn btn-secondary" data-action="edit" data-id="${s.id}">Edit</button>
             <button class="btn btn-danger" data-action="remove" data-id="${s.id}">Remove</button>
           </div>`
        : '<span class="muted-inline">View only</span>';
      const tr = document.createElement("tr");
      tr.dataset.id = s.id;
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${formatDate(s.practice_date)}</td>
        <td>${escHtml(s.group_name)}</td>
        <td>${escHtml(s.level)}</td>
        <td>${formatTime(s.start_time)}</td>
        <td>${formatTime(s.end_time)}</td>
        <td>${escHtml(s.location)}</td>
        <td>${action}</td>`;
      scheduleTbody.appendChild(tr);
    });

    hide(scheduleLoading);
    show(scheduleTable);
  } catch (err) {
    hide(scheduleLoading);
    showErr(scheduleError, `Failed to load schedule: ${err.message}`);
  } finally {
    btnRefresh.disabled = false;
  }
}

/* ── remove session ── */
scheduleTbody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  if (btn.dataset.action === "edit") {
    await editSession(btn.dataset.id);
    return;
  }
  if (btn.dataset.action !== "remove") return;
  if (!confirm("Remove this session?")) return;

  btn.disabled = true;
  btn.textContent = "Removing…";

  try {
    const res = await apiFetch(`/api/schedule/${btn.dataset.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await safeJson(res);
      alert(`Failed: ${(data && data.message) || res.status}`);
      btn.disabled = false;
      btn.textContent = "Remove";
      return;
    }
    await loadSchedule();
  } catch (err) {
    alert(`Error: ${err.message}`);
    btn.disabled = false;
    btn.textContent = "Remove";
  }
});

async function editSession(sessionId) {
  const session = sessionsById.get(String(sessionId));
  if (!session) {
    alert("Session data is out of date. Please refresh and try again.");
    return;
  }

  const nextDate = prompt(
    "Practice date (YYYY-MM-DD)",
    toDateInputValue(session.practice_date),
  );
  if (nextDate === null) return;
  const nextStart = prompt(
    "Start time (HH:MM)",
    toTimeInputValue(session.start_time),
  );
  if (nextStart === null) return;
  const nextEnd = prompt(
    "End time (HH:MM)",
    toTimeInputValue(session.end_time),
  );
  if (nextEnd === null) return;
  const nextLocation = prompt("Location", session.location || "") ?? "";

  if (!nextDate || !nextStart || !nextEnd) {
    alert("Date, start time, and end time are required.");
    return;
  }

  try {
    const response = await apiFetch(`/api/schedule/${sessionId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        group_id: session.group_id,
        practice_date: nextDate,
        start_time: nextStart,
        end_time: nextEnd,
        location: nextLocation.trim(),
      }),
    });

    if (!response.ok) {
      const data = await safeJson(response);
      alert(`Failed to update: ${(data && data.message) || response.status}`);
      return;
    }

    await loadSchedule();
  } catch (err) {
    alert(`Error updating session: ${err.message}`);
  }
}

/* ── add session ── */
sessionForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hide(sessionError);
  btnAddSession.disabled = true;
  btnAddSession.textContent = "Adding…";

  try {
    const res = await apiFetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        group_id: Number(selGroup.value),
        practice_date: selDate.value,
        start_time: selStart.value,
        end_time: selEnd.value,
        location: selLocation.value.trim(),
        repeat_weeks: repeatWeekly.checked
          ? Math.min(
              24,
              Math.max(1, Number.parseInt(repeatCount.value, 10) || 1),
            )
          : 1,
      }),
    });

    const data = await safeJson(res);
    if (!res.ok) {
      showErr(sessionError, (data && data.message) || `Failed (${res.status})`);
      return;
    }

    sessionForm.reset();
    repeatCount.value = "1";
    await loadSchedule();
  } catch (err) {
    showErr(sessionError, `Network error: ${err.message}`);
  } finally {
    btnAddSession.disabled = false;
    btnAddSession.textContent = "Add Session";
  }
});

/* ── add group ── */
groupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hide(groupError);
  const btn = document.getElementById("btn-add-group");
  btn.disabled = true;
  btn.textContent = "Creating…";

  try {
    const res = await apiFetch("/api/practice-groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        group_name: groupName.value.trim(),
        level: groupLevel.value.trim(),
      }),
    });

    const data = await safeJson(res);
    if (!res.ok) {
      showErr(groupError, (data && data.message) || `Failed (${res.status})`);
      return;
    }

    groupForm.reset();
    await loadGroups();
  } catch (err) {
    showErr(groupError, `Network error: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = "Create Group";
  }
});

btnRefresh.addEventListener("click", () => loadSchedule());
btnLogout.addEventListener("click", redirectToLogin);

/* ── init ── */
async function init() {
  if (!getToken()) {
    redirectToLogin();
    return;
  }

  const cached = localStorage.getItem("swimsyncUser");
  if (cached) {
    try {
      currentUser = JSON.parse(cached);
    } catch {
      /* ignore */
    }
  }

  if (!currentUser) {
    const res = await apiFetch("/api/me");
    currentUser = await res.json();
    localStorage.setItem("swimsyncUser", JSON.stringify(currentUser));
  }

  userRoleBadge.textContent = currentUser.role.toUpperCase();
  userRoleBadge.className = `badge role-badge role-${currentUser.role}`;

  const canEdit = currentUser.role === "admin" || currentUser.role === "coach";
  if (canEdit) {
    show(createSessionCard);
    show(createGroupCard);
    schedActionHeading.textContent = "Action";
  } else {
    schedActionHeading.textContent = "Access";
  }

  await checkHealth();
  await loadGroups();
  await loadSchedule();
}

init().catch(() => redirectToLogin());
