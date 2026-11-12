# Ambadnya Aviation — Tax Invoice Generator

A dashboard for creating Ambadnya Aviation tax invoices as PDFs. It runs entirely in the browser: there's no server, no install and no internet needed. Open `index.html` and it works.

## How to use

1. Open `index.html` in Chrome, Edge or Safari (double-clicking it is enough).
2. Fill in the four steps:
   - **Invoice**: your invoice number and the date.
   - **Client details**: company name, address and GSTIN. The client's state is picked automatically from the first two digits of the GSTIN.
   - **Flight details**: aircraft, sector, date and anything else. The first line prints in bold as the headline.
   - **Total cost**: the amount *before* GST. 18% GST is added automatically.
3. Check the live preview, then click **Download PDF**.

### How GST is applied
| Client's state | Tax shown on the invoice |
|---|---|
| Maharashtra (GSTIN starts with `27`) | CGST 9% + SGST 9% |
| Any other state | IGST 18% |

The total is the same either way. The rate defaults to 18% and can be changed for a single invoice.

### Convenience features
- **Saved clients**: every client you invoice is remembered. Pick one from *Saved clients…* to fill in their details.
- **Recent invoices**: click one to load it back into the form, for example to re-issue it or copy it.
- **Next number**: the hint under *Invoice number* suggests the number after your last one.
- Your work in progress is kept if you close the tab.

All of this is stored only in this browser on this computer. Clearing the browser's site data erases it. The PDFs you download are the permanent record.

## Changing the fixed details

The company name, GSTIN, PAN, email, phone, bank details and terms & conditions all live in **`assets/config.js`**. Edit that file and reload the page.

## Files

| Path | Purpose |
|---|---|
| `index.html` | The dashboard |
| `assets/config.js` | Fixed company / bank details and terms |
| `assets/invoice.js` | PDF layout (A4, vector, Montserrat font) |
| `assets/app.js` | Dashboard behaviour |
| `assets/styles.css` | Dashboard styling |
| `assets/embedded.js` | Logo and fonts embedded so it works offline |
| `assets/logo.jpg`, `assets/logo-mark.png` | Logo source images |
| `vendor/jspdf.umd.min.js` | [jsPDF](https://github.com/parallax/jsPDF) 4.2.1 (MIT) |

The Montserrat font is licensed under the SIL Open Font License.
