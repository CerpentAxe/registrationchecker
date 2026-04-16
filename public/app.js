const FIELD_LABELS = {
  country: "Country",
  applicationNumber: "Application No.",
  registrationNumber: "Registration No.",
  trademark: "Trade Mark",
  classes: "Classes",
  specification: "Goods / Services",
  applicant: "Applicant",
  applicantAddress: "Applicant Address",
  endorsement: "Endorsement",
  association: "Associated with",
  disclaimer: "Disclaimer",
  admission: "Admission",
  applicationDate: "Application Date",
  registrationDate: "Registration Date",
};

const MANUAL_FIELDS = [
  "applicantAddress",
  "endorsement",
  "association",
  "disclaimer",
  "admission",
];

const API_BASE =
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : "";
const REQUEST_TIMEOUT_MS = 60000;

const state = {
  pdfItems: [],
  excelItems: [],
};

const uploadForm = document.querySelector("#upload-form");
const extractPdfBtn = document.querySelector("#extract-pdf-btn");
const extractExcelBtn = document.querySelector("#extract-excel-btn");
const compareBtn = document.querySelector("#compare-btn");
const pairedList = document.querySelector("#paired-list");
const comparisonResults = document.querySelector("#comparison-results");
const pdfFileInput = document.querySelector("#pdf-file");
const excelFileInput = document.querySelector("#excel-file");
const pdfDropzone = document.querySelector("#pdf-dropzone");
const excelDropzone = document.querySelector("#excel-dropzone");

function setFileToInput(input, file) {
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  input.files = dataTransfer.files;
}

function attachDropzone(dropzone, input, acceptedExtensions) {
  ["dragenter", "dragover"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.add("drag-over");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.remove("drag-over");
    });
  });

  dropzone.addEventListener("drop", (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    const extension = file.name.includes(".")
      ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase()
      : "";
    if (!acceptedExtensions.includes(extension)) {
      comparisonResults.innerHTML = `<p class='diff-red'>Invalid file type for ${input.id}.</p>`;
      return;
    }
    setFileToInput(input, file);
    dropzone.textContent = `Selected: ${file.name}`;
    updateStageButtons();
  });
}

function buildCard(item, side) {
  const card = document.createElement("article");
  card.className = `card${item.removed ? " removed" : ""}`;
  card.dataset.id = item.id;
  card.dataset.side = side;

  const fields = Object.entries(FIELD_LABELS)
    .map(([key, label]) => {
      const value = item[key] || "";
      const manualCheck =
        side === "excel" && !value
          ? `<label class="inline-manual"><input type="checkbox" /> Manually checked</label>`
          : "";
      return `<p><strong>${label}:</strong> ${value || "<span class='muted'>-</span>"} ${manualCheck}</p>`;
    })
    .join("");

  const title = item.applicationNumber || item.registrationNumber || item.id;

  card.innerHTML = `
    <div class="card-header">
      <h3>${title}</h3>
      <button type="button" data-action="remove">${item.removed ? "Restore" : "Remove"}</button>
    </div>
    <div class="grid">${fields}</div>
  `;
  return card;
}

function buildPlaceholderCard(title) {
  const card = document.createElement("article");
  card.className = "card placeholder";
  card.innerHTML = `<div class="card-header"><h3>${title}</h3></div><p class="muted">No matching trade mark in this column.</p>`;
  return card;
}

