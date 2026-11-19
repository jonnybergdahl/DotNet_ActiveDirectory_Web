// Theme handling: "system" (follow the OS), "light" or "dark".
// Loaded in <head> without defer so the saved theme is applied before first paint.
// While signed out (<html data-auth="out">) the page follows the OS: the saved theme
// is the signed-in user's choice. Load it after js/auth.js so data-auth is already set.

(function () {
  const STORAGE_KEY = "theme";
  const ORDER = ["system", "light", "dark"];
  const ICONS = { system: "brightness_auto", light: "light_mode", dark: "dark_mode" };
  const LABELS = { system: "Theme: system", light: "Theme: light", dark: "Theme: dark" };

  function read() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return ORDER.includes(value) ? value : "system";
    } catch {
      return "system";
    }
  }

  function write(value) {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* storage unavailable: theme still works for this page view */
    }
  }

  function current() {
    return document.documentElement.dataset.auth === "out" ? "system" : read();
  }

  function apply(mode) {
    const root = document.documentElement;
    if (mode === "system") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", mode);
    }
    const button = document.querySelector("[data-theme-toggle]");
    if (button) {
      button.querySelector(".icon").textContent = ICONS[mode];
      button.setAttribute("aria-label", LABELS[mode]);
      button.title = LABELS[mode];
    }
  }

  apply(current());

  // Sign-in and logout switch between the saved theme and the OS setting.
  document.addEventListener("auth-change", () => apply(current()));

  document.addEventListener("DOMContentLoaded", () => {
    apply(current());
    const button = document.querySelector("[data-theme-toggle]");
    if (!button) return;
    button.addEventListener("click", () => {
      const next = ORDER[(ORDER.indexOf(read()) + 1) % ORDER.length];
      write(next);
      apply(next);
    });
  });
})();
