const signupForm = document.getElementById("signup-form");
const signupName = document.getElementById("signup-name");
const signupEmail = document.getElementById("signup-email");
const signupPassword = document.getElementById("signup-password");
const signupRole = document.getElementById("signup-role");
const signupGender = document.getElementById("signup-gender");
const signupDob = document.getElementById("signup-dob");
const signupAddress = document.getElementById("signup-address");
const signupError = document.getElementById("signup-error");
const signupSuccess = document.getElementById("signup-success");
const btnSignup = document.getElementById("btn-signup");

function showError(message) {
  signupError.textContent = message;
  signupError.classList.remove("hidden");
}

function hideError() {
  signupError.textContent = "";
  signupError.classList.add("hidden");
}

function showSuccess(message) {
  signupSuccess.textContent = message;
  signupSuccess.classList.remove("hidden");
}

function hideSuccess() {
  signupSuccess.textContent = "";
  signupSuccess.classList.add("hidden");
}

if (localStorage.getItem("swimsyncToken")) {
  window.location.href = "/app";
}

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideError();
  hideSuccess();
  btnSignup.disabled = true;
  btnSignup.textContent = "Creating…";

  try {
    const response = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: signupName.value.trim(),
        email: signupEmail.value.trim(),
        password: signupPassword.value,
        role: signupRole.value,
        gender: signupGender.value,
        date_of_birth: signupDob.value,
        address: signupAddress.value.trim(),
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      showError(data.message || "Signup failed.");
      return;
    }

    signupForm.reset();
    showSuccess("Account created. Redirecting to login…");
    setTimeout(() => {
      window.location.href = "/";
    }, 1200);
  } catch (error) {
    showError(`Network error: ${error.message}`);
  } finally {
    btnSignup.disabled = false;
    btnSignup.textContent = "Create Account";
  }
});
