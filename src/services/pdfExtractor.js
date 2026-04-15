const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");
const pdfParse = require("pdf-parse");
const { HfInference } = require("@huggingface/inference");
const { createCanvas } = require("@napi-rs/canvas");
const { createWorker } = require("tesseract.js");
const { formatDateDDMMYYYY } = require("./dateUtils");

const HF_MODEL = "Qwen/Qwen2.5-72B-Instruct";
const hfToken = process.env.HF_TOKEN || "";
const canUseHf = hfToken.startsWith("hf_");
const hfClient = canUseHf ? new HfInference(hfToken) : null;

let cachedGetDocument = null;
async function getPdfJsGetDocument() {
  if (cachedGetDocument) return cachedGetDocument;
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  cachedGetDocument = pdfjs.getDocument;
  return cachedGetDocument;
}

function textLooksGarbage(text) {
  const cleaned = String(text || "").replace(/\s+/g, "");
  if (!cleaned) return true;
  const strangeCharCount = (cleaned.match(/[^\x20-\x7E]/g) || []).length;
  return strangeCharCount / cleaned.length > 0.35 || /[\u0000-\u001f]/.test(cleaned);
}

async function extractTextWithOcrFallback(filePath) {
  const data = await fs.readFile(filePath);
  const parsed = await pdfParse(data).catch(() => ({ text: "" }));
  const parsedText = String(parsed?.text || "");
  if (parsedText && !textLooksGarbage(parsedText)) {
    return parsedText;
  }

  const getDocument = await getPdfJsGetDocument();
  const fileUrl = pathToFileURL(filePath).href;
  const loadingTask = getDocument({ url: fileUrl, disableWorker: true });
  const pdf = await loadingTask.promise;
  let directText = "";

  try {
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => `${item.str || ""}${item.hasEOL ? "\n" : " "}`)
        .join("");
      directText += `\n\n--- PAGE ${pageNo} ---\n${pageText}`;
    }
  } finally {
    await loadingTask.destroy();
  }

  if (directText && !textLooksGarbage(directText)) {
    return directText;
  }

  const ocrLoadingTask = getDocument({ url: fileUrl, disableWorker: true });
  const ocrPdf = await ocrLoadingTask.promise;
  const worker = await createWorker("eng");
  let fullText = "";

  try {
    for (let pageNo = 1; pageNo <= ocrPdf.numPages; pageNo += 1) {
      const page = await ocrPdf.getPage(pageNo);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = createCanvas(viewport.width, viewport.height);
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport }).promise;
      const pngBuffer = canvas.toBuffer("image/png");
      const tmpPngPath = path.join(os.tmpdir(), `tm-ocr-${Date.now()}-${pageNo}.png`);
      await fs.writeFile(tmpPngPath, pngBuffer);
      const result = await worker.recognize(tmpPngPath);
      await fs.unlink(tmpPngPath).catch(() => {});
      fullText += `\n\n--- PAGE ${pageNo} ---\n${result.data.text || ""}`;
    }
  } catch (ocrErr) {
    console.warn("OCR fallback failed, using direct text extraction:", ocrErr.message);
    return directText;
  } finally {
    await worker.terminate();
    await ocrLoadingTask.destroy();
  }

  return fullText;
}

