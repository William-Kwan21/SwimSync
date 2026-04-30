/* ── selectors ── */
const userRoleBadge = document.getElementById("user-role-badge");
const btnLogout = document.getElementById("btn-logout");
const btnRefresh = document.getElementById("btn-refresh");

const scheduleTable = document.getElementById("schedule-table");
const scheduleTbody = document.getElementById("schedule-tbody");
const scheduleLoading = document.getElementById("schedule-loading");
const scheduleError = document.getElementById("schedule-error");
const scheduleNotice = document.getElementById("schedule-notice");
const scheduleEmpty = document.getElementById("schedule-empty");
const schedActionHeading = document.getElementById("sched-action-heading");
const viewDate = document.getElementById("view-date");
const btnViewDate = document.getElementById("btn-view-date");
const btnClearDate = document.getElementById("btn-clear-date");
const btnRemoveAll = document.getElementById("btn-remove-all");
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

const editSessionModal = document.getElementById("edit-session-modal");
const editSessionForm = document.getElementById("edit-session-form");
const editSessionId = document.getElementById("edit-session-id");
const editSessionGroup = document.getElementById("edit-session-group");
const editSessionDate = document.getElementById("edit-session-date");
const editSessionStart = document.getElementById("edit-session-start");
const editSessionEnd = document.getElementById("edit-session-end");
const editSessionLocation = document.getElementById("edit-session-location");
const editSessionError = document.getElementById("edit-session-error");
const btnEditSessionClose = document.getElementById("btn-edit-session-close");
const btnEditSessionCancel = document.getElementById("btn-edit-session-cancel");
const btnEditSessionSave = document.getElementById("btn-edit-session-save");

const attendanceModal = document.getElementById("attendance-modal");
const attendanceForm = document.getElementById("attendance-form");
const attendanceSessionId = document.getElementById("attendance-session-id");
const attendanceSessionLabel = document.getElementById("attendance-session-label");
const attendanceSetAll = document.getElementById("attendance-set-all");
const attendanceTbody = document.getElementById("attendance-tbody");
const attendanceError = document.getElementById("attendance-error");
const btnAttendanceClose = document.getElementById("btn-attendance-close");
const btnAttendanceCancel = document.getElementById("btn-attendance-cancel");
const btnAttendanceSave = document.getElementById("btn-attendance-save");

let currentUser = null;
let sessionsById = new Map();
let calendarCursor = new Date();
let practiceGroups = [];
let scheduleNoticeTimer = null;

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

function showScheduleNotice(msg) {
  if (!scheduleNotice) return;
  if (scheduleNoticeTimer) {
    clearTimeout(scheduleNoticeTimer);
    scheduleNoticeTimer = null;
  }
  scheduleNotice.textContent = msg;
  scheduleNotice.classList.remove("error");
  scheduleNotice.classList.add("info");
  show(scheduleNotice);
  scheduleNoticeTimer = setTimeout(() => {
    hide(scheduleNotice);
    scheduleNoticeTimer = null;
  }, 2800);
}

async function themedAlert(message, title = "Notice") {
  if (window.uiPopup && typeof window.uiPopup.alert === "function") {
    await window.uiPopup.alert(message, title);
  } else {
    console.warn("uiPopup.alert unavailable:", title, message);
  }
}

