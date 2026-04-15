function pad2(value) {
  return String(value).padStart(2, "0");
}

function normalizeDateString(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/(\d{1,2})(st|nd|rd|th)\b/g, "$1")
    .replace(/\bday of\b/g, " ")
    .replace(/[,]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\bjanaury\b/g, "january")
    .replace(/\bjanurary\b/g, "january")
    .replace(/\bfebuary\b/g, "february")
    .replace(/\bsept\b/g, "september")
    .trim();
}

function monthNumber(monthText) {
  const m = String(monthText || "").toLowerCase().slice(0, 3);
  const map = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  };
  return map[m] || 0;
}

function fromExcelSerial(serial) {
  if (!Number.isFinite(serial)) return null;
  // Excel serial date origin (Windows): 1899-12-30
  const base = new Date(1899, 11, 30);
  base.setDate(base.getDate() + Math.floor(serial));
  return base;
}

function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "number") {
    return fromExcelSerial(value);
  }

  const text = normalizeDateString(value);
  if (!text) return null;

  const direct = new Date(text);
  if (!Number.isNaN(direct.getTime())) {
    return direct;
  }

  const slashMatch = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  if (slashMatch) {
    const day = Number(slashMatch[1]);
    const month = Number(slashMatch[2]);
    let year = Number(slashMatch[3]);
    if (year < 100) year += 2000;
    return new Date(year, month - 1, day);
  }

  const dmyWord = text.match(/\b(\d{1,2})\s+([a-z]+)\s+(\d{4})\b/);
  if (dmyWord) {
    const day = Number(dmyWord[1]);
    const month = monthNumber(dmyWord[2]);
    const year = Number(dmyWord[3]);
    if (month) return new Date(year, month - 1, day);
  }

  const myWord = text.match(/\b([a-z]+)\s+(\d{1,2})\s+(\d{4})\b/);
  if (myWord) {
    const month = monthNumber(myWord[1]);
    const day = Number(myWord[2]);
    const year = Number(myWord[3]);
    if (month) return new Date(year, month - 1, day);
  }

  return null;
}

function formatDateDDMMYYYY(value) {
  const parsed = parseDate(value);
  if (!parsed) return String(value || "").trim();
  return `${pad2(parsed.getDate())}/${pad2(parsed.getMonth() + 1)}/${parsed.getFullYear()}`;
}

module.exports = { formatDateDDMMYYYY };
