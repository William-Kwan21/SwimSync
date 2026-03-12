/* ── selectors ── */
const dbStatus = document.getElementById("db-status");
const userRoleBadge = document.getElementById("user-role-badge");
const btnLogout = document.getElementById("btn-logout");

const teamLoading = document.getElementById("team-loading");
const teamError = document.getElementById("team-error");

const coachesCard = document.getElementById("coaches-card");
const coachesTbody = document.getElementById("coaches-tbody");
const coachesCount = document.getElementById("coaches-count");

const swimmersCard = document.getElementById("swimmers-card");
const swimmersTbody = document.getElementById("swimmers-tbody");
const swimmersCount = document.getElementById("swimmers-count");

const parentsCard = document.getElementById("parents-card");
const parentsTbody = document.getElementById("parents-tbody");
const parentsCount = document.getElementById("parents-count");

let currentUser = null;
let practiceGroups = [];

/* ── helpers ── */
function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }

function getToken() { return localStorage.getItem("swimsyncToken"); }

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

function formatDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

async function apiFetch(url, options = {}) {
  const headers = { ...(options.headers || {}), Authorization: `Bearer ${getToken()}` };
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) { redirectToLogin(); throw new Error("Session expired"); }
  return response;
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

function canManageGroups() {
  return currentUser && (currentUser.role === "admin" || currentUser.role === "coach");
}

function renderGroupSelect(swimmer) {
  if (!canManageGroups()) {
    return '<span class="muted-inline">No access</span>';
  }

  const options = practiceGroups
    .map((group) => {
      const selected = Number(group.id) === Number(swimmer.group_id) ? "selected" : "";
      return `<option value="${group.id}" ${selected}>${escHtml(group.group_name)}</option>`;
    })
    .join("");

  if (!options) {
    return '<span class="muted-inline">No groups found</span>';
  }

  return `<select data-swimmer-group="${swimmer.swimmer_id}" aria-label="Select group for ${escHtml(swimmer.name)}">${options}</select>`;
}

function renderGroupAction(swimmer) {
  if (!canManageGroups()) {
    return '<span class="muted-inline">View only</span>';
  }

  if (!practiceGroups.length) {
    return '<span class="muted-inline">No groups</span>';
  }

  return `<button class="btn btn-secondary" data-save-swimmer="${swimmer.swimmer_id}">Save</button>`;
}

async function loadPracticeGroups() {
  if (!canManageGroups()) {
    practiceGroups = [];
    return;
  }

  const res = await apiFetch("/api/practice-groups");
  if (!res.ok) throw new Error(`Failed to load groups (${res.status})`);
  practiceGroups = await res.json();
}

/* ── health ── */
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

/* ── load team ── */
async function loadTeam() {
  show(teamLoading);
  hide(teamError);

  try {
    await loadPracticeGroups();

    const res = await apiFetch("/api/team");
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const { coaches, swimmers, parents } = await res.json();

    /* coaches */
    coachesCount.textContent = coaches.length;
    coachesCount.className = "badge ok";
    coachesTbody.innerHTML = coaches.length
      ? coaches.map(c => `
          <tr>
            <td>${escHtml(c.name)}</td>
            <td>${escHtml(c.email)}</td>
            <td>${escHtml(c.certification)}</td>
            <td>${c.years_experience != null ? c.years_experience + " yrs" : "—"}</td>
          </tr>`).join("")
      : `<tr><td colspan="4" class="muted-inline">No coaches on record.</td></tr>`;
    show(coachesCard);

    /* swimmers */
    swimmersCount.textContent = swimmers.length;
    swimmersCount.className = "badge ok";
    swimmersTbody.innerHTML = swimmers.length
      ? swimmers.map(s => `
          <tr>
            <td>${escHtml(s.name)}</td>
            <td>${escHtml(s.email)}</td>
            <td>${formatDate(s.date_of_birth)}</td>
            <td>${escHtml(s.gender)}</td>
            <td>${escHtml(s.skill_level)}</td>
            <td>${escHtml(s.group_name || "Unassigned")}</td>
            <td>${renderGroupSelect(s)} ${renderGroupAction(s)}</td>
          </tr>`).join("")
      : `<tr><td colspan="7" class="muted-inline">No swimmers on record.</td></tr>`;
    show(swimmersCard);

    /* parents */
    parentsCount.textContent = parents.length;
    parentsCount.className = "badge ok";
    parentsTbody.innerHTML = parents.length
      ? parents.map(p => `
          <tr>
            <td>${escHtml(p.name)}</td>
            <td>${escHtml(p.email)}</td>
            <td>${escHtml(p.phone)}</td>
            <td>${escHtml(p.emergency_contact)}</td>
          </tr>`).join("")
      : `<tr><td colspan="4" class="muted-inline">No parents on record.</td></tr>`;
    show(parentsCard);

    hide(teamLoading);
  } catch (err) {
    hide(teamLoading);
    teamError.textContent = `Failed to load team: ${err.message}`;
    show(teamError);
  }
}

swimmersTbody.addEventListener("click", async (event) => {
  const btn = event.target.closest("button[data-save-swimmer]");
  if (!btn || !canManageGroups()) {
    return;
  }

  const swimmerId = Number(btn.dataset.saveSwimmer);
  const select = swimmersTbody.querySelector(`select[data-swimmer-group="${swimmerId}"]`);
  if (!select) {
    return;
  }

  const groupId = Number(select.value);
  if (Number.isNaN(swimmerId) || Number.isNaN(groupId)) {
    return;
  }

  btn.disabled = true;
  btn.textContent = "Saving…";

  try {
    const res = await apiFetch(`/api/swimmers/${swimmerId}/group`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group_id: groupId })
    });

    const data = await safeJson(res);
    if (!res.ok) {
      throw new Error((data && data.message) || `Failed (${res.status})`);
    }

    await loadTeam();
  } catch (err) {
    teamError.textContent = `Failed to update swimmer group: ${err.message}`;
    show(teamError);
    btn.disabled = false;
    btn.textContent = "Save";
  }
});

btnLogout.addEventListener("click", redirectToLogin);

/* ── init ── */
async function init() {
  if (!getToken()) { redirectToLogin(); return; }

  const cached = localStorage.getItem("swimsyncUser");
  if (cached) {
    try { currentUser = JSON.parse(cached); } catch { /* */ }
  }

  if (!currentUser) {
    const res = await apiFetch("/api/me");
    currentUser = await res.json();
    localStorage.setItem("swimsyncUser", JSON.stringify(currentUser));
  }

  userRoleBadge.textContent = currentUser.role.toUpperCase();
  userRoleBadge.className = `badge role-badge role-${currentUser.role}`;

  await checkHealth();
  await loadTeam();
}

init().catch(() => redirectToLogin());
