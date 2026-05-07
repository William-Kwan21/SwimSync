const userRoleBadge = document.getElementById("user-role-badge");
const btnLogout = document.getElementById("btn-logout");

const adminImportCard = document.getElementById("admin-import-card");
const adminCreateMeetCard = document.getElementById("admin-create-meet-card");
const meetCreateForm = document.getElementById("meet-create-form");
const meetCreateName = document.getElementById("meet-create-name");
const meetCreateDate = document.getElementById("meet-create-date");
const meetCreateLocation = document.getElementById("meet-create-location");
const meetCreateHostTeam = document.getElementById("meet-create-host-team");
const meetCreateStatus = document.getElementById("meet-create-status");
const btnCreateMeet = document.getElementById("btn-create-meet");
const meetImportForm = document.getElementById("meet-import-form");
const meetImportFile = document.getElementById("meet-import-file");
const meetImportStatus = document.getElementById("meet-import-status");
const btnImportMeet = document.getElementById("btn-import-meet");

const timesImportForm = document.getElementById("times-import-form");
const timesImportSwimmer = document.getElementById("times-import-swimmer");
const timesImportFile = document.getElementById("times-import-file");
const timesImportStatus = document.getElementById("times-import-status");
const btnImportTimes = document.getElementById("btn-import-times");

const manualTimeCard = document.getElementById("manual-time-card");
const manualTimeForm = document.getElementById("manual-time-form");
const timeSwimmerName = document.getElementById("time-swimmer-name");
const timeStroke = document.getElementById("time-stroke");
const timeDistance = document.getElementById("time-distance");
const timeBest = document.getElementById("time-best");
const timeAchievedOn = document.getElementById("time-achieved-on");
const manualTimeStatus = document.getElementById("manual-time-status");
const btnSaveTime = document.getElementById("btn-save-time");

const btnRefreshMeets = document.getElementById("btn-refresh-meets");
const meetsLoading = document.getElementById("meets-loading");
const meetsError = document.getElementById("meets-error");
const meetsEmpty = document.getElementById("meets-empty");
const meetsTable = document.getElementById("meets-table");
const meetsTbody = document.getElementById("meets-tbody");

const meetDetailCard = document.getElementById("meet-detail-card");
const meetDetailTitle = document.getElementById("meet-detail-title");
const meetDetailMeta = document.getElementById("meet-detail-meta");
const meetOverview = document.getElementById("meet-overview");
const meetDays = document.getElementById("meet-days");
const meetPublicEventsTbody = document.getElementById(
  "meet-public-events-tbody",
);
const meetEditControls = document.getElementById("meet-edit-controls");
const meetEditForm = document.getElementById("meet-edit-form");
const meetEditName = document.getElementById("meet-edit-name");
const meetEditStartDate = document.getElementById("meet-edit-start-date");
const meetEditEndDate = document.getElementById("meet-edit-end-date");
const meetEditLocation = document.getElementById("meet-edit-location");
const meetEditHostTeam = document.getElementById("meet-edit-host-team");
const meetEditStatus = document.getElementById("meet-edit-status");
const btnSaveMeetEdit = document.getElementById("btn-save-meet-edit");

const coachEventControls = document.getElementById("coach-event-controls");
const eventsTbody = document.getElementById("events-tbody");
const coachSelectionStatus = document.getElementById("coach-selection-status");
const btnSaveEventSelection = document.getElementById(
  "btn-save-event-selection",
);

const declareControls = document.getElementById("declare-controls");
const declareTbody = document.getElementById("declare-tbody");
const declareStatus = document.getElementById("declare-status");
const btnSaveDeclarations = document.getElementById("btn-save-declarations");
const coachEntryControls = document.getElementById("coach-entry-controls");
const coachEntryTbody = document.getElementById("coach-entry-tbody");
const coachEntryStatus = document.getElementById("coach-entry-status");
const btnSaveCoachEntries = document.getElementById("btn-save-coach-entries");

const timesLoading = document.getElementById("times-loading");
const timesError = document.getElementById("times-error");
const timesEmpty = document.getElementById("times-empty");
const timesTable = document.getElementById("times-table");
const timesTbody = document.getElementById("times-tbody");

