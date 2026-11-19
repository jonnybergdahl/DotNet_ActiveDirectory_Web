// DNS records page: pick a zone, add A or CNAME records, list, filter, sort and delete.
// Uses the helpers in site.js. ?zone=…&q=… preselects a zone and filter (used by the search).

(function () {
  const zoneSelect = document.querySelector("[data-zone]");
  const form = document.querySelector("[data-add-form]");
  const typeSelect = document.querySelector("[data-record-type]");
  const targetSelect = document.querySelector("[data-target-host]");
  const filterInput = document.querySelector("[data-filter]");
  const tbody = document.querySelector("[data-records]");
  const countEl = document.querySelector("[data-count]");

  const params = new URLSearchParams(location.search);
  const sort = { field: "hostName", asc: true };
  let records = [];

  const ipToNumber = (ip) => (ip || "").split(".").reduce((acc, octet) => acc * 256 + (parseInt(octet, 10) || 0), 0);
  const compare = {
    ttl: (a, b) => a.ttl - b.ttl,
    ipAddress: (a, b) => {
      const ipA = /^\d+\.\d+\.\d+\.\d+$/.test(a.ipAddress);
      const ipB = /^\d+\.\d+\.\d+\.\d+$/.test(b.ipAddress);
      if (ipA && ipB) return ipToNumber(a.ipAddress) - ipToNumber(b.ipAddress);
      if (ipA !== ipB) return ipA ? -1 : 1; // IPs before CNAME targets
      return a.ipAddress.localeCompare(b.ipAddress);
    },
  };

  async function loadZones() {
    zoneSelect.replaceChildren(el("option", { value: "" }, "Loading…"));
    const res = await api("GET", "/api/dns/zones");
    const zones = res.ok && Array.isArray(res.data) ? res.data : [];
    if (!zones.length) {
      zoneSelect.replaceChildren(el("option", { value: "" }, res.ok ? "No zones configured" : "Failed to load zones"));
      renderMessage(res.ok ? "No DNS zones are configured." : res.data.message);
      return;
    }
    zoneSelect.replaceChildren(...zones.map((z) => el("option", { value: z }, z)));
    const wanted = params.get("zone");
    if (wanted && zones.some((z) => z.toLowerCase() === wanted.toLowerCase())) {
      zoneSelect.value = zones.find((z) => z.toLowerCase() === wanted.toLowerCase());
    }
    if (params.has("q")) filterInput.value = params.get("q");
    await loadRecords();
  }

  async function loadRecords() {
    const zone = zoneSelect.value;
    if (!zone) return;
    renderMessage("Loading records…");
    const res = await api("GET", `/api/dns/${encodeURIComponent(zone)}`);
    if (!res.ok) {
      records = [];
      renderMessage("Failed to load records.");
      showStatus(res.data.message, true);
      return;
    }
    records = res.data || [];
    updateTargetHosts();
    render();
  }

  function renderMessage(message) {
    countEl.textContent = "";
    tbody.replaceChildren(emptyRow(5, message));
  }

  function updateTargetHosts() {
    const current = targetSelect.value;
    const hosts = records.filter((r) => r.recordType === "A").map((r) => r.hostName).sort();
    targetSelect.replaceChildren(
      el("option", { value: "" }, "Select a host…"),
      ...hosts.map((h) => el("option", { value: h }, h)));
    if (hosts.includes(current)) targetSelect.value = current;
  }

  function render() {
    const q = filterInput.value.trim().toLowerCase();
    const filtered = records.filter((r) =>
      r.hostName.toLowerCase().includes(q) || (r.ipAddress || "").toLowerCase().includes(q));
    const rows = sortRows(filtered, sort, compare);

    countEl.textContent = q ? `${rows.length} of ${records.length}` : `${records.length}`;

    if (!rows.length) {
      tbody.replaceChildren(emptyRow(5, records.length ? "No records match the filter." : "No records in this zone."));
      return;
    }

    tbody.replaceChildren(...rows.map((r) => el("tr", null,
      el("td", null, r.hostName),
      el("td", null, r.recordType),
      el("td", null, r.ipAddress),
      el("td", { className: "num" }, r.ttl),
      el("td", { className: "actions" },
        iconButton("delete", `Delete ${r.hostName}`, () => removeRecord(r), "danger")))));
  }

  function showFieldsForType() {
    for (const field of form.querySelectorAll("[data-for-type]")) {
      field.hidden = field.dataset.forType !== typeSelect.value;
    }
  }

  async function addRecord(e) {
    e.preventDefault();
    const zone = zoneSelect.value;
    const type = typeSelect.value;
    const name = form.elements.name.value.trim();
    const ip = form.elements.ip.value.trim();
    const target = targetSelect.value;

    if (!zone) return showStatus("Select a zone first.", true);
    if (!/^[a-zA-Z0-9\-._]{1,255}$/.test(name)) {
      form.elements.name.focus();
      return showStatus("Enter a valid name (letters, digits, - . _).", true);
    }

    let res;
    if (type === "A") {
      if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
        form.elements.ip.focus();
        return showStatus("Enter an IPv4 address, for example 10.0.0.50.", true);
      }
      res = await api("POST", "/api/dns", { zone, hostname: name, ipAddress: ip });
    } else {
      if (!target) {
        targetSelect.focus();
        return showStatus("Select a target host.", true);
      }
      res = await api("POST", "/api/dns/cname", { zone, aliasName: name, targetHost: target });
    }

    if (!res.ok) return showStatus(res.data.message || "Could not add the record.", true);
    showStatus(res.data.message);
    if (res.data.warning) showStatus(res.data.warning, true);
    form.elements.name.value = "";
    form.elements.ip.value = "";
    targetSelect.value = "";
    form.elements.name.focus();
    loadRecords();
  }

  async function removeRecord(record) {
    const ok = await confirmAction("Delete record", `Delete ${record.hostName} (${record.recordType})?`, "Delete");
    if (!ok) return;
    const res = await api("DELETE", "/api/dns", { zone: zoneSelect.value, hostname: record.hostName });
    if (!res.ok) return showStatus(res.data.message || "Could not delete the record.", true);
    showStatus(res.data.message);
    if (res.data.warning) showStatus(res.data.warning, true);
    loadRecords();
  }

  initSortHeaders(sort, render);
  zoneSelect.addEventListener("change", loadRecords);
  document.querySelector("[data-refresh]").addEventListener("click", loadRecords);
  filterInput.addEventListener("input", render);
  typeSelect.addEventListener("change", showFieldsForType);
  form.addEventListener("submit", addRecord);

  showFieldsForType();
  loadZones();
})();
