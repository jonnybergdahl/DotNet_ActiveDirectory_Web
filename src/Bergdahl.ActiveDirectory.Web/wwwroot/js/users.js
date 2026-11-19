// Users page: pick an OU, create users, list, filter, sort, change passwords,
// manage group memberships and delete. Uses the helpers in site.js.
// ?path=…&q=… preselects an OU and filter (used by the search).

(function () {
  const pathSelect = document.querySelector("[data-adpath]");
  const createForm = document.querySelector("[data-create-form]");
  const newUserGroupSelect = document.querySelector("[data-new-user-group]");
  const newUserGroupsList = document.querySelector("[data-new-user-groups]");
  const filterInput = document.querySelector("[data-filter]");
  const tbody = document.querySelector("[data-users]");
  const countEl = document.querySelector("[data-count]");

  const passwordForm = document.querySelector("[data-password-form]");
  const passwordError = document.querySelector("[data-password-error]");
  const memberList = document.querySelector("[data-member-list]");
  const memberGroupSelect = document.querySelector("[data-member-group]");
  const addMemberForm = document.querySelector("[data-add-member-form]");

  const params = new URLSearchParams(location.search);
  const sort = { field: "userLoginName", asc: true };
  let users = [];
  let newUserGroups = [];
  let passwordUser = "";
  let groupsUser = "";

  // ---------- OUs and users ----------

  async function loadPaths() {
    pathSelect.replaceChildren(el("option", { value: "" }, "Loading…"));
    const res = await api("GET", "/api/users/paths");
    const paths = res.ok && Array.isArray(res.data) ? res.data : [];
    if (!paths.length) {
      pathSelect.replaceChildren(el("option", { value: "" }, res.ok ? "No OUs configured" : "Failed to load OUs"));
      renderMessage(res.ok ? "No OUs are configured." : res.data.message);
      return;
    }
    pathSelect.replaceChildren(...paths.map((p) => el("option", { value: p }, p)));
    const wanted = params.get("path");
    if (wanted && paths.includes(wanted)) pathSelect.value = wanted;
    if (params.has("q")) filterInput.value = params.get("q");
    await loadUsers();
  }

  async function loadUsers() {
    const path = pathSelect.value;
    if (!path) return;
    renderMessage("Loading users…");
    const res = await api("GET", `/api/users?adPath=${encodeURIComponent(path)}`);
    if (!res.ok) {
      users = [];
      renderMessage("Failed to load users.");
      showStatus(res.data.message, true);
      return;
    }
    users = res.data || [];
    render();
  }

  function renderMessage(message) {
    countEl.textContent = "";
    tbody.replaceChildren(emptyRow(4, message));
  }

  function render() {
    const q = filterInput.value.trim().toLowerCase();
    const filtered = users.filter((u) =>
      [u.userLoginName, u.firstName, u.lastName].some((v) => (v || "").toLowerCase().includes(q)));
    const rows = sortRows(filtered, sort);

    countEl.textContent = q ? `${rows.length} of ${users.length}` : `${users.length}`;

    if (!rows.length) {
      tbody.replaceChildren(emptyRow(4, users.length ? "No users match the filter." : "No users in this OU."));
      return;
    }

    tbody.replaceChildren(...rows.map((u) => el("tr", null,
      el("td", null, u.userLoginName),
      el("td", null, u.firstName || ""),
      el("td", null, u.lastName || ""),
      el("td", { className: "actions" },
        iconButton("key", `Change password for ${u.userLoginName}`, () => openPassword(u.userLoginName)),
        iconButton("groups", `Groups for ${u.userLoginName}`, () => openGroups(u.userLoginName)),
        iconButton("delete", `Delete ${u.userLoginName}`, () => removeUser(u.userLoginName), "danger")))));
  }

  // ---------- Groups list (for both pickers) ----------

  async function loadGroups() {
    const res = await api("GET", "/api/users/groups");
    if (!res.ok) {
      showStatus(res.data.message || "Failed to load groups.", true);
      return;
    }
    const names = (res.data || []).map((g) => g.groupName).sort((a, b) => a.localeCompare(b));
    for (const select of [newUserGroupSelect, memberGroupSelect]) {
      select.replaceChildren(el("option", { value: "" }, "Select a group…"), ...names.map((n) => el("option", { value: n }, n)));
    }
  }

  // ---------- Create user ----------

  function renderNewUserGroups() {
    newUserGroupsList.replaceChildren(...newUserGroups.map((g) => el("li", { className: "chip" },
      g,
      iconButton("close", `Remove ${g}`, () => {
        newUserGroups = newUserGroups.filter((x) => x !== g);
        renderNewUserGroups();
      }))));
  }

  document.querySelector("[data-add-group]").addEventListener("click", () => {
    const group = newUserGroupSelect.value;
    if (group && !newUserGroups.includes(group)) {
      newUserGroups.push(group);
      renderNewUserGroups();
    }
    newUserGroupSelect.value = "";
  });

  createForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = createForm.elements;
    const body = {
      userLoginName: f.login.value.trim(),
      firstName: f.first.value.trim(),
      lastName: f.last.value.trim(),
      password: f.password.value,
      adPath: pathSelect.value,
      groups: newUserGroups,
    };
    if (!body.userLoginName || !body.firstName || !body.lastName || !body.password) {
      return showStatus("Fill in login name, password, first name and last name.", true);
    }

    const res = await api("POST", "/api/users", body);
    if (!res.ok) return showStatus(res.data.message || "Could not create the user.", true);
    showStatus(res.data.message);
    createForm.reset();
    newUserGroups = [];
    renderNewUserGroups();
    loadUsers();
  });

  // ---------- Delete ----------

  async function removeUser(login) {
    const ok = await confirmAction("Delete user", `Delete the user ${login}? This can't be undone.`, "Delete");
    if (!ok) return;
    const res = await api("DELETE", "/api/users", { userLoginName: login });
    if (!res.ok) return showStatus(res.data.message || "Could not delete the user.", true);
    showStatus(res.data.message);
    loadUsers();
  }

  // ---------- Change password ----------

  function openPassword(login) {
    passwordUser = login;
    document.querySelector("[data-password-user]").textContent = login;
    passwordForm.reset();
    passwordError.textContent = "";
    openDialog("password-dialog");
    passwordForm.elements.password.focus();
  }

  passwordForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const password = passwordForm.elements.password.value;
    if (!password) {
      passwordError.textContent = "Enter a new password.";
      return;
    }
    if (password !== passwordForm.elements.confirm.value) {
      passwordError.textContent = "The passwords don't match.";
      passwordForm.elements.confirm.select();
      return;
    }
    passwordError.textContent = "";
    const res = await api("POST", "/api/users/change-password", { userLoginName: passwordUser, newPassword: password });
    if (!res.ok) {
      passwordError.textContent = res.data.message || "Could not change the password.";
      return;
    }
    closeDialog("password-dialog");
    showStatus(res.data.message);
  });

  // ---------- Group memberships ----------

  function openGroups(login) {
    groupsUser = login;
    document.querySelector("[data-groups-user]").textContent = login;
    memberGroupSelect.value = "";
    openDialog("groups-dialog");
    loadMemberships();
  }

  async function loadMemberships() {
    memberList.replaceChildren(el("li", { className: "muted" }, "Loading…"));
    const res = await api("GET", `/api/users/groups/${encodeURIComponent(groupsUser)}`);
    if (!res.ok) {
      memberList.replaceChildren(el("li", { className: "muted" }, "Failed to load groups."));
      return;
    }
    const groups = (res.data || []).slice().sort((a, b) => a.localeCompare(b));
    if (!groups.length) {
      memberList.replaceChildren(el("li", { className: "muted" }, "Not a member of any groups."));
      return;
    }
    memberList.replaceChildren(...groups.map((g) => el("li", null,
      icon("group"),
      el("span", null, g),
      iconButton("remove_circle", `Remove from ${g}`, () => removeMembership(g), "small danger"))));
  }

  addMemberForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const group = memberGroupSelect.value;
    if (!group) return showStatus("Select a group.", true);
    const res = await api("POST", "/api/users/add-to-group", { userLoginName: groupsUser, groupName: group });
    if (!res.ok) return showStatus(res.data.message || "Could not add to the group.", true);
    showStatus(res.data.message);
    memberGroupSelect.value = "";
    loadMemberships();
  });

  async function removeMembership(group) {
    const res = await api("POST", "/api/users/remove-from-group", { userLoginName: groupsUser, groupName: group });
    if (!res.ok) return showStatus(res.data.message || "Could not remove from the group.", true);
    showStatus(res.data.message);
    loadMemberships();
  }

  // ---------- Start ----------

  initSortHeaders(sort, render);
  pathSelect.addEventListener("change", loadUsers);
  document.querySelector("[data-refresh]").addEventListener("click", loadUsers);
  filterInput.addEventListener("input", render);

  loadPaths();
  loadGroups();
})();
