const { FIELD_LABELS, MANUAL_CHECK_FIELDS } = require("./fieldMap");

function normalizeValue(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  return normalizeValue(text)
    .split(/(\s+|[.,;:/()\-])/)
    .filter((part) => part !== "");
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function simpleDiffHtml(actual, expected) {
  const left = tokenize(actual);
  const right = tokenize(expected);
  const max = Math.max(left.length, right.length);
  let html = "";

  for (let i = 0; i < max; i += 1) {
    const a = left[i];
    const b = right[i];
    if (a === b) {
      if (a) html += escapeHtml(a);
      continue;
    }
    if (a) html += `<span class="diff-red">-${escapeHtml(a)}</span>`;
    if (b) html += `<span class="diff-red">+${escapeHtml(b)}</span>`;
  }

  return html || "<span class=\"muted\">No text</span>";
}

function normalizeId(value) {
  return normalizeValue(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getApplicationKey(item) {
  return normalizeId(item?.applicationNumber || item?.registrationNumber || "");
}

function compareTrademarkLists(pdfItems, excelItems) {
  const excelByAppNo = new Map();
  const unmatchedExcel = [];
  excelItems.forEach((item) => {
    const key = getApplicationKey(item);
    if (key && !excelByAppNo.has(key)) {
      excelByAppNo.set(key, item);
      return;
    }
    unmatchedExcel.push(item);
  });

  const comparisons = [];
  const usedExcelIds = new Set();

  for (let i = 0; i < pdfItems.length; i += 1) {
    const pdf = pdfItems[i] || {};
    const appKey = getApplicationKey(pdf);
    let excel = {};
    if (appKey && excelByAppNo.has(appKey)) {
      excel = excelByAppNo.get(appKey);
      usedExcelIds.add(excel.id);
    } else {
      const nextExcel = unmatchedExcel.find((item) => !usedExcelIds.has(item.id));
      if (nextExcel) {
        excel = nextExcel;
        usedExcelIds.add(nextExcel.id);
      }
    }
    const fieldResults = Object.entries(FIELD_LABELS).map(([key, label]) => {
      const pdfValue = normalizeValue(pdf[key]);
      const excelValue = normalizeValue(excel[key]);
      const isManual = MANUAL_CHECK_FIELDS.includes(key);
      const isMatch = isManual || pdfValue === excelValue;

      return {
        key,
        label,
        pdfValue,
        excelValue,
        isManual,
        isMatch,
        needsManualCheck: !!pdfValue && !excelValue,
        diffHtml: !isMatch ? simpleDiffHtml(pdfValue, excelValue) : "",
      };
    });

    comparisons.push({
      pairIndex: comparisons.length + 1,
      pdfId: pdf.id || null,
      excelId: excel.id || null,
      applicationNumber: pdf.applicationNumber || excel.applicationNumber || pdf.registrationNumber || excel.registrationNumber || "",
      pdfItem: pdf,
      excelItem: excel,
      allAutoMatched: fieldResults.filter((f) => !f.isManual).every((f) => f.isMatch),
      fields: fieldResults,
    });
  }

  excelItems.forEach((excel) => {
    if (usedExcelIds.has(excel.id)) return;
    const fieldResults = Object.entries(FIELD_LABELS).map(([key, label]) => ({
      key,
      label,
      pdfValue: "",
      excelValue: normalizeValue(excel[key]),
      isManual: MANUAL_CHECK_FIELDS.includes(key),
      isMatch: false,
      needsManualCheck: false,
      diffHtml: simpleDiffHtml("", normalizeValue(excel[key])),
    }));

    comparisons.push({
      pairIndex: comparisons.length + 1,
      pdfId: null,
      excelId: excel.id || null,
      applicationNumber: excel.applicationNumber || excel.registrationNumber || "",
      pdfItem: {},
      excelItem: excel,
      allAutoMatched: false,
      fields: fieldResults,
    });
  });

  return comparisons;
}

module.exports = { compareTrademarkLists };
