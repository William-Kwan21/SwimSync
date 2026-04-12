(function initUiTheme() {
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

    // Keep native behavior off and apply themed dropdown.
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
    setupPopupApi();
    runEnhancements(document);
    observeDynamicDom();
  });
})();
