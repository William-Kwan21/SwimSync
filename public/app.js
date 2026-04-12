const dbStatus = document.getElementById("db-status");
const usersTable = document.getElementById("users-table");
const usersTbody = document.getElementById("users-tbody");
const usersLoading = document.getElementById("users-loading");
const usersError = document.getElementById("users-error");
const usersEmpty = document.getElementById("users-empty");
const btnRefresh = document.getElementById("btn-refresh");
const btnLogout = document.getElementById("btn-logout");
const currentUserName = document.getElementById("current-user-name");
const currentUserEmail = document.getElementById("current-user-email");
const currentUserRole = document.getElementById("current-user-role");
const roleDescription = document.getElementById("role-description");
const userRoleBadge = document.getElementById("user-role-badge");
const usersSectionTitle = document.getElementById("users-section-title");
const actionColumnHeading = document.getElementById("action-column-heading");
const addUserCard = document.getElementById("add-user-card");
const addUserForm = document.getElementById("add-user-form");
const addUserStatus = document.getElementById("add-user-status");
const addUserButton = document.getElementById("btn-add-user");
const attendanceCard = document.getElementById("attendance-card");
const attendanceLoading = document.getElementById("attendance-loading");
const attendanceError = document.getElementById("attendance-error");
const attendanceEmpty = document.getElementById("attendance-empty");
const attendanceTable = document.getElementById("attendance-table");
const attendanceTbody = document.getElementById("attendance-tbody");

let currentUser = null;

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
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showError(el, msg) {
  el.textContent = msg;
  show(el);
}

function showStatus(el, msg, type = "info") {
  el.textContent = msg;
  el.classList.remove("hidden", "error", "info");
  if (type === "error") {
    el.classList.add("error");
  } else {
    el.classList.add("info");
  }
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

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
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
    Authorization: `Bearer ${token}`
  };

  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    redirectToLogin();
    throw new Error("Session expired");
  }

  return response;
}

function applyRoleUI() {
  if (!currentUser) {
    return;
  }

  currentUserName.textContent = currentUser.name;
  currentUserEmail.textContent = currentUser.email;
  currentUserRole.textContent = currentUser.role;
  roleDescription.textContent = currentUser.roleDescription || "Role permissions active.";
  roleDescription.classList.add("info");

  userRoleBadge.textContent = currentUser.role.toUpperCase();
  userRoleBadge.className = `badge role-badge role-${currentUser.role}`;

  if (currentUser.role === "admin") {
    show(addUserCard);
    usersSectionTitle.textContent = "All Users in Database";
    actionColumnHeading.textContent = "Action";
  } else if (currentUser.role === "coach") {
    hide(addUserCard);
    usersSectionTitle.textContent = "Team User Directory";
    actionColumnHeading.textContent = "Access";
  } else {
    hide(addUserCard);
    usersSectionTitle.textContent = "My Account";
    actionColumnHeading.textContent = "Access";
  }

  if (currentUser.role === "swimmer" || currentUser.role === "parent") {
    show(attendanceCard);
  } else {
    hide(attendanceCard);
  }
}

async function loadAttendanceSummary() {
  if (!currentUser || (currentUser.role !== "swimmer" && currentUser.role !== "parent")) {
    return;
  }

  hide(attendanceError);
  hide(attendanceEmpty);
  hide(attendanceTable);
  show(attendanceLoading);

  try {
    const res = await apiFetch("/api/attendance/summary");
    if (!res.ok) {
      throw new Error(`Server error: ${res.status}`);
    }

    const rows = await res.json();
    attendanceTbody.innerHTML = "";

    if (!rows.length) {
      hide(attendanceLoading);
      show(attendanceEmpty);
      return;
    }

    attendanceTbody.innerHTML = rows
      .map(
        (row) => `<tr>
          <td>${escHtml(row.swimmer_name)}</td>
          <td>${Number(row.present_count) || 0}</td>
          <td>${Number(row.late_count) || 0}</td>
          <td>${Number(row.absent_count) || 0}</td>
          <td>${Number(row.excused_count) || 0}</td>
          <td>${Number(row.marked_count) || 0}</td>
          <td>${row.attendance_rate == null ? "—" : `${Number(row.attendance_rate).toFixed(1)}%`}</td>
        </tr>`,
      )
      .join("");

    hide(attendanceLoading);
    show(attendanceTable);
  } catch (err) {
    hide(attendanceLoading);
    showError(attendanceError, `Failed to load attendance summary: ${err.message}`);
  }
}

