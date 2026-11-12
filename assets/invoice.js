/*
 * Builds the Ambadnya Aviation tax invoice as a vector PDF (A4) with jsPDF.
 * Exposes window.AmbInvoice = { compute, build, amountInWords, formatINR }.
 */
(function () {
  "use strict";

  const COLORS = {
    ink: [17, 20, 26],
    gold: [176, 132, 44],
    goldDeep: [140, 101, 30],
    goldLight: [233, 210, 154],
    tint: [251, 247, 238],
    muted: [98, 104, 116],
    line: [228, 221, 205],
    white: [255, 255, 255],
  };

  const PAGE = { w: 210, h: 297, m: 16 };

  /* ---------- money helpers ---------- */

  const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

  function formatINR(n) {
    return Number(n).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen",
    "Eighteen", "Nineteen"];
  const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const twoDigits = (n) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : ""));
  const threeDigits = (n) =>
    n >= 100 ? ONES[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + twoDigits(n % 100) : "") : twoDigits(n);

  function intToWords(n) {
    if (n === 0) return "Zero";
    const parts = [];
    const crore = Math.floor(n / 1e7);
    n %= 1e7;
    const lakh = Math.floor(n / 1e5);
    n %= 1e5;
    const thousand = Math.floor(n / 1000);
    n %= 1000;
    if (crore) parts.push(intToWords(crore) + " Crore");
    if (lakh) parts.push(twoDigits(lakh) + " Lakh");
    if (thousand) parts.push(twoDigits(thousand) + " Thousand");
    if (n) parts.push(threeDigits(n));
    return parts.join(" ");
  }

  function amountInWords(amount) {
    const paiseTotal = Math.round(Number(amount) * 100);
    const rupees = Math.floor(paiseTotal / 100);
    const paise = paiseTotal % 100;
    return "Rupees " + intToWords(rupees) + (paise ? " and " + twoDigits(paise) + " Paise" : "") + " Only";
  }

  /* ---------- tax computation ---------- */

  function compute(data) {
    const cfg = window.AMB_CONFIG;
    const taxable = round2(data.amount || 0);
    const rate = Number(data.gstRate ?? cfg.defaultGstRate) || 0;
    const gst = round2((taxable * rate) / 100);
    const intra = (data.client.stateCode || "") === cfg.company.stateCode;
    const cgst = intra ? round2(gst / 2) : 0;
    const sgst = intra ? round2(gst - cgst) : 0;
    const igst = intra ? 0 : gst;
    const total = round2(taxable + gst);
    return { taxable, rate, gst, intra, cgst, sgst, igst, total };
  }

  /* ---------- date ---------- */

  function formatDate(iso) {
    if (!iso) return "";
    const [y, m, d] = iso.split("-").map(Number);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return String(d).padStart(2, "0") + " " + months[m - 1] + " " + y;
  }

  /* ---------- PDF ---------- */

  function registerFonts(doc) {
    const f = window.AMB_ASSETS.fonts;
    const add = (key, family) => {
      doc.addFileToVFS(family + ".ttf", f[key]);
      doc.addFont(family + ".ttf", family, "normal");
    };
    add("normal", "MontReg");
    add("medium", "MontMed");
    add("semibold", "MontSemi");
    add("bold", "MontBold");
  }

  function build(data) {
    const { jsPDF } = window.jspdf;
    const cfg = window.AMB_CONFIG;
    const t = compute(data);
    const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
    registerFonts(doc);

    doc.setProperties({
      title: "Tax Invoice " + (data.invoiceNo || ""),
      subject: "Tax Invoice — " + cfg.company.name,
      author: cfg.company.name,
      creator: cfg.company.name + " Invoice Generator",
    });

    const L = PAGE.m;
    const R = PAGE.w - PAGE.m;
    const W = R - L;

    const font = (family, size, color) => {
      doc.setFont(family, "normal");
      doc.setFontSize(size);
      doc.setTextColor(...(color || COLORS.ink));
    };
    const fill = (c) => doc.setFillColor(...c);
    const stroke = (c) => doc.setDrawColor(...c);
    const label = (txt, x, y, opts) => {
      font("MontSemi", 6.6, COLORS.gold);
      doc.setCharSpace(0.45);
      doc.text(txt.toUpperCase(), x, y, opts);
      doc.setCharSpace(0);
    };
    const lineH = (size) => size * 0.3528 * 1.45; // pt -> mm, with leading

    /* Decorative edge bands */
    const bands = () => {
      fill(COLORS.ink);
      doc.rect(0, 0, PAGE.w, 3.2, "F");
      fill(COLORS.gold);
      doc.rect(0, 3.2, PAGE.w, 1, "F");
      fill(COLORS.gold);
      doc.rect(0, PAGE.h - 4.2, PAGE.w, 1, "F");
      fill(COLORS.ink);
      doc.rect(0, PAGE.h - 3.2, PAGE.w, 3.2, "F");
    };
    bands();

    const FOOTER_TOP = PAGE.h - 20;
    let y;
    const ensure = (h) => {
      if (y + h > FOOTER_TOP - 4) {
        footer();
        doc.addPage();
        bands();
        y = 16;
      }
    };

    /* ===== Header ===== */
    const logoW = 30;
    const logoH = logoW * (1096 / 1068);
    doc.addImage(window.AMB_ASSETS.logo, "JPEG", L - 2, 9, logoW, logoH);

    font("MontBold", 24, COLORS.ink);
    doc.setCharSpace(0.6);
    doc.text("TAX INVOICE", R, 20, { align: "right" });
    doc.setCharSpace(0);
    label("Original for recipient", R, 25.5, { align: "right" });

    // Meta block (right aligned key/value rows)
    const meta = [
      ["Invoice No.", data.invoiceNo || "—"],
      ["Invoice Date", formatDate(data.date) || "—"],
      ["Place of Supply", data.client.stateCode ? `${window.GST_STATES[data.client.stateCode] || ""} (${data.client.stateCode})` : "—"],
    ];
    let my = 33;
    meta.forEach(([k, v]) => {
      font("MontReg", 8, COLORS.muted);
      doc.text(k, R - 44, my, { align: "right" });
      font("MontSemi", 8.6, COLORS.ink);
      doc.text(String(v), R, my, { align: "right" });
      my += 5;
    });

    y = Math.max(9 + logoH, my) + 3;
    stroke(COLORS.line);
    doc.setLineWidth(0.3);
    doc.line(L, y, R, y);
    y += 6;

    /* ===== Billed By / Billed To ===== */
    const colGap = 6;
    const colW = (W - colGap) / 2;
    const pad = 4.5;
    const innerW = colW - pad * 2 - 1.2;

    const partyLines = (rows) => {
      // rows: [{text, style}] -> wrapped lines with fonts
      const out = [];
      rows.forEach((r) => {
        if (!r.text) return;
        font(r.f, r.s);
        doc.splitTextToSize(String(r.text), innerW).forEach((ln) => out.push({ ...r, text: ln }));
      });
      return out;
    };

    const c = cfg.company;
    const byRows = partyLines([
      { text: c.name, f: "MontBold", s: 11, col: COLORS.ink },
      { text: `GSTIN: ${c.gstin}`, f: "MontMed", s: 8.2, col: COLORS.ink, gapBefore: 1 },
      { text: `PAN: ${c.pan}`, f: "MontReg", s: 8.2, col: COLORS.muted },
      { text: `State: ${c.stateName} (${c.stateCode})`, f: "MontReg", s: 8.2, col: COLORS.muted },
      { text: c.email, f: "MontReg", s: 8.2, col: COLORS.muted },
      { text: c.phone, f: "MontReg", s: 8.2, col: COLORS.muted },
    ]);

    const cl = data.client;
    const toRows = partyLines([
      { text: cl.name || "—", f: "MontBold", s: 11, col: COLORS.ink },
      ...(cl.address || "").split(/\n/).filter(Boolean).map((a) => ({ text: a.trim(), f: "MontReg", s: 8.2, col: COLORS.muted })),
      { text: cl.gstin ? `GSTIN: ${cl.gstin}` : "", f: "MontMed", s: 8.2, col: COLORS.ink, gapBefore: 1 },
      { text: cl.stateCode ? `State: ${window.GST_STATES[cl.stateCode] || ""} (${cl.stateCode})` : "", f: "MontReg", s: 8.2, col: COLORS.muted },
      { text: cl.contact || "", f: "MontReg", s: 8.2, col: COLORS.muted },
    ]);

    const blockH = (rows) => rows.reduce((h, r, i) => h + lineH(r.s) + (r.gapBefore && i ? r.gapBefore : 0), 0);
    const cardH = Math.max(blockH(byRows), blockH(toRows)) + 7 + pad * 2;

    const drawCard = (x, title, rows) => {
      fill(COLORS.tint);
      doc.roundedRect(x, y, colW, cardH, 1.6, 1.6, "F");
      fill(COLORS.gold);
      doc.rect(x, y, 1.2, cardH, "F");
      label(title, x + pad + 1.2, y + pad + 2);
      let ty = y + pad + 2 + 6.5;
      rows.forEach((r, i) => {
        if (r.gapBefore && i) ty += r.gapBefore;
        font(r.f, r.s, r.col);
        doc.text(r.text, x + pad + 1.2, ty);
        ty += lineH(r.s);
      });
    };
    drawCard(L, "Billed by", byRows);
    drawCard(L + colW + colGap, "Billed to", toRows);
    y += cardH + 8;

    /* ===== Service table ===== */
    const hasSac = !!(data.sac && data.sac.trim());
    const colNo = L + 4;
    const colDesc = L + 13;
    const colSac = R - 52;
    const colAmt = R - 4;
    const descW = (hasSac ? colSac - 6 : colAmt - 40) - colDesc;

    ensure(30);
    fill(COLORS.ink);
    doc.roundedRect(L, y, W, 9, 1.4, 1.4, "F");
    font("MontSemi", 7.2, COLORS.goldLight);
    doc.setCharSpace(0.4);
    doc.text("#", colNo, y + 5.9);
    doc.text("DESCRIPTION OF SERVICE", colDesc, y + 5.9);
    if (hasSac) doc.text("SAC", colSac, y + 5.9);
    doc.text("AMOUNT (₹)", colAmt, y + 5.9, { align: "right" });
    doc.setCharSpace(0);
    y += 9;

    const flightLines = (data.flight || "").split(/\n/).map((s) => s.trim()).filter(Boolean);
    const descRows = [];
    flightLines.forEach((ln, i) => {
      const f = i === 0 ? "MontSemi" : "MontReg";
      const s = i === 0 ? 9.6 : 8.6;
      font(f, s);
      doc.splitTextToSize(ln, descW).forEach((w) => descRows.push({ text: w, f, s, col: i === 0 ? COLORS.ink : COLORS.muted }));
    });
    if (!descRows.length) descRows.push({ text: "—", f: "MontReg", s: 9, col: COLORS.muted });

    let ry = y + 7.5;
    const rowStart = y;
    descRows.forEach((r) => {
      ensure(lineH(r.s));
      font(r.f, r.s, r.col);
      doc.text(r.text, colDesc, ry);
      ry += lineH(r.s);
      y = ry;
    });
    font("MontMed", 9.2, COLORS.ink);
    doc.text("1", colNo, rowStart + 7.5);
    if (hasSac) doc.text(data.sac.trim(), colSac, rowStart + 7.5);
    font("MontSemi", 9.6, COLORS.ink);
    doc.text(formatINR(t.taxable), colAmt, rowStart + 7.5, { align: "right" });

    y = Math.max(ry, rowStart + 14) + 2;
    stroke(COLORS.line);
    doc.setLineWidth(0.3);
    doc.line(L, y, R, y);
    y += 6;

    /* ===== Totals + amount in words ===== */
    const totW = 82;
    const totX = R - totW;
    const taxRows = [["Taxable Value", t.taxable]];
    if (t.intra) {
      taxRows.push([`CGST @ ${t.rate / 2}%`, t.cgst]);
      taxRows.push([`SGST @ ${t.rate / 2}%`, t.sgst]);
    } else {
      taxRows.push([`IGST @ ${t.rate}%`, t.igst]);
    }
    ensure(taxRows.length * 6.5 + 18);

    const totTop = y;
    taxRows.forEach(([k, v]) => {
      font("MontReg", 8.8, COLORS.muted);
      doc.text(k, totX + 4, y + 3);
      font("MontMed", 9, COLORS.ink);
      doc.text(formatINR(v), colAmt, y + 3, { align: "right" });
      y += 6.5;
    });
    y += 1;
    fill(COLORS.ink);
    doc.roundedRect(totX, y, totW, 12, 1.6, 1.6, "F");
    font("MontSemi", 7.2, COLORS.goldLight);
    doc.setCharSpace(0.4);
    doc.text("TOTAL AMOUNT", totX + 4, y + 7.6);
    doc.setCharSpace(0);
    font("MontBold", 12.5, COLORS.white);
    doc.text("₹ " + formatINR(t.total), colAmt, y + 7.9, { align: "right" });
    const totBottom = y + 12;

    // Amount in words (left of totals)
    const wordsW = totX - L - 8;
    label("Amount in words", L, totTop + 3);
    font("MontSemi", 9.2, COLORS.ink);
    const wl = doc.splitTextToSize(amountInWords(t.total), wordsW);
    let wy = totTop + 9;
    wl.forEach((ln) => {
      doc.text(ln, L, wy);
      wy += lineH(9.2);
    });
    if (data.notes && data.notes.trim()) {
      wy += 2;
      label("Notes", L, wy);
      wy += 5.5;
      font("MontReg", 8.2, COLORS.muted);
      doc.splitTextToSize(data.notes.trim(), wordsW).forEach((ln) => {
        doc.text(ln, L, wy);
        wy += lineH(8.2);
      });
    }

    y = Math.max(totBottom, wy) + 9;

    /* ===== Bank details + signatory ===== */
    const b = cfg.bank;
    const bankRows = [
      ["Bank", b.bankName],
      ["Account Name", b.accountName],
      ["Account No.", b.accountNumber],
      ["IFSC", b.ifsc],
    ];
    const bankH = 10 + bankRows.length * 5.6 + 3;
    ensure(bankH + 4);
    const bankW = colW + 10;
    stroke(COLORS.line);
    doc.setLineWidth(0.3);
    fill(COLORS.white);
    doc.roundedRect(L, y, bankW, bankH, 1.6, 1.6, "FD");
    label("Pay to", L + pad, y + 6.5);
    let by = y + 12.5;
    bankRows.forEach(([k, v]) => {
      font("MontReg", 8.2, COLORS.muted);
      doc.text(k, L + pad, by);
      font("MontSemi", 8.6, COLORS.ink);
      doc.text(v, L + pad + 27, by);
      by += 5.6;
    });

    // Signatory
    const sx = R;
    font("MontReg", 8.2, COLORS.muted);
    doc.text("For " + c.name, sx, y + 6.5, { align: "right" });
    stroke(COLORS.ink);
    doc.setLineWidth(0.25);
    doc.line(sx - 52, y + bankH - 6, sx, y + bankH - 6);
    font("MontSemi", 8.2, COLORS.ink);
    doc.text("Authorised Signatory", sx, y + bankH - 1.8, { align: "right" });

    y += bankH + 9;

    /* ===== Terms ===== */
    const termLines = [];
    font("MontReg", 7.8);
    cfg.terms.forEach((tx, i) => {
      doc.splitTextToSize(tx, W - 7).forEach((ln, j) => termLines.push({ n: j === 0 ? String(i + 1) + "." : "", ln }));
    });
    ensure(8 + termLines.length * lineH(7.8));
    label("Terms & Conditions", L, y);
    y += 5.5;
    termLines.forEach(({ n, ln }) => {
      ensure(lineH(7.8));
      font("MontMed", 7.8, COLORS.gold);
      if (n) doc.text(n, L, y);
      font("MontReg", 7.8, COLORS.muted);
      doc.text(ln, L + 5, y);
      y += lineH(7.8);
    });

    /* ===== Footer ===== */
    function footer() {
      const fy = PAGE.h - 14;
      stroke(COLORS.line);
      doc.setLineWidth(0.3);
      doc.line(L, fy - 4, R, fy - 4);
      font("MontMed", 8, COLORS.ink);
      doc.text(`${c.email}     |     ${c.phone}`, PAGE.w / 2, fy, { align: "center" });
      font("MontReg", 6.6, COLORS.muted);
      doc.text("This is a computer-generated invoice.", PAGE.w / 2, fy + 4, { align: "center" });
    }
    footer();

    return { doc, totals: t };
  }

  window.AmbInvoice = { compute, build, amountInWords, formatINR, formatDate };
})();
