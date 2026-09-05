/* eslint-disable max-len, require-jsdoc */
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const {onRequest} = require("firebase-functions/v2/https");
const cors = require("cors")({origin: true});
const nodemailer = require("nodemailer");
const pdfParse = require("pdf-parse");
const archiver = require("archiver");
const XLSX = require("xlsx");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {randomUUID} = require("crypto");
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

const MAX_INLINE_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_RECEIPT_IMAGES_PER_REQUEST = 12;
const OCR_FUNCTION_REGION = process.env.OCR_FUNCTION_REGION || "europe-west2";
const ACCOUNTANT_EMAILS = new Set([
  "info@caistec.com",
  "info@expressaccounts.biz",
  "catrin@expressaccounts.biz",
]);

const GMAIL_USER = process.env.GMAIL_USER || "";
const GMAIL_PASS = process.env.GMAIL_PASS || "";
const NOTIFY_TO = process.env.NOTIFY_TO || "info@caistec.com";

let transporter = null;
function getMailTransporter() {
  if (transporter) {
    return transporter;
  }

  if (!GMAIL_USER || !GMAIL_PASS) {
    const error = new Error("Missing GMAIL_USER or GMAIL_PASS environment variables.");
    error.statusCode = 500;
    throw error;
  }

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_PASS,
    },
  });

  return transporter;
}

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

function isAccountantEmail(email) {
  return ACCOUNTANT_EMAILS.has(String(email || "").toLowerCase());
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

async function findVerificationCodeByEmail(emailLower, userId) {
  const codesRef = admin.firestore().collection("VerificationCodes");

  const pickCandidate = (docs) => {
    const normalizedUserId = String(userId || "");
    const exactUserMatch = docs
      .map((docSnap) => ({id: docSnap.id, data: docSnap.data() || {}}))
      .find((entry) => String(entry.data.usedBy || "") === normalizedUserId);
    if (exactUserMatch) return exactUserMatch;

    const usable = docs
      .map((docSnap) => ({id: docSnap.id, data: docSnap.data() || {}}))
      .filter((entry) => {
        const usedBy = String(entry.data.usedBy || "");
        return !usedBy;
      });

    if (usable.length) {
      return usable[0];
    }

    // Last resort: allow reassignment from an existing linked user when
    // the email matches and no unclaimed code exists.
    const any = docs.map((docSnap) => ({id: docSnap.id, data: docSnap.data() || {}}));
    return any[0] || null;
  };

  const lowerSnap = await codesRef
    .where("accountantSubmittedEmailLower", "==", emailLower)
    .limit(25)
    .get();
  const lowerMatch = pickCandidate(lowerSnap.docs);
  if (lowerMatch) return lowerMatch;

  const exactSnap = await codesRef
    .where("accountantSubmittedEmail", "==", emailLower)
    .limit(25)
    .get();
  const exactMatch = pickCandidate(exactSnap.docs);
  if (exactMatch) return exactMatch;

  // Legacy fallback: older code docs may not have lowercase email field.
  // Scan a bounded recent set and compare case-insensitively.
  let fallbackDocs = [];
  try {
    const recentSnap = await codesRef
      .orderBy("createdAt", "desc")
      .limit(500)
      .get();
    fallbackDocs = recentSnap.docs;
  } catch (_) {
    const coarseSnap = await codesRef.limit(500).get();
    fallbackDocs = coarseSnap.docs;
  }

  const fallbackMatch = pickCandidate(
    fallbackDocs.filter((docSnap) =>
      normalizeEmail((docSnap.data() || {}).accountantSubmittedEmail) === emailLower
    )
  );

  if (!fallbackMatch) return null;
  return {id: fallbackMatch.id, data: fallbackMatch.data() || {}};
}

async function applyVerificationCodeByEmail({userId, emailLower, markEmailVerified}) {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) {
    return {matched: false, reason: "missing-user-id"};
  }

  const normalizedEmail = normalizeEmail(emailLower);
  if (!normalizedEmail) {
    return {matched: false, reason: "missing-email"};
  }

  const matchedCode = await findVerificationCodeByEmail(normalizedEmail, normalizedUserId);
  if (!matchedCode) {
    return {matched: false, reason: "no-code-for-email"};
  }

  const userRef = admin.firestore().collection("users").doc(normalizedUserId);
  const codeRef = admin.firestore().collection("VerificationCodes").doc(matchedCode.id);
  const nowTs = admin.firestore.FieldValue.serverTimestamp();

  await admin.firestore().runTransaction(async (tx) => {
    const [userSnap, codeSnap] = await Promise.all([tx.get(userRef), tx.get(codeRef)]);
    const userData = userSnap.exists ? (userSnap.data() || {}) : {};
    const codeData = codeSnap.exists ? (codeSnap.data() || {}) : {};

    const usedBy = String(codeData.usedBy || "");
    const reassignedFromUserId = usedBy && usedBy !== normalizedUserId ? usedBy : "";

    if (reassignedFromUserId) {
      const oldUserRef = admin.firestore().collection("users").doc(reassignedFromUserId);
      const oldUserSnap = await tx.get(oldUserRef);
      if (oldUserSnap.exists) {
        const oldUserData = oldUserSnap.data() || {};
        const oldCode = String(oldUserData.verificationCode || "");
        if (oldCode === matchedCode.id) {
          tx.set(oldUserRef, {
            verificationStatus: admin.firestore.FieldValue.delete(),
            verifiedName: admin.firestore.FieldValue.delete(),
            verificationCode: admin.firestore.FieldValue.delete(),
            hideAds: false,
            updatedAt: nowTs,
          }, {merge: true});
        }
      }
    }

    const verifiedName =
      String(codeData.accountantSubmittedName || "").trim() ||
      String(userData.name || userData.displayName || "").trim() ||
      "Verified client";

    tx.set(userRef, {
      verificationStatus: "verified",
      verifiedName,
      verificationCode: matchedCode.id,
      hideAds: true,
      emailVerified: markEmailVerified ? true : Boolean(userData.emailVerified),
      updatedAt: nowTs,
    }, {merge: true});

    tx.set(codeRef, {
      usedBy: normalizedUserId,
      usedAt: nowTs,
      verificationStatus: "verified",
      accountantSubmittedEmailLower: normalizedEmail,
      updatedAt: nowTs,
    }, {merge: true});
  });

  if (markEmailVerified) {
    await admin.auth().updateUser(normalizedUserId, {emailVerified: true});
  }

  return {
    matched: true,
    code: matchedCode.id,
  };
}