async function themedConfirm(message, title = "Please Confirm") {
  if (window.uiPopup && typeof window.uiPopup.confirm === "function") {
    return window.uiPopup.confirm(message, title);
  }
  console.warn("uiPopup.confirm unavailable:", title, message);
  return false;
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

function weekdayFromRepeatCheckbox(checkboxEl) {
  if (!checkboxEl) return null;

  const dataWeekday = Number(checkboxEl.dataset.weekday);
  if (Number.isInteger(dataWeekday) && dataWeekday >= 0 && dataWeekday <= 6) {
    return dataWeekday;
  }

  const labelEl = checkboxEl.closest("label");
  const dayText = labelEl
    ? (labelEl.querySelector("span")?.textContent || "").trim()
        .toLowerCase()
    : "";

  const byLabel = {
    sunday: 0,
    su: 0,
    monday: 1,
    m: 1,
    tuesday: 2,
    tu: 2,
    t: 2,
    wednesday: 3,
    w: 3,
    thursday: 4,
    th: 4,
    friday: 5,
    f: 5,
    saturday: 6,
    sa: 6,
  };
  if (Object.prototype.hasOwnProperty.call(byLabel, dayText)) {
    return byLabel[dayText];
  }

  const parsed = Number(checkboxEl.value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 6 ? parsed : null;
}

function formatDate(d) {
  if (!d) return "—";
  let dt;
  if (typeof d === "string") {
    const dateOnly = d.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
      dt = new Date(`${dateOnly}T00:00:00`);
    } else {
      dt = new Date(d);
    }
  } else {
    dt = new Date(d);
  }

  if (Number.isNaN(dt.getTime())) return "—";
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

function toAttendanceLabel(status) {
  const key = String(status || "unmarked").toLowerCase();
  if (key === "present") return "Present";
  if (key === "late") return "Late";
  if (key === "absent") return "Absent";
  if (key === "excused") return "Excused";
  return "Unmarked";
}

function attendanceBadge(status) {
  const key = String(status || "unmarked").toLowerCase();
  return `<span class="attendance-pill attendance-${escHtml(key)}">${escHtml(toAttendanceLabel(key))}</span>`;
}

function attendanceOptions(selectedStatus) {
  const selectedKey = String(selectedStatus || "unmarked").toLowerCase();
  const options = ["unmarked", "present", "late", "absent", "excused"];
  return options
    .map((opt) => {
      const selected = opt === selectedKey ? "selected" : "";
      return `<option value="${opt}" ${selected}>${toAttendanceLabel(opt)}</option>`;
    })
    .join("");
}

function toDateInputValue(d) {
  if (!d) return "";
  let dt;
  if (typeof d === "string") {
    const dateOnly = d.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
      dt = new Date(`${dateOnly}T00:00:00`);
    } else {
      dt = new Date(d);
    }
  } else {
    dt = new Date(d);
  }

  if (Number.isNaN(dt.getTime())) {
    return "";
  }

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

function buildWeeklyOccurrenceDates(startDateStr, endDateStr, weekdaysInput) {
  const startDate = new Date(`${startDateStr}T00:00:00`);
  const endDate = new Date(`${endDateStr}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return [];
  }
  if (endDate < startDate) {
    return [];
  }

  const normalizedWeekdays = [
    ...new Set(
      weekdaysInput
        .map((day) => Number(day))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
    ),
  ];
  const weekdays = normalizedWeekdays.length
    ? normalizedWeekdays
    : [startDate.getDay()];

  const dateSet = new Set();
  weekdays.forEach((weekday) => {
    const first = new Date(startDate);
    const offset = (weekday - first.getDay() + 7) % 7;
    first.setDate(first.getDate() + offset);

    let cursor = first;
    while (cursor <= endDate) {
      dateSet.add(toDateInputValue(cursor));
      const next = new Date(cursor);
      next.setDate(next.getDate() + 7);
      cursor = next;
    }
  });

  return Array.from(dateSet).sort();
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
  if (viewDate._flatpickr) {
    viewDate._flatpickr.open();
    return;
  }
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

function initTomSelectForElement(selectEl) {
  if (!selectEl || selectEl.hasAttribute("data-no-theme")) {
    return;
  }

  if (typeof TomSelect === "undefined") {
    return;
  }

  if (selectEl.tomselect) {
    return;
  }

  selectEl.dataset.uiEnhanced = "true";
  new TomSelect(selectEl, {
    create: false,
    allowEmptyOption: true,
    maxOptions: 250,
    searchField: ["text"],
    dropdownParent: "body",
    copyClassesToDropdown: true,
  });
}

function getSelectValue(selectEl) {
  if (!selectEl) return "";
  if (selectEl.tomselect) {
    return String(selectEl.tomselect.getValue() || "");
  }
  return String(selectEl.value || "");
}

function setSelectValue(selectEl, value) {
  if (!selectEl) return;
  if (selectEl.tomselect) {
    selectEl.tomselect.setValue(value, true);
    return;
  }
  selectEl.value = value;
}

function resetSelectOptions(selectEl, optionsMarkup) {
  if (!selectEl) return;

  const currentValue = selectEl.value;

  if (selectEl.tomselect) {
    selectEl.tomselect.destroy();
  }

  delete selectEl.dataset.uiEnhanced;
  selectEl.innerHTML = optionsMarkup;

  if (currentValue) {
    const hasCurrentValue = Array.from(selectEl.options).some(
      (opt) => String(opt.value) === String(currentValue),
    );
    if (hasCurrentValue) {
      selectEl.value = currentValue;
    }
  }

  initTomSelectForElement(selectEl);
}

/* ── health check ── */
async function checkHealth() {
  try {
    const res = await fetch("/api/health");
    await res.json();
  } catch {
    return;
  }
}

/* ── load groups into select ── */
async function loadGroups() {
  try {
    const res = await apiFetch("/api/practice-groups");
    practiceGroups = await res.json();
    const opts = practiceGroups
      .map(
        (g) =>
          `<option value="${g.id}">${escHtml(g.group_name)} (${escHtml(g.level || "—")})</option>`,
      )
      .join("");
    const fallbackOptions = opts || `<option value="">No groups</option>`;
    resetSelectOptions(sidebarSelGroup, fallbackOptions);
    if (editSessionGroup) {
      resetSelectOptions(editSessionGroup, fallbackOptions);
    }
  } catch {
    resetSelectOptions(sidebarSelGroup, `<option value="">Error loading</option>`);
    if (editSessionGroup) {
      resetSelectOptions(editSessionGroup, `<option value="">Error loading</option>`);
    }
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
    const rawSessions = await res.json();
    const sessions = isDateFiltered
      ? rawSessions
      : rawSessions.filter((session) => {
          const dateValue = new Date(`${toDateKey(session.practice_date)}T00:00:00`);
          if (Number.isNaN(dateValue.getTime())) {
            return false;
          }
          return (
            dateValue.getFullYear() === calendarCursor.getFullYear() &&
            dateValue.getMonth() === calendarCursor.getMonth()
          );
        });
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
      let action = '<span class="muted-inline">View only</span>';
      if (canEdit) {
        action = `<div class="table-actions">
             <button class="btn btn-secondary" data-action="attendance" data-id="${s.id}">Attendance</button>
             <button class="btn btn-secondary" data-action="edit" data-id="${s.id}">Edit</button>
             <button class="btn btn-danger" data-action="remove" data-id="${s.id}">Remove</button>
           </div>`;
      } else if (currentUser && currentUser.role === "swimmer") {
        action = attendanceBadge(s.my_attendance_status);
      } else if (currentUser && currentUser.role === "parent") {
        action = `<span class="muted-inline">${escHtml(
          s.parent_attendance_summary || "Unmarked",
        )}</span>`;
      }

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
  if (btn.dataset.action === "attendance") {
    await openAttendanceModal(btn.dataset.id);
    return;
  }
  if (btn.dataset.action === "edit") {
    await editSession(btn.dataset.id);
    return;
  }
  if (btn.dataset.action !== "remove") return;
  if (!(await themedConfirm("Remove this session?", "Delete Session"))) return;

  btn.disabled = true;
  btn.textContent = "Removing…";

  try {
    const res = await apiFetch(`/api/schedule/${btn.dataset.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await safeJson(res);
      await themedAlert(
        `Failed: ${(data && data.message) || res.status}`,
        "Delete Failed",
      );
      btn.disabled = false;
      btn.textContent = "Remove";
      return;
    }
    await loadSchedule();
  } catch (err) {
    await themedAlert(`Error: ${err.message}`, "Delete Failed");
    btn.disabled = false;
    btn.textContent = "Remove";
  }
});

async function openAttendanceModal(sessionId) {
  const session = sessionsById.get(String(sessionId));
  if (!session) {
    await themedAlert(
      "Session data is out of date. Please refresh and try again.",
      "Session Not Found",
    );
    return;
  }

  attendanceSessionId.value = String(session.id);
  attendanceSessionLabel.textContent = `${formatDate(session.practice_date)} - ${session.group_name}`;
  if (attendanceSetAll) {
    attendanceSetAll.value = "";
  }
  hide(attendanceError);
  attendanceTbody.innerHTML = `<tr><td colspan="3" class="muted-inline">Loading swimmers...</td></tr>`;

  show(attendanceModal);
  document.body.style.overflow = "hidden";

  try {
    const res = await apiFetch(`/api/schedule/${session.id}/attendance`);
    const data = await safeJson(res);
    let swimmers = [];

    if (res.ok) {
      swimmers = data && Array.isArray(data.swimmers) ? data.swimmers : [];
    }

    // Legacy backend fallback: load roster from /api/team if attendance route is unavailable or empty.
    if (!swimmers.length) {
      const teamRes = await apiFetch("/api/team");
      const teamData = await safeJson(teamRes);
      if (teamRes.ok && teamData && Array.isArray(teamData.swimmers)) {
        swimmers = teamData.swimmers
          .filter((swimmer) => Number(swimmer.group_id) === Number(session.group_id))
          .map((swimmer) => ({
            swimmer_id: swimmer.swimmer_id,
            name: swimmer.name,
            email: swimmer.email,
            status: "unmarked",
            note: "",
          }));
      }
    }

    if (!swimmers.length) {
      attendanceTbody.innerHTML = `<tr><td colspan="3" class="muted-inline">No swimmers assigned to this group.</td></tr>`;
      attendanceSessionLabel.textContent = `${formatDate(session.practice_date)} - ${session.group_name} (0 swimmers)`;
      return;
    }

    attendanceSessionLabel.textContent = `${formatDate(session.practice_date)} - ${session.group_name} (${swimmers.length} swimmers)`;

    attendanceTbody.innerHTML = swimmers
      .map(
        (swimmer) => `<tr data-swimmer-id="${swimmer.swimmer_id}">
          <td>${escHtml(swimmer.name)}</td>
          <td>
            <select data-attendance-status="${swimmer.swimmer_id}">
              ${attendanceOptions(swimmer.status)}
            </select>
          </td>
          <td>
            <input type="text" data-attendance-note="${swimmer.swimmer_id}" value="${escHtml(swimmer.note || "")}" placeholder="Optional note" />
          </td>
        </tr>`,
      )
      .join("");

    // Ensure attendance controls use the same themed dropdown UI.
    initTomSelectForElement(attendanceSetAll);
    attendanceTbody
      .querySelectorAll("select[data-attendance-status]")
      .forEach((selectEl) => initTomSelectForElement(selectEl));
  } catch (err) {
    showErr(attendanceError, `Failed to load attendance: ${err.message}`);
    attendanceTbody.innerHTML = `<tr><td colspan="3" class="muted-inline">Could not load swimmer roster.</td></tr>`;
  }
}

function closeAttendanceModal() {
  if (!attendanceModal) return;
  hide(attendanceModal);
  attendanceForm.reset();
  if (attendanceSetAll) {
    attendanceSetAll.value = "";
  }
  attendanceTbody.innerHTML = "";
  hide(attendanceError);
  document.body.style.overflow = "";
}

async function submitAttendance() {
  hide(attendanceError);

  const scheduleId = Number(attendanceSessionId.value);
  if (!Number.isInteger(scheduleId)) {
    showErr(attendanceError, "Invalid session id.");
    return;
  }

  const rows = Array.from(attendanceTbody.querySelectorAll("tr[data-swimmer-id]"));
  const entries = rows
    .map((row) => {
      const swimmerId = Number(row.dataset.swimmerId);
      const statusSelect = row.querySelector("select[data-attendance-status]");
      const noteInput = row.querySelector("input[data-attendance-note]");
      return {
        swimmer_id: swimmerId,
        status: statusSelect ? getSelectValue(statusSelect) : "unmarked",
        note: noteInput ? noteInput.value.trim() : "",
      };
    })
    .filter((entry) => Number.isInteger(entry.swimmer_id));

  if (!entries.length) {
    showErr(attendanceError, "No swimmers available to save.");
    return;
  }

  try {
    const res = await apiFetch(`/api/schedule/${scheduleId}/attendance`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    });

    const data = await safeJson(res);
    if (!res.ok) {
      throw new Error((data && data.message) || `Failed (${res.status})`);
    }

    closeAttendanceModal();
    await loadSchedule();
    showScheduleNotice("Attendance saved.");
  } catch (err) {
    showErr(attendanceError, `Failed to save attendance: ${err.message}`);
  }
}

