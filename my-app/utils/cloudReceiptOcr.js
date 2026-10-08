import * as FileSystem from "expo-file-system/legacy";
import Constants from "expo-constants";
import { auth, firebaseConfig } from "../firebaseConfig";

const MAX_RECEIPT_IMAGE_BYTES = 8 * 1024 * 1024;
const DEFAULT_RECEIPT_OCR_REGION = "europe-west2";

function getReceiptOcrUrl() {
  const configuredUrl = Constants.expoConfig?.extra?.RECEIPT_IMAGE_OCR_URL;
  if (configuredUrl) {
    return configuredUrl;
  }

  const projectId = firebaseConfig?.projectId;
  if (!projectId) {
    return null;
  }

  return `https://${DEFAULT_RECEIPT_OCR_REGION}-${projectId}.cloudfunctions.net/extractReceiptImages`;
}

function getMimeType(asset) {
  if (typeof asset?.type === "string" && asset.type.startsWith("image/")) {
    return asset.type;
  }

  const fileName = String(asset?.fileName || asset?.uri || "").toLowerCase();
  if (fileName.endsWith(".png")) return "image/png";
  if (fileName.endsWith(".webp")) return "image/webp";
  if (fileName.endsWith(".heic")) return "image/heic";
  if (fileName.endsWith(".heif")) return "image/heif";
  return "image/jpeg";
}

async function getImageBase64(asset) {
  if (asset?.base64) {
    return asset.base64;
  }

  if (!asset?.uri) {
    throw new Error("A receipt image is missing its file path.");
  }

  return FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

export async function extractReceiptImagesInCloud(assets) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Please sign in again before scanning receipt images.");
  }

  const requestUrl = getReceiptOcrUrl();
  if (!requestUrl) {
    throw new Error("Cloud receipt OCR is not configured for this app build.");
  }

  const images = await Promise.all(
    (assets || []).map(async (asset, index) => {
      const imageBase64 = await getImageBase64(asset);
      const byteLength = Math.floor((imageBase64.length * 3) / 4);

      if (byteLength > MAX_RECEIPT_IMAGE_BYTES) {
        const name = asset?.fileName || `receipt-${index + 1}.jpg`;
        throw new Error(`${name} is too large for live cloud scanning.`);
      }

      return {
        imageBase64,
        fileName: asset?.fileName || `receipt-${index + 1}.jpg`,
        mimeType: getMimeType(asset),
        estimatedBytes: byteLength,
      };
    }),
  );

  const totalEstimatedBytes = images.reduce(
    (sum, image) => sum + (image.estimatedBytes || 0),
    0,
  );
  console.log(
    "Cloud receipt OCR request url=%s images=%d bytes=%d",
    requestUrl,
    images.length,
    totalEstimatedBytes,
  );

  const idToken = await user.getIdToken();
  const response = await fetch(requestUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      images: images.map(({ estimatedBytes, ...image }) => image),
    }),
  });

  const rawBody = await response.text();
  let payload = null;
  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const details = rawBody
      ? ` status=${response.status} body=${rawBody.slice(0, 300)}`
      : ` status=${response.status}`;
    throw new Error(
      payload?.error || `Cloud receipt OCR could not scan these images.${details}`,
    );
  }

  return payload;
}