function parsePortalAttachmentSource(sourceUrl) {
  const url = String(sourceUrl || "").trim();
  if (!url) return null;

  const gsMatch = url.match(/^gs:\/\/([^/]+)\/(.+)$/i);
  if (gsMatch) {
    return {
      bucket: gsMatch[1],
      objectPath: gsMatch[2],
    };
  }

  const firebaseStorageMatch = url.match(/^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/([^/]+)\/o\/([^?]+)(\?.*)?$/i);
  if (firebaseStorageMatch) {
    return {
      bucket: firebaseStorageMatch[1],
      objectPath: decodeURIComponent(firebaseStorageMatch[2]),
    };
  }

  const storageGoogleapisMatch = url.match(/^https:\/\/storage\.googleapis\.com\/([^/]+)\/(.+)$/i);
  if (storageGoogleapisMatch) {
    return {
      bucket: storageGoogleapisMatch[1],
      objectPath: decodeURIComponent(storageGoogleapisMatch[2]),
    };
  }

  return null;
}

function resolveExportStorageBucketName() {
  const configuredBucket = String(
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.GCLOUD_STORAGE_BUCKET ||
    admin.app().options.storageBucket || ""
  ).trim();

  if (configuredBucket) {
    return configuredBucket;
  }

  return "";
}

function buildBucketCandidates(bucketName) {
  const candidates = [];
  const push = (value) => {
    const normalized = String(value || "").trim();
    if (!normalized) return;
    if (!candidates.includes(normalized)) {
      candidates.push(normalized);
    }
  };

  push(bucketName);

  if (String(bucketName).endsWith(".firebasestorage.app")) {
    push(String(bucketName).replace(/\.firebasestorage\.app$/i, ".appspot.com"));
  }
  if (String(bucketName).endsWith(".appspot.com")) {
    push(String(bucketName).replace(/\.appspot\.com$/i, ".firebasestorage.app"));
  }

  const defaultBucket = resolveExportStorageBucketName();
  push(defaultBucket);

  return candidates;
}

exports.resolveExportStorageBucketName = resolveExportStorageBucketName;

function inferMimeTypeFromPath(pathValue) {
  const lower = String(pathValue || "").toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".heif")) return "image/heif";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

