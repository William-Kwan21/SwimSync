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
const meetPublicEventsTbody = document.getElementById("meet-public-events-tbody");
const meetEditControls = document.getElementById("meet-edit-controls");
const meetEditForm = document.getElementById("meet-edit-form");
const meetEditName = document.getElementById("meet-edit-name");
const meetEditDate = document.getElementById("meet-edit-date");
const meetEditLocation = document.getElementById("meet-edit-location");
const meetEditHostTeam = document.getElementById("meet-edit-host-team");
const meetEditStatus = document.getElementById("meet-edit-status");
const btnSaveMeetEdit = document.getElementById("btn-save-meet-edit");

const coachEventControls = document.getElementById("coach-event-controls");
const eventsTbody = document.getElementById("events-tbody");
const coachSelectionStatus = document.getElementById("coach-selection-status");
const btnSaveEventSelection = document.getElementById("btn-save-event-selection");

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
    return String(data && (data.message || data.error || data.details) ? data.message || data.error || data.details : "").trim();
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

  const canManageMeets = currentUser.role === "admin" || currentUser.role === "coach";
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
      showState(meetCreateStatus, `Meet created: ${data.meet.meet_name}`, "info");
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
    <td>${Number(meet.selected_event_count) || 0}</td>
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
    .map((row) => `<span class="chip">${escHtml(formatDate(row.meet_day))}</span>`)
    .join("");
}

function renderMeetOverview(detail) {
  if (!meetOverview) return;

  const meet = detail && detail.meet ? detail.meet : {};
  const dayCount = Array.isArray(detail && detail.days) ? detail.days.length : 0;
  const eventCount = Array.isArray(detail && detail.events) ? detail.events.length : 0;
  const selectedCount = Array.isArray(detail && detail.events)
    ? detail.events.filter((event) => Number(event.is_selected) === 1).length
    : 0;

  meetOverview.innerHTML = `
    <div>
      <p class="summary-label">Meet Name</p>
      <p class="summary-value">${escHtml(meet.meet_name || "-")}</p>
    </div>
    <div>
      <p class="summary-label">Meet Date</p>
      <p class="summary-value">${formatDate(meet.meet_date)}</p>
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
      <p class="summary-value">${eventCount} total, ${selectedCount} selected</p>
    </div>
  `;
}

function renderPublicEventsTable(detail) {
  if (!meetPublicEventsTbody) return;

  const events = Array.isArray(detail && detail.events) ? detail.events : [];
  meetPublicEventsTbody.innerHTML = events.length
    ? events
        .map((event, index) => {
          const eventNumberMatch = String(event.event_name || "").match(/\bEvent\s+(\d{1,3})\b/i);
          const eventNumber = eventNumberMatch ? eventNumberMatch[1] : String(index + 1);
          return `
            <tr>
              <td>${escHtml(eventNumber)}</td>
              <td>${escHtml(event.event_name || "-")}</td>
              <td>${escHtml(event.stroke || "-")}</td>
              <td>${event.distance_meters || "-"}</td>
              <td>${escHtml(event.age_group || "-")}</td>
              <td>${escHtml(event.gender || "-")}</td>
              <td>${escHtml(event.qualifying_time_text || "No standard")}</td>
            </tr>
          `;
        })
        .join("")
    : '<tr><td colspan="7" class="muted-inline">No events imported for this meet.</td></tr>';
}

function renderMeetEditForm(detail) {
  const canEditMeet = !!(detail && detail.can_select_events);
  if (!canEditMeet) {
    hide(meetEditControls);
    return;
  }

  meetEditName.value = detail && detail.meet && detail.meet.meet_name ? detail.meet.meet_name : "";
  meetEditDate.value =
    detail && detail.meet && detail.meet.meet_date
      ? String(detail.meet.meet_date).slice(0, 10)
      : "";
  meetEditLocation.value = detail && detail.meet && detail.meet.location ? detail.meet.location : "";
  meetEditHostTeam.value = detail && detail.meet && detail.meet.host_team ? detail.meet.host_team : "";
  hide(meetEditStatus);
  show(meetEditControls);
}

function renderCoachEventSelection(detail) {
  if (!detail.can_select_events) {
    hide(coachEventControls);
    return;
  }

  const rows = detail.events
    .map((event) => {
      const standard = event.qualifying_time_text || "No standard";
      return `
        <tr>
          <td><input type="checkbox" data-event-select="${event.id}" ${Number(event.is_selected) ? "checked" : ""} /></td>
          <td>${escHtml(event.event_name)}</td>
          <td>${escHtml(event.stroke || "-")}</td>
          <td>${event.distance_meters || "-"}</td>
          <td>${escHtml(event.gender || "-")}</td>
          <td>${escHtml(standard)}</td>
        </tr>
      `;
    })
    .join("");

  eventsTbody.innerHTML = rows || '<tr><td colspan="6" class="muted-inline">No events.</td></tr>';
  hide(coachSelectionStatus);
  show(coachEventControls);
}

