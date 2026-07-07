/* eslint-disable max-len, require-jsdoc */
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const {onRequest} = require("firebase-functions/v2/https");
const nodemailer = require("nodemailer");
const cors = require("cors")({origin: true});
const pdfParse = require("pdf-parse");
const {DocumentProcessorServiceClient} = require("@google-cloud/documentai").v1;
const vision = require("@google-cloud/vision");
const {extractBankStatementData} = require("./bankStatementExtractors");

if (!admin.apps.length) {
  admin.initializeApp();
}

// Singleton clients — instantiated once at module load, reused across requests
let _visionClient = null;
function getVisionClient() {
  if (!_visionClient) {
    _visionClient = new vision.ImageAnnotatorClient();
  }
  return _visionClient;
}

let _docAiClient = null;
function getDocAiClient(location) {
  if (!_docAiClient) {
    _docAiClient = new DocumentProcessorServiceClient({
      apiEndpoint: `${location}-documentai.googleapis.com`,
    });
  }
  return _docAiClient;
}

const GMAIL_USER = "janus.antithesis@gmail.com";
const GMAIL_PASS = "bchz bnwo pjhd qpzy";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_PASS,
  },
});

const MAX_INLINE_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_RECEIPT_IMAGES_PER_REQUEST = 12;
const OCR_FUNCTION_REGION = process.env.OCR_FUNCTION_REGION || "europe-west2";

function getDocumentAiConfig() {
  return {
    projectId: process.env.GCLOUD_PROJECT || process.env.DOCUMENT_AI_PROJECT_ID || admin.app().options.projectId,
    location: process.env.DOCUMENT_AI_LOCATION || "eu",
    processorId: process.env.DOCUMENT_AI_PROCESSOR_ID || "",
    receiptProcessorId:
      process.env.RECEIPT_OCR_PROCESSOR_ID ||
      process.env.DOCUMENT_AI_PROCESSOR_ID ||
      "",
  };
}

async function processDocumentWithAi({base64Content, mimeType, processorId}) {
  const {projectId, location} = getDocumentAiConfig();
  if (!projectId || !processorId) {
    return null;
  }

  const client = getDocAiClient(location);

  const name = `projects/${projectId}/locations/${location}/processors/${processorId}`;
  const [result] = await client.processDocument({
    name,
    rawDocument: {
      content: base64Content,
      mimeType,
    },
  });

  const document = result && result.document ? result.document : null;
  return {
    text: document && document.text ? document.text : "",
    pageCount: document && Array.isArray(document.pages) ? document.pages.length : 0,
    provider: "document-ai",
  };
}

async function verifyAuthenticatedUser(req) {
  const authHeader = String(req.headers.authorization || "");
  if (!authHeader.startsWith("Bearer ")) {
    const error = new Error("Missing authentication token.");
    error.statusCode = 401;
    throw error;
  }

  const idToken = authHeader.slice("Bearer ".length).trim();
  if (!idToken) {
    const error = new Error("Missing authentication token.");
    error.statusCode = 401;
    throw error;
  }

  return admin.auth().verifyIdToken(idToken);
}

async function extractTextFromPdf(pdfBase64, mimeType) {
  const {processorId} = getDocumentAiConfig();

  if (processorId) {
    try {
      const result = await processDocumentWithAi({
        base64Content: pdfBase64,
        mimeType,
        processorId,
      });
      if (result) {
        return result;
      }
    } catch (error) {
      console.warn("Document AI PDF scan failed, falling back to embedded PDF text extraction.", error);
    }
  }

  const pdfBuffer = Buffer.from(pdfBase64, "base64");
  const parsedPdf = await pdfParse(pdfBuffer);
  return {
    text: parsedPdf && parsedPdf.text ? parsedPdf.text : "",
    pageCount: parsedPdf && parsedPdf.numpages ? parsedPdf.numpages : 0,
    provider: "pdf-parse",
  };
}

async function extractTextFromReceiptImage(imageBase64, mimeType) {
  const {receiptProcessorId} = getDocumentAiConfig();
  if (receiptProcessorId) {
    try {
      const parsed = await processDocumentWithAi({
        base64Content: imageBase64,
        mimeType,
        processorId: receiptProcessorId,
      });

      return {
        text: parsed && parsed.text ? parsed.text : "",
        pageCount: parsed && parsed.pageCount ? parsed.pageCount : 1,
        provider: parsed && parsed.provider ? parsed.provider : "document-ai",
      };
    } catch (error) {
      console.warn("Document AI receipt scan failed, falling back to Vision OCR.", error);
    }
  }

  const client = getVisionClient();
  const [result] = await client.documentTextDetection({
    image: {content: imageBase64},
  });
  const fullText = result && result.fullTextAnnotation ? result.fullTextAnnotation.text : "";

  return {
    text: fullText || "",
    pageCount: 1,
    provider: "vision-ocr",
  };
}

exports.submitDeletionRequest = functions.https.onRequest((req, res) => {
  cors(req, res, () => {
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    const {email, message} = req.body;

    const mailOptions = {
      from: GMAIL_USER,
      to: "info@caistec.com",
      subject: "New Data Deletion Request",
      text: `Email: ${email}\n\nMessage:\n${message || "(no message)"}`,
    };

    transporter.sendMail(mailOptions, (error) => {
      if (error) {
        console.error("Error sending mail", error);
        return res.status(500).send("Failed to send request");
      }
      return res.status(200).send("Request received. We'll handle it shortly.");
    });
  });
});

