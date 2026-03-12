const dbStatus = document.getElementById("db-status");
const usersTable = document.getElementById("users-table");
const usersTbody = document.getElementById("users-tbody");
const usersLoading = document.getElementById("users-loading");
const usersError = document.getElementById("users-error");
const usersEmpty = document.getElementById("users-empty");
const formError = document.getElementById("form-error");
const addForm = document.getElementById("add-user-form");
const inputName = document.getElementById("input-name");
const inputEmail = document.getElementById("input-email");
const inputPassword = document.getElementById("input-password");
const inputRole = document.getElementById("input-role");
const btnAdd = document.getElementById("btn-add");
const btnRefresh = document.getElementById("btn-refresh");
const btnLogout = document.getElementById("btn-logout");
const currentUserName = document.getElementById("current-user-name");
const currentUserEmail = document.getElementById("current-user-email");
const currentUserRole = document.getElementById("current-user-role");
const roleDescription = document.getElementById("role-description");
const userRoleBadge = document.getElementById("user-role-badge");
const usersSectionTitle = document.getElementById("users-section-title");
const adminFormCard = document.getElementById("admin-form-card");
const actionColumnHeading = document.getElementById("action-column-heading");

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
    usersSectionTitle.textContent = "All Users in Database";
    show(adminFormCard);
    actionColumnHeading.textContent = "Action";
  } else if (currentUser.role === "coach") {
    usersSectionTitle.textContent = "Team User Directory";
    hide(adminFormCard);
    actionColumnHeading.textContent = "Access";
  } else {
    usersSectionTitle.textContent = "My Account";
    hide(adminFormCard);
    actionColumnHeading.textContent = "Access";
  }
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
      usersTbody.appendChild(tr);
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

addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hide(formError);
  btnAdd.disabled = true;
  btnAdd.textContent = "Adding…";

  try {
    const res = await apiFetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: inputName.value.trim(),
        email: inputEmail.value.trim(),
        password: inputPassword.value,
        role: inputRole.value
      })
    });

    const data = await safeJson(res);

    if (!res.ok) {
      showError(formError, (data && data.message) || `Request failed (${res.status}).`);
      return;
    }

    addForm.reset();
    await loadUsers();
  } catch (err) {
    showError(formError, `Network error: ${err.message}`);
  } finally {
    btnAdd.disabled = false;
    btnAdd.textContent = "Add User";
  }
});

usersTbody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button.btn-danger");
  if (!btn) {
    return;
  }

  const userId = btn.dataset.id;
  if (!confirm("Remove this user?")) {
    return;
  }

  btn.disabled = true;
  btn.textContent = "Removing…";

  try {
    const res = await apiFetch(`/api/users/${userId}`, { method: "DELETE" });

    if (!res.ok) {
      const data = await safeJson(res);
      alert(`Failed to remove user: ${(data && data.message) || res.status}`);
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
    alert(`Network error: ${err.message}`);
    btn.disabled = false;
    btn.textContent = "Remove";
  }
});

btnRefresh.addEventListener("click", loadUsers);
btnLogout.addEventListener("click", redirectToLogin);

async function init() {
  const token = getToken();
  if (!token) {
    redirectToLogin();
    return;
  }

  await checkHealth();
  await fetchCurrentUser();
  await loadUsers();
}

init().catch((error) => {
  console.error(error);
  redirectToLogin();
});
