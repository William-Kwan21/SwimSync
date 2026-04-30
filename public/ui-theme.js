(function initUiTheme() {
  const THEME_MODE_KEY = "swimsync-theme-mode";
  const THEME_ACCENT_KEY = "swimsync-theme-accent";
  const ACCENTS = {
    ocean: {
      label: "Ocean",
      accent: "#1a75aa",
      accentSoft: "rgba(112, 217, 230, 0.32)",
      accentGlow: "rgba(26, 117, 170, 0.18)",
    },
    teal: {
      label: "Teal",
      accent: "#0f918b",
      accentSoft: "rgba(114, 224, 214, 0.28)",
      accentGlow: "rgba(15, 145, 139, 0.18)",
    },
    sunset: {
      label: "Sunset",
      accent: "#d96b4f",
      accentSoft: "rgba(255, 183, 155, 0.28)",
      accentGlow: "rgba(217, 107, 79, 0.2)",
    },
    plum: {
      label: "Plum",
      accent: "#7a5cf0",
      accentSoft: "rgba(180, 170, 255, 0.26)",
      accentGlow: "rgba(122, 92, 240, 0.2)",
    },
    forest: {
      label: "Forest",
      accent: "#2d8c6f",
      accentSoft: "rgba(136, 219, 190, 0.24)",
      accentGlow: "rgba(45, 140, 111, 0.18)",
    },
  };

  function getPreferredMode() {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return "light";
    }

    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function readThemePreferences() {
    const storedMode = window.localStorage.getItem(THEME_MODE_KEY);
    const storedAccent = window.localStorage.getItem(THEME_ACCENT_KEY);
    return {
      mode: storedMode === "dark" || storedMode === "light" ? storedMode : getPreferredMode(),
      accent: Object.prototype.hasOwnProperty.call(ACCENTS, storedAccent) ? storedAccent : "ocean",
    };
  }

  function applyTheme(mode, accent) {
    if (!document.body) {
      return;
    }

    const safeMode = mode === "dark" ? "dark" : "light";
    const safeAccent = Object.prototype.hasOwnProperty.call(ACCENTS, accent) ? accent : "ocean";
    const palette = ACCENTS[safeAccent];

    document.body.dataset.theme = safeMode;
    document.body.dataset.accent = safeAccent;
    document.documentElement.style.colorScheme = safeMode;
    document.body.style.setProperty("--theme-accent", palette.accent);
    document.body.style.setProperty("--theme-accent-soft", palette.accentSoft);
    document.body.style.setProperty("--theme-accent-glow", palette.accentGlow);
    window.localStorage.setItem(THEME_MODE_KEY, safeMode);
    window.localStorage.setItem(THEME_ACCENT_KEY, safeAccent);
  }

  function ensurePopupShell() {
    let shell = document.getElementById("ui-popup-shell");
    if (shell) {
      return shell;
    }

    shell = document.createElement("div");
    shell.id = "ui-popup-shell";
    shell.className = "ui-popup-backdrop hidden";
    shell.innerHTML = `
      <div class="ui-popup-card" role="dialog" aria-modal="true" aria-labelledby="ui-popup-title">
        <h3 id="ui-popup-title" class="ui-popup-title">Notice</h3>
        <p id="ui-popup-message" class="ui-popup-message"></p>
        <div class="ui-popup-actions">
          <button id="ui-popup-cancel" type="button" class="btn btn-secondary">Cancel</button>
          <button id="ui-popup-ok" type="button" class="btn btn-primary">OK</button>
        </div>
      </div>
    `;

    document.body.appendChild(shell);
    return shell;
  }

  function openPopup(message, options) {
    const shell = ensurePopupShell();
    const titleEl = shell.querySelector("#ui-popup-title");
    const messageEl = shell.querySelector("#ui-popup-message");
    const cancelBtn = shell.querySelector("#ui-popup-cancel");
    const okBtn = shell.querySelector("#ui-popup-ok");
    const opts = options || {};

    titleEl.textContent = opts.title || "Notice";
    messageEl.textContent = String(message || "");
    okBtn.textContent = opts.okText || "OK";
    cancelBtn.textContent = opts.cancelText || "Cancel";

    if (opts.showCancel) {
      cancelBtn.classList.remove("hidden");
    } else {
      cancelBtn.classList.add("hidden");
    }

    shell.classList.remove("hidden");

    return new Promise(function (resolve) {
      function cleanup(result) {
        shell.classList.add("hidden");
        okBtn.removeEventListener("click", onOk);
        cancelBtn.removeEventListener("click", onCancel);
        shell.removeEventListener("click", onBackdrop);
        document.removeEventListener("keydown", onEscape);
        resolve(result);
      }

      function onOk() {
        cleanup(true);
      }

      function onCancel() {
        cleanup(false);
      }

      function onBackdrop(event) {
        if (event.target === shell && opts.showCancel) {
          cleanup(false);
        }
      }

      function onEscape(event) {
        if (event.key !== "Escape") {
          return;
        }

        if (opts.showCancel) {
          cleanup(false);
        } else {
          cleanup(true);
        }
      }

      okBtn.addEventListener("click", onOk);
      cancelBtn.addEventListener("click", onCancel);
      shell.addEventListener("click", onBackdrop);
      document.addEventListener("keydown", onEscape);
      okBtn.focus();
    });
  }

  function setupPopupApi() {
    window.uiPopup = {
      alert: function (message, title) {
        return openPopup(message, {
          title: title || "Notice",
          okText: "OK",
          showCancel: false,
        }).then(function () {
          return undefined;
        });
      },
      confirm: function (message, title) {
        return openPopup(message, {
          title: title || "Please Confirm",
          okText: "Confirm",
          cancelText: "Cancel",
          showCancel: true,
        });
      },
    };
  }

  function renderThemeControls() {
    const panel = document.createElement("div");
    panel.id = "ui-theme-panel";
    panel.className = "theme-panel";
    panel.innerHTML = `
      <span class="theme-panel-label">Appearance</span>
      <button type="button" class="btn btn-secondary theme-mode-toggle" data-theme-toggle>Light</button>
      <label class="theme-accent-wrap">
        <span class="visually-hidden">Theme color</span>
        <select class="theme-accent-select" data-theme-accent aria-label="Theme color"></select>
      </label>
    `;

    const accentSelect = panel.querySelector("[data-theme-accent]");
    Object.entries(ACCENTS).forEach(function ([key, accent]) {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = accent.label;
      accentSelect.appendChild(option);
    });

    return panel;
  }

  function syncThemeControls(panel) {
    if (!panel) {
      return;
    }

    const mode = document.body && document.body.dataset.theme === "dark" ? "dark" : "light";
    const accent = (document.body && document.body.dataset.accent) || "ocean";
    const toggleBtn = panel.querySelector("[data-theme-toggle]");
    const accentSelect = panel.querySelector("[data-theme-accent]");

    if (toggleBtn) {
      toggleBtn.textContent = mode === "dark" ? "Dark" : "Light";
      toggleBtn.setAttribute("aria-pressed", mode === "dark" ? "true" : "false");
    }

    if (accentSelect && accentSelect.value !== accent) {
      accentSelect.value = accent;
    }
  }

  function mountThemeControls() {
    if (document.getElementById("ui-theme-panel")) {
      return document.getElementById("ui-theme-panel");
    }

    const panel = renderThemeControls();
    const headerRow = document.querySelector("header .header-top-row");
    const authBrand = document.querySelector(".auth-card .auth-brand");

    if (headerRow) {
      const logoutButton = headerRow.querySelector("#btn-logout");
      if (logoutButton) {
        headerRow.insertBefore(panel, logoutButton);
      } else {
        headerRow.appendChild(panel);
      }
    } else if (authBrand && authBrand.parentElement) {
      authBrand.insertAdjacentElement("afterend", panel);
    } else {
      document.body.insertBefore(panel, document.body.firstChild);
    }

    panel.querySelector("[data-theme-toggle]").addEventListener("click", function () {
      const nextMode = document.body && document.body.dataset.theme === "dark" ? "light" : "dark";
      applyTheme(nextMode, (document.body && document.body.dataset.accent) || "ocean");
      syncThemeControls(panel);
    });

    panel.querySelector("[data-theme-accent]").addEventListener("change", function (event) {
      applyTheme((document.body && document.body.dataset.theme) || "light", event.target.value);
      syncThemeControls(panel);
    });

    syncThemeControls(panel);
    return panel;
  }

  function enhanceSelect(selectEl) {
    if (!selectEl || selectEl.dataset.uiEnhanced === "true") {
      return;
    }

    if (typeof TomSelect === "undefined") {
      return;
    }

    if (selectEl.multiple || selectEl.hasAttribute("data-no-theme")) {
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
      render: {
        no_results: function () {
          return '<div class="ts-no-results">No matches</div>';
        },
      },
    });
  }

  function enhanceDateInput(inputEl) {
    if (!inputEl || inputEl.dataset.uiEnhanced === "true") {
      return;
    }

    if (typeof flatpickr === "undefined") {
      return;
    }

    inputEl.dataset.uiEnhanced = "true";
    flatpickr(inputEl, {
      dateFormat: "Y-m-d",
      allowInput: true,
      disableMobile: true,
      onChange: function () {
        inputEl.dispatchEvent(new Event("change", { bubbles: true }));
      },
    });
  }

  function enhanceTimeInput(inputEl) {
    if (!inputEl || inputEl.dataset.uiEnhanced === "true") {
      return;
    }

    if (typeof flatpickr === "undefined") {
      return;
    }

    inputEl.dataset.uiEnhanced = "true";
    flatpickr(inputEl, {
      enableTime: true,
      noCalendar: true,
      dateFormat: "H:i",
      altInput: true,
      altFormat: "h:i K",
      time_24hr: false,
      allowInput: true,
      disableMobile: true,
      minuteIncrement: 5,
      onChange: function (_selectedDates, dateStr) {
        const normalized = dateStr && dateStr.length >= 5 ? dateStr.slice(0, 5) : dateStr;
        if (normalized) {
          inputEl.value = normalized;
        }
        inputEl.dispatchEvent(new Event("change", { bubbles: true }));
      },
    });
  }

  function runEnhancements(root) {
    const scope = root || document;

    scope.querySelectorAll("select").forEach(enhanceSelect);
    scope.querySelectorAll('input[type="date"]').forEach(enhanceDateInput);
    scope.querySelectorAll('input[type="time"]').forEach(enhanceTimeInput);
  }

  function observeDynamicDom() {
    const observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (!(node instanceof HTMLElement)) {
            return;
          }

          if (node.matches && node.matches("select, input[type='date'], input[type='time']")) {
            runEnhancements(node.parentElement || document);
            return;
          }

          if (node.querySelectorAll) {
            runEnhancements(node);
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    const preferences = readThemePreferences();
    applyTheme(preferences.mode, preferences.accent);
    setupPopupApi();
    mountThemeControls();
    runEnhancements(document);
    observeDynamicDom();
  });
})();
