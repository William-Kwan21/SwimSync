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
const btnCalPrev = document.getElementById("btn-cal-prev");
const btnCalNext = document.getElementById("btn-cal-next");
const calendarMonthLabel = document.getElementById("calendar-month-label");
const calendarGrid = document.getElementById("calendar-grid");

const sidebarSessionCard = document.getElementById("sidebar-session-card");
const sidebarSessionForm = document.getElementById("sidebar-session-form");
const sidebarSelGroup = document.getElementById("sidebar-sel-group");
const sidebarSelDate = document.getElementById("sidebar-sel-date");
const sidebarSelStart = document.getElementById("sidebar-sel-start");
const sidebarSelEnd = document.getElementById("sidebar-sel-end");
const sidebarSelLocation = document.getElementById("sidebar-sel-location");
const sidebarRepeatWeekly = document.getElementById("sidebar-repeat-weekly");
const sidebarRepeatDaysRow = document.getElementById("sidebar-repeat-days-row");
const sidebarRepeatUntilRow = document.getElementById("sidebar-repeat-until-row");
const sidebarRepeatUntil = document.getElementById("sidebar-repeat-until");
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
let calendarCursor = new Date();

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

function syncRepeatDaysVisibility() {
  if (
    !sidebarRepeatDaysRow ||
    !sidebarRepeatUntilRow ||
    !sidebarRepeatWeekly
  ) {
    return;
  }

  if (sidebarRepeatWeekly.checked) {
    show(sidebarRepeatDaysRow);
    show(sidebarRepeatUntilRow);
  } else {
    hide(sidebarRepeatDaysRow);
    hide(sidebarRepeatUntilRow);
  }
}

