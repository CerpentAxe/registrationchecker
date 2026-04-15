const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs/promises");
require("dotenv").config();

const { extractTrademarksFromPdf } = require("./services/pdfExtractor");
const {
  extractTrademarksFromExcel,
  extractTrademarksFromExcelBuffer,
} = require("./services/excelExtractor");
const { compareTrademarkLists } = require("./services/comparisonService");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: "50mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));
app.use((req, _res, next) => {
  if (req.path.startsWith("/api/")) {
    console.log(`[API] ${req.method} ${req.path}`);
  }
  next();
});

const uploadDir = path.join(__dirname, "..", "tmp");
const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (_req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage });

app.post("/api/upload/pdf", upload.single("pdf"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "PDF file is required." });
  }

  try {
    const items = await extractTrademarksFromPdf(req.file.path);
    res.json({ items });
  } catch (err) {
    console.error("PDF extraction error:", err);
    res.status(500).json({ error: err.message || "Failed to extract PDF details." });
  } finally {
    await fs.unlink(req.file.path).catch(() => {});
  }
});

app.post("/api/upload/excel", upload.single("excel"), async (req, res) => {
  console.log(
    `[API] upload/excel file=${req.file?.originalname || "none"} size=${req.file?.size || 0}`
  );
  if (!req.file) {
    return res.status(400).json({ error: "Excel file is required." });
  }

  try {
    const result = await extractTrademarksFromExcel(req.file.path);
    console.log("[API] excel debug:", result.debug);
    res.json(result);
  } catch (err) {
    console.error("Excel extraction error:", err);
    res.status(500).json({ error: err.message || "Failed to extract Excel details." });
  } finally {
    await fs.unlink(req.file.path).catch(() => {});
  }
});

app.post("/api/upload/excel-json", async (req, res) => {
  try {
    const { fileBase64 } = req.body || {};
    if (!fileBase64) {
      return res.status(400).json({ error: "Excel file data is required." });
    }
    const buffer = Buffer.from(fileBase64, "base64");
    const result = extractTrademarksFromExcelBuffer(buffer);
    console.log("[API] excel-json debug:", result.debug);
    res.json(result);
  } catch (err) {
    console.error("Excel JSON extraction error:", err);
    res.status(500).json({ error: err.message || "Failed to extract Excel details." });
  }
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use((err, _req, res, _next) => {
  console.error("Unhandled server error:", err);
  if (res.headersSent) return;
  res.status(500).json({ error: err.message || "Internal server error" });
});

app.post("/api/compare", (req, res) => {
  const { pdfItems = [], excelItems = [] } = req.body || {};
  const comparisons = compareTrademarkLists(pdfItems, excelItems);
  res.json({ comparisons });
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Registration checker running on http://localhost:${port}`);
  });
}

module.exports = app;