let currentUser = null;
let selectedMeetId = null;
let selectedMeetDetail = null;

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
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(String(value).slice(0, 10) + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function addDaysToDateOnly(value, days) {
  const raw = String(value || "").slice(0, 10);
  if (!raw) return null;
  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function getDayOffsetFromDate(dateOnly, dayName) {
  const dayIndexMap = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };

  const target = dayIndexMap[String(dayName || "").trim().toLowerCase()];
  if (target == null) return 0;

  const raw = String(dateOnly || "").slice(0, 10);
  if (!raw) return 0;

  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 0;

  return (target - date.getDay() + 7) % 7;
}

function compareSessionLabels(a, b) {
  const dayOrder = { friday: 0, saturday: 1, sunday: 2 };
  const periodOrder = { am: 0, mid: 1, pm: 2 };

  const rank = (label) => {
    const parts = String(label || "")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ");
    const day = String(parts[0] || "").toLowerCase();
    const period = String(parts[1] || "").toLowerCase();
    return [dayOrder[day] ?? 99, periodOrder[period] ?? 99, String(label || "")];
  };

  const left = rank(a);
  const right = rank(b);
  if (left[0] !== right[0]) return left[0] - right[0];
  if (left[1] !== right[1]) return left[1] - right[1];
  return left[2].localeCompare(right[2]);
}

function buildSessionRows(detail) {
  const meet = detail && detail.meet ? detail.meet : {};
  const baseDate = meet.start_date || meet.meet_date || null;
  const rows = [];
  const seen = new Set();

  const addRow = (row) => {
    const meetDay = String(row && row.meet_day ? row.meet_day : "").slice(0, 10);
    const sessionLabel = String(row && row.session_label ? row.session_label : "").trim();
    if (!meetDay || !sessionLabel) return;
    const key = `${meetDay}|${sessionLabel}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({
      meet_day: meetDay,
      session_label: sessionLabel,
      age_group: row.age_group || "",
      gender: row.gender || "",
      warmup_time: row.warmup_time || "",
    });
  };

  (detail && Array.isArray(detail.days) ? detail.days : []).forEach(addRow);

  (detail && Array.isArray(detail.events) ? detail.events : []).forEach((event) => {
    const parsed = parseEventNameWithSession(event.event_name || "");
    const sessionLabel = String(parsed.sessionLabel || "").trim();
    if (!sessionLabel) return;
    const dayName = sessionLabel.split(/\s+/)[0];
    const meetDay = baseDate ? addDaysToDateOnly(baseDate, getDayOffsetFromDate(baseDate, dayName)) : null;
    addRow({
      meet_day: meetDay,
      session_label: sessionLabel,
      age_group: event.age_group || "",
      gender: event.gender || "",
      warmup_time: "",
    });
  });

  return rows.sort((a, b) => {
    const dateCmp = String(a.meet_day).localeCompare(String(b.meet_day));
    if (dateCmp !== 0) return dateCmp;
    return compareSessionLabels(a.session_label, b.session_label);
  });
}

function showState(el, message, type) {
  el.textContent = message;
  el.classList.remove("hidden", "error", "info");
  if (type === "error") {
    el.classList.add("error");
  } else {
    el.classList.add("info");
  }
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

async function readResponseMessage(res) {
  const text = await res.text();
  if (!text || !text.trim()) {
    return "";
  }

  try {
    const data = JSON.parse(text);
    return String(
      data && (data.message || data.error || data.details)
        ? data.message || data.error || data.details
        : "",
    ).trim();
  } catch {
    return text.replace(/\s+/g, " ").trim().slice(0, 240);
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

async function downloadOriginalMeetFile(meetId, fileName) {
  const parsedMeetId = Number(meetId);
  if (!Number.isInteger(parsedMeetId) || parsedMeetId <= 0) {
    throw new Error("Invalid meet id");
  }

  const response = await apiFetch(`/api/meets/${parsedMeetId}/original-file`);
  if (!response.ok) {
    const message = await readResponseMessage(response);
    throw new Error(message || `Download failed (${response.status})`);
  }

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const downloadName = String(fileName || `meet-${parsedMeetId}.pdf`).trim();
  const isPdfFile =
    /\.pdf$/i.test(downloadName) ||
    String(blob.type || "").toLowerCase().includes("pdf");

  try {
    if (isPdfFile) {
      const opened = window.open(blobUrl, "_blank", "noopener,noreferrer");
      if (opened) {
        return;
      }
    }

    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  }
}

async function checkHealth() {
  try {
    const res = await fetch("/api/health");
    if (!res.ok) throw new Error("bad response");
    await res.json();
  } catch {
    return;
  }
}

function applyRoleUI() {
  userRoleBadge.textContent = currentUser.role.toUpperCase();
  userRoleBadge.className = `badge role-badge role-${currentUser.role}`;

  const canManageMeets =
    currentUser.role === "admin" || currentUser.role === "coach";
  const canImport = currentUser.role === "admin";

  if (canManageMeets) {
    show(adminCreateMeetCard);
  } else {
    hide(adminCreateMeetCard);
  }

  if (canImport) {
    show(adminImportCard);
  } else {
    hide(adminImportCard);
  }

  if (canManageMeets) {
    show(manualTimeCard);
  } else {
    hide(manualTimeCard);
  }
}

if (meetCreateForm) {
  meetCreateForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    hide(meetCreateStatus);
    btnCreateMeet.disabled = true;
    btnCreateMeet.textContent = "Adding...";

    try {
      const payload = {
        meet_name: meetCreateName.value.trim(),
        meet_date: meetCreateDate.value,
        location: meetCreateLocation.value.trim(),
        host_team: meetCreateHostTeam.value.trim(),
      };

      const res = await apiFetch("/api/meets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error((data && data.message) || `Failed (${res.status})`);
      }

      meetCreateForm.reset();
      showState(
        meetCreateStatus,
        `Meet created: ${data.meet.meet_name}`,
        "info",
      );
      await loadMeets();
    } catch (error) {
      showState(meetCreateStatus, `Create failed: ${error.message}`, "error");
    } finally {
      btnCreateMeet.disabled = false;
      btnCreateMeet.textContent = "Add Meet";
    }
  });
}

function renderMeetRow(meet) {
  const tr = document.createElement("tr");
  tr.dataset.meetId = String(meet.id);
  const canDeleteMeet = currentUser && currentUser.role === "admin";
  const actionButtons = canDeleteMeet
    ? `<div style="display:flex; gap:0.45rem; flex-wrap:wrap;">
         <button class="btn btn-secondary" data-open-meet="${meet.id}" type="button">Open</button>
         <button class="btn btn-danger" data-delete-meet="${meet.id}" type="button">Delete</button>
       </div>`
    : `<button class="btn btn-secondary" data-open-meet="${meet.id}" type="button">Open</button>`;
  tr.innerHTML = `
    <td>${escHtml(meet.meet_name)}</td>
    <td>${formatDate(meet.meet_date)}</td>
    <td>${escHtml(meet.location || "-")}</td>
    <td>${Number(meet.event_count) || 0}</td>
    <td>${actionButtons}</td>
  `;
  return tr;
}

async function loadMeets() {
  hide(meetsError);
  hide(meetsEmpty);
  hide(meetsTable);
  show(meetsLoading);

  try {
    const res = await apiFetch("/api/meets");
    if (!res.ok) {
      throw new Error(`Server error: ${res.status}`);
    }

    const meets = await res.json();
    meetsTbody.innerHTML = "";

    if (!meets.length) {
      hide(meetsLoading);
      show(meetsEmpty);
      hide(meetDetailCard);
      return;
    }

    meets.forEach((meet) => meetsTbody.appendChild(renderMeetRow(meet)));

    hide(meetsLoading);
    show(meetsTable);
  } catch (error) {
    hide(meetsLoading);
    showState(meetsError, `Failed to load meets: ${error.message}`, "error");
  }
}

function declarationKey(swimmerId, meetDay) {
  return `${swimmerId}|${String(meetDay).slice(0, 10)}|`;
}

function declarationSessionKey(swimmerId, meetDay, sessionLabel) {
  return `${swimmerId}|${String(meetDay).slice(0, 10)}|${String(sessionLabel || "").trim()}`;
}

function renderMeetDays(days) {
  meetDays.innerHTML = days
    .map((row) => {
      const sessionLabel = String(row.session_label || "").trim();
      const dateLabel = formatDate(row.meet_day);
      const chipLabel = sessionLabel
        ? `${sessionLabel} • ${dateLabel}`
        : dateLabel;
      return `<span class="chip">${escHtml(chipLabel)}</span>`;
    })
    .join("");
}

function renderImportantInfo(detail) {
  const importantInfoCard = document.getElementById("meet-important-info");
  const importantInfoContent = document.getElementById("meet-info-content");
  if (!importantInfoCard || !importantInfoContent) return;

  const meet = detail && detail.meet ? detail.meet : {};
  const days = Array.isArray(detail && detail.days) ? detail.days : [];

  // Build date range section
  let dateRangeHtml = "";
  if (meet.start_date || meet.end_date) {
    const startDateStr = meet.start_date ? formatDate(meet.start_date) : "TBD";
    const endDateStr = meet.end_date ? formatDate(meet.end_date) : "TBD";
    const dateRangeText =
      meet.start_date && meet.end_date && meet.start_date !== meet.end_date
        ? `${startDateStr} to ${endDateStr}`
        : startDateStr;

    dateRangeHtml = `
      <div style="padding: 0.75rem; border: 1px solid #dee2e6; border-radius: 4px;">
        <div style="font-weight: 600; margin-bottom: 0.5rem;">Date Range</div>
        <div>${escHtml(dateRangeText)}</div>
      </div>
    `;
  }

  // Build location section
  let locationHtml = "";
  if (meet.location) {
    locationHtml = `
      <div style="padding: 0.75rem; border: 1px solid #dee2e6; border-radius: 4px;">
        <div style="font-weight: 600; margin-bottom: 0.5rem;">Location</div>
        <div>${escHtml(meet.location)}</div>
      </div>
    `;
  }

  // Build warmup times section
  let warmupHtml = "";
  const sessionsWithWarmup = days.filter((d) => d.warmup_time);
  if (sessionsWithWarmup.length > 0) {
    const warmupRows = sessionsWithWarmup
      .map((d) => {
        const sessionName = d.session_label || formatDate(d.meet_day);
        return `
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; font-size: 0.9rem;">
            <div style="color: #666;">${escHtml(sessionName)}:</div>
            <div>${escHtml(d.warmup_time)}</div>
          </div>
        `;
      })
      .join("");

    warmupHtml = `
      <div style="padding: 0.75rem; border: 1px solid #dee2e6; border-radius: 4px;">
        <div style="font-weight: 600; margin-bottom: 0.5rem;">Warm-up Times</div>
        ${warmupRows}
      </div>
    `;
  }

  // Build original file section
  let fileHtml = "";
  if (meet.import_filename) {
    const meetId = Number(meet.id);
    fileHtml = `
      <div style="padding: 0.75rem; border: 1px solid #dee2e6; border-radius: 4px;">
        <div style="font-weight: 600; margin-bottom: 0.5rem;">Original File</div>
        <div style="word-break: break-all; font-size: 0.9rem;">
          <a href="#"
             data-download-original-file="1"
             data-meet-id="${Number.isInteger(meetId) ? meetId : ""}"
             data-file-name="${escHtml(meet.import_filename)}"
             style="color: #0066cc; text-decoration: none; cursor: pointer; display: inline-flex; align-items: center; gap: 0.5rem;">
            <span>📄</span>
            <span>${escHtml(meet.import_filename)}</span>
          </a>
        </div>
      </div>
    `;
  }

  const contentHtml = [dateRangeHtml, locationHtml, warmupHtml, fileHtml]
    .filter(Boolean)
    .join("");

  if (contentHtml) {
    importantInfoContent.innerHTML = contentHtml;
    show(importantInfoCard);
  } else {
    hide(importantInfoCard);
  }
}

function renderMeetOverview(detail) {
  if (!meetOverview) return;

  const meet = detail && detail.meet ? detail.meet : {};
  const dayCount = Array.isArray(detail && detail.days)
    ? detail.days.length
    : 0;
  const eventCount = Array.isArray(detail && detail.events)
    ? detail.events.length
    : 0;

  // Calculate date range from all meet days
  let dateRangeDisplay = formatDate(meet.meet_date);
  if (Array.isArray(detail && detail.days) && detail.days.length > 1) {
    const dates = detail.days
      .map((day) => String(day.meet_day || "").slice(0, 10))
      .filter(Boolean)
      .sort();

    if (dates.length > 1) {
      const firstDate = new Date(dates[0] + "T00:00:00");
      const lastDate = new Date(dates[dates.length - 1] + "T00:00:00");

      if (
        !Number.isNaN(firstDate.getTime()) &&
        !Number.isNaN(lastDate.getTime())
      ) {
        const firstMonth = firstDate.toLocaleDateString("en-US", {
          month: "short",
        });
        const firstDay = firstDate.getDate();
        const lastMonth = lastDate.toLocaleDateString("en-US", {
          month: "short",
        });
        const lastDay = lastDate.getDate();
        const year = firstDate.getFullYear();

        // Format as "May 1-3, 2026" or "May 1 - Jun 3, 2026" if different months
        if (firstMonth === lastMonth) {
          dateRangeDisplay = `${firstMonth} ${firstDay}-${lastDay}, ${year}`;
        } else {
          dateRangeDisplay = `${firstMonth} ${firstDay} - ${lastMonth} ${lastDay}, ${year}`;
        }
      }
    }
  }

  meetOverview.innerHTML = `
    <div>
      <p class="summary-label">Meet Name</p>
      <p class="summary-value">${escHtml(meet.meet_name || "-")}</p>
    </div>
    <div>
      <p class="summary-label">Meet Date</p>
      <p class="summary-value">${dateRangeDisplay}</p>
    </div>
    <div>
      <p class="summary-label">Location</p>
      <p class="summary-value">${escHtml(meet.location || "Location TBD")}</p>
    </div>
    <div>
      <p class="summary-label">Host Team</p>
      <p class="summary-value">${escHtml(meet.host_team || "-")}</p>
    </div>
    <div>
      <p class="summary-label">Sessions</p>
      <p class="summary-value">${dayCount}</p>
    </div>
    <div>
      <p class="summary-label">Events</p>
      <p class="summary-value">${eventCount} total</p>
    </div>
  `;
}

function parseEventNameWithSession(eventName) {
  const raw = String(eventName || "").trim();
  const match = raw.match(/^\[([^\]]+)\]\s*(.+)$/);
  if (!match) {
    return { sessionLabel: "", eventTitle: raw };
  }

  return {
    sessionLabel: String(match[1] || "").trim(),
    eventTitle: String(match[2] || "").trim(),
  };
}

function extractAgeGroupFromEventName(eventName) {
  if (!eventName) return "";

  // Format: "Gender AgeGroup Distance Stroke"
  // Example: "Female 11-12 50m Freestyle"
  const parts = String(eventName).trim().split(/\s+/);

  // If we have at least 2 parts (gender + age group)
  if (parts.length >= 2) {
    // The second part should be the age group
    const ageGroup = parts[1];

    // Check if it looks like an age group (contains digits or "Open" or "&")
    if (
      ageGroup &&
      (ageGroup.match(/\d/) || ageGroup === "Open" || ageGroup.includes("&"))
    ) {
      return ageGroup;
    }
  }

  return "";
}

function renderPublicEventsTable(detail) {
  if (!meetPublicEventsTbody) return;

  const events = Array.isArray(detail && detail.events) ? detail.events : [];
  if (!events.length) {
    meetPublicEventsTbody.innerHTML =
      '<tr><td colspan="4" class="muted-inline">No events imported for this meet.</td></tr>';
    return;
  }

  const rows = [];
  const eventsBySession = new Map();

  events.forEach((event) => {
    const parsed = parseEventNameWithSession(event.event_name || "");
    const sessionLabel = parsed.sessionLabel || "Unscheduled";
    if (!eventsBySession.has(sessionLabel)) {
      eventsBySession.set(sessionLabel, []);
    }
    eventsBySession.get(sessionLabel).push(event);
  });

  Array.from(eventsBySession.entries())
    .sort((a, b) => compareSessionLabels(a[0], b[0]))
    .forEach(([sessionLabel, sessionEvents]) => {
      rows.push(
        `<tr class="date-separator-row"><td colspan="4">${escHtml(sessionLabel)}</td></tr>`,
      );

      sessionEvents.forEach((event, index) => {
        const parsed = parseEventNameWithSession(event.event_name || "");
        const eventTitle = parsed.eventTitle || String(event.event_name || "");

        // Prefer the stored event_number; fall back to parsing it out of the name
        const eventNumberRaw = event.event_number != null
          ? event.event_number
          : (() => {
              const m = String(eventTitle || "").match(/\bEvent\s+(\d{1,3})\b/i);
              return m ? m[1] : null;
            })();
        const eventNumber = eventNumberRaw != null ? String(eventNumberRaw) : String(index + 1);
        const cleanEventName = String(eventTitle || "-")
          .replace(/\bEvent\s+\d{1,3}\b\s*/i, "")
          .trim();
        const displayEventName = cleanEventName;

        const standardText = event.qualifying_time_text || "NT";
        const entryState = "OPEN";
        const entryClass = "event-entry-in";

        const ageGroup =
          event.age_group || extractAgeGroupFromEventName(cleanEventName);
        const tagBits = [ageGroup || ""].filter(Boolean);

        const metaBits = [
          event.distance_meters ? `${event.distance_meters}m` : "",
          event.stroke || "",
        ]
          .filter(Boolean)
          .join(" ");

        rows.push(`
            <tr class="meet-event-row">
              <td>
                <span class="event-entry-pill ${entryClass}">${entryState}</span>
              </td>
              <td>
                <div class="event-main-line">
                  <span class="event-number-pill">#${escHtml(eventNumber)}</span>
                  <span class="event-title-text">${escHtml(displayEventName || cleanEventName || eventTitle || "-")}</span>
                </div>
                <div class="event-sub-line">${escHtml(metaBits || "Distance and stroke pending")}</div>
              </td>
              <td><span class="event-time-text">${escHtml(standardText)}</span></td>
              <td>
                ${
                  tagBits.length
                    ? tagBits
                        .map(
                          (tag) =>
                            `<span class="event-standard-chip">${escHtml(tag)}</span>`,
                        )
                        .join("")
                    : '<span class="event-standard-muted">Open</span>'
                }
              </td>
            </tr>
          `);
      });
    });

  meetPublicEventsTbody.innerHTML = rows.join("");
}

function renderMeetEditForm(detail) {
  const canEditMeet = !!(detail && detail.can_select_events);
  if (!canEditMeet) {
    hide(meetEditControls);
    return;
  }

  meetEditName.value =
    detail && detail.meet && detail.meet.meet_name ? detail.meet.meet_name : "";
  meetEditLocation.value =
    detail && detail.meet && detail.meet.location ? detail.meet.location : "";
  meetEditHostTeam.value =
    detail && detail.meet && detail.meet.host_team ? detail.meet.host_team : "";

  // Get date range from meet days
  const dayCount = Array.isArray(detail && detail.days)
    ? detail.days.length
    : 0;
  if (dayCount > 0) {
    const dates = (detail.days || [])
      .map((day) => String(day.meet_day || "").slice(0, 10))
      .filter(Boolean)
      .sort();

    if (dates.length > 0) {
      meetEditStartDate.value = dates[0];
      meetEditEndDate.value = dates[dates.length - 1];
    }
  }

  hide(meetEditStatus);
  show(meetEditControls);
}

function renderCoachEventSelection(detail) {
  if (!coachEventControls || !eventsTbody || !coachSelectionStatus) {
    return;
  }

  if (!detail.can_select_events) {
    hide(coachEventControls);
    return;
  }

  const rows = detail.events
    .map((event) => {
      const standard = event.qualifying_time_text || "No standard";
      const parsed = parseEventNameWithSession(event.event_name || "");
      const displayName = parsed.eventTitle || event.event_name;
      return `
        <tr>
          <td><input type="checkbox" data-event-select="${event.id}" ${Number(event.is_selected) ? "checked" : ""} /></td>
          <td>${escHtml(displayName)}</td>
          <td>${escHtml(event.stroke || "-")}</td>
          <td>${event.distance_meters || "-"}</td>
          <td>${escHtml(event.gender || "-")}</td>
          <td>${escHtml(standard)}</td>
        </tr>
      `;
    })
    .join("");

  eventsTbody.innerHTML =
    rows || '<tr><td colspan="6" class="muted-inline">No events.</td></tr>';
  hide(coachSelectionStatus);
  show(coachEventControls);
}

function renderDeclarationTable(detail) {
  if (!detail.can_declare) {
    hide(declareControls);
    return;
  }

  const dayValues = buildSessionRows(detail).map((row) => ({
    meet_day: String(row.meet_day).slice(0, 10),
    session_label: String(row.session_label || "").trim(),
    age_group: row.age_group || "",
    gender: row.gender || "",
  }));

  // Debug: Log what we have
  console.log("renderDeclarationTable - dayValues:", dayValues);
  console.log(
    "renderDeclarationTable - detail.declaration_eligibility:",
    detail.declaration_eligibility,
  );

  const declarationMap = new Map();

  (detail.declarations || []).forEach((entry) => {
    declarationMap.set(
      declarationSessionKey(
        entry.swimmer_id,
        entry.meet_day,
        entry.session_label,
      ),
      {
        status: entry.status || "maybe",
      },
    );
  });

  // Build eligibility map: swimmerId|meet_day|session_label -> allowed
  const eligibilityMap = new Map();
  (detail.declaration_eligibility || []).forEach((entry) => {
    const key = declarationSessionKey(
      entry.swimmer_id,
      entry.meet_day,
      entry.session_label,
    );
    eligibilityMap.set(key, entry.allowed);
  });

  const cards = [];
  (detail.swimmers || []).forEach((swimmer) => {
    if (!dayValues.length) {
      return;
    }

    // Filter to only eligible sessions for this swimmer
    const eligibleSessions = dayValues.filter((dayInfo) => {
      const key = declarationSessionKey(
        swimmer.swimmer_id,
        dayInfo.meet_day,
        dayInfo.session_label,
      );
      const isEligible = eligibilityMap.get(key) === true;
      console.log(
        `Checking swimmer ${swimmer.swimmer_id} on ${dayInfo.meet_day} "${dayInfo.session_label}": key="${key}" eligible=${isEligible}`,
      );
      return isEligible;
    });

    console.log(
      `Swimmer ${swimmer.swimmer_name}: ${eligibleSessions.length} eligible sessions`,
    );

    if (!eligibleSessions.length) {
      return; // Skip swimmers with no eligible sessions
    }

    const sessionRows = eligibleSessions
      .map((dayInfo) => {
        const key = declarationSessionKey(
          swimmer.swimmer_id,
          dayInfo.meet_day,
          dayInfo.session_label,
        );
        const existing = declarationMap.get(key) || { status: "no" };
        const statusValue = existing.status === "yes" ? "yes" : "no";
        const sessionName = dayInfo.session_label || "Session";
        const heading = `${sessionName} • ${formatDate(dayInfo.meet_day)}`;
        const ruleBits = [dayInfo.age_group || "", dayInfo.gender || ""]
          .filter(Boolean)
          .join(" • ");
        const eligibilityText = ruleBits ? `Eligible: ${ruleBits}` : "Eligible";

        return `
          <div class="declare-session-row">
            <div class="declare-session-head">${escHtml(heading)}</div>
            <div class="declare-session-meta">${escHtml(eligibilityText)}</div>
            <div class="declare-session-toggle" data-declare-toggle-group="${swimmer.swimmer_id}|${escHtml(dayInfo.meet_day)}|${escHtml(dayInfo.session_label)}">
              <button type="button" class="declare-choice-btn ${statusValue === "yes" ? "active" : ""}" data-declare-choice="yes" data-swimmer-id="${swimmer.swimmer_id}" data-day="${escHtml(dayInfo.meet_day)}" data-session-label="${escHtml(dayInfo.session_label)}">Opt in</button>
              <button type="button" class="declare-choice-btn ${statusValue === "no" ? "active" : ""}" data-declare-choice="no" data-swimmer-id="${swimmer.swimmer_id}" data-day="${escHtml(dayInfo.meet_day)}" data-session-label="${escHtml(dayInfo.session_label)}">Opt out</button>
            </div>
            <input type="hidden" data-declare-status="${swimmer.swimmer_id}" data-day="${escHtml(dayInfo.meet_day)}" data-session-label="${escHtml(dayInfo.session_label)}" value="${statusValue}" />
          </div>
        `;
      })
      .join("");

    cards.push(`
      <article class="declare-swimmer-card">
        <div class="declare-swimmer-header">${escHtml(swimmer.swimmer_name)}</div>
        <div class="declare-swimmer-group">${escHtml(swimmer.group_name || "")}</div>
        ${sessionRows}
      </article>
    `);
  });

  declareTbody.innerHTML =
    cards.join("") ||
    '<div class="muted-inline" style="padding:0.65rem;">No eligible swimmers or meet days.</div>';
  hide(declareStatus);
  show(declareControls);
}

function renderCoachEntryTable(detail) {
  if (!detail.can_manage_entries) {
    hide(coachEntryControls);
    return;
  }

  const declaredYesSet = new Set(
    (detail.declarations || [])
      .filter((row) => String(row.status || "").toLowerCase() === "yes")
      .map((row) => Number(row.swimmer_id)),
  );

  const allMeetEvents = detail.events || [];
  const eligibilityBySwimmer = new Map(
    (detail.eligibility || []).map((row) => [
      Number(row.swimmer_id),
      new Set((row.eligible_event_ids || []).map((id) => Number(id))),
    ]),
  );
  const entrySet = new Set(
    (detail.entries || []).map(
      (row) => `${Number(row.swimmer_id)}|${Number(row.meet_event_id)}`,
    ),
  );

  const rows = [];
  (detail.swimmers || []).forEach((swimmer) => {
    const swimmerId = Number(swimmer.swimmer_id);
    if (!declaredYesSet.has(swimmerId)) {
      return;
    }

    const eligibleEvents = allMeetEvents.filter((event) => {
      const eligibleSet = eligibilityBySwimmer.get(swimmerId) || new Set();
      return eligibleSet.has(Number(event.id));
    });

    // Group events by session
    const eventsBySession = new Map();
    eligibleEvents.forEach((event) => {
      const parsed = parseEventNameWithSession(event.event_name || "");
      const sessionLabel = parsed.sessionLabel || "Unscheduled";
      if (!eventsBySession.has(sessionLabel)) {
        eventsBySession.set(sessionLabel, []);
      }
      eventsBySession.get(sessionLabel).push(event);
    });

    const sessionSections = Array.from(eventsBySession.entries())
      .sort((a, b) => compareSessionLabels(a[0], b[0]))
      .map(([sessionLabel, sessionEvents]) => {
        const eventRows = sessionEvents
          .map((event) => {
            const checked = entrySet.has(`${swimmerId}|${Number(event.id)}`)
              ? "checked"
              : "";
            const parsed = parseEventNameWithSession(event.event_name || "");
            const displayName = parsed.eventTitle || event.event_name;
            // Determine best time for this swimmer/event
            const bestTimeText =
              getBestTimeForSwimmerAndEvent(detail, swimmerId, event) || "NT";

            return `
              <div class="entry-row" style="display:flex; align-items:center; gap:0.6rem; margin:0 0 0.45rem 0;">
                <label style="display:flex; align-items:center; gap:0.5rem; margin:0;">
                  <input type="checkbox" data-entry-swimmer="${swimmerId}" data-entry-event="${event.id}" ${checked} />
                  <span>${escHtml(displayName)}</span>
                </label>
                <div style="margin-left:auto; display:flex; gap:0.5rem; align-items:center;">
                  <button type="button" class="btn btn-link btn-time" data-time-display data-swimmer="${swimmerId}" data-event="${event.id}" style="color:#0b66ff; border:0; background:transparent; cursor:pointer; padding:0;">${escHtml(bestTimeText)}</button>
                  <button type="button" class="btn btn-secondary btn-custom-time" data-open-custom data-swimmer="${swimmerId}" data-event="${event.id}" style="font-size:0.85rem;">Custom</button>
                </div>
              </div>`;
          })
          .join("");
        return `
          <div style="margin-bottom: 0.75rem;">
            <div style="font-weight: 600; font-size: 0.9rem; color: #333; margin-bottom: 0.5rem; padding-bottom: 0.5rem; border-bottom: 1px solid #ddd;">${escHtml(sessionLabel)}</div>
            <div style="margin-left: 0.5rem;">${eventRows}</div>
          </div>
        `;
      })
      .join("");

    const eventContent = eligibleEvents.length
      ? sessionSections
      : '<span class="muted-inline">No eligible events for this swimmer.</span>';

    rows.push(`
      <tr data-entry-swimmer-row="${swimmerId}">
        <td>${escHtml(swimmer.swimmer_name)}</td>
        <td>${eventContent}</td>
      </tr>
    `);
  });

  coachEntryTbody.innerHTML =
    rows.join("") ||
    '<tr><td colspan="2" class="muted-inline">No swimmers with "Yes" declarations yet.</td></tr>';
  hide(coachEntryStatus);
  show(coachEntryControls);
}

function getBestTimeForSwimmerAndEvent(detail, swimmerId, event) {
  try {
    if (!detail || !Array.isArray(detail.best_times) || !event) return null;
    const stroke = String(event.stroke || "").trim();
    const distance = Number(event.distance_meters) || null;
    const course = String(event.course || "SCY")
      .trim()
      .toUpperCase();

    // find exact match by swimmer, stroke, distance, and course
    const match = detail.best_times.find((bt) => {
      const btCourse = String(bt.course || "SCY")
        .trim()
        .toUpperCase();
      return (
        Number(bt.swimmer_id) === Number(swimmerId) &&
        String(bt.stroke || "")
          .trim()
          .toLowerCase() ===
          String(stroke || "")
            .trim()
            .toLowerCase() &&
        (distance == null
          ? false
          : Number(bt.distance_meters) === Number(distance)) &&
        btCourse === course
      );
    });

    if (match)
      return (
        match.best_time_text ||
        (match.best_time_seconds != null
          ? String(match.best_time_seconds)
          : null)
      );
    return null;
  } catch (e) {
    return null;
  }
}

// Handle custom time UI for coach entry table
coachEntryTbody.addEventListener("click", (ev) => {
  const openBtn = ev.target.closest("button[data-open-custom]");
  if (!openBtn) return;
  const swimmerId = Number(openBtn.getAttribute("data-swimmer"));
  const eventId = Number(openBtn.getAttribute("data-event"));
  if (!Number.isInteger(swimmerId) || !Number.isInteger(eventId)) return;

  // Ask user to enter a custom time (simple prompt for now)
  const currentVal =
    (selectedMeetDetail &&
      selectedMeetDetail._custom_entry_times &&
      selectedMeetDetail._custom_entry_times[`${swimmerId}|${eventId}`]) ||
    "";
  const custom = window.prompt(
    "Enter custom time (e.g. 1:30.00) or leave blank to clear:",
    currentVal || "",
  );
  if (custom === null) return; // cancelled

  // store on selectedMeetDetail for now
  if (!selectedMeetDetail) selectedMeetDetail = detail;
  if (!selectedMeetDetail._custom_entry_times)
    selectedMeetDetail._custom_entry_times = {};
  const key = `${swimmerId}|${eventId}`;
  if (custom && String(custom).trim()) {
    selectedMeetDetail._custom_entry_times[key] = String(custom).trim();
  } else {
    delete selectedMeetDetail._custom_entry_times[key];
  }

  // Update displayed button text
  const timeButton = coachEntryTbody.querySelector(
    `button[data-time-display][data-swimmer="${swimmerId}"][data-event="${eventId}"]`,
  );
  if (timeButton) {
    const eventObj =
      selectedMeetDetail && Array.isArray(selectedMeetDetail.events)
        ? selectedMeetDetail.events.find(
            (ev) => Number(ev.id) === Number(eventId),
          )
        : null;
    timeButton.textContent =
      selectedMeetDetail._custom_entry_times[key] ||
      getBestTimeForSwimmerAndEvent(detail, swimmerId, eventObj) ||
      "NT";
  }
});

async function loadMeetDetail(meetId) {
  try {
    const res = await apiFetch(`/api/meets/${meetId}`);
    if (!res.ok) {
      const data = await safeJson(res);
      throw new Error((data && data.message) || `Failed: ${res.status}`);
    }

    const detail = await res.json();
    selectedMeetId = meetId;
    selectedMeetDetail = detail;

    const sessionRows = buildSessionRows(detail);
    const displayDetail = {
      ...detail,
      days: sessionRows,
    };

    meetDetailTitle.textContent = detail.meet.meet_name;
    meetDetailMeta.textContent = `${formatDate(detail.meet.meet_date)} · ${detail.meet.location || "Location TBD"}${detail.meet.host_team ? ` · ${detail.meet.host_team}` : ""}`;
    renderMeetOverview(displayDetail);
    renderImportantInfo(displayDetail);
    renderMeetEditForm(displayDetail);
    renderMeetDays(sessionRows);
    renderPublicEventsTable(detail);
    renderDeclarationTable(displayDetail);
    renderCoachEntryTable(detail);

    show(meetDetailCard);
  } catch (error) {
    showState(meetsError, `Failed to open meet: ${error.message}`, "error");
  }
}

async function loadTimes() {
  hide(timesError);
  hide(timesEmpty);
  hide(timesTable);
  show(timesLoading);

  try {
    const res = await apiFetch("/api/swimmer-times");
    if (!res.ok) {
      throw new Error(`Server error: ${res.status}`);
    }

    const rows = await res.json();
    timesTbody.innerHTML = "";

    if (!rows.length) {
      hide(timesLoading);
      show(timesEmpty);
      return;
    }

    timesTbody.innerHTML = rows
      .map(
        (row) => `
          <tr>
            <td>${escHtml(row.swimmer_name)}</td>
            <td>${escHtml(row.stroke)}</td>
            <td>${Number(row.distance_meters) || 0}m</td>
            <td>${escHtml(row.course || "SCY")}</td>
            <td>${escHtml(row.best_time_text || row.best_time_seconds)}</td>
            <td>${formatDate(row.achieved_on)}</td>
          </tr>
        `,
      )
      .join("");

    hide(timesLoading);
    show(timesTable);
  } catch (error) {
    hide(timesLoading);
    showState(timesError, `Failed to load times: ${error.message}`, "error");
  }
}

async function loadSwimmerOptionsForManualTime() {
  if (!timeSwimmerName && !timesImportSwimmer) {
    return;
  }

  try {
    let swimmers = [];

    const optionsRes = await apiFetch("/api/swimmers/options");
    if (optionsRes.ok) {
      const optionsData = await optionsRes.json();
      swimmers = Array.isArray(optionsData)
        ? optionsData
        : Array.isArray(optionsData && optionsData.swimmers)
          ? optionsData.swimmers
          : [];
    } else {
      const res = await apiFetch("/api/team");
      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }
      const data = await res.json();
      swimmers = Array.isArray(data && data.swimmers) ? data.swimmers : [];
    }

    if (!swimmers.length) {
      if (timeSwimmerName) {
        timeSwimmerName.innerHTML =
          '<option value="">No swimmers found</option>';
      }
      if (timesImportSwimmer) {
        timesImportSwimmer.innerHTML =
          '<option value="">No swimmers found</option>';
      }
      return;
    }

    const options = swimmers
      .map((swimmer) => {
        const swimmerId =
          swimmer && swimmer.swimmer_id != null
            ? swimmer.swimmer_id
            : swimmer && swimmer.id != null
              ? swimmer.id
              : "";
        const swimmerName =
          swimmer && (swimmer.swimmer_name || swimmer.name || swimmer.email)
            ? swimmer.swimmer_name || swimmer.name || swimmer.email
            : `Swimmer ${swimmerId || ""}`.trim();
        const groupSuffix =
          swimmer && swimmer.group_name
            ? ` (${escHtml(swimmer.group_name)})`
            : "";
        return `<option value="${escHtml(swimmerId)}">${escHtml(swimmerName)}${groupSuffix}</option>`;
      })
      .join("");

    if (timeSwimmerName) {
      timeSwimmerName.innerHTML = `<option value="">Select swimmer...</option>${options}`;
    }

    if (timesImportSwimmer) {
      timesImportSwimmer.innerHTML = `<option value="">Auto-detect from file</option>${options}`;
    }

    if (typeof TomSelect !== "undefined") {
      if (timeSwimmerName && timeSwimmerName.tomselect) {
        timeSwimmerName.tomselect.destroy();
      }

      if (timesImportSwimmer && timesImportSwimmer.tomselect) {
        timesImportSwimmer.tomselect.destroy();
      }

      if (timeSwimmerName) {
        new TomSelect(timeSwimmerName, {
          create: false,
          allowEmptyOption: true,
          maxOptions: 500,
          searchField: ["text"],
          dropdownParent: "body",
          copyClassesToDropdown: true,
        });
      }

      if (timesImportSwimmer) {
        new TomSelect(timesImportSwimmer, {
          create: false,
          allowEmptyOption: true,
          maxOptions: 500,
          searchField: ["text"],
          dropdownParent: "body",
          copyClassesToDropdown: true,
        });
      }
    }
  } catch (error) {
    if (timeSwimmerName) {
      timeSwimmerName.innerHTML =
        '<option value="">Failed to load swimmers</option>';
    }
    if (timesImportSwimmer) {
      timesImportSwimmer.innerHTML =
        '<option value="">Failed to load swimmers</option>';
    }
    showState(
      manualTimeStatus,
      `Could not load swimmers: ${error.message}`,
      "error",
    );
  }
}

async function readSelectedFile(inputEl) {
  if (!inputEl || !inputEl.files || !inputEl.files[0]) {
    throw new Error("Please choose a file first.");
  }

  const file = inputEl.files[0];
  return {
    file,
    file_type: file.type || "application/octet-stream",
    file_name: file.name,
  };
}

function isPdfFile(file) {
  if (!file) return false;
  return (
    String(file.type || "").toLowerCase() === "application/pdf" ||
    String(file.name || "")
      .toLowerCase()
      .endsWith(".pdf")
  );
}

let pdfJsLoadPromise = null;

function loadScriptTag(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "1") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error(`Failed to load ${src}`)),
        {
          once: true,
        },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = "1";
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

async function ensurePdfJsLib() {
  if (typeof window !== "undefined" && window.pdfjsLib) {
    return window.pdfjsLib;
  }

  if (!pdfJsLoadPromise) {
    pdfJsLoadPromise = (async () => {
      const candidates = [
        "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js",
        "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js",
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
      ];

      let lastError = null;
      for (const src of candidates) {
        try {
          await loadScriptTag(src);
          if (typeof window !== "undefined" && window.pdfjsLib) {
            return window.pdfjsLib;
          }
        } catch (error) {
          lastError = error;
        }
      }

      throw (
        lastError ||
        new Error("Unable to load PDF extraction library from CDN sources.")
      );
    })();
  }

  return pdfJsLoadPromise;
}

async function extractPdfTextInBrowser(file) {
  const pdfjsLib = await ensurePdfJsLib();

  if (!pdfjsLib || typeof pdfjsLib.getDocument !== "function") {
    throw new Error(
      "PDF text extraction library is unavailable in this browser session.",
    );
  }

  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
  const chunks = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
    const page = await doc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const lines = [];
    let lineBuffer = "";

    (textContent.items || []).forEach((item) => {
      const part = item && item.str ? String(item.str).replace(/\s+/g, " ").trim() : "";
      if (part) {
        lineBuffer = lineBuffer ? `${lineBuffer} ${part}` : part;
      }
      if (item && item.hasEOL && lineBuffer) {
        lines.push(lineBuffer.trim());
        lineBuffer = "";
      }
    });

    if (lineBuffer) {
      lines.push(lineBuffer.trim());
    }

    const pageText = lines.join("\n").trim();

    if (pageText) {
      chunks.push(pageText);
    }
  }

  const text = chunks.join("\n").trim();
  if (!text) {
    throw new Error(
      "The PDF appears to be image-only. Use a text-searchable PDF export.",
    );
  }
  return text;
}

function compactMeetTextForImport(rawText) {
  const text = String(rawText || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = text
    .split("\n")
    .map((line) => String(line || "").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const keepers = [];
  const seen = new Set();
  const pushLine = (line) => {
    const key = line.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    keepers.push(line);
  };

  const headingRegex = /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(AM|PM|MID(?:-?DAY)?|AFTERNOON|MORNING|SESSION)\b/i;
  const sessionSummaryRegex = /\bSession\s*\d+\s*:\s*(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i;
  const sessionHeaderRegex = /^Session\s*\d+\b/i;
  const datedSessionLineRegex = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+\d{1,2}\/\d{1,2}\/\d{2,4}\b.*\b(Warm\s*Up|Competition\s+Start|Start)\b/i;
  const tableHeaderRegex = /\bGirls\s+Event\s+Boys\b/i;
  const pairedRowRegex = /^\d{1,3}\s+.+\s+\d{1,3}$/i;
  const explicitDualRegex = /^event\s*#?\s*\d{1,3}\s+.+\s+event\s*#?\s*\d{1,3}$/i;
  const mixedEventRowRegex = /^\d{1,3}\s+(girls?|boys?|mixed)?\s*(25|50|100|200|400|500|800|1000|1500)\b.*\b(freestyle|free|backstroke|back|breaststroke|breast|butterfly|fly|individual\s+medley|im|relay)\b/i;

  for (const line of lines) {
    if (
      headingRegex.test(line) ||
      sessionSummaryRegex.test(line) ||
      sessionHeaderRegex.test(line) ||
      datedSessionLineRegex.test(line) ||
      tableHeaderRegex.test(line) ||
      pairedRowRegex.test(line) ||
      explicitDualRegex.test(line) ||
      mixedEventRowRegex.test(line)
    ) {
      pushLine(line);
    }
  }

  // If compaction is too aggressive, keep original text to avoid losing data.
  const compacted = keepers.join("\n").trim();
  if (!compacted || compacted.length < 400) {
    return text;
  }

  return compacted;
}

function uploadFileMultipart(url, filePayload, extraFields = {}) {
  return apiFetch(url, {
    method: "POST",
    body: (() => {
      const formData = new FormData();
      formData.append(
        "import_file",
        filePayload.file,
        filePayload.file_name || "import.pdf",
      );
      Object.entries(extraFields).forEach(([key, value]) => {
        if (value != null && String(value).trim() !== "") {
          formData.append(key, String(value));
        }
      });
      return formData;
    })(),
  });
}

function uploadTextMultipart(url, fields) {
  return apiFetch(url, {
    method: "POST",
    body: (() => {
      const formData = new FormData();
      Object.entries(fields || {}).forEach(([key, value]) => {
        if (value != null && String(value).trim() !== "") {
          formData.append(key, String(value));
        }
      });
      return formData;
    })(),
  });
}

function build413Message(prefix) {
  return `${prefix} failed (413). Upload was blocked before it reached the app. Retry with a smaller file or raise proxy upload limit (nginx client_max_body_size / Apache LimitRequestBody).`;
}

function shouldRetryPdfImport(response, responseData, filePayload) {
  if (
    !response ||
    response.ok ||
    !filePayload ||
    !isPdfFile(filePayload.file)
  ) {
    return false;
  }

  if (response.status === 413) {
    return true;
  }

  if (response.status === 504) {
    return true;
  }

  const message = String(
    responseData && responseData.message ? responseData.message : "",
  )
    .toLowerCase()
    .trim();

  return (
    message.includes("invalid meet file") ||
    message.includes("no valid events") ||
    message.includes("unable to read text from pdf") ||
    message.includes("pdf support requires pdf-parse") ||
    message.includes("meet file content is empty") ||
    message.includes("content is required") ||
    message.includes("gateway time-out")
  );
}

meetImportForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  btnImportMeet.disabled = true;
  btnImportMeet.textContent = "Importing...";

  try {
    let stage = "reading file";
    const filePayload = await readSelectedFile(meetImportFile);
    let res;
    let data;

    if (isPdfFile(filePayload.file)) {
      stage = "uploading pdf to server";
      showState(meetImportStatus, "Importing PDF on server...", "info");
      res = await uploadFileMultipart("/api/meets/import", filePayload);
      data = await safeJson(res);

      if (!res.ok && shouldRetryPdfImport(res, data, filePayload)) {
        stage = "extracting PDF text in browser";
        showState(meetImportStatus, "Retrying with browser PDF extraction...", "info");

        let extractedText;
        try {
          extractedText = await extractPdfTextInBrowser(filePayload.file);
        } catch (error) {
          throw new Error(`PDF extraction failed: ${error.message}`);
        }

        const compactedText = compactMeetTextForImport(extractedText);

        stage = "sending extracted text to server";
        showState(meetImportStatus, "Importing extracted PDF text...", "info");
        res = await uploadTextMultipart("/api/meets/import", {
          content: compactedText,
          file_type: "text/plain",
          is_pdf: "1",
          file_name: filePayload.file_name || filePayload.file.name || "meet-import.txt",
          encoding: "utf8",
        });
        data = await safeJson(res);
      }
    } else {
      stage = "uploading meet file";
      showState(meetImportStatus, "Uploading meet file...", "info");
      res = await uploadFileMultipart("/api/meets/import", filePayload);
      data = await safeJson(res);
    }

    if (!res.ok) {
      const serverMessage = data && data.message ? String(data.message) : "";
      const serverError = data && data.error ? String(data.error) : "";
      const detailText =
        data && data.details && typeof data.details === "object"
          ? Object.entries(data.details)
              .map(([key, value]) => `${key}: ${value}`)
              .join(", ")
          : "";
      const statusDetails = `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""}`;
      const combinedServerText = [serverMessage, serverError, detailText]
        .filter((part) => part && String(part).trim())
        .join(" | ");
      throw new Error(
        combinedServerText ||
          (res.status === 413
            ? build413Message("Meet import")
            : `Import failed during ${stage}: ${statusDetails}`),
      );
    }

    showState(
      meetImportStatus,
      `Meet imported: ${data.meet.meet_name}`,
      "info",
    );
    meetImportForm.reset();
    await loadMeets();
  } catch (error) {
    const message =
      error && typeof error.message === "string" && error.message.trim()
        ? error.message.trim()
        : "Unknown error (no message from browser/server)";
    console.error("Meet import error:", error);
    showState(meetImportStatus, `Meet import failed: ${message}`, "error");
  } finally {
    btnImportMeet.disabled = false;
    btnImportMeet.textContent = "Import Meet";
  }
});

timesImportForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  btnImportTimes.disabled = true;
  btnImportTimes.textContent = "Importing...";

  try {
    const filePayload = await readSelectedFile(timesImportFile);
    showState(timesImportStatus, "Uploading times file...", "info");

    const selectedDefaultSwimmer = Number(
      timesImportSwimmer && timesImportSwimmer.tomselect
        ? timesImportSwimmer.tomselect.getValue()
        : timesImportSwimmer
          ? timesImportSwimmer.value
          : "",
    );

    if (
      Number.isInteger(selectedDefaultSwimmer) &&
      selectedDefaultSwimmer > 0
    ) {
      filePayload.default_swimmer_id = selectedDefaultSwimmer;
    }

    const res = await uploadFileMultipart(
      "/api/swimmer-times/import",
      filePayload,
      {
        default_swimmer_id:
          Number.isInteger(selectedDefaultSwimmer) && selectedDefaultSwimmer > 0
            ? selectedDefaultSwimmer
            : "",
      },
    );

    const data = await safeJson(res);
    if (!res.ok) {
      throw new Error(
        (data && data.message) ||
          (res.status === 413
            ? build413Message("Times import")
            : `Import failed (${res.status})`),
      );
    }

    const skipped = Array.isArray(data.skipped) ? data.skipped.length : 0;
    showState(
      timesImportStatus,
      `Imported ${data.imported} rows (${skipped} skipped).`,
      "info",
    );
    timesImportForm.reset();
    if (timesImportSwimmer && timesImportSwimmer.tomselect) {
      timesImportSwimmer.tomselect.clear(true);
    }
    await loadTimes();
  } catch (error) {
    showState(
      timesImportStatus,
      `Times import failed: ${error.message}`,
      "error",
    );
  } finally {
    btnImportTimes.disabled = false;
    btnImportTimes.textContent = "Import Times";
  }
});

manualTimeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  btnSaveTime.disabled = true;
  btnSaveTime.textContent = "Saving...";

  try {
    const payload = {
      swimmer_id: Number(
        timeSwimmerName && timeSwimmerName.tomselect
          ? timeSwimmerName.tomselect.getValue()
          : timeSwimmerName.value,
      ),
      stroke: timeStroke.value,
      distance_meters: Number(timeDistance.value),
      best_time: timeBest.value,
      achieved_on: timeAchievedOn.value || null,
    };

    const res = await apiFetch("/api/swimmer-times", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await safeJson(res);
    if (!res.ok) {
      throw new Error((data && data.message) || `Failed (${res.status})`);
    }

    showState(manualTimeStatus, "Best time saved.", "info");
    manualTimeForm.reset();
    await loadTimes();
  } catch (error) {
    showState(manualTimeStatus, `Save failed: ${error.message}`, "error");
  } finally {
    btnSaveTime.disabled = false;
    btnSaveTime.textContent = "Save Best Time";
  }
});

meetsTbody.addEventListener("click", async (event) => {
  const deleteBtn = event.target.closest("button[data-delete-meet]");
  if (deleteBtn) {
    const meetId = Number(deleteBtn.dataset.deleteMeet);
    if (Number.isNaN(meetId)) return;

    const confirmed = window.confirm(
      "Delete this meet and all its related data?",
    );
    if (!confirmed) return;

    deleteBtn.disabled = true;
    const originalText = deleteBtn.textContent;
    deleteBtn.textContent = "Deleting...";
    try {
      let res = await apiFetch(`/api/meets/${meetId}`, {
        method: "DELETE",
      });
      let data = await safeJson(res);

      const routeNotFound =
        !res.ok &&
        res.status === 404 &&
        data &&
        typeof data.message === "string" &&
        data.message.toLowerCase().includes("route not found");

      if (routeNotFound) {
        res = await apiFetch(`/api/meets/${meetId}/delete`, {
          method: "POST",
        });
        data = await safeJson(res);
      }

      if (!res.ok) {
        throw new Error((data && data.message) || `Failed (${res.status})`);
      }

      if (selectedMeetId === meetId) {
        selectedMeetId = null;
        selectedMeetDetail = null;
        hide(meetDetailCard);
      }

      await loadMeets();
      showState(meetsError, "Meet deleted.", "info");
      return;
    } catch (error) {
      showState(meetsError, `Delete failed: ${error.message}`, "error");
    } finally {
      deleteBtn.disabled = false;
      deleteBtn.textContent = originalText;
    }
    return;
  }

  const btn = event.target.closest("button[data-open-meet]");
  if (!btn) return;

  const meetId = Number(btn.dataset.openMeet);
  if (Number.isNaN(meetId)) return;
  await loadMeetDetail(meetId);
});

if (meetDetailCard) {
  meetDetailCard.addEventListener("click", async (event) => {
    const link = event.target.closest("a[data-download-original-file]");
    if (!link) return;

    event.preventDefault();
    const meetId = Number(link.getAttribute("data-meet-id") || "");
    const fileName = String(link.getAttribute("data-file-name") || "").trim();

    try {
      await downloadOriginalMeetFile(meetId, fileName);
    } catch (error) {
      showState(meetsError, `Download failed: ${error.message}`, "error");
    }
  });
}

if (declareControls) {
  declareControls.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-declare-choice]");
    if (!btn || btn.disabled) return;

    const swimmerId = Number(btn.getAttribute("data-swimmer-id"));
    const day = String(btn.getAttribute("data-day") || "");
    const sessionLabel = String(btn.getAttribute("data-session-label") || "");
    const choice = String(
      btn.getAttribute("data-declare-choice") || "",
    ).toLowerCase();
    if (
      !Number.isInteger(swimmerId) ||
      !day ||
      (choice !== "yes" && choice !== "no")
    ) {
      return;
    }

    const statusInput = Array.from(
      declareTbody.querySelectorAll(
        "input[data-declare-status][data-day][data-session-label]",
      ),
    ).find(
      (input) =>
        Number(input.getAttribute("data-declare-status")) === swimmerId &&
        String(input.getAttribute("data-day") || "") === day &&
        String(input.getAttribute("data-session-label") || "") === sessionLabel,
    );

    if (!statusInput) return;
    statusInput.value = choice;

    const group = btn.closest(".declare-session-toggle");
    if (group) {
      group
        .querySelectorAll("button[data-declare-choice]")
        .forEach((choiceBtn) => {
          choiceBtn.classList.toggle(
            "active",
            String(choiceBtn.getAttribute("data-declare-choice") || "") ===
              choice,
          );
        });
    }
  });
}

if (btnSaveDeclarations) {
  btnSaveDeclarations.addEventListener("click", async () => {
    if (!selectedMeetId) return;

    const declarations = Array.from(
      declareTbody.querySelectorAll("input[data-declare-status]"),
    )
      .map((input) => ({
        swimmer_id: Number(input.getAttribute("data-declare-status")),
        meet_day: String(input.getAttribute("data-day") || ""),
        session_label: String(input.getAttribute("data-session-label") || ""),
        status: String(input.value || "").toLowerCase(),
      }))
      .filter((item) => Number.isInteger(item.swimmer_id) && item.meet_day);

    btnSaveDeclarations.disabled = true;
    btnSaveDeclarations.textContent = "Saving...";

    try {
      const res = await apiFetch(`/api/meets/${selectedMeetId}/declarations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ declarations }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error((data && data.message) || `Failed (${res.status})`);
      }

      showState(declareStatus, "Declarations saved.", "info");
      await loadMeetDetail(selectedMeetId);
    } catch (error) {
      showState(declareStatus, `Save failed: ${error.message}`, "error");
    } finally {
      btnSaveDeclarations.disabled = false;
      btnSaveDeclarations.textContent = "Save Declarations";
    }
  });
}