function syncRepeatDefaultsFromStartDate() {
  if (!sidebarSelDate) return;

  if (sidebarRepeatUntil) {
    sidebarRepeatUntil.min = sidebarSelDate.value || "";
    if (!sidebarRepeatUntil.value && sidebarSelDate.value) {
      sidebarRepeatUntil.value = sidebarSelDate.value;
    }
  }

  if (!sidebarSelDate.value) return;
  const startDate = new Date(`${sidebarSelDate.value}T00:00:00`);
  if (Number.isNaN(startDate.getTime())) return;

  const checks = document.querySelectorAll('input[name="sidebar-repeat-day"]');
  const anySelected = Array.from(checks).some((c) => c.checked);
  if (anySelected) return;

  const weekday = startDate.getDay();
  const defaultCheck = document.querySelector(
    `input[name="sidebar-repeat-day"][value="${weekday}"]`,
  );
  if (defaultCheck) {
    defaultCheck.checked = true;
  }
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
  const dt = new Date(d);
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDateKey(d) {
  if (!d) return "";
  if (typeof d === "string") {
    return d.slice(0, 10);
  }
  return toDateInputValue(d);
}

function toTimeInputValue(t) {
  if (!t) return "";
  return String(t).slice(0, 5);
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

function startOfMonth(dateValue) {
  return new Date(dateValue.getFullYear(), dateValue.getMonth(), 1);
}

function monthLabel(dateValue) {
  return dateValue.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function renderCalendar() {
  if (!calendarGrid || !calendarMonthLabel) return;

  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const firstWeekday = firstOfMonth.getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const todayKey = toDateInputValue(new Date());
  const selectedKey = viewDate.value || "";

  calendarMonthLabel.textContent = monthLabel(calendarCursor);
  calendarGrid.innerHTML = "";

  for (let i = 0; i < firstWeekday; i += 1) {
    const spacer = document.createElement("button");
    spacer.type = "button";
    spacer.className = "calendar-day is-empty";
    spacer.disabled = true;
    spacer.setAttribute("aria-hidden", "true");
    calendarGrid.appendChild(spacer);
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const dateKey = toDateInputValue(new Date(year, month, day));
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "calendar-day";
    btn.dataset.date = dateKey;
    btn.textContent = String(day);
    btn.setAttribute(
      "aria-label",
      new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    );

    if (dateKey === todayKey) {
      btn.classList.add("is-today");
    }
    if (dateKey === selectedKey) {
      btn.classList.add("is-selected");
    }

    calendarGrid.appendChild(btn);
  }
}

function syncCalendarMonthToSelectedDate() {
  if (!viewDate || !viewDate.value) return;
  const selected = new Date(`${viewDate.value}T00:00:00`);
  if (Number.isNaN(selected.getTime())) return;
  calendarCursor = startOfMonth(selected);
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

function clearViewDateFilter() {
  if (!viewDate) return;
  viewDate.value = "";
  updateViewDateLabel();
  renderCalendar();
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
    const opts = groups
      .map(
        (g) =>
          `<option value="${g.id}">${escHtml(g.group_name)} (${escHtml(g.level || "—")})</option>`,
      )
      .join("");
    sidebarSelGroup.innerHTML = opts || `<option value="">No groups</option>`;
  } catch {
    sidebarSelGroup.innerHTML = `<option value="">Error loading</option>`;
  }
}

/* ── repeat and sidebar handlers ── */
if (sidebarRepeatWeekly) {
  sidebarRepeatWeekly.addEventListener("change", syncRepeatDaysVisibility);
}
if (sidebarSelDate) {
  sidebarSelDate.addEventListener("change", syncRepeatDefaultsFromStartDate);
}

/* ── load schedule ── */
async function loadSchedule() {
  hide(scheduleError);
  hide(scheduleEmpty);
  hide(scheduleTable);
  show(scheduleLoading);
  btnRefresh.disabled = true;

  try {
    const isDateFiltered = Boolean(viewDate.value);
    const query = isDateFiltered ? `?date=${encodeURIComponent(viewDate.value)}` : "";
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
    let currentDateKey = "";

    sessions.forEach((s, i) => {
      const nextDateKey = toDateKey(s.practice_date);

      if (!isDateFiltered && nextDateKey && nextDateKey !== currentDateKey) {
        currentDateKey = nextDateKey;
        const sep = document.createElement("tr");
        sep.className = "date-separator-row";
        sep.innerHTML = `<td colspan="8">${formatDate(s.practice_date)}</td>`;
        scheduleTbody.appendChild(sep);
      }

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
  sidebarSessionError.classList.remove("info");
  sidebarSessionError.classList.add("error");
  btnSidebarAddSession.disabled = true;
  btnSidebarAddSession.textContent = "Adding…";

  const savedGroup = sidebarSelGroup.value;
  const savedStart = sidebarSelStart.value;
  const savedEnd = sidebarSelEnd.value;
  const savedLocation = sidebarSelLocation.value;

  try {
    function getSelectedSidebarRepeatDays() {
      const checks = document.querySelectorAll(
        'input[name="sidebar-repeat-day"]:checked',
      );
      return Array.from(checks)
        .map((c) => Number(c.value))
        .filter((v) => v >= 0 && v <= 6);
    }

    const repeatWeekly = sidebarRepeatWeekly.checked;
    const repeatUntil = sidebarRepeatUntil.value;

    if (repeatWeekly && !repeatUntil) {
      showErr(
        sidebarSessionError,
        "Choose a 'Repeat Until' date when weekly repeat is enabled.",
      );
      return;
    }

    if (repeatWeekly && repeatUntil && repeatUntil < sidebarSelDate.value) {
      showErr(
        sidebarSessionError,
        "'Repeat Until' must be on or after the start date.",
      );
      return;
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
        repeat_weekly: repeatWeekly,
        repeat_until: repeatWeekly ? repeatUntil : null,
        repeat_days: repeatWeekly ? getSelectedSidebarRepeatDays() : [],
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
    sidebarRepeatWeekly.checked = false;
    sidebarRepeatUntil.value = "";
    sidebarRepeatUntil.min = "";
    syncRepeatDaysVisibility();
    clearViewDateFilter();
    const createdCount = Number(data && data.created_count) || 0;
    const createdSessions = Array.isArray(data && data.sessions)
      ? data.sessions
      : [];
    const firstCreated = createdSessions[0] || null;
    const lastCreated = createdSessions[createdSessions.length - 1] || null;
    const summary =
      createdCount > 0 && firstCreated && lastCreated
        ? `Created ${createdCount} session${createdCount === 1 ? "" : "s"} from ${formatDate(firstCreated.practice_date)} to ${formatDate(lastCreated.practice_date)}.`
        : `Added ${data && data.created_count ? data.created_count : "session(s)"}.`;

    show(sidebarSessionError);
    sidebarSessionError.classList.remove("error");
    sidebarSessionError.classList.add("info");
    sidebarSessionError.textContent = summary;
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
  syncCalendarMonthToSelectedDate();
  updateViewDateLabel();
  renderCalendar();
  loadSchedule();
});
btnClearDate.addEventListener("click", () => {
  clearViewDateFilter();
  loadSchedule();
});

if (btnCalPrev) {
  btnCalPrev.addEventListener("click", () => {
    calendarCursor = new Date(
      calendarCursor.getFullYear(),
      calendarCursor.getMonth() - 1,
      1,
    );
    renderCalendar();
  });
}

if (btnCalNext) {
  btnCalNext.addEventListener("click", () => {
    calendarCursor = new Date(
      calendarCursor.getFullYear(),
      calendarCursor.getMonth() + 1,
      1,
    );
    renderCalendar();
  });
}

if (calendarGrid) {
  calendarGrid.addEventListener("click", (e) => {
    const btn = e.target.closest("button.calendar-day[data-date]");
    if (!btn) return;
    viewDate.value = btn.dataset.date;
    syncCalendarMonthToSelectedDate();
    updateViewDateLabel();
    renderCalendar();
    loadSchedule();
  });
}

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
  syncRepeatDaysVisibility();
  syncRepeatDefaultsFromStartDate();
  calendarCursor = startOfMonth(new Date());
  clearViewDateFilter();
  renderCalendar();
  await loadSchedule();
}

init().catch(() => redirectToLogin());
