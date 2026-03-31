/* eslint-disable max-len, require-jsdoc */
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const nodemailer = require("nodemailer");
const cors = require("cors")({origin: true});
const {DocumentProcessorServiceClient} = require("@google-cloud/documentai").v1;
const {extractBankStatementData} = require("./bankStatementExtractors");

if (!admin.apps.length) {
  admin.initializeApp();
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

function getDocumentAiConfig() {
  return {
    projectId: process.env.GCLOUD_PROJECT || process.env.DOCUMENT_AI_PROJECT_ID || admin.app().options.projectId,
    location: process.env.DOCUMENT_AI_LOCATION || "eu",
    processorId: process.env.DOCUMENT_AI_PROCESSOR_ID || "",
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

exports.extractBankStatementPdf = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method === "OPTIONS") {
      return res.status(204).send("");
    }

    if (req.method !== "POST") {
      return res.status(405).json({error: "Method Not Allowed"});
    }

    try {
      await verifyAuthenticatedUser(req);

      const {pdfBase64, fileName, mimeType = "application/pdf"} = req.body || {};
      if (!pdfBase64 || typeof pdfBase64 !== "string") {
        return res.status(400).json({error: "No PDF content was provided."});
      }

      if (mimeType !== "application/pdf") {
        return res.status(400).json({error: "Only PDF files are supported for this scan."});
      }

      const {projectId, location, processorId} = getDocumentAiConfig();
      if (!projectId || !processorId) {
        return res.status(500).json({
          error: "Document AI is not configured yet. Set DOCUMENT_AI_PROCESSOR_ID and redeploy the functions.",
        });
      }

      const client = new DocumentProcessorServiceClient({
        apiEndpoint: `${location}-documentai.googleapis.com`,
      });

      const name = `projects/${projectId}/locations/${location}/processors/${processorId}`;
      const [result] = await client.processDocument({
        name,
        rawDocument: {
          content: pdfBase64,
          mimeType,
        },
      });

      const document = result && result.document ? result.document : null;
      const documentText = document && document.text ? document.text : "";
      const extracted = extractBankStatementData(documentText);

      return res.status(200).json({
        fileName: fileName || null,
        extracted,
        pageCount: document && Array.isArray(document.pages) ? document.pages.length : 0,
        textLength: documentText.length,
      });
    } catch (error) {
      console.error("PDF OCR failed", error);
      const statusCode = error && error.statusCode ? error.statusCode : 500;
      return res.status(statusCode).json({
        error: statusCode === 401 ? error.message : "PDF scan failed. Check the Document AI setup and try again.",
      });
    }
  });
});
