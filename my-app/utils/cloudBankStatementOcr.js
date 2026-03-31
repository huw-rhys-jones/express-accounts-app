import * as FileSystem from "expo-file-system/legacy";
import Constants from "expo-constants";
import { auth, firebaseConfig } from "../firebaseConfig";

const MAX_INLINE_PDF_BYTES = 6 * 1024 * 1024;

function getCloudOcrUrl() {
  const configuredUrl = Constants.expoConfig?.extra?.BANK_PDF_OCR_URL;
  if (configuredUrl) {
    return configuredUrl;
  }

  const projectId = firebaseConfig?.projectId;
  if (!projectId) {
    return null;
  }

  return `https://${projectId}.web.app/extract-bank-statement-pdf`;
}

export async function extractBankStatementPdfInCloud({ uri, fileName }) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Please sign in again before scanning this PDF.");
  }

  const requestUrl = getCloudOcrUrl();
  if (!requestUrl) {
    throw new Error("Cloud OCR is not configured for this app build.");
  }

  const fileInfo = await FileSystem.getInfoAsync(uri, { size: true });
  if (!fileInfo?.exists) {
    throw new Error("The selected PDF could not be read from this device.");
  }

  if (typeof fileInfo.size === "number" && fileInfo.size > MAX_INLINE_PDF_BYTES) {
    throw new Error("This PDF is too large for live scanning. Please export a smaller statement PDF and try again.");
  }

  const pdfBase64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const idToken = await user.getIdToken();
  const response = await fetch(requestUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      pdfBase64,
      fileName: fileName || "statement.pdf",
    }),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.error || "Cloud OCR could not scan this PDF.");
  }

  return payload;
}