btnRefreshMeets.addEventListener("click", loadMeets);
btnLogout.addEventListener("click", redirectToLogin);

if (meetEditForm) {
  meetEditForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selectedMeetId) return;

    hide(meetEditStatus);
    btnSaveMeetEdit.disabled = true;
    btnSaveMeetEdit.textContent = "Saving...";

    try {
      const payload = {
        meet_name: meetEditName.value.trim(),
        start_date: meetEditStartDate.value,
        end_date: meetEditEndDate.value,
        location: meetEditLocation.value.trim(),
        host_team: meetEditHostTeam.value.trim(),
      };

      const res = await apiFetch(`/api/meets/${selectedMeetId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error((data && data.message) || `Failed (${res.status})`);
      }

      showState(meetEditStatus, "Meet info updated.", "info");
      await loadMeets();
      await loadMeetDetail(selectedMeetId);
    } catch (error) {
      showState(meetEditStatus, `Update failed: ${error.message}`, "error");
    } finally {
      btnSaveMeetEdit.disabled = false;
      btnSaveMeetEdit.textContent = "Save Meet Info";
    }
  });
}

btnSaveCoachEntries.addEventListener("click", async () => {
  if (!selectedMeetId || !selectedMeetDetail) return;

  const bySwimmer = new Map();
  const swimmerRows = Array.from(
    coachEntryTbody.querySelectorAll("tr[data-entry-swimmer-row]"),
  );
  swimmerRows.forEach((row) => {
    const swimmerId = Number(row.getAttribute("data-entry-swimmer-row"));
    if (Number.isInteger(swimmerId)) {
      bySwimmer.set(swimmerId, []);
    }
  });

  const checkboxes = Array.from(
    coachEntryTbody.querySelectorAll(
      "input[data-entry-swimmer][data-entry-event]",
    ),
  );
  checkboxes.forEach((input) => {
    const swimmerId = Number(input.getAttribute("data-entry-swimmer"));
    const eventId = Number(input.getAttribute("data-entry-event"));
    if (!Number.isInteger(swimmerId) || !Number.isInteger(eventId)) return;
    if (!bySwimmer.has(swimmerId)) bySwimmer.set(swimmerId, []);
    if (input.checked) {
      bySwimmer.get(swimmerId).push(eventId);
    }
  });

  const entries = Array.from(bySwimmer.entries()).map(
    ([swimmer_id, event_ids]) => ({
      swimmer_id,
      event_ids,
    }),
  );

  btnSaveCoachEntries.disabled = true;
  btnSaveCoachEntries.textContent = "Saving...";
  try {
    // Include any custom times the coach set in the payload under `entries_with_times`.
    const entriesWithTimes = [];
    if (selectedMeetDetail && selectedMeetDetail._custom_entry_times) {
      Object.entries(selectedMeetDetail._custom_entry_times).forEach(
        ([key, timeText]) => {
          const [swimmer_id, meet_event_id] = key
            .split("|")
            .map((v) => Number(v));
          if (Number.isInteger(swimmer_id) && Number.isInteger(meet_event_id)) {
            entriesWithTimes.push({
              swimmer_id,
              meet_event_id,
              custom_time_text: String(timeText),
            });
          }
        },
      );
    }

    const payload = { entries, entries_with_times: entriesWithTimes };

    const res = await apiFetch(`/api/meets/${selectedMeetId}/entries`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await safeJson(res);
    if (!res.ok) {
      throw new Error((data && data.message) || `Failed (${res.status})`);
    }
    showState(coachEntryStatus, "Event sign-ups saved.", "info");
    await loadMeetDetail(selectedMeetId);
  } catch (error) {
    showState(coachEntryStatus, `Save failed: ${error.message}`, "error");
  } finally {
    btnSaveCoachEntries.disabled = false;
    btnSaveCoachEntries.textContent = "Save Event Sign-ups";
  }
});

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
      currentUser = null;
    }
  }

  if (!currentUser) {
    const response = await apiFetch("/api/me");
    if (!response.ok) {
      redirectToLogin();
      return;
    }
    currentUser = await response.json();
    localStorage.setItem("swimsyncUser", JSON.stringify(currentUser));
  }

  applyRoleUI();
  await checkHealth();
  if (currentUser.role === "admin" || currentUser.role === "coach") {
    await loadSwimmerOptionsForManualTime();
  }
  await Promise.all([loadMeets(), loadTimes()]);
}

init().catch(() => redirectToLogin());