function buildFirebaseTokenDownloadUrl(bucketName, objectName, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(objectName)}?alt=media&token=${encodeURIComponent(token)}`;
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

function isExpoPushToken(token) {
  return /^ExponentPushToken\[[^\]]+\]$|^ExpoPushToken\[[^\]]+\]$/.test(String(token || ""));
}

async function sendExpoPushMessages(messages) {
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(messages),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload && payload.errors ? JSON.stringify(payload.errors) : "Expo push request failed.");
    error.statusCode = response.status;
    throw error;
  }

  return Array.isArray(payload.data) ? payload.data : [];
}

async function getExpoPushReceipts(ticketIds) {
  const response = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({ids: ticketIds}),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload && payload.errors ? JSON.stringify(payload.errors) : "Expo receipt request failed.");
    error.statusCode = response.status;
    throw error;
  }

  return payload.data || {};
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
  cors(req, res, async () => {
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    try {
      const {email, message} = req.body || {};
      const mailer = getMailTransporter();
      await mailer.sendMail({
        from: GMAIL_USER,
        to: NOTIFY_TO,
        subject: "New Data Deletion Request",
        text: `Email: ${email || "(missing)"}\n\nMessage:\n${message || "(no message)"}`,
      });
      return res.status(200).send("Request received. We'll handle it shortly.");
    } catch (error) {
      console.error("Error sending deletion request email", error);
      return res.status(500).send("Failed to send request");
    }
  });
});

exports.submitFeedback = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    try {
      const {name, email, message} = req.body || {};
      const mailer = getMailTransporter();
      await mailer.sendMail({
        from: GMAIL_USER,
        to: NOTIFY_TO,
        subject: `Express Accounts Feedback - ${name || "Unknown"}`,
        text: `${message || "(no message)"}\n\n---\nSent from: ${email || "(missing)"}`,
      });
      return res.status(200).send("Feedback received.");
    } catch (error) {
      console.error("Error sending feedback email", error);
      return res.status(500).send("Failed to send feedback");
    }
  });
});

exports.fetchPortalAttachment = onRequest({region: OCR_FUNCTION_REGION, timeoutSeconds: 120}, (req, res) => {
  cors(req, res, async () => {
    if (req.method === "OPTIONS") {
      return res.status(204).send("");
    }

    if (req.method !== "POST") {
      return res.status(405).json({error: "Method Not Allowed"});
    }

    try {
      const decodedToken = await verifyAuthenticatedUser(req);
      if (!isAccountantEmail(decodedToken.email)) {
        return res.status(403).json({error: "Only accountant users may export attachment files."});
      }

      const payload = req.body || {};
      const sourceUrl = payload.sourceUrl || "";
      const parsed = parsePortalAttachmentSource(sourceUrl);
      const objectPath = (parsed && parsed.objectPath) || payload.fullPath || "";
      const sourceBucket = (parsed && parsed.bucket) || payload.bucket || "";

      if (!objectPath) {
        return res.status(400).json({error: "Attachment path is missing."});
      }

      const bucketCandidates = buildBucketCandidates(sourceBucket);
      let fileBuffer = null;
      let lastError = null;

      for (const bucketName of bucketCandidates) {
        try {
          const [downloaded] = await admin.storage().bucket(bucketName).file(objectPath).download();
          fileBuffer = downloaded;
          break;
        } catch (error) {
          lastError = error;
        }
      }

      if (!fileBuffer) {
        const message = lastError && lastError.message ? lastError.message : "Attachment not found";
        return res.status(404).json({error: message});
      }

      res.set("Content-Type", inferMimeTypeFromPath(objectPath));
      res.set("Cache-Control", "private, max-age=0");
      return res.status(200).send(fileBuffer);
    } catch (error) {
      console.error("Portal attachment fetch failed", error);
      const statusCode = error && error.statusCode ? error.statusCode : 500;
      return res.status(statusCode).json({
        error: statusCode === 401 ? error.message : "Attachment proxy download failed.",
      });
    }
  });
});

exports.exportClientZip = onRequest(
  {
    region: OCR_FUNCTION_REGION,
    timeoutSeconds: 1800,
    memory: "1GiB",
  },
  (req, res) => {
    cors(req, res, async () => {
      const debugId = `export-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const debugState = {
        debugId,
        stage: "init",
        startedAt: new Date().toISOString(),
        timingsMs: {},
        request: {
          method: req.method,
          hasAuthHeader: Boolean(req.headers && req.headers.authorization),
        },
      };

      const stageStartedAt = Date.now();
      function setStage(stage) {
        debugState.stage = stage;
        debugState.timingsMs[stage] = Date.now() - stageStartedAt;
      }

      if (req.method === "OPTIONS") {
        return res.status(204).send("");
      }

      if (req.method !== "POST") {
        return res.status(405).json({error: "Method Not Allowed"});
      }

      function pad2(value) {
        return String(value).padStart(2, "0");
      }

      function toDateOnlyString(value) {
        if (!value) return "";
        const d = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(d.getTime())) {
          return String(value).split("T")[0];
        }
        return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
      }

      function toMoney(value) {
        return Number(value || 0).toFixed(2);
      }

      const MAX_XLSX_CELL_TEXT = 32767;
      const XLSX_TRUNCATION_SUFFIX = " … [truncated]";

      function sanitizeWorksheetCellValue(value) {
        if (typeof value !== "string") return value;
        if (value.length <= MAX_XLSX_CELL_TEXT) return value;

        const keepLength = Math.max(0, MAX_XLSX_CELL_TEXT - XLSX_TRUNCATION_SUFFIX.length);
        return value.slice(0, keepLength) + XLSX_TRUNCATION_SUFFIX;
      }

      function sanitizeWorksheetAoa(aoa) {
        return (Array.isArray(aoa) ? aoa : []).map((row) =>
          (Array.isArray(row) ? row : [row]).map((cell) => sanitizeWorksheetCellValue(cell))
        );
      }

      function sanitizeFileSegment(value, fallback) {
        const cleaned = String(value || "")
          .trim()
          .replace(/[^a-zA-Z0-9._-]+/g, "-")
          .replace(/-+/g, "-")
          .replace(/(^-|-$)/g, "");
        return cleaned || fallback;
      }

      function normalizeAttachments(input) {
        return (Array.isArray(input) ? input : [])
          .map((attachment, index) => {
            if (!attachment) return null;
            if (typeof attachment === "string") {
              return {
                id: `attachment-${index}`,
                name: `attachment-${index + 1}`,
                mimeType: "",
                kind: "image",
                url: attachment,
                gsUrl: "",
                bucket: "",
                fullPath: "",
              };
            }

            const normalizedUrl =
              attachment.url ||
              attachment.downloadURL ||
              attachment.uri ||
              attachment.localUri ||
              attachment.sourceUri ||
              "";

            return {
              id: attachment.id || normalizedUrl || `attachment-${index}`,
              name: attachment.name || attachment.fileName || `attachment-${index + 1}`,
              mimeType: attachment.mimeType || attachment.type || "",
              kind: attachment.kind || "",
              url: normalizedUrl,
              gsUrl: attachment.gsUrl || attachment.gsURI || attachment.storageUri || attachment.uri || "",
              bucket: attachment.bucket || "",
              fullPath: attachment.fullPath || attachment.path || attachment.storagePath || "",
              downloadToken: attachment.downloadToken || attachment.token || attachment.firebaseStorageDownloadToken || "",
            };
          })
          .filter(Boolean);
      }

      function mergeAttachmentSources(primaryAttachments, imageUrls) {
        const merged = [
          ...normalizeAttachments(primaryAttachments),
          ...normalizeAttachments(imageUrls),
        ];

        const seen = new Set();
        return merged.filter((item) => {
          const key = String(item && item.url ? item.url : item && item.id ? item.id : "").trim();
          if (!key) return false;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }

      function isImageLikeAttachment(attachment) {
        const mimeType = String(attachment && attachment.mimeType ? attachment.mimeType : "").toLowerCase();
        const kind = String(attachment && attachment.kind ? attachment.kind : "").toLowerCase();
        if (mimeType.startsWith("image/")) return true;
        if (kind === "image") return true;
        const name = String(attachment && attachment.name ? attachment.name : "").toLowerCase();
        return /\.(jpg|jpeg|png|webp|gif|heic|heif)$/.test(name);
      }

      function buildExportItems(entries, prefix) {
        const sortedEntries = [...(entries || [])].sort((a, b) => {
          const dateA = String(a && (a.date || a.loggedAt || "") || "");
          const dateB = String(b && (b.date || b.loggedAt || "") || "");
          const dateCompare = dateA.localeCompare(dateB);
          if (dateCompare !== 0) return dateCompare;
          return String(a && a.id ? a.id : "").localeCompare(String(b && b.id ? b.id : ""));
        });

        return sortedEntries.map((entry, index) => {
          const exportId = prefix + String(index + 1).padStart(4, "0");
          const imageAttachments = mergeAttachmentSources(entry && entry.attachments, entry && entry.images)
            .filter((attachment) => attachment.url && isImageLikeAttachment(attachment))
            .map((attachment, imageIndex) => ({
              ...attachment,
              exportAttachmentId: `${exportId}-${imageIndex + 1}`,
            }));
          return {entry, exportId, imageAttachments};
        });
      }

      function inferAttachmentExtension(attachment) {
        const attachmentName = String(attachment && attachment.name ? attachment.name : "").trim();
        if (attachmentName.includes(".")) {
          const ext = attachmentName.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "");
          if (ext) return `.${ext}`;
        }
        const mimeType = String(attachment && attachment.mimeType ? attachment.mimeType : "").toLowerCase();
        if (mimeType === "image/jpeg") return ".jpg";
        if (mimeType === "image/png") return ".png";
        if (mimeType === "image/webp") return ".webp";
        if (mimeType === "image/heic") return ".heic";
        if (mimeType === "image/heif") return ".heif";
        if (mimeType === "image/gif") return ".gif";
        const rawUrl = String(attachment && attachment.url ? attachment.url : "");
        const urlWithoutQuery = rawUrl.split("?")[0];
        if (urlWithoutQuery.includes(".")) {
          const ext = urlWithoutQuery.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "");
          if (ext) return `.${ext}`;
        }
        return ".jpg";
      }

      function filterEntriesByPeriod(entries, startDate, endDate, getDateValue) {
        return (entries || []).filter((entry) => {
          if (!startDate || !endDate) return true;
          const rawDate = typeof getDateValue === "function" ? getDateValue(entry) : entry && entry.date;
          const dateValue = toDateOnlyString(rawDate);
          if (!dateValue) return false;
          return dateValue >= startDate && dateValue <= endDate;
        });
      }

      function calculateReceiptTotalsByCategory(receipts) {
        return receipts.reduce(
          (acc, item) => {
            const category = (item.category || "Uncategorized").trim() || "Uncategorized";
            const amountPence = Math.round((Number(item.amount) || 0) * 100);
            const vatAmount = Number.isFinite(Number(item.vatAmount))
              ? Number(item.vatAmount)
              : ((Number(item.amount) || 0) * (Number(item.vatRate) || 0)) /
                (100 + (Number(item.vatRate) || 0) || 1);
            acc.overallPence += amountPence;
            acc.totalVatPence += Math.round((Number(vatAmount) || 0) * 100);
            acc.byCategoryPence[category] = (acc.byCategoryPence[category] || 0) + amountPence;
            return acc;
          },
          {overallPence: 0, totalVatPence: 0, byCategoryPence: {}},
        );
      }

      function calculateIncomeTotals(entries) {
        return entries.reduce(
          (acc, item) => {
            const label = (item.label || "Unlabelled").trim() || "Unlabelled";
            acc.totalAmountPence += Math.round((Number(item.amount) || 0) * 100);
            acc.totalVatPence += Math.round((Number(item.vatAmount) || 0) * 100);
            acc.byLabelPence[label] = (acc.byLabelPence[label] || 0) + Math.round((Number(item.amount) || 0) * 100);
            return acc;
          },
          {totalAmountPence: 0, totalVatPence: 0, byLabelPence: {}},
        );
      }

      function buildReceiptWorkbookRows(receiptExportItems) {
        const rows = receiptExportItems.map((exportItem) => {
          const receipt = exportItem.entry;
          const vatAmount = Number.isFinite(Number(receipt.vatAmount))
            ? Number(receipt.vatAmount)
            : ((Number(receipt.amount) || 0) * (Number(receipt.vatRate) || 0)) /
              (100 + (Number(receipt.vatRate) || 0) || 1);
          return [
            exportItem.exportId,
            toMoney(receipt.amount),
            toMoney(vatAmount),
            `${receipt.vatRate || 0}%`,
            receipt.date,
            receipt.category,
            exportItem.imageAttachments.map((attachment) => attachment.exportAttachmentId).join(", "),
            String(exportItem.imageAttachments.length),
            toDateOnlyString(receipt.loggedAt),
          ];
        });

        const totals = calculateReceiptTotalsByCategory(receiptExportItems.map((item) => item.entry));
        const categorySummaryRows = Object.entries(totals.byCategoryPence)
          .sort(([a], [b]) => a.localeCompare(b, undefined, {sensitivity: "base"}))
          .map(([categoryName, amountPence]) => [categoryName, toMoney(amountPence / 100)]);

        const aoa = [
          ["Item ID", "Amount", "VAT Amount", "VAT Rate", "Date", "Category", "Image IDs", "Image Count", "Logged At"],
          ...rows,
          [],
          ["Summary", ""],
          ["Total Amount", toMoney(totals.overallPence / 100)],
          ["Total VAT Amount", toMoney(totals.totalVatPence / 100)],
          ["", ""],
          ["Totals by Category", ""],
          ...categorySummaryRows,
        ];

        if (rows.length === 0) {
          aoa.splice(1, 0, ["No receipts found for this period.", "", "", "", "", "", "", "", ""]);
        }

        return aoa;
      }

      function buildIncomeWorkbookRows(incomeExportItems) {
        const rows = incomeExportItems.map((exportItem) => {
          const entry = exportItem.entry;
          return [
            exportItem.exportId,
            toMoney(entry.amount),
            toMoney(entry.vatAmount),
            `${entry.vatRate || 0}%`,
            entry.date,
            entry.reference || "",
            entry.label || "",
            entry.notes || "",
            exportItem.imageAttachments.map((attachment) => attachment.exportAttachmentId).join(", "),
            String(exportItem.imageAttachments.length),
            toDateOnlyString(entry.loggedAt),
          ];
        });

        const totals = calculateIncomeTotals(incomeExportItems.map((item) => item.entry));
        const labelSummaryRows = Object.entries(totals.byLabelPence)
          .sort(([a], [b]) => a.localeCompare(b, undefined, {sensitivity: "base"}))
          .map(([label, amountPence]) => [label, toMoney(amountPence / 100)]);

        const aoa = [
          ["Item ID", "Amount", "VAT Amount", "VAT Rate", "Date", "Reference", "Label", "Notes", "Image IDs", "Image Count", "Logged At"],
          ...rows,
          [],
          ["Summary", ""],
          ["Total Amount", toMoney(totals.totalAmountPence / 100)],
          ["Total VAT Amount", toMoney(totals.totalVatPence / 100)],
          ["", ""],
          ["Totals by Label", ""],
          ...labelSummaryRows,
        ];

        if (rows.length === 0) {
          aoa.splice(1, 0, ["No income records found for this period.", "", "", "", "", "", "", "", "", "", ""]);
        }

        return aoa;
      }

      function buildBankStatementWorkbookRows(filteredStatements) {
        const typeLabel = (statementType) => statementType === "credit" ? "Credit card" : "Bank";
        const summaryRows = filteredStatements.map((statement) => [
          statement.accountName || "",
          typeLabel(statement.statementType),
          statement.statementStartDate || "",
          statement.statementEndDate || statement.date || "",
          Number.isFinite(Number(statement.statementBalance)) ? toMoney(statement.statementBalance) : "",
          toMoney(statement.moneyInTotal || 0),
          toMoney(statement.moneyOutTotal || 0),
          toMoney(Number.isFinite(Number(statement.netMovement)) ? Number(statement.netMovement) : (Number(statement.moneyInTotal) || 0) - (Number(statement.moneyOutTotal) || 0)),
          statement.notes || "",
          String(statement.attachmentsCount || 0),
          String((statement.transactions || []).length),
          String((statement.vendorTotals || []).length),
          String((statement.categoryTotals || []).length),
          toDateOnlyString(statement.loggedAt || statement.updatedAt),
        ]);

        const rawTextRows = filteredStatements.map((statement) => [
          statement.accountName || "",
          typeLabel(statement.statementType),
          statement.statementEndDate || statement.date || "",
          statement.rawText || "",
        ]);

        const aoa = [
          ["Statement Summary"],
          ["Account", "Type", "Start Date", "End / Issue Date", "Statement Balance", "Money In", "Money Out", "Net Movement", "Notes", "Attachments", "Transactions", "Vendors", "Categories", "Logged At"],
          ...summaryRows,
          [],
          ["Raw OCR Text"],
          ["Account", "Type", "Statement Date", "Raw Text"],
          ...rawTextRows,
        ];

        if (!summaryRows.length) {
          aoa.splice(2, 0, ["No bank statements found for this period."]);
        }

        return aoa;
      }

      async function downloadAttachmentBuffer(attachment) {
        const sourceUrl = String(attachment.url || attachment.gsUrl || "").trim();
        const parsed = parsePortalAttachmentSource(sourceUrl) || parsePortalAttachmentSource(attachment.gsUrl || "");
        const objectPath = (parsed && parsed.objectPath) || attachment.fullPath || "";
        const sourceBucket = (parsed && parsed.bucket) || attachment.bucket || "";

        if (objectPath) {
          const bucketCandidates = buildBucketCandidates(sourceBucket);
          for (const bucketName of bucketCandidates) {
            try {
              const [downloaded] = await admin.storage().bucket(bucketName).file(objectPath).download();
              return downloaded;
            } catch (error) {
              // try next candidate
            }
          }
        }

        if (sourceUrl) {
          const response = await fetch(sourceUrl);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const bytes = await response.arrayBuffer();
          return Buffer.from(bytes);
        }

        throw new Error("Attachment source URL is missing");
      }

      let tempZipPath = null;
      try {
        setStage("verify-auth");
        const decodedToken = await verifyAuthenticatedUser(req);
        if (!isAccountantEmail(decodedToken.email)) {
          return res.status(403).json({error: "Only accountant users may export client ZIPs."});
        }

        const payload = req.body || {};
        const targetUserId = String(payload.userId || "").trim();
        if (!targetUserId) {
          return res.status(400).json({error: "Missing target userId."});
        }
        debugState.request.targetUserId = targetUserId;

        const startDate = payload.startDate ? String(payload.startDate) : null;
        const endDate = payload.endDate ? String(payload.endDate) : null;
        debugState.request.startDate = startDate;
        debugState.request.endDate = endDate;

        setStage("query-firestore");
        const [receiptsSnapshot, incomeSnapshot, bankStatementsSnapshot] = await Promise.all([
          admin.firestore().collection("receipts").where("userId", "==", targetUserId).get(),
          admin.firestore().collection("income").where("userId", "==", targetUserId).get(),
          admin.firestore().collection("bankStatements").where("userId", "==", targetUserId).get(),
        ]);

        const receipts = receiptsSnapshot.docs.map((snap) => {
          const data = snap.data() || {};
          const createdDate = data.createdAt && typeof data.createdAt.toDate === "function" ? data.createdAt.toDate() : null;
          return {
            id: snap.id,
            amount: Number(data.amount) || 0,
            vatRate: data.vatRate != null ? Number(data.vatRate) : 0,
            vatAmount: data.vatAmount != null ? Number(data.vatAmount) : null,
            date: data.date ? String(data.date).split("T")[0] : "",
            category: data.category || "Uncategorized",
            attachments: mergeAttachmentSources(data.attachments, data.images),
            loggedAt: createdDate ? createdDate.toISOString() : (data.date || ""),
          };
        });

        const income = incomeSnapshot.docs.map((snap) => {
          const data = snap.data() || {};
          const createdDate = data.createdAt && typeof data.createdAt.toDate === "function" ? data.createdAt.toDate() : null;
          return {
            id: snap.id,
            amount: Number(data.amount) || 0,
            vatAmount: data.vatAmount != null ? Number(data.vatAmount) : 0,
            vatRate: data.vatRate != null ? Number(data.vatRate) : 0,
            date: data.date ? String(data.date).split("T")[0] : "",
            reference: data.reference || "",
            label: data.label || "",
            notes: data.notes || "",
            attachments: normalizeAttachments(data.attachments),
            loggedAt: createdDate ? createdDate.toISOString() : (data.date || ""),
          };
        });

        const bankStatements = bankStatementsSnapshot.docs.map((snap) => {
          const data = snap.data() || {};
          const createdDate = data.createdAt && typeof data.createdAt.toDate === "function" ? data.createdAt.toDate() : null;
          const updatedDate = data.updatedAt && typeof data.updatedAt.toDate === "function" ? data.updatedAt.toDate() : null;
          return {
            id: snap.id,
            accountName: data.accountName || "",
            statementType: data.statementType || "bank",
            statementBalance: data.statementBalance != null ? Number(data.statementBalance) : null,
            statementStartDate: data.statementStartDate ? String(data.statementStartDate).split("T")[0] : "",
            statementEndDate: data.statementEndDate ? String(data.statementEndDate).split("T")[0] : "",
            date: data.date ? String(data.date).split("T")[0] : (data.statementEndDate ? String(data.statementEndDate).split("T")[0] : ""),
            moneyInTotal: Number(data.moneyInTotal) || 0,
            moneyOutTotal: Number(data.moneyOutTotal) || 0,
            netMovement: Number(data.netMovement) || 0,
            notes: data.notes || "",
            rawText: data.rawText || "",
            attachmentsCount: Array.isArray(data.attachments) ? data.attachments.length : 0,
            transactions: Array.isArray(data.transactions) ? data.transactions : [],
            vendorTotals: Array.isArray(data.vendorTotals) ? data.vendorTotals : [],
            categoryTotals: Array.isArray(data.categoryTotals) ? data.categoryTotals : [],
            loggedAt: createdDate ? createdDate.toISOString() : (updatedDate ? updatedDate.toISOString() : (data.date || data.statementEndDate || "")),
            updatedAt: updatedDate ? updatedDate.toISOString() : "",
          };
        });

        const filteredReceipts = filterEntriesByPeriod(receipts, startDate, endDate, (receipt) => receipt.date);
        const filteredIncome = filterEntriesByPeriod(income, startDate, endDate, (entry) => entry.date);
        const filteredStatements = filterEntriesByPeriod(
          bankStatements,
          startDate,
          endDate,
          (statement) => statement.date || statement.statementEndDate || statement.statementStartDate || statement.loggedAt,
        );

        debugState.counts = {
          receiptsTotal: receipts.length,
          incomeTotal: income.length,
          statementsTotal: bankStatements.length,
          receiptsFiltered: filteredReceipts.length,
          incomeFiltered: filteredIncome.length,
          statementsFiltered: filteredStatements.length,
        };

        const receiptExportItems = buildExportItems(filteredReceipts, "E");
        const incomeExportItems = buildExportItems(filteredIncome, "I");

        setStage("build-workbook");
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(
          workbook,
          XLSX.utils.aoa_to_sheet(sanitizeWorksheetAoa(buildReceiptWorkbookRows(receiptExportItems))),
          "Receipts",
        );
        XLSX.utils.book_append_sheet(
          workbook,
          XLSX.utils.aoa_to_sheet(sanitizeWorksheetAoa(buildIncomeWorkbookRows(incomeExportItems))),
          "Income",
        );
        XLSX.utils.book_append_sheet(
          workbook,
          XLSX.utils.aoa_to_sheet(sanitizeWorksheetAoa(buildBankStatementWorkbookRows(filteredStatements))),
          "Bank Statements",
        );

        const safeName = sanitizeFileSegment(String(payload.userName || targetUserId).toLowerCase(), "client");
        const fileSuffix = startDate && endDate ? `${startDate}-to-${endDate}` : "all-time";
        const baseName = `${safeName}-${fileSuffix}`;
        const workbookFileName = `${baseName}.xlsx`;
        const zipFileName = `${baseName}.zip`;
        debugState.fileNames = {workbookFileName, zipFileName};

        const workbookBuffer = XLSX.write(workbook, {bookType: "xlsx", type: "buffer"});
        debugState.workbookBytes = workbookBuffer.length;

        setStage("create-archive");
        const archive = archiver.create("zip", {
          zlib: {level: 9},
        });

        tempZipPath = path.join(
          os.tmpdir(),
          `client-export-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`,
        );
        const fileOut = fs.createWriteStream(tempZipPath);

        const archiveFinished = new Promise((resolve, reject) => {
          archive.on("error", reject);
          fileOut.on("error", reject);
          fileOut.on("close", resolve);
        });
        archive.pipe(fileOut);

        const imageErrors = [];
        archive.append(workbookBuffer, {name: workbookFileName});

        setStage("append-receipt-images");
        for (const exportItem of receiptExportItems) {
          for (const attachment of exportItem.imageAttachments) {
            try {
              const fileBuffer = await downloadAttachmentBuffer(attachment);
              const ext = inferAttachmentExtension(attachment);
              archive.append(fileBuffer, {name: `images/expenses/${sanitizeFileSegment(exportItem.exportId, "E")}-${attachment.exportAttachmentId.split("-")[1] || "1"}${ext}`});
            } catch (error) {
              imageErrors.push(`expense ${attachment.exportAttachmentId} failed: ${error.message || error}`);
            }
          }
        }

        setStage("append-income-images");
        for (const exportItem of incomeExportItems) {
          for (const attachment of exportItem.imageAttachments) {
            try {
              const fileBuffer = await downloadAttachmentBuffer(attachment);
              const ext = inferAttachmentExtension(attachment);
              archive.append(fileBuffer, {name: `images/income/${sanitizeFileSegment(exportItem.exportId, "I")}-${attachment.exportAttachmentId.split("-")[1] || "1"}${ext}`});
            } catch (error) {
              imageErrors.push(`income ${attachment.exportAttachmentId} failed: ${error.message || error}`);
            }
          }
        }

        if (imageErrors.length) {
          archive.append(imageErrors.join("\n"), {name: "image-download-errors.txt"});
        }

        setStage("finalize-archive");
        await archive.finalize();
        await archiveFinished;

        const zipStats = await fs.promises.stat(tempZipPath);
        debugState.zipBytes = zipStats.size;
        debugState.imageErrors = {
          count: imageErrors.length,
          sample: imageErrors.slice(0, 10),
        };

        const objectName = `portal-exports/${sanitizeFileSegment(targetUserId, "user")}/${Date.now()}-${zipFileName}`;
        const storageBucketName = resolveExportStorageBucketName();
        const bucket = storageBucketName ? admin.storage().bucket(storageBucketName) : admin.storage().bucket();
        debugState.storage = {
          configuredBucket: storageBucketName || null,
          bucketName: bucket.name,
          objectName,
        };

        setStage("upload-zip");
        const exportDownloadToken = randomUUID();
        await bucket.upload(tempZipPath, {
          destination: objectName,
          metadata: {
            contentType: "application/zip",
            cacheControl: "private, max-age=900",
            metadata: {
              firebaseStorageDownloadTokens: exportDownloadToken,
            },
          },
        });

        setStage("sign-download-url");
        let downloadUrl = "";
        let downloadMethod = "signed-url";
        // Always include an authenticated proxy fallback so portal downloads
        // keep working even if signed URL generation/access is flaky.
        let proxyDownload = {
          bucket: bucket.name,
          fullPath: objectName,
          method: "portal-fetch-image",
        };
        try {
          [downloadUrl] = await bucket.file(objectName).getSignedUrl({
            version: "v4",
            action: "read",
            expires: Date.now() + 15 * 60 * 1000,
            responseDisposition: `attachment; filename="${zipFileName}"`,
            responseType: "application/zip",
          });
        } catch (signError) {
          const signDebug = {
            stage: "sign-download-url",
            code: signError && signError.code ? signError.code : null,
            name: signError && signError.name ? signError.name : null,
            message: signError && signError.message ? signError.message : String(signError),
            bucketName: bucket.name,
            objectName,
            hint: "Grant Service Account Token Creator (iam.serviceAccounts.signBlob) to the Cloud Functions runtime service account.",
          };
          debugState.signing = signDebug;

          // Fall back to authenticated proxy download so export still succeeds
          // even when IAM lacks signBlob permission for signed URLs.
          downloadMethod = "token-url";
          setStage("sign-download-url-fallback-token-url");
          downloadUrl = buildFirebaseTokenDownloadUrl(bucket.name, objectName, exportDownloadToken);
        }

        setStage("success");
        res.set("x-export-debug-id", debugId);
        res.set("x-export-stage", debugState.stage);

        return res.status(200).json({
          fileName: zipFileName,
          downloadUrl,
          downloadMethod,
          proxyDownload,
          sizeBytes: zipStats.size,
          receipts: filteredReceipts.length,
          income: filteredIncome.length,
          statements: filteredStatements.length,
          imageErrors: imageErrors.length,
          debugId,
          debug: {
            stage: debugState.stage,
            timingsMs: debugState.timingsMs,
            counts: debugState.counts,
            storage: debugState.storage,
            zipBytes: debugState.zipBytes,
            workbookBytes: debugState.workbookBytes,
            signing: debugState.signing || null,
          },
        });
      } catch (error) {
        const debugPayload = {
          ...debugState,
          stage: debugState.stage,
          failedAt: new Date().toISOString(),
          totalDurationMs: Date.now() - stageStartedAt,
          error: {
            name: error && error.name ? error.name : null,
            code: error && error.code ? error.code : null,
            statusCode: error && error.statusCode ? error.statusCode : null,
            message: error && error.message ? error.message : String(error),
            stackTop: error && error.stack ? String(error.stack).split("\n").slice(0, 8) : [],
            debug: error && error.debug ? error.debug : null,
          },
        };

        console.error("Client ZIP export failed", debugPayload);
        if (res.headersSent) {
          try {
            res.end();
          } catch (_) {
            // ignore secondary response errors
          }
          return;
        }
        const statusCode = error && error.statusCode ? error.statusCode : 500;
        res.set("x-export-debug-id", debugId);
        res.set("x-export-stage", debugState.stage || "failed");
        return res.status(statusCode).json({
          error: statusCode === 401 ? error.message : "Could not build export ZIP.",
          debugId,
          debug: debugPayload,
        });
      } finally {
        if (tempZipPath) {
          fs.promises.unlink(tempZipPath).catch(() => {});
        }
      }
    });
  },
);

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
      if (!userRecord.exists || (userRecord.data() && userRecord.data().verificationStatus !== "verified")) {
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
        provider: results.every((entry) => entry.provider === (results[0] && results[0].provider))
          ? (results[0] && results[0].provider) || null
          : "mixed",
      });
    } catch (error) {
      console.error("Receipt image OCR failed", error);
      const details = error && typeof error.details === "string" ? error.details : "";
      const message = (error && error.message) || details || "Receipt image scan failed. Please try again with another image.";
      const statusCode =
        error && error.statusCode
          ? error.statusCode
          : error && error.code === 7
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

exports.autoAssignVerificationByEmail = onRequest({region: OCR_FUNCTION_REGION, timeoutSeconds: 120}, (req, res) => {
  cors(req, res, async () => {
    if (req.method === "OPTIONS") {
      return res.status(204).send("");
    }

    if (req.method !== "POST") {
      return res.status(405).json({error: "Method Not Allowed"});
    }

    try {
      const decodedToken = await verifyAuthenticatedUser(req);
      const userId = decodedToken.uid;
      if (!userId) {
        return res.status(401).json({error: "Missing user ID in token."});
      }

      const authUser = await admin.auth().getUser(userId);
      const emailLower = normalizeEmail(authUser.email || decodedToken.email || "");

      if (!emailLower) {
        return res.status(400).json({error: "No email address was found for this account."});
      }

      const result = await applyVerificationCodeByEmail({
        userId,
        emailLower,
        markEmailVerified: true,
      });

      return res.status(200).json({
        matched: Boolean(result.matched),
        code: result.code || null,
        reason: result.reason || null,
        emailVerified: true,
      });
    } catch (error) {
      console.error("autoAssignVerificationByEmail failed", error);
      const statusCode = error && error.statusCode ? error.statusCode : 500;
      return res.status(statusCode).json({
        error: statusCode === 401 ? error.message : "Could not auto-assign verification by email.",
      });
    }
  });
});

exports.portalVerifyUserEmail = onRequest({region: OCR_FUNCTION_REGION, timeoutSeconds: 120}, (req, res) => {
  cors(req, res, async () => {
    if (req.method === "OPTIONS") {
      return res.status(204).send("");
    }

    if (req.method !== "POST") {
      return res.status(405).json({error: "Method Not Allowed"});
    }

    try {
      const decodedToken = await verifyAuthenticatedUser(req);
      if (!isAccountantEmail(decodedToken.email)) {
        return res.status(403).json({error: "Only accountant users may verify client emails."});
      }

      const body = req.body || {};
      const requestedUserId = String(body.userId || "").trim();
      const requestedEmail = normalizeEmail(body.email || "");

      if (!requestedUserId && !requestedEmail) {
        return res.status(400).json({error: "Missing target userId or email."});
      }

      let authUser = null;
      if (requestedEmail) {
        try {
          authUser = await admin.auth().getUserByEmail(requestedEmail);
        } catch (_) {
          authUser = null;
        }
      }

      if (!authUser && requestedUserId) {
        authUser = await admin.auth().getUser(requestedUserId);
      }

      if (!authUser) {
        return res.status(404).json({error: "Could not find an Auth user for this client."});
      }

      const targetUserId = authUser.uid;
      const targetEmail = normalizeEmail(authUser.email || requestedEmail);

      await admin.auth().updateUser(targetUserId, {emailVerified: true});

      const nowTs = admin.firestore.FieldValue.serverTimestamp();
      const usersCollection = admin.firestore().collection("users");

      if (targetEmail) {
        const emailMatches = await usersCollection.where("email", "==", targetEmail).limit(200).get();
        const batch = admin.firestore().batch();
        emailMatches.forEach((docSnap) => {
          batch.set(docSnap.ref, {
            emailVerified: true,
            updatedAt: nowTs,
          }, {merge: true});
        });

        // Ensure canonical auth user doc is updated even if absent in the email query.
        batch.set(usersCollection.doc(targetUserId), {
          email: targetEmail,
          emailVerified: true,
          updatedAt: nowTs,
        }, {merge: true});
        await batch.commit();
      } else {
        await usersCollection.doc(targetUserId).set({
          emailVerified: true,
          updatedAt: nowTs,
        }, {merge: true});
      }

      let autoAssigned = null;
      if (targetEmail) {
        try {
          autoAssigned = await applyVerificationCodeByEmail({
            userId: targetUserId,
            emailLower: targetEmail,
            markEmailVerified: true,
          });
        } catch (assignError) {
          console.warn("portalVerifyUserEmail auto-assign skipped", assignError);
        }
      }

      return res.status(200).json({
        ok: true,
        userId: targetUserId,
        email: targetEmail || null,
        codeAssigned: Boolean(autoAssigned && autoAssigned.matched),
        code: autoAssigned && autoAssigned.code ? autoAssigned.code : null,
      });
    } catch (error) {
      console.error("portalVerifyUserEmail failed", error);
      const statusCode = error && error.statusCode ? error.statusCode : 500;
      return res.status(statusCode).json({
        error: statusCode === 401 ? error.message : "Could not verify email for this user.",
      });
    }
  });
});

exports.sendPortalTestNotification = onRequest({region: OCR_FUNCTION_REGION, timeoutSeconds: 60}, (req, res) => {
  cors(req, res, async () => {
    if (req.method === "OPTIONS") {
      return res.status(204).send("");
    }

    if (req.method !== "POST") {
      return res.status(405).json({error: "Method Not Allowed"});
    }

    try {
      const decodedToken = await verifyAuthenticatedUser(req);
      if (!isAccountantEmail(decodedToken.email)) {
        return res.status(403).json({error: "Only authorised accountants can send test notifications."});
      }

      const {userId, userIds, title, body, action = "open-summary"} = req.body || {};
      const requestedUserIds = Array.isArray(userIds) ? userIds : [userId];
      const normalizedUserIds = requestedUserIds
          .map((id) => String(id || "").trim())
          .filter(Boolean);
      const targetUserIds = Array.from(new Set(normalizedUserIds));
      if (targetUserIds.length === 0) {
        return res.status(400).json({error: "Missing userId or userIds."});
      }

      const tokenSnapshots = await Promise.all(targetUserIds.map(async (targetUserId) => {
        return admin.firestore()
            .collection("users")
            .doc(targetUserId)
            .collection("pushTokens")
            .get();
      }));

      const tokenDocs = tokenSnapshots.flatMap((tokenSnap, userIndex) => tokenSnap.docs.map((docSnap) => ({
        id: docSnap.id,
        userId: targetUserIds[userIndex],
        token: String((docSnap.data() || {}).token || ""),
      }))).filter((entry) => isExpoPushToken(entry.token));

      if (tokenDocs.length === 0) {
        return res.status(404).json({error: "No push tokens found for this user. Open the app on their device first and allow notifications."});
      }

      const messages = tokenDocs.map(({token}) => ({
        to: token,
        channelId: "alerts",
        sound: "default",
        priority: "high",
        title: String(title || "Express Accounts test"),
        body: String(body || "This is a test notification from the client portal."),
        data: {type: "portal-notification", action: String(action || "open-summary")},
      }));

      const tickets = await sendExpoPushMessages(messages);
      const batch = admin.firestore().batch();
      tickets.forEach((ticket, index) => {
        if (ticket && ticket.status === "error" && ticket.details && ticket.details.error === "DeviceNotRegistered") {
          batch.delete(admin.firestore()
              .collection("users")
              .doc(tokenDocs[index].userId)
              .collection("pushTokens")
              .doc(tokenDocs[index].id));
        }
      });
      await batch.commit();

      const ticketRefs = tickets.map((ticket, index) => ({
        id: ticket && ticket.id ? ticket.id : null,
        status: ticket && ticket.status ? ticket.status : "unknown",
        message: ticket && ticket.message ? ticket.message : null,
        details: ticket && ticket.details ? ticket.details : null,
        tokenDocId: tokenDocs[index] ? tokenDocs[index].id : null,
        userId: tokenDocs[index] ? tokenDocs[index].userId : null,
      }));

      return res.status(200).json({
        targetedUsers: targetUserIds.length,
        sent: tokenDocs.length,
        tickets,
        ticketRefs,
      });
    } catch (error) {
      console.error("sendPortalTestNotification failed", error);
      const statusCode = error && error.statusCode ? error.statusCode : 500;
      return res.status(statusCode).json({error: statusCode === 401 ? error.message : "Could not send test notification."});
    }
  });
});

exports.checkPortalNotificationReceipts = onRequest({region: OCR_FUNCTION_REGION, timeoutSeconds: 60}, (req, res) => {
  cors(req, res, async () => {
    if (req.method === "OPTIONS") {
      return res.status(204).send("");
    }

    if (req.method !== "POST") {
      return res.status(405).json({error: "Method Not Allowed"});
    }

    try {
      const decodedToken = await verifyAuthenticatedUser(req);
      if (!isAccountantEmail(decodedToken.email)) {
        return res.status(403).json({error: "Only authorised accountants can check notification receipts."});
      }

      const {userId, userIds, tickets} = req.body || {};
      const requestedUserIds = Array.isArray(userIds) ? userIds : [userId];
      const normalizedUserIds = requestedUserIds
          .map((id) => String(id || "").trim())
          .filter(Boolean);
      const targetUserIds = Array.from(new Set(normalizedUserIds));
      if (targetUserIds.length === 0) {
        return res.status(400).json({error: "Missing userId or userIds."});
      }

      const ticketRefs = Array.isArray(tickets) ? tickets : [];
      const ticketIds = ticketRefs.map((ticket) => String(ticket && ticket.id ? ticket.id : "").trim()).filter(Boolean);
      if (ticketIds.length === 0) {
        return res.status(400).json({error: "No Expo ticket ids to check yet."});
      }

      const receipts = await getExpoPushReceipts(ticketIds);
      const tokenDocByTicket = new Map(
          ticketRefs.map((ticket) => [String(ticket && ticket.id ? ticket.id : ""), {
            tokenDocId: String(ticket && ticket.tokenDocId ? ticket.tokenDocId : ""),
            userId: String(ticket && ticket.userId ? ticket.userId : ""),
          }]),
      );

      const batch = admin.firestore().batch();
      Object.entries(receipts).forEach(([ticketId, receipt]) => {
        if (receipt && receipt.status === "error" && receipt.details && receipt.details.error === "DeviceNotRegistered") {
          const tokenRef = tokenDocByTicket.get(ticketId);
          if (tokenRef && targetUserIds.includes(tokenRef.userId) && tokenRef.tokenDocId) {
            batch.delete(admin.firestore()
                .collection("users")
                .doc(tokenRef.userId)
                .collection("pushTokens")
                .doc(tokenRef.tokenDocId));
          }
        }
      });
      await batch.commit();

      return res.status(200).json({receipts});
    } catch (error) {
      console.error("checkPortalNotificationReceipts failed", error);
      const statusCode = error && error.statusCode ? error.statusCode : 500;
      return res.status(statusCode).json({error: statusCode === 401 ? error.message : "Could not check notification receipts."});
    }
  });
});
