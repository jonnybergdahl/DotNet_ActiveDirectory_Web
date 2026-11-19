// Shared helpers for the app pages: API calls, toasts, dialogs, confirm and logout.
// Classic deferred script; the page scripts (dns.js, users.js) use the functions below.

/** Builds an element: el("td", { className: "num" }, "text", childNode) */
function el(tag, props, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null) continue;
    if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (key in node && !key.startsWith("aria")) node[key] = value;
    else node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function icon(name) {
  return el("span", { className: "icon", "aria-hidden": "true" }, name);
}

function iconButton(iconName, label, onClick, extraClass) {
  return el("button", {
    className: `icon-button${extraClass ? " " + extraClass : ""}`,
    type: "button",
    "aria-label": label,
    title: label,
    onclick: onClick,
  }, icon(iconName));
}

/** The CSRF token the layout renders from the session; sessionStorage is the fallback. */
function csrfToken() {
  return document.querySelector("meta[name='csrf-token']")?.content || sessionStorage.getItem("csrf") || "";
}

/**
 * Calls the app's API. Adds the CSRF header to state-changing calls, sends JSON,
 * and goes to the login page on 401. Resolves to { ok, status, data }.
 */
async function api(method, url, body) {
  const headers = {};
  if (method !== "GET") headers["X-XSRF-TOKEN"] = csrfToken();
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let res;
  try {
    res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    return { ok: false, status: 0, data: { message: "Network error" } };
  }

  if (res.status === 401) {
    location.href = "/login.html";
    return new Promise(() => {}); // never resolves; the page is going away
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }
  if (!res.ok && !(data && data.message)) {
    data = { message: `Request failed (${res.status})` };
  }
  return { ok: res.ok, status: res.status, data };
}

/** Shows a short message in the bottom right corner. */
function showStatus(message, isError) {
  const container = document.getElementById("toasts");
  if (!container || !message) return;

  const toast = el("div", { className: `toast${isError ? " error" : ""}`, role: isError ? "alert" : "status" },
    icon(isError ? "error" : "check_circle"),
    el("span", null, message),
    iconButton("close", "Dismiss", () => toast.remove()));
  container.append(toast);

  setTimeout(() => {
    toast.classList.add("leaving");
    setTimeout(() => toast.remove(), 200);
  }, isError ? 8000 : 5000);
}

function openDialog(id) {
  const dialog = document.getElementById(id);
  if (dialog && !dialog.open) dialog.showModal();
  return dialog;
}

function closeDialog(id) {
  document.getElementById(id)?.close();
}

/** Asks for confirmation in the shared confirm dialog. Resolves to true or false. */
function confirmAction(title, message, actionLabel) {
  const dialog = document.getElementById("confirm-dialog");
  dialog.querySelector("[data-confirm-title]").textContent = title;
  dialog.querySelector("[data-confirm-message]").textContent = message;
  dialog.querySelector("[data-confirm-ok]").lastChild.textContent = actionLabel || "Delete";
  dialog.returnValue = "";
  dialog.showModal();
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "ok"), { once: true });
  });
}

/**
 * Sorts rows by a column. state = { field, asc }; numeric fields compare as numbers.
 * Updates aria-sort and the arrow icon on headers that have data-sort="field".
 */
function sortRows(rows, state, compareFns) {
  const compare = compareFns?.[state.field] ||
    ((a, b) => String(a[state.field] ?? "").localeCompare(String(b[state.field] ?? ""), undefined, { numeric: true, sensitivity: "base" }));
  const sorted = [...rows].sort(compare);
  if (!state.asc) sorted.reverse();

  for (const th of document.querySelectorAll("th[data-sort]")) {
    if (th.dataset.sort === state.field) {
      th.setAttribute("aria-sort", state.asc ? "ascending" : "descending");
      th.querySelector(".sort .icon").textContent = state.asc ? "arrow_upward" : "arrow_downward";
    } else {
      th.removeAttribute("aria-sort");
    }
  }
  return sorted;
}

/** Wires up th[data-sort] buttons: clicking toggles direction or switches field, then calls render(). */
function initSortHeaders(state, render) {
  for (const th of document.querySelectorAll("th[data-sort]")) {
    th.querySelector(".sort").addEventListener("click", () => {
      if (state.field === th.dataset.sort) state.asc = !state.asc;
      else Object.assign(state, { field: th.dataset.sort, asc: true });
      render();
    });
  }
}

/** One full-width message row in a table body. */
function emptyRow(colspan, message) {
  return el("tr", { className: "empty" }, el("td", { colSpan: colspan }, message));
}

// ---------- Logout and dialog close buttons ----------

document.addEventListener("click", async (e) => {
  if (e.target.closest("[data-logout]")) {
    await api("POST", "/api/auth/logout");
    sessionStorage.removeItem("csrf");
    location.href = "/login.html";
    return;
  }
  const closer = e.target.closest("[data-dialog-close]");
  if (closer) closer.closest("dialog")?.close();
});