function renderUserRow(user) {
  const canDelete = currentUser.role === "admin" && user.id !== currentUser.id;
  const actionLabel = canDelete
    ? `<button class="btn btn-danger" data-id="${user.id}" aria-label="Remove ${escHtml(user.name)}">Remove</button>`
    : '<span class="muted-inline">View only</span>';

  const tr = document.createElement("tr");
  tr.dataset.id = user.id;
  tr.innerHTML = `
    <td>${user.id}</td>
    <td>${escHtml(user.name)}</td>
    <td>${escHtml(user.email)}</td>
    <td><span class="table-role role-pill role-${escHtml(user.role)}">${escHtml(user.role)}</span></td>
    <td>${formatDate(user.created_at)}</td>
    <td>${actionLabel}</td>`;

  return tr;
}

async function fetchCurrentUser() {
  const response = await apiFetch("/api/me");
  const data = await response.json();
  currentUser = data;
  localStorage.setItem("swimsyncUser", JSON.stringify(data));
  applyRoleUI();
}

async function checkHealth() {
  try {
    const res = await fetch("/api/health");
    if (!res.ok) {
      throw new Error("bad response");
    }
    const data = await res.json();
    dbStatus.textContent = `✓ DB connected — ${new Date(data.dbTime).toLocaleTimeString()}`;
    dbStatus.className = "badge ok";
  } catch {
    dbStatus.textContent = "✗ DB connection failed";
    dbStatus.className = "badge fail";
  }
}

async function loadUsers() {
  hide(usersError);
  hide(usersEmpty);
  hide(usersTable);
  show(usersLoading);
  btnRefresh.disabled = true;

  try {
    const res = await apiFetch("/api/users");
    if (!res.ok) {
      throw new Error(`Server error: ${res.status}`);
    }

    const users = await res.json();
    usersTbody.innerHTML = "";

    if (users.length === 0) {
      hide(usersLoading);
      show(usersEmpty);
      return;
    }

    users.forEach((user) => {
      usersTbody.appendChild(renderUserRow(user));
    });

    hide(usersLoading);
    show(usersTable);
  } catch (err) {
    hide(usersLoading);
    showError(usersError, `Failed to load users: ${err.message}`);
  } finally {
    btnRefresh.disabled = false;
  }
}

usersTbody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button.btn-danger");
  if (!btn) {
    return;
  }

  const userId = btn.dataset.id;
  if (!(await themedConfirm("Remove this user?", "Delete User"))) {
    return;
  }

  btn.disabled = true;
  btn.textContent = "Removing…";

  try {
    const res = await apiFetch(`/api/users/${userId}`, { method: "DELETE" });

    if (!res.ok) {
      const data = await safeJson(res);
      await themedAlert(
        `Failed to remove user: ${(data && data.message) || res.status}`,
        "Delete Failed",
      );
      btn.disabled = false;
      btn.textContent = "Remove";
      return;
    }

    const row = usersTbody.querySelector(`tr[data-id="${userId}"]`);
    if (row) {
      row.remove();
    }

    if (usersTbody.rows.length === 0) {
      hide(usersTable);
      show(usersEmpty);
    }
  } catch (err) {
    await themedAlert(`Network error: ${err.message}`, "Network Error");
    btn.disabled = false;
    btn.textContent = "Remove";
  }
});

btnRefresh.addEventListener("click", loadUsers);
btnLogout.addEventListener("click", redirectToLogin);

if (addUserForm) {
  addUserForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(addUserForm);
    const payload = {
      name: String(formData.get("name") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      password: String(formData.get("password") || ""),
      role: String(formData.get("role") || "").trim(),
    };

    if (!payload.name || !payload.email || !payload.password || !payload.role) {
      showStatus(addUserStatus, "All fields are required.", "error");
      return;
    }

    if (payload.password.length < 8) {
      showStatus(addUserStatus, "Password must be at least 8 characters.", "error");
      return;
    }

    addUserButton.disabled = true;
    addUserButton.textContent = "Adding…";
    showStatus(addUserStatus, "Creating user record...", "info");

    try {
      const res = await apiFetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await safeJson(res);

      if (!res.ok) {
        showStatus(
          addUserStatus,
          `Failed to add user: ${(data && data.message) || res.status}`,
          "error",
        );
        return;
      }

      addUserForm.reset();
      showStatus(addUserStatus, "User added successfully.", "info");

      if (data && data.id) {
        hide(usersEmpty);
        show(usersTable);
        usersTbody.appendChild(renderUserRow(data));
      } else {
        await loadUsers();
      }
    } catch (err) {
      showStatus(addUserStatus, `Network error: ${err.message}`, "error");
    } finally {
      addUserButton.disabled = false;
      addUserButton.textContent = "Add User";
    }
  });
}

async function init() {
  const token = getToken();
  if (!token) {
    redirectToLogin();
    return;
  }

  await checkHealth();
  await fetchCurrentUser();
  await loadAttendanceSummary();
  await loadUsers();
}

init().catch((error) => {
  console.error(error);
  redirectToLogin();
});
