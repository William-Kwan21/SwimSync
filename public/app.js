/* ── selectors ── */
const dbStatus   = document.getElementById("db-status");
const usersTable = document.getElementById("users-table");
const usersTbody = document.getElementById("users-tbody");
const usersLoading = document.getElementById("users-loading");
const usersError   = document.getElementById("users-error");
const usersEmpty   = document.getElementById("users-empty");
const formError    = document.getElementById("form-error");
const addForm      = document.getElementById("add-user-form");
const inputName    = document.getElementById("input-name");
const inputEmail   = document.getElementById("input-email");
const btnAdd       = document.getElementById("btn-add");
const btnRefresh   = document.getElementById("btn-refresh");

/* ── helpers ── */
function show(el)  { el.classList.remove("hidden"); }
function hide(el)  { el.classList.add("hidden"); }

function showError(el, msg) {
  el.textContent = msg;
  show(el);
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/* safely parse JSON; returns null if body is empty or not JSON */
async function safeJson(res) {
  const text = await res.text();
  if (!text || !text.trim()) return null;
  try { return JSON.parse(text); } catch { return null; }
}

/* ── health check ── */
async function checkHealth() {
  try {
    const res = await fetch("/api/health");
    if (!res.ok) throw new Error("bad response");
    const data = await res.json();
    dbStatus.textContent = `✓ DB connected — ${new Date(data.dbTime).toLocaleTimeString()}`;
    dbStatus.className = "badge ok";
  } catch {
    dbStatus.textContent = "✗ DB connection failed";
    dbStatus.className = "badge fail";
  }
}

/* ── Phase 1 – load and display users ── */
async function loadUsers() {
  hide(usersError);
  hide(usersEmpty);
  hide(usersTable);
  show(usersLoading);
  btnRefresh.disabled = true;

  try {
    const res = await fetch("/api/users");
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    const users = await res.json();

    usersTbody.innerHTML = "";

    if (users.length === 0) {
      hide(usersLoading);
      show(usersEmpty);
      return;
    }

    users.forEach(user => {
      const tr = document.createElement("tr");
      tr.dataset.id = user.id;
      tr.innerHTML = `
        <td>${user.id}</td>
        <td>${escHtml(user.name)}</td>
        <td>${escHtml(user.email)}</td>
        <td>${formatDate(user.created_at)}</td>
        <td>
          <button class="btn btn-danger" data-id="${user.id}" aria-label="Remove ${escHtml(user.name)}">
            Remove
          </button>
        </td>`;
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

/* ── Phase 2 – add user ── */
addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hide(formError);
  btnAdd.disabled = true;
  btnAdd.textContent = "Adding…";

  const name  = inputName.value.trim();
  const email = inputEmail.value.trim();

  try {
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email })
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

/* ── Phase 2 – remove user (event delegation) ── */
usersTbody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button.btn-danger");
  if (!btn) return;

  const userId = btn.dataset.id;
  if (!confirm("Remove this user?")) return;

  btn.disabled = true;
  btn.textContent = "Removing…";

  try {
    const res = await fetch(`/api/users/${userId}`, { method: "DELETE" });

    if (!res.ok) {
      const data = await safeJson(res);
      alert(`Failed to remove user: ${(data && data.message) || res.status}`);
      btn.disabled = false;
      btn.textContent = "Remove";
      return;
    }

    const row = usersTbody.querySelector(`tr[data-id="${userId}"]`);
    if (row) row.remove();

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

/* ── refresh button ── */
btnRefresh.addEventListener("click", loadUsers);

/* ── XSS protection ── */
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ── init ── */
checkHealth();
loadUsers();