function fallbackRuleBasedExtraction(text) {
  const normalized = String(text || "").replace(/\r/g, "");
  const entries = [];
  const entryRegex = /(\d{4}\/\d{5,})\s+in\s+Class\s+(\d{1,2})\s+([\s\S]*?)(?=(?:\n\s*\d{4}\/\d{5,}\s+in\s+Class)|$)/gi;

  for (const match of normalized.matchAll(entryRegex)) {
    const applicationNumber = match[1] || "";
    const classes = match[2] || "";
    const body = `${applicationNumber} in Class ${classes} ${match[3] || ""}`;
    const compactBody = body.replace(/\s+/g, " ").trim();

    const specification =
      compactBody.match(/in\s+Class\s+\d{1,2}\s+(.+?)(?=In the name of|Address for service:|Associated with|FILED:|$)/i)?.[1]?.trim() || "";
    const applicant =
      compactBody.match(/In the name of\s+(.+?)\s+of\s+/i)?.[1]?.trim() ||
      compactBody.match(/In the name of\s+(.+?)(?=Address for service:|Associated with|FILED:|$)/i)?.[1]?.trim() ||
      "";
    const applicantAddress =
      compactBody.match(/In the name of\s+.+?\s+of\s+(.+?)(?=Address for service:|Associated with|FILED:|$)/i)?.[1]?.trim() || "";
    const addressForServiceAddress =
      compactBody.match(/Address for service:\s*(.+?)(?=Associated with|FILED:|Signed and sealed at Pretoria|$)/i)?.[1]?.trim() || "";
    const association = compactBody.match(/Associated with(?:\s+No)?\s*:\s*(.+?)(?=FILED:|Signed and sealed at Pretoria|$)/i)?.[1]?.trim() || "";
    const applicationDate = formatDateDDMMYYYY(
      compactBody.match(/FILED\s*:\s*(.+?)(?=Signed and sealed at Pretoria|$)/i)?.[1]?.trim() || ""
    );
    const registrationDate = formatDateDDMMYYYY(
      compactBody.match(/Signed and sealed at Pretoria,\s*this\s+(.+?)(?=Registrar|$)/i)?.[1]?.trim() || ""
    );

    entries.push({
      id: `pdf-${entries.length + 1}`,
      source: "pdf",
      removed: false,
      country: "South Africa",
      applicationNumber,
      registrationNumber: applicationNumber,
      classes,
      specification,
      applicant,
      applicantAddress,
      addressForServiceAddress,
      association,
      applicationDate,
      registrationDate,
      rawExtract: compactBody,
    });
  }

  if (entries.length > 0) {
    return entries;
  }

  const singleApplicationNumber =
    normalized.match(/application\s*(?:no|number)\s*[:#]?\s*([A-Z0-9\/-]+)/i)?.[1] ||
    normalized.match(/\b(\d{4}\/\d{5,})\b/)?.[1] ||
    "";
  const singleClasses = normalized.match(/class(?:es)?\s*[:#]?\s*([0-9,\s]+)/i)?.[1]?.trim() || "";
  const singleApplicant =
    normalized.match(/in the name of\s*([\s\S]{1,120}?)(?:\n|of\s)/i)?.[1]?.trim() || "";
  const singleApplicationDate = formatDateDDMMYYYY(
    normalized.match(/filed\s*[:\-]?\s*([0-9a-z,\s\/-]+)/i)?.[1]?.trim() || ""
  );
  const singleRegistrationDate = formatDateDDMMYYYY(
    normalized.match(/signed and sealed at pretoria,\s*this\s*([0-9a-z,\s]+)/i)?.[1]?.trim() || ""
  );

  return [
    {
      id: "pdf-1",
      source: "pdf",
      removed: false,
      country: "South Africa",
      applicationNumber: singleApplicationNumber,
      registrationNumber: singleApplicationNumber,
      classes: singleClasses,
      applicant: singleApplicant,
      applicationDate: singleApplicationDate,
      registrationDate: singleRegistrationDate,
      rawExtract: normalized.slice(0, 4000),
    },
  ];
}

function sanitizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item, index) => ({
      id: item.id || `pdf-${index + 1}`,
      source: "pdf",
      removed: false,
      country: item.country || "",
      applicationNumber: item.applicationNumber || item.registrationNumber || "",
      registrationNumber: item.registrationNumber || item.applicationNumber || "",
      trademark: item.trademark || "",
      classes: item.classes || "",
      specification: item.specification || item.goodsServices || "",
      applicant: item.applicant || "",
      applicantAddress: item.applicantAddress || "",
      addressForServiceName: item.addressForServiceName || "",
      addressForServiceAddress: item.addressForServiceAddress || "",
      endorsement: item.endorsement || "",
      association: item.association || "",
      disclaimer: item.disclaimer || "",
      admission: item.admission || "",
      applicationDate: item.applicationDate || "",
      registrationDate: item.registrationDate || "",
      rawExtract: item.rawExtract || "",
    }))
    .filter((item) => {
      item.applicationDate = formatDateDDMMYYYY(item.applicationDate);
      item.registrationDate = formatDateDDMMYYYY(item.registrationDate);
      return (
        item.applicationNumber ||
        item.registrationNumber ||
        item.classes ||
        item.applicant ||
        item.specification ||
        item.rawExtract
      );
    });
}

async function extractWithQwen(rawText) {
  if (!hfClient) {
    return [];
  }

  const prompt = `
You are extracting trade mark registration data from South African certificates.
The input text may contain multiple registration certificates and multiple trade marks.
Return ONLY a JSON array (no markdown) where each item has keys:
country, applicationNumber, registrationNumber, trademark, classes, specification, applicant, applicantAddress, addressForServiceName, addressForServiceAddress, endorsement, association, disclaimer, admission, applicationDate, registrationDate, rawExtract.

Rules:
- applicationNumber and registrationNumber are usually the same in South Africa.
- Parse FILED date as applicationDate.
- Parse "Signed and sealed at Pretoria, this" date as registrationDate.
- Keep missing fields as empty strings.
- Split into one object per trade mark.

Source text:
${rawText.slice(0, 50000)}
`;

  const completion = await hfClient.chatCompletion({
    model: HF_MODEL,
    messages: [{ role: "user", content: prompt }],
    temperature: 0,
    max_tokens: 4000,
  });

  const output = completion.choices?.[0]?.message?.content || "[]";
  const jsonStart = output.indexOf("[");
  const jsonEnd = output.lastIndexOf("]");
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error("Qwen response was not valid JSON.");
  }

  const parsed = JSON.parse(output.slice(jsonStart, jsonEnd + 1));
  return sanitizeItems(parsed);
}

async function extractTrademarksFromPdf(filePath) {
  const rawText = await extractTextWithOcrFallback(filePath);
  try {
    const qwenItems = await extractWithQwen(rawText);
    if (qwenItems.length > 0) {
      return qwenItems;
    }
  } catch (err) {
    console.warn("Qwen extraction failed, using fallback parser:", err.message);
  }

  return sanitizeItems(fallbackRuleBasedExtraction(rawText));
}

module.exports = { extractTrademarksFromPdf };
