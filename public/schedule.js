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
const viewDate = document.getElementById("view-date");
const btnViewDate = document.getElementById("btn-view-date");
const btnClearDate = document.getElementById("btn-clear-date");

const scheduleSidebar = document.querySelector(".schedule-sidebar");
const btnToggleSidebar = document.getElementById("btn-toggle-sidebar");

const sidebarSessionCard = document.getElementById("sidebar-session-card");
const sidebarSessionForm = document.getElementById("sidebar-session-form");
const sidebarSelGroup = document.getElementById("sidebar-sel-group");
const sidebarSelDate = document.getElementById("sidebar-sel-date");
const sidebarSelStart = document.getElementById("sidebar-sel-start");
const sidebarSelEnd = document.getElementById("sidebar-sel-end");
const sidebarSelLocation = document.getElementById("sidebar-sel-location");
const sidebarRepeatWeekly = document.getElementById("sidebar-repeat-weekly");
const sidebarRepeatOptions = document.getElementById("sidebar-repeat-options");
const sidebarRepeatCount = document.getElementById("sidebar-repeat-count");
const sidebarSessionError = document.getElementById("sidebar-session-error");
const btnSidebarAddSession = document.getElementById("btn-sidebar-add-session");

const sidebarGroupCard = document.getElementById("sidebar-group-card");
const sidebarGroupForm = document.getElementById("sidebar-group-form");
const sidebarGroupName = document.getElementById("sidebar-group-name");
const sidebarGroupLevel = document.getElementById("sidebar-group-level");
const sidebarGroupError = document.getElementById("sidebar-group-error");
const btnSidebarAddGroup = document.getElementById("btn-sidebar-add-group");

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

function getSelectedRepeatDays() {
  const checkboxes = document.querySelectorAll(
    'input[name="repeat-day"]:checked',
  );
  return Array.from(checkboxes)
    .map((input) => Number(input.value))
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);
}

function updateRepeatSummary() {
  if (!repeatDaysPicker) return;
  const summary = repeatDaysPicker.querySelector("summary");
  if (!summary) return;

  const labels = {
    0: "Sun",
    1: "Mon",
    2: "Tue",
    3: "Wed",
    4: "Thu",
    5: "Fri",
    6: "Sat",
  };
  const selected = getSelectedRepeatDays();

  summary.textContent = selected.length
    ? selected.map((d) => labels[d]).join(", ")
    : "Select day(s)";
}

function formatViewDateLabel(dateStr) {
  if (!dateStr) return "Select Date";
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Select Date";
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function updateViewDateLabel() {
  if (!btnViewDate) return;
  btnViewDate.textContent = formatViewDateLabel(viewDate.value);
}

function openViewDateCalendar() {
  if (!viewDate) return;
  if (typeof viewDate.showPicker === "function") {
    viewDate.showPicker();
    return;
  }
  viewDate.focus();
  viewDate.click();
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
    const opts = groups.map(g => `<option value="${g.id}">${escHtml(g.group_name)}</option>`).join("");
    sidebarSelGroup.innerHTML = opts || `<option value="">No groups</option>`;
  } catch {
    sidebarSelGroup.innerHTML = `<option value="">Error loading</option>`;
  }
}

/* ── repeat and sidebar handlers ── */
if (sidebarRepeatWeekly) {
  sidebarRepeatWeekly.addEventListener("change", () => {
    if (sidebarRepeatWeekly.checked) {
      show(sidebarRepeatOptions);
    } else {
      hide(sidebarRepeatOptions);
    }
  });
}

if (btnToggleSidebar && scheduleSidebar) {
  btnToggleSidebar.addEventListener("click", () => {
    scheduleSidebar.classList.toggle("sidebar-collapsed");
    btnToggleSidebar.textContent = scheduleSidebar.classList.contains(
      "sidebar-collapsed",
    )
      ? "☰"
      : "✕";
  });
}

