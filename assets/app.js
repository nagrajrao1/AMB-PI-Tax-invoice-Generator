/* Dashboard logic: form state, live preview, PDF download, saved invoices,
   saved clients and proforma → tax-invoice reminders. */
(function () {
  "use strict";

  const cfg = window.AMB_CONFIG;
  const { build, compute, amountInWords, formatINR, formatDate, flightDates, docTitle } = window.AmbInvoice;
  const $ = (id) => document.getElementById(id);

  const STORE_CLIENTS = "amb.clients.v1";
  const STORE_HISTORY = "amb.history.v1";
  const STORE_DRAFT = "amb.draft.v2";

  /* ---------- storage (fails soft in private mode) ---------- */
  const load = (k, d) => {
    try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; }
  };
  const save = (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ }
  };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /* Records: migrate older entries (no id/type) once. */
  function records() {
    const list = load(STORE_HISTORY, []);
    let changed = false;
    list.forEach((r, i) => {
      if (!r.id) { r.id = uid() + i; changed = true; }
      if (!r.type) { r.type = "tax"; changed = true; }
      if (!r.createdAt) { r.createdAt = Date.now() - i; changed = true; }
    });
    if (changed) save(STORE_HISTORY, list);
    return list;
  }
  const saveRecords = (list) => save(STORE_HISTORY, list);
  const findRecord = (id) => records().find((r) => r.id === id);

  /* ---------- dashboard font = invoice font ---------- */
  try {
    const f = window.AMB_ASSETS.fonts;
    [["normal", 400], ["medium", 500], ["semibold", 600], ["bold", 700], ["bold", 800]].forEach(([k, w]) => {
      const face = new FontFace("Montserrat", `url(data:font/ttf;base64,${f[k]})`, { weight: String(w) });
      face.load().then((ff) => document.fonts.add(ff)).catch(() => {});
    });
  } catch { /* fall back to system font */ }

  /* ---------- static UI ---------- */
  $("chip-gstin").textContent = "GSTIN " + cfg.company.gstin;
  $("chip-rate").textContent = "GST " + cfg.defaultGstRate + "% default";

  $("clientState").innerHTML =
    '<option value="">Select state…</option>' +
    Object.entries(window.GST_STATES)
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([code, name]) => `<option value="${code}">${name} (${code})</option>`)
      .join("");

  /* ---------- helpers ---------- */
  const todayISO = () => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };
  const daysBetween = (isoA, isoB) => Math.round((new Date(isoB) - new Date(isoA)) / 86400000);
  const parseAmount = (s) => {
    const n = parseFloat(String(s || "").replace(/[^0-9.]/g, ""));
    return isFinite(n) ? n : 0;
  };
  const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
  const escapeHtml = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const typeName = (t) => (t === "proforma" ? "Proforma" : "Tax Invoice");

  let toastTimer;
  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
  }

  /* ---------- editing state ---------- */
  // editId: the saved record being edited. linkProformaId: proforma being converted.
  const state = { editId: null, linkProformaId: null };

  /* ---------- form <-> data ---------- */
  const getType = () => document.querySelector('input[name="docType"]:checked').value;
  const setType = (t) => {
    document.querySelector(`input[name="docType"][value="${t === "proforma" ? "proforma" : "tax"}"]`).checked = true;
  };

  function readForm() {
    const v = (id) => $(id).value;
    return {
      type: getType(),
      invoiceNo: v("invoiceNo").trim(),
      date: v("date"),
      client: {
        name: v("clientName").trim(),
        address: v("clientAddress").trim(),
        gstin: v("clientGstin").trim().toUpperCase(),
        stateCode: v("clientState"),
        contact: v("clientContact").trim(),
      },
      flightFrom: v("flightFrom"),
      flightTo: v("flightTo"),
      flight: v("flight"),
      sac: v("sac"),
      amount: parseAmount(v("amount")),
      gstRate: v("gstRate") === "" ? cfg.defaultGstRate : Number(v("gstRate")),
      notes: v("notes"),
    };
  }

  function writeForm(d) {
    setType(d.type || "tax");
    $("invoiceNo").value = d.invoiceNo || "";
    $("date").value = d.date || todayISO();
    fillClient(d.client || {});
    $("flightFrom").value = d.flightFrom || "";
    $("flightTo").value = d.flightTo || "";
    $("flight").value = d.flight || "";
    $("sac").value = d.sac || "";
    $("amount").value = d.amount ? formatINR(d.amount).replace(/\.00$/, "") : "";
    $("gstRate").value = d.gstRate ?? cfg.defaultGstRate;
    $("notes").value = d.notes || "";
    document.querySelectorAll(".invalid").forEach((el) => el.classList.remove("invalid"));
    $("form-error").textContent = "";
  }

  function fillClient(c) {
    $("clientName").value = c.name || "";
    $("clientAddress").value = c.address || "";
    $("clientGstin").value = c.gstin || "";
    $("clientState").value = c.stateCode || "";
    $("clientContact").value = c.contact || "";
    validateGstin();
  }

  /* ---------- GSTIN handling ---------- */
  function validateGstin() {
    const el = $("clientGstin");
    const hint = $("gstin-hint");
    const g = el.value.trim().toUpperCase();
    el.classList.remove("invalid");
    hint.className = "hint";
    hint.textContent = "";
    if (!g) return true;
    if (g.length < 15) {
      hint.textContent = `${g.length}/15 characters`;
      return false;
    }
    if (!GSTIN_RE.test(g)) {
      el.classList.add("invalid");
      hint.className = "hint bad";
      hint.textContent = "This doesn't look like a valid GSTIN";
      return false;
    }
    const code = g.slice(0, 2);
    if (window.GST_STATES[code]) {
      $("clientState").value = code;
      hint.className = "hint ok";
      hint.textContent = "✓ " + window.GST_STATES[code];
    }
    return true;
  }

  /* ---------- summary + preview ---------- */
  let previewUrl = null;
  let previewTimer = null;

  function renderSummary(data) {
    const t = compute(data);
    $("s-kind").textContent = docTitle(data);
    $("s-kind").classList.toggle("is-proforma", data.type === "proforma");
    $("s-taxable").textContent = "₹ " + formatINR(t.taxable);
    $("s-taxlines").innerHTML = t.intra
      ? `<div class="summary-row"><span>CGST @ ${t.rate / 2}%</span><b>₹ ${formatINR(t.cgst)}</b></div>
         <div class="summary-row"><span>SGST @ ${t.rate / 2}%</span><b>₹ ${formatINR(t.sgst)}</b></div>`
      : `<div class="summary-row"><span>IGST @ ${t.rate}%</span><b>₹ ${formatINR(t.igst)}</b></div>`;
    $("s-total").textContent = "₹ " + formatINR(t.total);
    $("s-words").textContent = amountInWords(t.total);
    $("s-type").textContent = t.intra
      ? "CGST + SGST · within " + cfg.company.stateName
      : data.client.stateCode
        ? "IGST · inter-state supply"
        : "IGST · pick client state to confirm";
  }

  function renderPreview() {
    try {
      const { doc } = build(readForm());
      const url = doc.output("bloburl");
      $("preview").src = url + "#toolbar=0&navpanes=0&view=FitH";
      $("open-preview").href = url;
      if (previewUrl) setTimeout((u) => URL.revokeObjectURL(u), 1500, previewUrl);
      previewUrl = url;
    } catch (e) {
      console.error(e);
    }
  }

  function renderTypeLabels() {
    const p = getType() === "proforma";
    $("no-label").innerHTML = (p ? "Proforma number" : "Invoice number") + " <b>*</b>";
    $("date-label").innerHTML = (p ? "Proforma date" : "Invoice date") + " <b>*</b>";
    $("btn-download-label").textContent = state.editId ? "Update & Download PDF" : "Save & Download PDF";
  }

  function onChange() {
    const data = readForm();
    renderSummary(data);
    renderTypeLabels();
    save(STORE_DRAFT, { data, state });
    clearTimeout(previewTimer);
    previewTimer = setTimeout(renderPreview, 450);
  }

  /* ---------- mode banner (editing / converting) ---------- */
  function renderMode() {
    const b = $("mode-banner");
    if (state.editId) {
      const r = findRecord(state.editId);
      if (!r) { state.editId = null; return renderMode(); }
      $("mode-text").innerHTML = `✏️ Editing <b>${typeName(r.type)} #${escapeHtml(r.invoiceNo)}</b> — saving will update it.`;
      b.className = "mode-banner edit";
      b.hidden = false;
    } else if (state.linkProformaId) {
      const p = findRecord(state.linkProformaId);
      if (!p) { state.linkProformaId = null; return renderMode(); }
      $("mode-text").innerHTML = `🔁 Creating a tax invoice from <b>Proforma #${escapeHtml(p.invoiceNo)}</b>. Enter the tax invoice number and save.`;
      b.className = "mode-banner convert";
      b.hidden = false;
    } else {
      b.hidden = true;
    }
    renderTypeLabels();
  }

  function resetForm() {
    state.editId = null;
    state.linkProformaId = null;
    const t = getType();
    writeForm({ type: t, date: todayISO(), gstRate: cfg.defaultGstRate });
    renderMode();
    suggestNextNumber();
    onChange();
  }

  $("mode-cancel").addEventListener("click", resetForm);

  /* ---------- saved clients ---------- */
  const clients = () => load(STORE_CLIENTS, []);

  function upsertClient(client) {
    if (!client.name) return false;
    const list = clients().filter((c) => c.name.toLowerCase() !== client.name.toLowerCase());
    list.unshift(client);
    save(STORE_CLIENTS, list.slice(0, 200));
    renderClients();
    return true;
  }

  function renderClients() {
    const list = clients();
    $("savedClients").innerHTML =
      `<option value="">${list.length ? "Saved clients…" : "No saved clients yet"}</option>` +
      list.map((c, i) => `<option value="${i}">${escapeHtml(c.name)}</option>`).join("");
    $("client-names").innerHTML = list.map((c) => `<option value="${escapeHtml(c.name)}"></option>`).join("");
    const ul = $("client-list");
    ul.innerHTML = list.length
      ? list
          .map(
            (c, i) => `<li>
            <div class="li-main"><div class="h-no">${escapeHtml(c.name)}</div>
              <div class="h-client">${escapeHtml(c.gstin || "No GSTIN")}${c.stateCode ? " · " + escapeHtml(window.GST_STATES[c.stateCode] || "") : ""}</div></div>
            <div class="row-actions">
              <button type="button" class="mini" data-act="use-client" data-i="${i}">Use</button>
              <button type="button" class="mini danger" data-act="del-client" data-i="${i}" title="Delete client" aria-label="Delete ${escapeHtml(c.name)}">✕</button>
            </div></li>`
          )
          .join("")
      : '<li class="empty">Click “Save client” on the form to keep a client here.</li>';
  }

  $("savedClients").addEventListener("change", (e) => {
    const c = clients()[e.target.value];
    if (c) { fillClient(c); onChange(); }
    e.target.value = "";
  });

  // Picking a name from the autocomplete fills the rest of the client details
  let lastMatched = "";
  $("clientName").addEventListener("input", (e) => {
    const name = e.target.value.trim().toLowerCase();
    const c = clients().find((x) => x.name.toLowerCase() === name);
    if (c && name !== lastMatched) {
      fillClient(c);
      lastMatched = name;
    } else if (!c) {
      lastMatched = "";
    }
  });

  $("btn-save-client").addEventListener("click", () => {
    const c = readForm().client;
    const msg = $("client-msg");
    if (!c.name) {
      msg.className = "hint bad";
      msg.textContent = "Enter a company name first.";
      $("clientName").classList.add("invalid");
      return;
    }
    const existed = clients().some((x) => x.name.toLowerCase() === c.name.toLowerCase());
    upsertClient(c);
    msg.className = "hint ok";
    msg.textContent = existed ? "✓ Client updated" : "✓ Client saved";
    setTimeout(() => (msg.textContent = ""), 2500);
  });

  $("client-list").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const list = clients();
    const c = list[btn.dataset.i];
    if (!c) return;
    if (btn.dataset.act === "use-client") {
      fillClient(c);
      onChange();
      $("clientName").scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (btn.dataset.act === "del-client") {
      if (!confirm(`Delete saved client "${c.name}"?\n\nInvoices already issued to them are not affected.`)) return;
      list.splice(btn.dataset.i, 1);
      save(STORE_CLIENTS, list);
      renderClients();
      toast("Client deleted");
    }
  });

  /* ---------- reminders ---------- */
  function pendingProformas() {
    return records()
      .filter((r) => r.type === "proforma" && !r.convertedToId && !r.reminderDismissed)
      .map((r) => ({ r, due: r.flightTo || r.flightFrom || r.date }))
      .sort((a, b) => (a.due || "").localeCompare(b.due || ""));
  }

  function renderReminders() {
    const list = pendingProformas();
    const today = todayISO();
    $("reminders").hidden = !list.length;
    $("bell").hidden = !list.length;
    $("bell-count").textContent = list.length;
    const overdue = list.filter((x) => x.due && x.due <= today).length;
    $("bell").classList.toggle("hot", overdue > 0);
    document.title = (list.length ? `(${list.length}) ` : "") + "Ambadnya Aviation · Invoice Generator";
    $("reminders-title").textContent =
      list.length === 1 ? "1 proforma needs a tax invoice" : `${list.length} proformas need a tax invoice`;
    $("reminder-list").innerHTML = list
      .map(({ r, due }) => {
        let status, cls;
        if (!due) { status = "No flight date"; cls = "soon"; }
        else {
          const d = daysBetween(due, today);
          if (d > 0) { status = `Flight done ${d} day${d > 1 ? "s" : ""} ago — overdue`; cls = "late"; }
          else if (d === 0) { status = "Flight today — raise tax invoice"; cls = "late"; }
          else { status = `Flight in ${-d} day${d < -1 ? "s" : ""}`; cls = "soon"; }
        }
        return `<li class="${cls}">
          <div class="li-main">
            <div class="h-no">Proforma #${escapeHtml(r.invoiceNo)} · ${escapeHtml(r.client.name)}</div>
            <div class="h-client">${escapeHtml(flightDates(r) || "—")} · ₹ ${formatINR(compute(r).total)}</div>
            <span class="pill ${cls}">${status}</span>
          </div>
          <div class="row-actions">
            <button type="button" class="mini primary" data-act="convert" data-id="${r.id}">Create tax invoice</button>
            <button type="button" class="mini" data-act="dismiss" data-id="${r.id}" title="Stop reminding (e.g. trip cancelled)">Dismiss</button>
          </div></li>`;
      })
      .join("");
  }

  $("bell").addEventListener("click", () => $("reminders").scrollIntoView({ behavior: "smooth", block: "start" }));

  $("reminder-list").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    if (btn.dataset.act === "convert") startConvert(btn.dataset.id);
    if (btn.dataset.act === "dismiss") {
      const r = findRecord(btn.dataset.id);
      if (!r || !confirm(`Stop reminding about Proforma #${r.invoiceNo}?\n\nUse this if the trip was cancelled or invoiced elsewhere.`)) return;
      const list = records();
      list.find((x) => x.id === r.id).reminderDismissed = true;
      saveRecords(list);
      refreshAll();
      toast("Reminder dismissed");
    }
  });

  function startConvert(id) {
    const p = findRecord(id);
    if (!p) return;
    state.editId = null;
    state.linkProformaId = id;
    writeForm({ ...p, type: "tax", invoiceNo: "", date: todayISO() });
    renderMode();
    suggestNextNumber();
    onChange();
    window.scrollTo({ top: 0, behavior: "smooth" });
    $("invoiceNo").focus({ preventScroll: true });
  }

  /* ---------- saved invoices ---------- */
  let filter = "all";

  function renderHistory() {
    const q = $("history-search").value.trim().toLowerCase();
    const list = records()
      .filter((r) => filter === "all" || r.type === filter)
      .filter((r) => !q || (r.invoiceNo + " " + r.client.name).toLowerCase().includes(q));
    const ul = $("history");
    if (!list.length) {
      ul.innerHTML = `<li class="empty">${records().length ? "Nothing matches." : "Invoices you save will appear here."}</li>`;
      return;
    }
    ul.innerHTML = list
      .map((r) => {
        const isP = r.type === "proforma";
        let badge = `<span class="badge ${isP ? "b-pro" : "b-tax"}">${isP ? "Proforma" : "Tax"}</span>`;
        if (isP && r.convertedToId) badge += `<span class="badge b-done">→ #${escapeHtml(r.convertedInvoiceNo || "")}</span>`;
        else if (isP && !r.reminderDismissed) badge += `<span class="badge b-wait">Tax inv. pending</span>`;
        return `<li class="${state.editId === r.id ? "active" : ""}">
          <div class="li-main">
            <div class="h-no">#${escapeHtml(r.invoiceNo)} ${badge}</div>
            <div class="h-client">${escapeHtml(r.client.name)} · ${escapeHtml(formatDate(r.date))}</div>
            <div class="h-amt">₹ ${formatINR(compute(r).total)}</div>
          </div>
          <div class="row-actions">
            <button type="button" class="mini" data-act="edit" data-id="${r.id}">Edit</button>
            <button type="button" class="mini" data-act="pdf" data-id="${r.id}" title="Download PDF again">PDF</button>
            ${isP && !r.convertedToId ? `<button type="button" class="mini primary" data-act="convert" data-id="${r.id}" title="Create tax invoice from this proforma">→ Tax</button>` : ""}
            <button type="button" class="mini danger" data-act="delete" data-id="${r.id}" title="Delete" aria-label="Delete #${escapeHtml(r.invoiceNo)}">✕</button>
          </div></li>`;
      })
      .join("");
  }

  document.querySelectorAll(".filter").forEach((b) =>
    b.addEventListener("click", () => {
      filter = b.dataset.f;
      document.querySelectorAll(".filter").forEach((x) => x.classList.toggle("on", x === b));
      renderHistory();
    })
  );
  $("history-search").addEventListener("input", renderHistory);

  $("history").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const r = findRecord(btn.dataset.id);
    if (!r) return;
    const act = btn.dataset.act;
    if (act === "edit") {
      state.editId = r.id;
      state.linkProformaId = null;
      writeForm(r);
      renderMode();
      $("invoiceNo-hint").textContent = "";
      onChange();
      renderHistory();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (act === "pdf") {
      downloadPdf(r);
    } else if (act === "convert") {
      startConvert(r.id);
    } else if (act === "delete") {
      deleteRecord(r);
    }
  });

  function deleteRecord(r) {
    if (!confirm(`Delete ${typeName(r.type)} #${r.invoiceNo} for ${r.client.name}?\n\nThis only removes it from this dashboard — PDFs you already downloaded are not affected.`)) return;
    let list = records().filter((x) => x.id !== r.id);
    // Keep proforma ↔ tax links consistent
    list.forEach((x) => {
      if (x.convertedToId === r.id) { delete x.convertedToId; delete x.convertedInvoiceNo; }
      if (x.linkedProformaId === r.id) delete x.linkedProformaId;
    });
    saveRecords(list);
    if (state.editId === r.id || state.linkProformaId === r.id) resetForm();
    refreshAll();
    toast(`${typeName(r.type)} #${r.invoiceNo} deleted`);
  }

  /* ---------- next number suggestion (per document type) ---------- */
  function suggestNextNumber() {
    const hint = $("invoiceNo-hint");
    if (state.editId) { hint.textContent = ""; return; }
    const t = getType();
    const last = records()
      .filter((r) => r.type === t)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!last) { hint.textContent = ""; return; }
    const m = String(last.invoiceNo).match(/^(.*?)(\d+)(\D*)$/);
    const label = t === "proforma" ? "Last proforma" : "Last tax invoice";
    if (m) {
      const next = m[1] + String(Number(m[2]) + 1).padStart(m[2].length, "0") + m[3];
      hint.innerHTML = `${label}: #${escapeHtml(last.invoiceNo)} · <a href="#" id="use-next">use ${escapeHtml(next)}</a>`;
      $("use-next").addEventListener("click", (e) => {
        e.preventDefault();
        $("invoiceNo").value = next;
        $("invoiceNo").classList.remove("invalid");
        onChange();
      });
    } else {
      hint.textContent = `${label}: #${last.invoiceNo}`;
    }
  }

  /* ---------- save + download ---------- */
  function validate(data) {
    const missing = [];
    const check = (id, ok, name) => {
      $(id).classList.toggle("invalid", !ok);
      if (!ok) missing.push(name);
    };
    check("invoiceNo", !!data.invoiceNo, data.type === "proforma" ? "proforma number" : "invoice number");
    check("date", !!data.date, "date");
    check("clientName", !!data.client.name, "client name");
    check("flightFrom", !!data.flightFrom, "flight date");
    check("flight", !!data.flight.trim(), "flight details");
    check("amount", data.amount > 0, "taxable amount");
    if (missing.length) return "Please fill in: " + missing.join(", ") + ".";
    if (data.flightTo && data.flightTo < data.flightFrom) {
      $("flightTo").classList.add("invalid");
      return "Flight 'to' date is before the 'from' date.";
    }
    if (data.client.gstin && !GSTIN_RE.test(data.client.gstin)) return "Client GSTIN looks invalid — please check it.";
    const dup = records().find(
      (r) => r.type === data.type && r.id !== state.editId && r.invoiceNo.toLowerCase() === data.invoiceNo.toLowerCase()
    );
    if (dup) {
      $("invoiceNo").classList.add("invalid");
      return `${typeName(data.type)} #${data.invoiceNo} already exists (${dup.client.name}). Use a different number, or edit that one.`;
    }
    return "";
  }

  function fileName(r) {
    const safe = (s) => s.replace(/[^\w\-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
    return `${r.type === "proforma" ? "Proforma_Invoice" : "Tax_Invoice"}_${safe(r.invoiceNo)}_${safe(r.client.name)}.pdf`;
  }

  function downloadPdf(r) {
    build(r).doc.save(fileName(r));
  }

  $("btn-download").addEventListener("click", () => {
    const data = readForm();
    const err = validate(data);
    $("form-error").textContent = err;
    if (err) return;

    let list = records();
    let rec;
    if (state.editId && list.some((r) => r.id === state.editId)) {
      const i = list.findIndex((r) => r.id === state.editId);
      rec = { ...list[i], ...data, updatedAt: Date.now() };
      list[i] = rec;
    } else {
      rec = { ...data, id: uid(), createdAt: Date.now() };
      if (state.linkProformaId) rec.linkedProformaId = state.linkProformaId;
      list.unshift(rec);
    }
    // Keep the proforma's link to its tax invoice up to date
    if (rec.type === "tax" && rec.linkedProformaId) {
      const p = list.find((x) => x.id === rec.linkedProformaId);
      if (p) { p.convertedToId = rec.id; p.convertedInvoiceNo = rec.invoiceNo; }
    }
    saveRecords(list);
    upsertClient(data.client);
    downloadPdf(rec);

    const wasEdit = !!state.editId;
    const wasConvert = !!state.linkProformaId;
    // Stay on the saved record so further tweaks update it instead of duplicating
    state.editId = rec.id;
    state.linkProformaId = null;
    renderMode();
    refreshAll();
    toast(
      wasEdit ? `${typeName(rec.type)} #${rec.invoiceNo} updated`
        : wasConvert ? `Tax invoice #${rec.invoiceNo} saved — reminder cleared`
        : rec.type === "proforma" ? `Proforma #${rec.invoiceNo} saved — you'll be reminded to raise the tax invoice`
        : `Tax invoice #${rec.invoiceNo} saved`
    );
  });

  $("btn-new").addEventListener("click", () => {
    resetForm();
    $("invoiceNo").focus();
  });

  /* ---------- wiring ---------- */
  const form = $("invoice-form");
  form.addEventListener("input", (e) => {
    if (e.target.id === "clientGstin") {
      const pos = e.target.selectionStart;
      e.target.value = e.target.value.toUpperCase().replace(/\s/g, "");
      e.target.setSelectionRange(pos, pos);
      validateGstin();
    }
    if (e.target.classList.contains("invalid") && e.target.value.trim()) e.target.classList.remove("invalid");
    onChange();
  });
  form.addEventListener("change", (e) => {
    if (e.target.name === "docType") suggestNextNumber();
    if (e.target.id === "flightFrom") {
      $("flightTo").min = e.target.value;
      if ($("flightTo").value && $("flightTo").value < e.target.value) $("flightTo").value = "";
    }
    onChange();
  });
  form.addEventListener("submit", (e) => e.preventDefault());

  $("amount").addEventListener("blur", (e) => {
    const n = parseAmount(e.target.value);
    e.target.value = n ? formatINR(n).replace(/\.00$/, "") : "";
  });

  function refreshAll() {
    renderReminders();
    renderHistory();
    renderClients();
    suggestNextNumber();
  }

  // Re-check reminders when the tab comes back into view (e.g. next day)
  document.addEventListener("visibilitychange", () => { if (!document.hidden) renderReminders(); });

  /* ---------- init ---------- */
  const draft = load(STORE_DRAFT, null);
  if (draft && draft.data) {
    Object.assign(state, draft.state || {});
    writeForm(draft.data);
  } else {
    const old = load("amb.draft.v1", null); // draft from the first version
    writeForm(old ? { ...old, type: "tax" } : { date: todayISO(), gstRate: cfg.defaultGstRate });
  }
  $("flightTo").min = $("flightFrom").value;
  renderMode();
  refreshAll();
  onChange();
  renderPreview();
})();
