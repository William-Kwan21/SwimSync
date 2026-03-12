const loginForm = document.getElementById("login-form");
const loginEmail = document.getElementById("login-email");
const loginPassword = document.getElementById("login-password");
const loginError = document.getElementById("login-error");
const btnLogin = document.getElementById("btn-login");

function showError(message) {
  loginError.textContent = message;
  loginError.classList.remove("hidden");
}

function hideError() {
  loginError.textContent = "";
  loginError.classList.add("hidden");
}

if (localStorage.getItem("swimsyncToken")) {
  window.location.href = "/app";
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideError();
  btnLogin.disabled = true;
  btnLogin.textContent = "Signing In…";

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: loginEmail.value.trim(),
        password: loginPassword.value
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      showError(data.message || "Login failed.");
      return;
    }

    localStorage.setItem("swimsyncToken", data.token);
    localStorage.setItem("swimsyncUser", JSON.stringify(data.user));
    window.location.href = "/app";
  } catch (error) {
    showError(`Network error: ${error.message}`);
  } finally {
    btnLogin.disabled = false;
    btnLogin.textContent = "Sign In";
  }
});