/* ── load schedule ── */
async function loadSchedule() {
  hide(scheduleError);
  hide(scheduleEmpty);
  hide(scheduleTable);
  show(scheduleLoading);
  btnRefresh.disabled = true;

  try {
    const query = viewDate.value
      ? `?date=${encodeURIComponent(viewDate.value)}`
      : "";
    const res = await apiFetch(`/api/schedule${query}`);
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

/* ── sidebar session form ── */
sidebarSessionForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hide(sidebarSessionError);
  btnSidebarAddSession.disabled = true;
  btnSidebarAddSession.textContent = "Adding…";

  const savedGroup = sidebarSelGroup.value;
  const savedStart = sidebarSelStart.value;
  const savedEnd = sidebarSelEnd.value;
  const savedLocation = sidebarSelLocation.value;

  try {
    function getSelectedSidebarRepeatDays() {
      const checks = document.querySelectorAll('input[name="sidebar-repeat-day"]:checked');
      return Array.from(checks).map(c => Number(c.value)).filter(v => v >= 0 && v <= 6);
    }

    const res = await apiFetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        group_id: Number(sidebarSelGroup.value),
        practice_date: sidebarSelDate.value,
        start_time: sidebarSelStart.value,
        end_time: sidebarSelEnd.value,
        location: sidebarSelLocation.value.trim(),
        repeat_weeks: sidebarRepeatWeekly.checked ? Math.min(24, Math.max(1, Number(sidebarRepeatCount.value) || 1)) : 1,
        repeat_days: sidebarRepeatWeekly.checked ? getSelectedSidebarRepeatDays() : [],
      }),
    });

    const data = await safeJson(res);
    if (!res.ok) {
      const msg = (data && data.message) || "Failed to add session";
      show(sidebarSessionError);
      sidebarSessionError.textContent = msg;
      return;
    }

    sidebarSessionForm.reset();
  sidebarSelGroup.value = savedGroup;
  sidebarSelStart.value = savedStart;
  sidebarSelEnd.value = savedEnd;
  sidebarSelLocation.value = savedLocation;
    sidebarRepeatCount.value = "1";
    hide(sidebarRepeatOptions);
    const created = data.created_count || "Session(s)";
    show(sidebarSessionError);
    sidebarSessionError.classList.remove("error");
    sidebarSessionError.classList.add("info");
    sidebarSessionError.textContent = `Added ${created} session(s)!`;
    await loadSchedule();
  } catch (err) {
    show(sidebarSessionError);
    sidebarSessionError.classList.add("error");
    sidebarSessionError.textContent = `Network error: ${err.message}`;
  } finally {
    btnSidebarAddSession.disabled = false;
    btnSidebarAddSession.textContent = "Add Session(s)";
  }
});

/* ── sidebar group form ── */
sidebarGroupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hide(sidebarGroupError);
  btnSidebarAddGroup.disabled = true;
  btnSidebarAddGroup.textContent = "Creating…";

  try {
    const res = await apiFetch("/api/practice-groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        group_name: sidebarGroupName.value.trim(),
        level: sidebarGroupLevel.value.trim(),
      }),
    });

    const data = await safeJson(res);
    if (!res.ok) {
      const msg = (data && data.message) || "Failed";
      show(sidebarGroupError);
      sidebarGroupError.textContent = msg;
      return;
    }

    sidebarGroupForm.reset();
    show(sidebarGroupError);
    sidebarGroupError.classList.remove("error");
    sidebarGroupError.classList.add("info");
    sidebarGroupError.textContent = "Group created!";
    await loadGroups();
  } catch (err) {
    show(sidebarGroupError);
    sidebarGroupError.classList.add("error");
    sidebarGroupError.textContent = `Network error: ${err.message}`;
  } finally {
    btnSidebarAddGroup.disabled = false;
    btnSidebarAddGroup.textContent = "Create";
  }
});

btnRefresh.addEventListener("click", () => loadSchedule());
btnViewDate.addEventListener("click", openViewDateCalendar);
viewDate.addEventListener("change", () => {
  updateViewDateLabel();
  loadSchedule();
});
btnClearDate.addEventListener("click", () => {
  viewDate.value = "";
  updateViewDateLabel();
  loadSchedule();
});

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
    show(sidebarSessionCard);
    show(sidebarGroupCard);
    schedActionHeading.textContent = "Action";
  } else {
    hide(sidebarSessionCard);
    hide(sidebarGroupCard);
    schedActionHeading.textContent = "Access";
  }

  await checkHealth();
  await loadGroups();
  updateViewDateLabel();
  await loadSchedule();
}

init().catch(() => redirectToLogin());