async function editSession(sessionId) {
  const session = sessionsById.get(String(sessionId));
  if (!session) {
    await themedAlert(
      "Session data is out of date. Please refresh and try again.",
      "Session Not Found",
    );
    return;
  }

  hide(editSessionError);
  editSessionError.classList.remove("info");
  editSessionError.classList.add("error");

  editSessionId.value = String(session.id);
  editSessionDate.value = toDateInputValue(session.practice_date);
  editSessionStart.value = toTimeInputValue(session.start_time);
  editSessionEnd.value = toTimeInputValue(session.end_time);
  editSessionLocation.value = session.location || "";

  if (editSessionGroup && practiceGroups.length) {
    editSessionGroup.value = String(session.group_id);
  }

  openEditSessionModal();
}

function openEditSessionModal() {
  if (!editSessionModal) return;
  show(editSessionModal);
  document.body.style.overflow = "hidden";
  editSessionDate.focus();
}

function closeEditSessionModal() {
  if (!editSessionModal) return;
  hide(editSessionModal);
  document.body.style.overflow = "";
  editSessionForm.reset();
  hide(editSessionError);
}

async function submitSessionEdit() {
  const sessionId = editSessionId.value;
  const nextGroupId = Number(editSessionGroup.value);
  const nextDate = editSessionDate.value;
  const nextStart = editSessionStart.value;
  const nextEnd = editSessionEnd.value;
  const nextLocation = editSessionLocation.value.trim();

  hide(editSessionError);
  editSessionError.classList.remove("info");
  editSessionError.classList.add("error");

  if (!sessionId || !nextDate || !nextStart || !nextEnd || !nextGroupId) {
    showErr(editSessionError, "Group, date, start time, and end time are required.");
    return;
  }

  try {
    const response = await apiFetch(`/api/schedule/${sessionId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        group_id: nextGroupId,
        practice_date: nextDate,
        start_time: nextStart,
        end_time: nextEnd,
        location: nextLocation,
      }),
    });

    if (!response.ok) {
      const data = await safeJson(response);
      showErr(
        editSessionError,
        `Failed to update: ${(data && data.message) || response.status}`,
      );
      return;
    }

    closeEditSessionModal();
    await loadSchedule();
    showScheduleNotice("Session updated successfully.");
  } catch (err) {
    showErr(editSessionError, `Error updating session: ${err.message}`);
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
        .map((c) => weekdayFromRepeatCheckbox(c))
        .filter((v) => Number.isInteger(v) && v >= 0 && v <= 6);
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

    const selectedRepeatDays = repeatWeekly
      ? getSelectedSidebarRepeatDays()
      : [];
    const targetDates = repeatWeekly
      ? buildWeeklyOccurrenceDates(
          sidebarSelDate.value,
          repeatUntil,
          selectedRepeatDays,
        )
      : [sidebarSelDate.value];

    if (!targetDates.length) {
      showErr(
        sidebarSessionError,
        "No valid session dates were generated from your repeat settings.",
      );
      return;
    }

    const createdSessions = [];
    const failedDates = [];

    for (const dateValue of targetDates) {
      const res = await apiFetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          group_id: Number(sidebarSelGroup.value),
          practice_date: dateValue,
          start_time: sidebarSelStart.value,
          end_time: sidebarSelEnd.value,
          location: sidebarSelLocation.value.trim(),
          repeat_weekly: false,
          repeat_until: null,
          repeat_days: [],
        }),
      });

      const data = await safeJson(res);
      if (!res.ok) {
        failedDates.push(dateValue);
        continue;
      }

      if (data && Array.isArray(data.sessions) && data.sessions.length) {
        createdSessions.push(data.sessions[0]);
      } else {
        createdSessions.push({ practice_date: dateValue });
      }
    }

    if (!createdSessions.length) {
      showErr(sidebarSessionError, "Failed to add sessions.");
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
    const createdCount = createdSessions.length;
    const firstCreated = createdSessions[0] || null;
    const lastCreated = createdSessions[createdSessions.length - 1] || null;
    const summary =
      createdCount > 0 && firstCreated && lastCreated
        ? `Created ${createdCount} session${createdCount === 1 ? "" : "s"} from ${formatDate(firstCreated.practice_date)} to ${formatDate(lastCreated.practice_date)}.`
        : `Added ${createdCount} session${createdCount === 1 ? "" : "s"}.`;

    show(sidebarSessionError);
    sidebarSessionError.classList.remove("error");
    sidebarSessionError.classList.add("info");
    sidebarSessionError.textContent = failedDates.length
      ? `${summary} ${failedDates.length} date${failedDates.length === 1 ? " was" : "s were"} skipped.`
      : summary;
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

if (editSessionForm) {
  editSessionForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    btnEditSessionSave.disabled = true;
    btnEditSessionSave.textContent = "Saving...";
    try {
      await submitSessionEdit();
    } finally {
      btnEditSessionSave.disabled = false;
      btnEditSessionSave.textContent = "Save Changes";
    }
  });
}

if (attendanceForm) {
  attendanceForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    btnAttendanceSave.disabled = true;
    btnAttendanceSave.textContent = "Saving...";
    try {
      await submitAttendance();
    } finally {
      btnAttendanceSave.disabled = false;
      btnAttendanceSave.textContent = "Save Attendance";
    }
  });
}

if (attendanceSetAll) {
  attendanceSetAll.addEventListener("change", () => {
    const selectedValue = getSelectValue(attendanceSetAll);
    if (!selectedValue) {
      return;
    }

    const selects = attendanceTbody.querySelectorAll(
      "select[data-attendance-status]",
    );
    selects.forEach((selectEl) => {
      setSelectValue(selectEl, selectedValue);
    });
  });
}

if (btnEditSessionClose) {
  btnEditSessionClose.addEventListener("click", closeEditSessionModal);
}

if (btnEditSessionCancel) {
  btnEditSessionCancel.addEventListener("click", closeEditSessionModal);
}

if (btnAttendanceClose) {
  btnAttendanceClose.addEventListener("click", closeAttendanceModal);
}

if (btnAttendanceCancel) {
  btnAttendanceCancel.addEventListener("click", closeAttendanceModal);
}

if (editSessionModal) {
  editSessionModal.addEventListener("click", (e) => {
    if (e.target === editSessionModal) {
      closeEditSessionModal();
    }
  });
}

if (attendanceModal) {
  attendanceModal.addEventListener("click", (e) => {
    if (e.target === attendanceModal) {
      closeAttendanceModal();
    }
  });
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && editSessionModal && !editSessionModal.classList.contains("hidden")) {
    closeEditSessionModal();
  }
  if (e.key === "Escape" && attendanceModal && !attendanceModal.classList.contains("hidden")) {
    closeAttendanceModal();
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

if (btnRemoveAll) {
  btnRemoveAll.addEventListener("click", async () => {
    const approved = await themedConfirm(
      "Remove ALL scheduled sessions? This cannot be undone.",
      "Remove All Sessions",
    );
    if (!approved) return;

    btnRemoveAll.disabled = true;
    const previousLabel = btnRemoveAll.textContent;
    btnRemoveAll.textContent = "Removing…";

    try {
      const res = await apiFetch("/api/schedule", { method: "DELETE" });
      const data = await safeJson(res);
      if (!res.ok) {
        if (res.status === 404) {
          // Fallback for servers that have not reloaded the new bulk-delete route.
          const listRes = await apiFetch("/api/schedule");
          const list = await safeJson(listRes);
          if (!listRes.ok || !Array.isArray(list)) {
            await themedAlert(
              `Failed to remove sessions: ${(data && data.message) || res.status}`,
              "Remove Failed",
            );
            return;
          }

          let removedCount = 0;
          for (const item of list) {
            const id = Number(item && item.id);
            if (!Number.isInteger(id)) continue;
            const delRes = await apiFetch(`/api/schedule/${id}`, {
              method: "DELETE",
            });
            if (delRes.ok) {
              removedCount += 1;
            }
          }

          await themedAlert(
            `Removed ${removedCount} session${removedCount === 1 ? "" : "s"}.`,
            "Sessions Removed",
          );
          await loadSchedule();
          return;
        }

        await themedAlert(
          `Failed to remove sessions: ${(data && data.message) || res.status}`,
          "Remove Failed",
        );
        return;
      }

      const removed = Number(data && data.deleted_count) || 0;
      await themedAlert(
        `Removed ${removed} session${removed === 1 ? "" : "s"}.`,
        "Sessions Removed",
      );
      await loadSchedule();
    } catch (err) {
      await themedAlert(
        `Error removing sessions: ${err.message}`,
        "Remove Failed",
      );
    } finally {
      btnRemoveAll.disabled = false;
      btnRemoveAll.textContent = previousLabel;
    }
  });
}

if (btnCalPrev) {
  btnCalPrev.addEventListener("click", () => {
    calendarCursor = new Date(
      calendarCursor.getFullYear(),
      calendarCursor.getMonth() - 1,
      1,
    );
    renderCalendar();
    if (!viewDate.value) {
      loadSchedule();
    }
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
    if (!viewDate.value) {
      loadSchedule();
    }
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

  const res = await apiFetch("/api/me");
  currentUser = await res.json();
  localStorage.setItem("swimsyncUser", JSON.stringify(currentUser));

  userRoleBadge.textContent = currentUser.role.toUpperCase();
  userRoleBadge.className = `badge role-badge role-${currentUser.role}`;

  const canEdit = currentUser.role === "admin" || currentUser.role === "coach";
  if (canEdit) {
    show(sidebarSessionCard);
    show(sidebarGroupCard);
    if (btnRemoveAll) show(btnRemoveAll);
    schedActionHeading.textContent = "Action";
  } else {
    hide(sidebarSessionCard);
    hide(sidebarGroupCard);
    if (btnRemoveAll) hide(btnRemoveAll);
    schedActionHeading.textContent =
      currentUser.role === "swimmer" || currentUser.role === "parent"
        ? "Attendance"
        : "Access";
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
