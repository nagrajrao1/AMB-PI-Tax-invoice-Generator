/* Dashboard logic: form state, live preview, PDF download, saved clients & history. */
(function () {
  "use strict";

  const cfg = window.AMB_CONFIG;
  const { build, compute, amountInWords, formatINR } = window.AmbInvoice;
  const $ = (id) => document.getElementById(id);

  const STORE_CLIENTS = "amb.clients.v1";
  const STORE_HISTORY = "amb.history.v1";
  const STORE_DRAFT = "amb.draft.v1";

  /* ---------- storage (fails soft in private mode) ---------- */
  const load = (k, d) => {
    try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; }
  };
  const save = (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ }
  };

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

  const stateSel = $("clientState");
  stateSel.innerHTML =
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
  const parseAmount = (s) => {
    const n = parseFloat(String(s || "").replace(/[^0-9.]/g, ""));
    return isFinite(n) ? n : 0;
  };
  const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

  const fields = ["invoiceNo", "date", "clientName", "clientAddress", "clientGstin", "clientState",
    "clientContact", "flight", "sac", "amount", "gstRate", "notes"];

  function readForm() {
    const v = (id) => $(id).value;
    return {
      invoiceNo: v("invoiceNo").trim(),
      date: v("date"),
      client: {
        name: v("clientName").trim(),
        address: v("clientAddress").trim(),
        gstin: v("clientGstin").trim().toUpperCase(),
        stateCode: v("clientState"),
        contact: v("clientContact").trim(),
      },
      flight: v("flight"),
      sac: v("sac"),
      amount: parseAmount(v("amount")),
      gstRate: v("gstRate") === "" ? cfg.defaultGstRate : Number(v("gstRate")),
      notes: v("notes"),
    };
  }

  function writeForm(d) {
    $("invoiceNo").value = d.invoiceNo || "";
    $("date").value = d.date || todayISO();
    $("clientName").value = d.client?.name || "";
    $("clientAddress").value = d.client?.address || "";
    $("clientGstin").value = d.client?.gstin || "";
    $("clientState").value = d.client?.stateCode || "";
    $("clientContact").value = d.client?.contact || "";
    $("flight").value = d.flight || "";
    $("sac").value = d.sac || "";
    $("amount").value = d.amount ? formatINR(d.amount).replace(/\.00$/, "") : "";
    $("gstRate").value = d.gstRate ?? cfg.defaultGstRate;
    $("notes").value = d.notes || "";
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
    const data = readForm();
    try {
      const { doc } = build(data);
      const url = doc.output("bloburl");
      $("preview").src = url + "#toolbar=0&navpanes=0&view=FitH";
      $("open-preview").href = url;
      if (previewUrl) setTimeout((u) => URL.revokeObjectURL(u), 1500, previewUrl);
      previewUrl = url;
    } catch (e) {
      console.error(e);
    }
  }

  function onChange() {
    const data = readForm();
    renderSummary(data);
    save(STORE_DRAFT, data);
    clearTimeout(previewTimer);
    previewTimer = setTimeout(renderPreview, 450);
  }

  /* ---------- saved clients ---------- */
  function refreshClients() {
    const clients = load(STORE_CLIENTS, []);
    const sel = $("savedClients");
    sel.innerHTML =
      `<option value="">${clients.length ? "Saved clients…" : "No saved clients yet"}</option>` +
      clients.map((c, i) => `<option value="${i}">${escapeHtml(c.name)}</option>`).join("");
  }

  function rememberClient(client) {
    if (!client.name) return;
    const list = load(STORE_CLIENTS, []).filter(
      (c) => c.name.toLowerCase() !== client.name.toLowerCase()
    );
    list.unshift(client);
    save(STORE_CLIENTS, list.slice(0, 50));
    refreshClients();
  }

  $("savedClients").addEventListener("change", (e) => {
    const c = load(STORE_CLIENTS, [])[e.target.value];
    if (c) {
      $("clientName").value = c.name || "";
      $("clientAddress").value = c.address || "";
      $("clientGstin").value = c.gstin || "";
      $("clientState").value = c.stateCode || "";
      $("clientContact").value = c.contact || "";
      validateGstin();
      onChange();
    }
    e.target.value = "";
  });

  /* ---------- history ---------- */
  function refreshHistory() {
    const list = load(STORE_HISTORY, []);
    const ul = $("history");
    if (!list.length) {
      ul.innerHTML = '<li class="empty">Invoices you download will appear here.</li>';
      return;
    }
    ul.innerHTML = list
      .map(
        (h, i) => `<li data-i="${i}" title="Load this invoice into the form">
          <div style="min-width:0"><div class="h-no">#${escapeHtml(h.invoiceNo)}</div>
          <div class="h-client">${escapeHtml(h.client.name)} · ${escapeHtml(h.date || "")}</div></div>
          <div class="h-amt">₹ ${formatINR(compute(h).total)}</div></li>`
      )
      .join("");
  }
  $("history").addEventListener("click", (e) => {
    const li = e.target.closest("li[data-i]");
    if (!li) return;
    const h = load(STORE_HISTORY, [])[li.dataset.i];
    if (h) {
      writeForm(h);
      onChange();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function suggestNextNumber() {
    const last = load(STORE_HISTORY, [])[0];
    const hint = $("invoiceNo-hint");
    if (!last) { hint.textContent = ""; return; }
    const m = String(last.invoiceNo).match(/^(.*?)(\d+)(\D*)$/);
    if (m) {
      const next = m[1] + String(Number(m[2]) + 1).padStart(m[2].length, "0") + m[3];
      hint.innerHTML = `Last issued: #${escapeHtml(last.invoiceNo)} · <a href="#" id="use-next">use ${escapeHtml(next)}</a>`;
      $("use-next").addEventListener("click", (e) => {
        e.preventDefault();
        $("invoiceNo").value = next;
        onChange();
      });
    } else {
      hint.textContent = "Last issued: #" + last.invoiceNo;
    }
  }

  /* ---------- download ---------- */
  function validate(data) {
    const missing = [];
    const mark = (id, bad) => $(id).classList.toggle("invalid", bad);
    mark("invoiceNo", !data.invoiceNo); if (!data.invoiceNo) missing.push("invoice number");
    mark("clientName", !data.client.name); if (!data.client.name) missing.push("client name");
    mark("flight", !data.flight.trim()); if (!data.flight.trim()) missing.push("flight details");
    mark("amount", !(data.amount > 0)); if (!(data.amount > 0)) missing.push("taxable amount");
    if (!data.date) missing.push("date");
    if (missing.length) return "Please fill in: " + missing.join(", ") + ".";
    if (data.client.gstin && !GSTIN_RE.test(data.client.gstin)) return "Client GSTIN looks invalid — please check it.";
    return "";
  }

  $("btn-download").addEventListener("click", () => {
    const data = readForm();
    const err = validate(data);
    $("form-error").textContent = err;
    if (err) return;

    const { doc } = build(data);
    const safe = (s) => s.replace(/[^\w\-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
    doc.save(`Tax_Invoice_${safe(data.invoiceNo)}_${safe(data.client.name)}.pdf`);

    rememberClient(data.client);
    const hist = load(STORE_HISTORY, []).filter((h) => h.invoiceNo !== data.invoiceNo);
    hist.unshift(data);
    save(STORE_HISTORY, hist.slice(0, 30));
    refreshHistory();
    suggestNextNumber();
  });

  $("btn-new").addEventListener("click", () => {
    writeForm({ date: todayISO(), gstRate: cfg.defaultGstRate });
    $("form-error").textContent = "";
    document.querySelectorAll(".invalid").forEach((el) => el.classList.remove("invalid"));
    suggestNextNumber();
    onChange();
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
  form.addEventListener("change", onChange);
  form.addEventListener("submit", (e) => e.preventDefault());

  // Pretty-print the amount with Indian grouping when leaving the field
  $("amount").addEventListener("blur", (e) => {
    const n = parseAmount(e.target.value);
    e.target.value = n ? formatINR(n).replace(/\.00$/, "") : "";
  });

  /* ---------- init ---------- */
  const draft = load(STORE_DRAFT, null);
  writeForm(draft || { date: todayISO(), gstRate: cfg.defaultGstRate });
  refreshClients();
  refreshHistory();
  suggestNextNumber();
  onChange();
  renderPreview();
})();