function normalizeAppNo(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getPairedRows() {
  const pdfItems = [...state.pdfItems];
  const excelItems = [...state.excelItems];
  const excelByKey = new Map();
  const unmatchedExcel = [];

  excelItems.forEach((item) => {
    const key = normalizeAppNo(item.applicationNumber || item.registrationNumber);
    if (key && !excelByKey.has(key)) {
      excelByKey.set(key, item);
    } else {
      unmatchedExcel.push(item);
    }
  });

  const usedExcel = new Set();
  const rows = [];
  pdfItems.forEach((pdf) => {
    const key = normalizeAppNo(pdf.applicationNumber || pdf.registrationNumber);
    let excel = null;
    if (key && excelByKey.has(key)) {
      excel = excelByKey.get(key);
      usedExcel.add(excel.id);
    } else {
      const next = unmatchedExcel.find((item) => !usedExcel.has(item.id));
      if (next) {
        excel = next;
        usedExcel.add(next.id);
      }
    }
    const pdfKey = normalizeAppNo(pdf.applicationNumber || pdf.registrationNumber);
    const excelKey = normalizeAppNo(excel?.applicationNumber || excel?.registrationNumber);
    rows.push({ pdf, excel, isMatchByApplication: !!pdf && !!excel && !!pdfKey && pdfKey === excelKey });
  });

  excelItems.forEach((excel) => {
    if (!usedExcel.has(excel.id)) rows.push({ pdf: null, excel, isMatchByApplication: false });
  });

  return rows;
}

function renderPairedLists(comparisonByAppNo = new Map()) {
  pairedList.innerHTML = "";
  const rows = getPairedRows();

  rows.forEach((row) => {
    const rowEl = document.createElement("div");
    rowEl.className = "paired-row-box";

    const left = document.createElement("div");
    left.className = "paired-cell";
    left.appendChild(row.pdf ? buildCard(row.pdf, "pdf") : buildPlaceholderCard("No PDF match"));

    const right = document.createElement("div");
    right.className = "paired-cell";
    right.appendChild(row.excel ? buildCard(row.excel, "excel") : buildPlaceholderCard("No Excel match"));

    rowEl.appendChild(left);
    rowEl.appendChild(right);

    const appNo = row.pdf?.applicationNumber || row.excel?.applicationNumber || row.pdf?.registrationNumber || row.excel?.registrationNumber || "";
    const appKey = normalizeAppNo(appNo);
    const comparison = comparisonByAppNo.get(appKey);
    const comparisonPanel = document.createElement("div");
    comparisonPanel.className = "row-comparison";

    if (comparison) {
      const fieldsHtml = comparison.fields
        .filter((field) => !field.isMatch)
        .map((field) => {
          const manualCheckbox = field.needsManualCheck
            ? `<label class="inline-manual"><input type="checkbox" /> manually checked</label>`
            : "";
          return `
            <div class="field-row bad">
              <strong>${field.label}</strong>
              <div class="field-values">
                <div><small>PDF</small><div>${field.pdfValue || "<span class='muted'>-</span>"}</div></div>
                <div><small>Excel</small><div>${field.excelValue || "<span class='muted'>-</span>"}</div>${manualCheckbox}</div>
              </div>
              ${field.diffHtml ? `<div><small>Difference</small><div>${field.diffHtml}</div></div>` : ""}
            </div>
          `;
        })
        .join("");

      comparisonPanel.innerHTML = fieldsHtml
        ? `<h4 class="result-title">Comparison</h4>${fieldsHtml}`
        : `<p class="muted">Comparison: all compared fields match.</p>`;
      rowEl.appendChild(comparisonPanel);
    }

    pairedList.appendChild(rowEl);
  });
}

function attachRemoveHandler(listEl) {
  listEl.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-action='remove']");
    if (!btn) return;

    const card = btn.closest(".card");
    const side = card?.dataset?.side;
    if (!side) return;
    const items = side === "pdf" ? state.pdfItems : state.excelItems;
    const item = items.find((entry) => entry.id === card.dataset.id);
    if (!item) return;
    item.removed = !item.removed;
    renderPairedLists();
  });
}

async function uploadSingle(endpoint, fieldName, file) {
  const formData = new FormData();
  formData.append(fieldName, file);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err?.name === "AbortError") {
      throw new Error(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s: ${endpoint}`);
    }
    // Some environments fail multipart fetch intermittently; fall back to XHR.
    return uploadSingleWithXhr(endpoint, fieldName, file);
  }
  clearTimeout(timeout);
  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    let message = `Request failed: ${endpoint} (HTTP ${response.status})`;
    try {
      const payload = JSON.parse(raw || "{}");
      if (payload.error) message = `${payload.error} (HTTP ${response.status})`;
    } catch (_err) {
      if (raw) message = `${message} - ${raw.slice(0, 180)}`;
    }
    throw new Error(message);
  }
  return response.json();
}

function uploadSingleWithXhr(endpoint, fieldName, file) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append(fieldName, file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}${endpoint}`);
    xhr.onreadystatechange = () => {
      if (xhr.readyState !== XMLHttpRequest.DONE) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText || "{}"));
        } catch (_err) {
          reject(new Error(`Invalid JSON response from ${endpoint}`));
        }
        return;
      }
      let message = `Request failed: ${endpoint}`;
      try {
        const parsed = JSON.parse(xhr.responseText || "{}");
        if (parsed.error) message = parsed.error;
      } catch (_err) {}
      reject(
        new Error(
          `${message} (HTTP ${xhr.status})${xhr.responseText ? ` - ${xhr.responseText.slice(0, 180)}` : ""}`
        )
      );
    };
    xhr.onerror = () => {
      reject(new Error(`Could not reach backend for ${endpoint}. Network transport failed.`));
    };
    xhr.send(formData);
  });
}

