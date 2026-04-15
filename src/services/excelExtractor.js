const XLSX = require("xlsx");
const { EXCEL_KEY_MAP, normalizeKey } = require("./fieldMap");
const { formatDateDDMMYYYY } = require("./dateUtils");

function normalizeCell(value) {
  if (value === undefined || value === null) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function normalizeFieldValue(fieldKey, value) {
  if (fieldKey === "applicationDate" || fieldKey === "registrationDate") {
    return formatDateDDMMYYYY(value);
  }
  if (fieldKey === "specification") {
    let text = normalizeCell(value);
    // Remove leading numeric reference like "123: " if present.
    text = text.replace(/^\s*\d+\s*:\s*/, "");
    if (text && !/[.!?]\s*$/.test(text)) {
      text = `${text}.`;
    }
    return text;
  }
  return normalizeCell(value);
}

function mapHeaderKey(headerValue) {
  const normalized = normalizeKey(headerValue);
  if (EXCEL_KEY_MAP[normalized]) return EXCEL_KEY_MAP[normalized];
  if (normalized.startsWith("applicationno")) return "applicationNumber";
  if (normalized.startsWith("registrationno")) return "registrationNumber";
  if (normalized.startsWith("trademark")) return "trademark";
  if (normalized.startsWith("classes") || normalized === "class") return "classes";
  if (normalized.startsWith("goodsservices") || normalized.startsWith("goodsorservices")) return "specification";
  if (normalized.startsWith("applicantaddress")) return "applicantAddress";
  if (normalized.startsWith("applicant")) return "applicant";
  if (normalized.startsWith("applicationdate")) return "applicationDate";
  if (normalized.startsWith("registrationdate")) return "registrationDate";
  return null;
}

function buildRowsFromBestHeader(sheet) {
  function deriveRangeFromCells() {
    const cellKeys = Object.keys(sheet).filter((key) => !key.startsWith("!"));
    if (cellKeys.length === 0) return null;

    let minR = Number.MAX_SAFE_INTEGER;
    let minC = Number.MAX_SAFE_INTEGER;
    let maxR = -1;
    let maxC = -1;

    for (const key of cellKeys) {
      const decoded = XLSX.utils.decode_cell(key);
      if (decoded.r < minR) minR = decoded.r;
      if (decoded.c < minC) minC = decoded.c;
      if (decoded.r > maxR) maxR = decoded.r;
      if (decoded.c > maxC) maxC = decoded.c;
    }

    return { s: { r: minR, c: minC }, e: { r: maxR, c: maxC } };
  }

  const refRange = sheet["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]) : null;
  const cellRange = deriveRangeFromCells();
  const range = cellRange || refRange;
  if (!range) return { rows: [], meta: { headerRow: -1, headerScore: 0, rawRowsScanned: 0 } };

  function getCellValue(r, c) {
    const address = XLSX.utils.encode_cell({ r, c });
    const cell = sheet[address];
    if (!cell || cell.v === undefined || cell.v === null) return "";
    return normalizeCell(cell.w !== undefined ? cell.w : cell.v);
  }

  const scanEndRow = Math.min(range.e.r, range.s.r + 200);
  let bestHeaderRow = -1;
  let bestColumns = new Map();
  let bestScore = 0;

  for (let r = range.s.r; r <= scanEndRow; r += 1) {
    const columns = new Map();
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const mapped = mapHeaderKey(getCellValue(r, c));
      if (mapped && !columns.has(c)) {
        columns.set(c, mapped);
      }
    }
    const score = columns.size;
    if (score > bestScore) {
      bestScore = score;
      bestHeaderRow = r;
      bestColumns = columns;
    }
  }

  if (bestHeaderRow === -1 || bestScore < 2) {
    const fallbackRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    return {
      rows: fallbackRows,
      meta: {
        headerRow: bestHeaderRow,
        headerScore: bestScore,
        rawRowsScanned: fallbackRows.length,
        rangeSource: cellRange ? "cell-addresses" : "sheet-ref",
        mode: "sheet_to_json_fallback",
      },
    };
  }

  const rows = [];
  let dataRowCount = 0;
  let skippedHeaderLikeRows = 0;
  for (let r = bestHeaderRow + 1; r <= range.e.r; r += 1) {
    dataRowCount += 1;
    let headerLikeScore = 0;
    const out = {};
    let hasValue = false;

    for (const [c, fieldKey] of bestColumns.entries()) {
      const raw = getCellValue(r, c);
      if (mapHeaderKey(raw)) {
        headerLikeScore += 1;
      }
      if (raw) {
        out[fieldKey] = raw;
        hasValue = true;
      }
    }

    if (!hasValue) continue;
    if (headerLikeScore >= 2) {
      skippedHeaderLikeRows += 1;
      continue;
    }
    rows.push(out);
  }

  return {
    rows,
    meta: {
      headerRow: bestHeaderRow,
      headerScore: bestScore,
      rawRowsScanned: dataRowCount,
      skippedHeaderLikeRows,
      rangeSource: cellRange ? "cell-addresses" : "sheet-ref",
      mode: "coordinate_parser",
    },
  };
}

function parseWorkbook(workbook) {
  const normalizedRows = [];
  const debug = { sheets: [] };
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const { rows, meta } = buildRowsFromBestHeader(sheet);
    debug.sheets.push({
      sheetName,
      ...meta,
      parsedRows: rows.length,
    });
    normalizedRows.push(...rows);
  }

  const items = normalizedRows
    .map((row, index) => {
      const normalized = {
        id: `excel-${index + 1}`,
        source: "excel",
        removed: false,
      };

      Object.entries(row).forEach(([key, value]) => {
        const mappedKey = mapHeaderKey(key);
        if (!mappedKey) return;
        normalized[mappedKey] = normalizeFieldValue(mappedKey, value);
      });

      if (!normalized.applicationNumber && normalized.registrationNumber) {
        normalized.applicationNumber = normalized.registrationNumber;
      }
      if (!normalized.registrationNumber && normalized.applicationNumber) {
        normalized.registrationNumber = normalized.applicationNumber;
      }

      return normalized;
    })
    .filter((row) => {
      return Object.entries(row).some(([key, value]) => {
        if (key === "id" || key === "source" || key === "removed") return false;
        return String(value || "").trim() !== "";
      });
    });

  debug.totalRowsBeforeFilter = normalizedRows.length;
  debug.totalRowsAfterFilter = items.length;
  return { items, debug };
}

function extractTrademarksFromExcel(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  return parseWorkbook(workbook);
}

function extractTrademarksFromExcelBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  return parseWorkbook(workbook);
}

module.exports = { extractTrademarksFromExcel, extractTrademarksFromExcelBuffer };