exports.submitFeedback = functions.https.onRequest((req, res) => {
  cors(req, res, () => {
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    const {name, email, message} = req.body;

    const mailOptions = {
      from: GMAIL_USER,
      to: "info@caistec.com",
      subject: `Express Accounts Feedback - ${name}`,
      text: `${message}\n\n---\nSent from: ${email}`,
    };

    transporter.sendMail(mailOptions, (error) => {
      if (error) {
        console.error("Error sending feedback email", error);
        return res.status(500).send("Failed to send feedback");
      }
      return res.status(200).send("Feedback received.");
    });
  });
});

exports.extractBankStatementPdf = onRequest({region: OCR_FUNCTION_REGION}, (req, res) => {
  cors(req, res, async () => {
    if (req.method === "OPTIONS") {
      return res.status(204).send("");
    }

    if (req.method !== "POST") {
      return res.status(405).json({error: "Method Not Allowed"});
    }

    try {
      const decodedToken = await verifyAuthenticatedUser(req);

      // Bank statement / credit card OCR is restricted to verified users only
      const userRecord = await admin.firestore()
        .collection("users").doc(decodedToken.uid).get();
      if (!userRecord.exists || userRecord.data()?.verificationStatus !== "verified") {
        return res.status(403).json({
          error: "Bank statement scanning is only available to verified users. Please enter your client code in the app settings.",
        });
      }

      const {pdfBase64, fileName, mimeType = "application/pdf"} = req.body || {};
      if (!pdfBase64 || typeof pdfBase64 !== "string") {
        return res.status(400).json({error: "No PDF content was provided."});
      }

      if (mimeType !== "application/pdf") {
        return res.status(400).json({error: "Only PDF files are supported for this scan."});
      }

      const parsedPdf = await extractTextFromPdf(pdfBase64, mimeType);
      const documentText = parsedPdf.text || "";
      console.log("BANK_STATEMENT_RAW_TEXT_START\n%s\nBANK_STATEMENT_RAW_TEXT_END", documentText);
      const extracted = extractBankStatementData(documentText);

      return res.status(200).json({
        fileName: fileName || null,
        extracted,
        rawText: documentText,
        pageCount: parsedPdf.pageCount || 0,
        textLength: documentText.length,
        provider: parsedPdf.provider,
      });
    } catch (error) {
      console.error("PDF OCR failed", error);
      const statusCode = error && error.statusCode ? error.statusCode : 500;
      return res.status(statusCode).json({
        error: statusCode === 401 ? error.message : "PDF scan failed. Please try again with another PDF or image upload.",
      });
    }
  });
});

exports.extractReceiptImages = onRequest({region: OCR_FUNCTION_REGION, memory: "512MiB", timeoutSeconds: 120}, (req, res) => {
  cors(req, res, async () => {
    if (req.method === "OPTIONS") {
      return res.status(204).send("");
    }

    if (req.method !== "POST") {
      return res.status(405).json({error: "Method Not Allowed"});
    }

    try {
      await verifyAuthenticatedUser(req);

      const {images} = req.body || {};
      if (!Array.isArray(images) || !images.length) {
        return res.status(400).json({error: "No receipt images were provided."});
      }

      if (images.length > MAX_RECEIPT_IMAGES_PER_REQUEST) {
        return res.status(400).json({error: "Too many receipt images were provided in one request."});
      }

      const results = [];
      for (const [index, image] of images.entries()) {
        const imageBase64 = image && typeof image.imageBase64 === "string" ? image.imageBase64 : "";
        const mimeType = image && typeof image.mimeType === "string" ? image.mimeType : "image/jpeg";
        const fileName = image && typeof image.fileName === "string" ? image.fileName : `receipt-${index + 1}.jpg`;
        const byteLength = Buffer.byteLength(imageBase64, "base64");

        if (!imageBase64) {
          const error = new Error("An image payload was empty.");
          error.statusCode = 400;
          throw error;
        }

        if (!mimeType.startsWith("image/")) {
          const error = new Error("Only image uploads are supported for receipt OCR.");
          error.statusCode = 400;
          throw error;
        }

        if (byteLength > MAX_INLINE_IMAGE_BYTES) {
          const error = new Error(`Receipt image ${fileName} is too large for live scanning.`);
          error.statusCode = 400;
          throw error;
        }

        const parsed = await extractTextFromReceiptImage(imageBase64, mimeType);
        results.push({
          fileName,
          mimeType,
          rawText: parsed.text || "",
          textLength: parsed.text ? parsed.text.length : 0,
          pageCount: parsed.pageCount || 1,
          provider: parsed.provider,
        });
      }

      console.log(
        "RECEIPT_OCR_REQUEST images=%d providers=%s",
        results.length,
        results.map((entry) => entry.provider || "unknown").join(","),
      );

      return res.status(200).json({
        images: results,
        provider: results.every((entry) => entry.provider === results[0]?.provider)
          ? results[0]?.provider || null
          : "mixed",
      });
    } catch (error) {
      console.error("Receipt image OCR failed", error);
      const details = typeof error?.details === "string" ? error.details : "";
      const message = error?.message || details || "Receipt image scan failed. Please try again with another image.";
      const statusCode =
        error && error.statusCode
          ? error.statusCode
          : error?.code === 7
            ? 503
            : 500;
      return res.status(statusCode).json({
        error:
          statusCode === 401 || statusCode === 400 || statusCode === 503
            ? message
            : "Receipt image scan failed. Please try again with another image.",
      });
    }
  });
});