function uploadExcelAsJson(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const result = String(reader.result || "");
        const base64 = result.includes(",") ? result.split(",")[1] : result;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        const response = await fetch(`${API_BASE}/api/upload/excel-json`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileBase64: base64 }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const raw = await response.text().catch(() => "");
        if (!response.ok) {
          let message = `Request failed: /api/upload/excel-json (HTTP ${response.status})`;
          try {
            const payload = JSON.parse(raw || "{}");
            if (payload.error) message = `${payload.error} (HTTP ${response.status})`;
          } catch (_err) {
            if (raw) message = `${message} - ${raw.slice(0, 180)}`;
          }
          reject(new Error(message));
          return;
        }
        resolve(JSON.parse(raw || "{}"));
      } catch (err) {
        if (err?.name === "AbortError") {
          reject(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s: /api/upload/excel-json`));
          return;
        }
        reject(new Error(err?.message || "Excel JSON upload failed."));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read Excel file in browser."));
    reader.readAsDataURL(file);
  });
}

async function checkBackendHealth() {
  try {
    const response = await fetch(`${API_BASE}/api/health`);
    if (!response.ok) throw new Error("Backend unhealthy");
    return true;
  } catch (_err) {
    return false;
  }
}

function renderComparison(results) {
  const comparisonMap = new Map();
  results.forEach((pair) => {
    const appNo = pair.applicationNumber || "";
    const key = normalizeAppNo(appNo);
    if (key) comparisonMap.set(key, pair);
  });
  renderPairedLists(comparisonMap);
  comparisonResults.innerHTML = "";
}

function updateStageButtons() {
  extractPdfBtn.disabled = !pdfFileInput.files[0];
  extractExcelBtn.disabled = !excelFileInput.files[0] || state.pdfItems.length === 0;
  compareBtn.disabled = state.pdfItems.length === 0 || state.excelItems.length === 0;
}

uploadForm.addEventListener("submit", (event) => {
  event.preventDefault();
});

extractPdfBtn.addEventListener("click", async () => {
  const healthy = await checkBackendHealth();
  if (!healthy) {
    comparisonResults.innerHTML = "<p class='diff-red'>Backend is not reachable. Start/restart server first.</p>";
    return;
  }

  const pdfFile = pdfFileInput.files[0];
  if (!pdfFile) return;

  comparisonResults.innerHTML = "<p class='muted'>Extracting PDF data...</p>";
  extractPdfBtn.disabled = true;
  extractExcelBtn.disabled = true;
  compareBtn.disabled = true;

  try {
    const pdfResult = await uploadSingle("/api/upload/pdf", "pdf", pdfFile);
    state.pdfItems = pdfResult.items || [];
    state.excelItems = [];
    renderPairedLists();
    comparisonResults.innerHTML = "<p class='muted'>PDF extracted. Continue with Excel extraction.</p>";
  } catch (err) {
    comparisonResults.innerHTML = `<p class='diff-red'>${err.message}</p>`;
  } finally {
    updateStageButtons();
  }
});

extractExcelBtn.addEventListener("click", async () => {
  const healthy = await checkBackendHealth();
  if (!healthy) {
    comparisonResults.innerHTML = "<p class='diff-red'>Backend is not reachable. Start/restart server first.</p>";
    return;
  }

  const excelFile = excelFileInput.files[0];
  if (!excelFile || state.pdfItems.length === 0) return;

  comparisonResults.innerHTML = "<p class='muted'>Extracting Excel data...</p>";
  extractExcelBtn.disabled = true;
  compareBtn.disabled = true;

  try {
    const excelResult = await uploadExcelAsJson(excelFile);
    state.excelItems = excelResult.items || [];
    renderPairedLists();
    const debug = excelResult.debug
      ? `<br/><small class="muted">Rows parsed: ${excelResult.debug.totalRowsAfterFilter} (before filter: ${excelResult.debug.totalRowsBeforeFilter})</small>`
      : "";
    comparisonResults.innerHTML = `<p class='muted'>Excel extracted. You can now run comparison.${debug}</p>`;
  } catch (err) {
    comparisonResults.innerHTML = `<p class='diff-red'>${err.message}</p>`;
  } finally {
    updateStageButtons();
  }
});

compareBtn.addEventListener("click", async () => {
  const healthy = await checkBackendHealth();
  if (!healthy) {
    comparisonResults.innerHTML = "<p class='diff-red'>Backend is not reachable. Start/restart server first.</p>";
    return;
  }

  const matchedRows = getPairedRows().filter((row) => {
    return (
      row.isMatchByApplication &&
      row.pdf &&
      row.excel &&
      !row.pdf.removed &&
      !row.excel.removed
    );
  });
  const pdfItems = matchedRows.map((row) => row.pdf);
  const excelItems = matchedRows.map((row) => row.excel);

  if (pdfItems.length === 0) {
    comparisonResults.innerHTML = "<p class='diff-red'>No matching application numbers to compare.</p>";
    renderPairedLists();
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pdfItems, excelItems }),
    });
    const payload = await response.json();
    renderComparison(payload.comparisons || []);
  } catch (_err) {
    comparisonResults.innerHTML =
      "<p class='diff-red'>Could not reach backend for comparison. Check server and refresh.</p>";
  }
});

attachRemoveHandler(pairedList);
attachDropzone(pdfDropzone, pdfFileInput, [".pdf"]);
attachDropzone(excelDropzone, excelFileInput, [".xlsx", ".xls", ".csv"]);

pdfFileInput.addEventListener("change", () => {
  if (pdfFileInput.files[0]) {
    pdfDropzone.textContent = `Selected: ${pdfFileInput.files[0].name}`;
  }
  updateStageButtons();
});

excelFileInput.addEventListener("change", () => {
  if (excelFileInput.files[0]) {
    excelDropzone.textContent = `Selected: ${excelFileInput.files[0].name}`;
  }
  updateStageButtons();
});

updateStageButtons();
checkBackendHealth();