function renderDeclarationTable(detail) {
  if (!detail.can_declare) {
    hide(declareControls);
    return;
  }

  const dayValues = (detail.days || []).map((row) => ({
    meet_day: String(row.meet_day).slice(0, 10),
    session_label: String(row.session_label || "").trim(),
    age_group: row.age_group || "",
    gender: row.gender || "",
  }));
  const declarationMap = new Map();
  const declarationEligibility = new Map();

  (detail.declaration_eligibility || []).forEach((entry) => {
    declarationEligibility.set(
      declarationSessionKey(entry.swimmer_id, entry.meet_day, entry.session_label),
      !!entry.allowed,
    );
  });

  (detail.declarations || []).forEach((entry) => {
    declarationMap.set(
      declarationSessionKey(entry.swimmer_id, entry.meet_day, entry.session_label),
      {
        status: entry.status || "maybe",
        note: entry.note || "",
      },
    );
  });

  const rows = [];
  (detail.swimmers || []).forEach((swimmer) => {
    dayValues.forEach((dayInfo) => {
      const key = declarationSessionKey(swimmer.swimmer_id, dayInfo.meet_day, dayInfo.session_label);
      const existing = declarationMap.get(key) || { status: "maybe", note: "" };
      const allowed = declarationEligibility.has(key) ? declarationEligibility.get(key) : true;
      const sessionText = dayInfo.session_label
        ? `${formatDate(dayInfo.meet_day)} · ${dayInfo.session_label}`
        : formatDate(dayInfo.meet_day);
      const ruleBits = [dayInfo.age_group || "", dayInfo.gender || ""].filter(Boolean).join(" · ");
      const ruleText = ruleBits ? ` (${ruleBits})` : "";
      const disabledAttr = allowed ? "" : "disabled";

      rows.push(`
        <tr>
          <td>${escHtml(swimmer.swimmer_name)}</td>
          <td>${escHtml(sessionText + ruleText)}</td>
          <td>
            <select data-declare-status="${swimmer.swimmer_id}" data-day="${dayInfo.meet_day}" data-session-label="${escHtml(dayInfo.session_label)}" ${disabledAttr}>
              <option value="yes" ${existing.status === "yes" ? "selected" : ""}>Yes</option>
              <option value="no" ${existing.status === "no" ? "selected" : ""}>No</option>
              <option value="maybe" ${existing.status === "maybe" ? "selected" : ""}>Maybe</option>
            </select>
          </td>
          <td><input type="text" data-declare-note="${swimmer.swimmer_id}" data-day="${dayInfo.meet_day}" data-session-label="${escHtml(dayInfo.session_label)}" value="${escHtml(existing.note)}" placeholder="${allowed ? "Optional note" : "Not eligible for this session"}" ${disabledAttr} /></td>
        </tr>
      `);
    });
  });

  declareTbody.innerHTML = rows.join("") || '<tr><td colspan="4" class="muted-inline">No eligible swimmers or meet days.</td></tr>';
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

  const selectedEvents = (detail.events || []).filter((event) => Number(event.is_selected) === 1);
  const eligibilityBySwimmer = new Map(
    (detail.eligibility || []).map((row) => [
      Number(row.swimmer_id),
      new Set((row.eligible_event_ids || []).map((id) => Number(id))),
    ]),
  );
  const entrySet = new Set(
    (detail.entries || []).map((row) => `${Number(row.swimmer_id)}|${Number(row.meet_event_id)}`),
  );

  const rows = [];
  (detail.swimmers || []).forEach((swimmer) => {
    const swimmerId = Number(swimmer.swimmer_id);
    if (!declaredYesSet.has(swimmerId)) {
      return;
    }

    const eligibleEvents = selectedEvents.filter((event) => {
      const eligibleSet = eligibilityBySwimmer.get(swimmerId) || new Set();
      return eligibleSet.has(Number(event.id));
    });

    const eventChecks = eligibleEvents.length
      ? eligibleEvents
          .map((event) => {
            const checked = entrySet.has(`${swimmerId}|${Number(event.id)}`) ? "checked" : "";
            return `<label class="checkbox-row" style="margin:0 0 0.35rem 0;"><input type="checkbox" data-entry-swimmer="${swimmerId}" data-entry-event="${event.id}" ${checked} /><span>${escHtml(event.event_name)}</span></label>`;
          })
          .join("")
      : '<span class="muted-inline">No eligible selected events.</span>';

    rows.push(`
      <tr data-entry-swimmer-row="${swimmerId}">
        <td>${escHtml(swimmer.swimmer_name)}</td>
        <td>${eventChecks}</td>
      </tr>
    `);
  });

  coachEntryTbody.innerHTML = rows.join("") || '<tr><td colspan="2" class="muted-inline">No swimmers with "Yes" declarations yet.</td></tr>';
  hide(coachEntryStatus);
  show(coachEntryControls);
}

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

    meetDetailTitle.textContent = detail.meet.meet_name;
    meetDetailMeta.textContent = `${formatDate(detail.meet.meet_date)} · ${detail.meet.location || "Location TBD"}${detail.meet.host_team ? ` · ${detail.meet.host_team}` : ""}`;
    renderMeetOverview(detail);
    renderMeetEditForm(detail);
    renderMeetDays(detail.days || []);
    renderPublicEventsTable(detail);
    renderCoachEventSelection(detail);
    renderDeclarationTable(detail);
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
        timeSwimmerName.innerHTML = '<option value="">No swimmers found</option>';
      }
      if (timesImportSwimmer) {
        timesImportSwimmer.innerHTML = '<option value="">No swimmers found</option>';
      }
      return;
    }

    const options = swimmers
      .map(
        (swimmer) => {
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
        },
      )
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
      timeSwimmerName.innerHTML = '<option value="">Failed to load swimmers</option>';
    }
    if (timesImportSwimmer) {
      timesImportSwimmer.innerHTML = '<option value="">Failed to load swimmers</option>';
    }
    showState(manualTimeStatus, `Could not load swimmers: ${error.message}`, "error");
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
    String(file.name || "").toLowerCase().endsWith(".pdf")
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
      existing.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), {
        once: true,
      });
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
        lastError || new Error("Unable to load PDF extraction library from CDN sources.")
      );
    })();
  }

  return pdfJsLoadPromise;
}

