// Search in the top bar, from Web_Bergdahl_Template's js/search.js.
// search() is replaced: it looks up pages, DNS records in every configured zone and users
// in every configured OU. The data is fetched from the API the first time the user searches,
// then kept for this page view. Choosing a result opens its page with the zone/OU and filter set.
//
// Keys: Ctrl/⌘ K or "/" focuses the field, arrow keys move through results,
// Enter opens the selected one, Escape closes.
// On phones the field is hidden behind a search icon and covers the top bar when opened.

(function () {
  const root = document.querySelector("[data-search]");
  if (!root) return;

  const topbar = root.closest(".topbar");
  const input = root.querySelector("[data-search-input]");
  const results = root.querySelector("[data-search-results]");
  const shortcut = root.querySelector("[data-search-shortcut]");
  const openButton = document.querySelector("[data-search-open]");
  const closeButton = root.querySelector("[data-search-close]");
  const MAX_RESULTS = 10;

  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  if (shortcut) shortcut.textContent = isMac ? "⌘ K" : "Ctrl K";

  const pages = [
    { title: "DNS records", detail: "Page", icon: "dns", url: "/" },
    { title: "Users", detail: "Page", icon: "group", url: "/users" },
    { title: "Account", detail: "Page", icon: "person", url: "/account" },
  ];

  // ---------- Data: fetched once, on first use ----------

  let index = null;      // [{ title, detail, icon, url, text }]
  let loading = null;

  async function getJson(url) {
    try {
      const res = await fetch(url);
      if (res.status === 401) {
        location.href = "/login.html";
        return [];
      }
      return res.ok ? await res.json() : [];
    } catch {
      return [];
    }
  }

  function loadIndex() {
    if (loading) return loading;
    loading = (async () => {
      const [zones, paths] = await Promise.all([getJson("/api/dns/zones"), getJson("/api/users/paths")]);

      const hostLists = await Promise.all((zones || []).map(async (zone) =>
        (await getJson(`/api/dns/${encodeURIComponent(zone)}`) || []).map((r) => ({
          title: r.hostName,
          detail: `${r.recordType} · ${r.ipAddress} · ${zone}`,
          icon: "dns",
          url: `/?zone=${encodeURIComponent(zone)}&q=${encodeURIComponent(r.hostName)}`,
          text: `${r.hostName} ${r.ipAddress}`.toLowerCase(),
        }))));

      const userLists = await Promise.all((paths || []).map(async (path) =>
        (await getJson(`/api/users?adPath=${encodeURIComponent(path)}`) || []).map((u) => {
          const fullName = [u.firstName, u.lastName].filter(Boolean).join(" ");
          return {
            title: u.userLoginName,
            detail: fullName ? `${fullName} · ${path}` : path,
            icon: "person",
            url: `/users?path=${encodeURIComponent(path)}&q=${encodeURIComponent(u.userLoginName)}`,
            text: `${u.userLoginName} ${fullName}`.toLowerCase(),
          };
        })));

      index = [...hostLists.flat(), ...userLists.flat()];
      return index;
    })();
    return loading;
  }

  let items = [];
  let selected = -1;

  function search(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const pageHits = pages.filter((p) => p.title.toLowerCase().includes(q));
    const data = index || [];
    const starts = data.filter((d) => d.title.toLowerCase().startsWith(q));
    const contains = data.filter((d) => !starts.includes(d) && d.text.includes(q));
    return [...pageHits, ...starts, ...contains].slice(0, MAX_RESULTS);
  }

  function render() {
    const query = input.value;
    items = search(query);
    selected = items.length ? 0 : -1;
    results.replaceChildren();

    if (!query.trim()) {
      setOpen(false);
      return;
    }

    if (!items.length) {
      const empty = document.createElement("li");
      empty.className = "search-empty";
      empty.textContent = index ? `No results for “${query.trim()}”` : "Loading hosts and users…";
      results.append(empty);
    }

    items.forEach((item, i) => {
      const li = document.createElement("li");
      li.className = "search-result";
      li.id = `search-result-${i}`;
      li.setAttribute("role", "option");
      li.innerHTML = '<span class="icon"></span><span><span></span><small></small></span>';
      li.querySelector(".icon").textContent = item.icon;
      li.querySelector("span:last-child > span").textContent = item.title;
      li.querySelector("small").textContent = item.detail;
      li.addEventListener("mousedown", (e) => e.preventDefault()); // keep focus in the field
      li.addEventListener("click", () => go(item));
      results.append(li);
    });

    setOpen(true);
    highlight();
  }

  function highlight() {
    [...results.querySelectorAll(".search-result")].forEach((li, i) => {
      li.setAttribute("aria-selected", String(i === selected));
      if (i === selected) li.scrollIntoView({ block: "nearest" });
    });
    if (selected >= 0) input.setAttribute("aria-activedescendant", `search-result-${selected}`);
    else input.removeAttribute("aria-activedescendant");
  }

  function setOpen(open) {
    results.hidden = !open;
    input.setAttribute("aria-expanded", String(open));
  }

  function go(item) {
    close();
    location.href = item.url;
  }

  function close() {
    input.value = "";
    setOpen(false);
    topbar.classList.remove("search-active");
    input.blur();
  }

  function onInput() {
    render();
    if (!index) loadIndex().then(() => document.activeElement === input && render());
  }

  input.addEventListener("input", onInput);
  input.addEventListener("focus", () => {
    loadIndex(); // start fetching as soon as the field is focused
    if (input.value) render();
  });
  input.addEventListener("blur", () => setOpen(false));

  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!items.length) return;
      e.preventDefault();
      selected = (selected + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      highlight();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (items[selected]) go(items[selected]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  });

  function openSearch() {
    topbar.classList.add("search-active");
    input.focus();
    input.select();
  }

  openButton?.addEventListener("click", openSearch);
  closeButton?.addEventListener("click", close);

  // Ctrl/⌘ K anywhere, or "/" when not typing in another field
  document.addEventListener("keydown", (e) => {
    const typing = e.target.closest?.("input, textarea, select, [contenteditable]");
    if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
      if (document.querySelector("dialog[open]")) return;
      e.preventDefault();
      openSearch();
    }
  });
})();
