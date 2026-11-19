// App shell behaviour: the mobile navigation drawer and dropdown menus.
//
// Taken from Web_Bergdahl_Template's js/app.js. The template's hash router is left out:
// here every page is its own Razor view, and the server marks the active menu entry
// with aria-current="page".
//
// Classic deferred script (not a module).

(function () {
  const app = document.querySelector(".app");
  const menuToggle = document.querySelector("[data-menu-toggle]");
  const scrim = document.querySelector(".scrim");

  function setNavOpen(open) {
    app?.classList.toggle("nav-open", open);
    menuToggle?.setAttribute("aria-expanded", String(open));
  }

  menuToggle?.addEventListener("click", () => setNavOpen(!app.classList.contains("nav-open")));
  scrim?.addEventListener("click", () => setNavOpen(false));

  // ---------- Dropdown menus ----------
  // Markup: <div data-dropdown><button data-dropdown-toggle>…</button><div class="dropdown-menu" hidden>…</div></div>

  function closeDropdowns(except) {
    for (const dropdown of document.querySelectorAll("[data-dropdown]")) {
      if (dropdown === except) continue;
      dropdown.querySelector(".dropdown-menu").hidden = true;
      dropdown.querySelector("[data-dropdown-toggle]").setAttribute("aria-expanded", "false");
    }
  }

  function menuItems(dropdown) {
    return [...dropdown.querySelectorAll("[role='menuitem']")];
  }

  document.addEventListener("click", (e) => {
    const toggle = e.target.closest("[data-dropdown-toggle]");
    if (toggle) {
      const dropdown = toggle.closest("[data-dropdown]");
      const menu = dropdown.querySelector(".dropdown-menu");
      const open = menu.hidden;
      closeDropdowns(dropdown);
      menu.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
      if (open && e.detail === 0) menuItems(dropdown)[0]?.focus(); // opened from the keyboard
      return;
    }
    // Clicking outside, or on an item, closes the menu.
    closeDropdowns(e.target.closest(".dropdown-menu") && !e.target.closest("[role='menuitem']")
      ? e.target.closest("[data-dropdown]")
      : null);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const open = document.querySelector("[data-dropdown] .dropdown-menu:not([hidden])");
      if (open) {
        closeDropdowns();
        open.closest("[data-dropdown]").querySelector("[data-dropdown-toggle]").focus();
      } else {
        setNavOpen(false);
      }
      return;
    }

    // Arrow keys move between items in an open menu.
    const dropdown = e.target.closest?.("[data-dropdown]");
    if (!dropdown || dropdown.querySelector(".dropdown-menu").hidden) return;
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = menuItems(dropdown);
    const step = e.key === "ArrowDown" ? 1 : -1;
    const index = items.indexOf(document.activeElement);
    items[(index + step + items.length) % items.length]?.focus();
  });
})();
