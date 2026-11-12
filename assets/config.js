/*
 * Fixed company details printed on every invoice.
 * Edit this file if any of these ever change — nothing else needs touching.
 */
window.AMB_CONFIG = {
  company: {
    name: "Ambadnya Aviation",
    legalName: "Ambadnya Enterprises",
    pan: "AXAPR4127N",
    gstin: "27AXAPR4127N2Z3",
    stateCode: "27", // Maharashtra — decides CGST+SGST vs IGST
    stateName: "Maharashtra",
    email: "info@ambadnyaaviation.com",
    phone: "+91 98675 85054",
  },

  bank: {
    bankName: "State Bank of India",
    accountName: "Ambadnya Enterprises",
    accountNumber: "00000044744948962",
    ifsc: "SBIN0000489",
  },

  defaultGstRate: 18,

  terms: [
    "Terms remain the same, subject to availability of parking.",
    'Cheque / DD to be issued in favour of "Ambadnya Enterprises".',
    "All remittances to be made to the bank account mentioned herein.",
    "All claims / disputes should be communicated within 7 working days from the date of receipt of the invoice.",
  ],
};

/* GST state codes (first two digits of a GSTIN). */
window.GST_STATES = {
  "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
  "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
  "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur",
  "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal",
  "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
  "26": "Dadra & Nagar Haveli and Daman & Diu", "27": "Maharashtra", "29": "Karnataka",
  "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry",
  "35": "Andaman & Nicobar Islands", "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh",
  "97": "Other Territory",
};
