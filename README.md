# Ambadnya Aviation — Tax Invoice Generator

A dashboard for creating Ambadnya Aviation tax invoices as PDFs. It runs entirely in the browser: there's no server, no install and no internet needed. Open `index.html` and it works.

## How to use

**Quickest:** download `Ambadnya-Invoice-Generator.html` (a single self-contained file) and double-click it.

Or, with the full folder:

1. Open `index.html` in Chrome, Edge or Safari (double-clicking it is enough).
2. Fill in the four steps:
   - **Document**: choose **Tax Invoice** or **Proforma Invoice**, then enter the number and date.
   - **Client details**: pick a saved client, or type a new one and click **Save client**. Typing a saved client's name fills in the rest. The state is picked from the GSTIN.
   - **Flight details**: choose the flight date(s) from the calendar (from / to). The dates print in the *Billed To* box. Then describe the service; the first line prints in bold.
   - **Total cost**: the amount *before* GST. 18% GST is added automatically.
3. Check the live preview, then click **Save & Download PDF**.

### Proforma → tax invoice reminders
Every proforma you save stays on a **reminder list** at the top of the dashboard, with a red bell in the header, until a tax invoice is raised for it.
- **Create tax invoice** copies the proforma into a new tax invoice. You enter the tax invoice number and save, and the reminder clears.
- Reminders are marked **overdue** once the flight's last date has passed.
- **Dismiss** stops the reminder, for example if the trip was cancelled.

### Saved invoices
Every saved invoice is listed on the right, with filters for All / Tax / Proforma and a search box.
- **Edit** loads the invoice into the form. Saving then updates it instead of creating a new one.
- **PDF** downloads it again.
- **→ Tax** converts a proforma.
- **✕** deletes it after you confirm. If you delete a tax invoice that was made from a proforma, that proforma's reminder comes back.

Saving is blocked if the same invoice number already exists for that document type.

### How GST is applied
| Client's state | Tax shown on the invoice |
|---|---|
| Maharashtra (GSTIN starts with `27`) | CGST 9% + SGST 9% |
| Any other state | IGST 18% |

### Where your data lives
Saved invoices, clients and reminders are stored only in this browser on this computer. Clearing the browser's site data, or opening the file in a different browser, starts empty. The PDFs you download are the permanent record.

## Changing the fixed details

The company name, GSTIN, PAN, email, phone, website, bank details and terms & conditions all live in **`assets/config.js`**. Edit that file and reload the page. Then run `python3 build.py` to refresh the single-file version.

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
| `build.py` | Rebuilds `Ambadnya-Invoice-Generator.html` after changes |
| `vendor/jspdf.umd.min.js` | [jsPDF](https://github.com/parallax/jsPDF) 4.2.1 (MIT) |

The Montserrat font is licensed under the SIL Open Font License.
