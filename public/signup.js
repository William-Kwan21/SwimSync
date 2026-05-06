const signupForm = document.getElementById("signup-form");
const signupError = document.getElementById("signup-error");
const signupSuccess = document.getElementById("signup-success");
const btnSignup = document.getElementById("btn-signup");
const btnAddSwimmer = document.getElementById("btn-add-swimmer");
const signupSwimmers = document.getElementById("signup-swimmers");
const signupParentName = document.getElementById("signup-parent-name");
const signupParentEmail = document.getElementById("signup-parent-email");
const signupParentPassword = document.getElementById("signup-parent-password");
const signupParentAddress = document.getElementById("signup-parent-address");

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

function createSwimmerCard(index) {
  const card = document.createElement("section");
  card.className = "form-row form-row-full swimmer-card";
  card.dataset.swimmerCard = "true";
  card.innerHTML = `
    <div style="padding:0.85rem; border:1px solid rgba(255,255,255,0.08); border-radius:12px; background:rgba(255,255,255,0.03); margin-bottom:0.75rem;">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:1rem; margin-bottom:0.75rem;">
        <strong>Swimmer ${index + 1}</strong>
        <button type="button" class="btn btn-secondary" data-remove-swimmer>Remove</button>
      </div>
      <div class="form-row">
        <label>Swimmer full name</label>
        <input type="text" data-swimmer-name placeholder="Swimmer full name" required />
      </div>
      <div class="form-row">
        <label>Email</label>
        <input type="email" data-swimmer-email placeholder="swimmer@example.com" required />
      </div>
      <div class="form-row">
        <label>Password</label>
        <input type="password" data-swimmer-password placeholder="At least 8 characters" minlength="8" required />
      </div>
      <div class="form-row">
        <label>Gender</label>
        <select data-swimmer-gender required>
          <option value="">Select gender</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="non-binary">Non-binary</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div class="form-row">
        <label>Date of Birth</label>
        <input type="date" data-swimmer-dob required />
      </div>
    </div>
  `;
  return card;
}

function syncSwimmerLabels() {
  const cards = Array.from(signupSwimmers.querySelectorAll("[data-swimmer-card]"));
  cards.forEach((card, index) => {
    const heading = card.querySelector("strong");
    if (heading) {
      heading.textContent = `Swimmer ${index + 1}`;
    }
  });
}

function addSwimmerCard() {
  const card = createSwimmerCard(signupSwimmers.children.length);
  signupSwimmers.appendChild(card);
  syncSwimmerLabels();
}

function collectSwimmers() {
  const cards = Array.from(signupSwimmers.querySelectorAll("[data-swimmer-card]"));
  return cards.map((card) => ({
    name: card.querySelector("[data-swimmer-name]").value.trim(),
    email: card.querySelector("[data-swimmer-email]").value.trim(),
    password: card.querySelector("[data-swimmer-password]").value,
    gender: card.querySelector("[data-swimmer-gender]").value,
    date_of_birth: card.querySelector("[data-swimmer-dob]").value,
    address: signupParentAddress.value.trim(),
  }));
}

if (localStorage.getItem("swimsyncToken")) {
  window.location.href = "/app";
}

if (btnAddSwimmer) {
  btnAddSwimmer.addEventListener("click", () => {
    addSwimmerCard();
  });
}

if (signupSwimmers) {
  signupSwimmers.addEventListener("click", (event) => {
    const removeBtn = event.target.closest("button[data-remove-swimmer]");
    if (!removeBtn) return;

    const cards = Array.from(signupSwimmers.querySelectorAll("[data-swimmer-card]"));
    if (cards.length <= 1) return;
    const card = removeBtn.closest("[data-swimmer-card]");
    if (card) {
      card.remove();
      syncSwimmerLabels();
    }
  });
}

if (signupForm) {
  addSwimmerCard();

  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideError();
    hideSuccess();
    btnSignup.disabled = true;
    btnSignup.textContent = "Creating…";

    try {
      const parent = {
        name: signupParentName.value.trim(),
        email: signupParentEmail.value.trim(),
        password: signupParentPassword.value,
        address: signupParentAddress.value.trim(),
      };

      const swimmers = collectSwimmers();
      const invalidSwimmer = swimmers.find(
        (swimmer) =>
          !swimmer.name ||
          !swimmer.email ||
          !swimmer.password ||
          !swimmer.gender ||
          !swimmer.date_of_birth,
      );

      if (!parent.name || !parent.email || !parent.password || !parent.address) {
        throw new Error("Parent name, email, password, and address are required.");
      }

      if (!swimmers.length) {
        throw new Error("Add at least one swimmer profile.");
      }

      if (invalidSwimmer) {
        throw new Error("Each swimmer needs a name, email, password, gender, and date of birth.");
      }

      const response = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_type: "parent",
          parent,
          swimmers,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Signup failed.");
      }

      signupForm.reset();
      signupSwimmers.innerHTML = "";
      addSwimmerCard();
      showSuccess("Family account created. Redirecting to login…");
      setTimeout(() => {
        window.location.href = "/";
      }, 1200);
    } catch (error) {
      showError(`Signup failed: ${error.message}`);
    } finally {
      btnSignup.disabled = false;
      btnSignup.textContent = "Create Account";
    }
  });
}