async function extractPdfTextInBrowser(file) {
  const pdfjsLib = await ensurePdfJsLib();

  if (!pdfjsLib || typeof pdfjsLib.getDocument !== "function") {
    throw new Error("PDF text extraction library is unavailable in this browser session.");
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
    const pageText = (textContent.items || [])
      .map((item) => (item && item.str ? String(item.str) : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (pageText) {
      chunks.push(pageText);
    }
  }

  const text = chunks.join("\n").trim();
  if (!text) {
    throw new Error("The PDF appears to be image-only. Use a text-searchable PDF export.");
  }
  return text;
}

function uploadFileMultipart(url, filePayload, extraFields = {}) {
  return apiFetch(url, {
    method: "POST",
    body: (() => {
      const formData = new FormData();
      formData.append("import_file", filePayload.file, filePayload.file_name || "import.pdf");
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
  if (!response || response.ok || !filePayload || !isPdfFile(filePayload.file)) {
    return false;
  }

  if (response.status === 413) {
    return true;
  }

  const message = String(responseData && responseData.message ? responseData.message : "")
    .toLowerCase()
    .trim();

  return (
    message.includes("invalid meet file") ||
    message.includes("no valid events") ||
    message.includes("unable to read text from pdf") ||
    message.includes("pdf support requires pdf-parse") ||
    message.includes("meet file content is empty") ||
    message.includes("content is required")
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
      stage = "extracting PDF text in browser";
      showState(meetImportStatus, "Extracting text from PDF...", "info");

      let extractedText;
      try {
        extractedText = await extractPdfTextInBrowser(filePayload.file);
      } catch (error) {
        throw new Error(`PDF extraction failed: ${error.message}`);
      }

      stage = "sending extracted text to server";
      showState(meetImportStatus, "Importing extracted PDF text...", "info");
      res = await uploadTextMultipart("/api/meets/import", {
        content: extractedText,
        file_type: "text/plain",
        file_name: filePayload.file_name || "meet-import.txt",
        encoding: "utf8",
      });
      data = await safeJson(res);
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

    showState(meetImportStatus, `Meet imported: ${data.meet.meet_name}`, "info");
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

    if (Number.isInteger(selectedDefaultSwimmer) && selectedDefaultSwimmer > 0) {
      filePayload.default_swimmer_id = selectedDefaultSwimmer;
    }

    const res = await uploadFileMultipart("/api/swimmer-times/import", filePayload, {
      default_swimmer_id:
        Number.isInteger(selectedDefaultSwimmer) && selectedDefaultSwimmer > 0
          ? selectedDefaultSwimmer
          : "",
    });

    const data = await safeJson(res);
    if (!res.ok) {
      throw new Error(
        (data && data.message) ||
          (res.status === 413 ? build413Message("Times import") : `Import failed (${res.status})`),
      );
    }

    const skipped = Array.isArray(data.skipped) ? data.skipped.length : 0;
    showState(timesImportStatus, `Imported ${data.imported} rows (${skipped} skipped).`, "info");
    timesImportForm.reset();
    if (timesImportSwimmer && timesImportSwimmer.tomselect) {
      timesImportSwimmer.tomselect.clear(true);
    }
    await loadTimes();
  } catch (error) {
    showState(timesImportStatus, `Times import failed: ${error.message}`, "error");
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

    const confirmed = window.confirm("Delete this meet and all its related data?");
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

btnSaveEventSelection.addEventListener("click", async () => {
  if (!selectedMeetId) return;

  const selectedIds = Array.from(document.querySelectorAll("input[data-event-select]:checked"))
    .map((el) => Number(el.getAttribute("data-event-select")))
    .filter((id) => Number.isInteger(id));

  btnSaveEventSelection.disabled = true;
  btnSaveEventSelection.textContent = "Saving...";

  try {
    const res = await apiFetch(`/api/meets/${selectedMeetId}/events/selection`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_ids: selectedIds }),
    });
    const data = await safeJson(res);
    if (!res.ok) {
      throw new Error((data && data.message) || `Failed (${res.status})`);
    }

    showState(coachSelectionStatus, "Selected events saved.", "info");
    await loadMeets();
    await loadMeetDetail(selectedMeetId);
  } catch (error) {
    showState(coachSelectionStatus, `Save failed: ${error.message}`, "error");
  } finally {
    btnSaveEventSelection.disabled = false;
    btnSaveEventSelection.textContent = "Save Selected Events";
  }
});

btnSaveDeclarations.addEventListener("click", async () => {
  if (!selectedMeetId || !selectedMeetDetail) return;

  const declarations = [];
  const statusEls = Array.from(declareTbody.querySelectorAll("select[data-declare-status]"));

  statusEls.forEach((statusEl) => {
    const swimmerId = Number(statusEl.getAttribute("data-declare-status"));
    const day = String(statusEl.getAttribute("data-day") || "");
    const sessionLabel = String(statusEl.getAttribute("data-session-label") || "");
    const noteEl = Array.from(declareTbody.querySelectorAll("input[data-declare-note][data-day][data-session-label]")).find(
      (input) =>
        Number(input.getAttribute("data-declare-note")) === swimmerId &&
        String(input.getAttribute("data-day") || "") === day &&
        String(input.getAttribute("data-session-label") || "") === sessionLabel,
    );

    declarations.push({
      swimmer_id: swimmerId,
      meet_day: day,
      session_label: sessionLabel,
      status: statusEl.value,
      note: noteEl ? noteEl.value : "",
    });
  });

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
        meet_date: meetEditDate.value,
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
  const swimmerRows = Array.from(coachEntryTbody.querySelectorAll("tr[data-entry-swimmer-row]"));
  swimmerRows.forEach((row) => {
    const swimmerId = Number(row.getAttribute("data-entry-swimmer-row"));
    if (Number.isInteger(swimmerId)) {
      bySwimmer.set(swimmerId, []);
    }
  });

  const checkboxes = Array.from(coachEntryTbody.querySelectorAll("input[data-entry-swimmer][data-entry-event]"));
  checkboxes.forEach((input) => {
    const swimmerId = Number(input.getAttribute("data-entry-swimmer"));
    const eventId = Number(input.getAttribute("data-entry-event"));
    if (!Number.isInteger(swimmerId) || !Number.isInteger(eventId)) return;
    if (!bySwimmer.has(swimmerId)) bySwimmer.set(swimmerId, []);
    if (input.checked) {
      bySwimmer.get(swimmerId).push(eventId);
    }
  });

  const entries = Array.from(bySwimmer.entries()).map(([swimmer_id, event_ids]) => ({
    swimmer_id,
    event_ids,
  }));

  btnSaveCoachEntries.disabled = true;
  btnSaveCoachEntries.textContent = "Saving...";
  try {
    const res = await apiFetch(`/api/meets/${selectedMeetId}/entries`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
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
