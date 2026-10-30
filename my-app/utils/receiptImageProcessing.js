import * as ImageManipulator from "expo-image-manipulator";
import jpeg from "jpeg-js";
import { Buffer } from "buffer";
import { findDocumentRect, rgbaToGray } from "./documentRect";

const DETECT_WIDTH = 240;
const WORKING_QUALITY = 0.95;
const OUTPUT_QUALITY = 0.9;
const MIN_CONFIDENCE = 0.6;

export const FULL_RECT = { left: 0, top: 0, right: 1, bottom: 1 };

export function isFullRect(rect, epsilon = 0.002) {
  return (
    rect.left <= epsilon && rect.top <= epsilon && rect.right >= 1 - epsilon && rect.bottom >= 1 - epsilon
  );
}

// Rotating the image 90deg clockwise maps a point (x, y) to (1 - y, x).
export function rotateRectCw({ left, top, right, bottom }) {
  return { left: 1 - bottom, top: left, right: 1 - top, bottom: right };
}

export function rotateRectCcw({ left, top, right, bottom }) {
  return { left: top, top: 1 - right, right: bottom, bottom: 1 - left };
}

export function rotatedSize(width, height, rotation) {
  return rotation % 180 === 0 ? { width, height } : { width: height, height: width };
}

// Re-encodes once so EXIF orientation is baked in; every later coordinate refers to this upright copy.
export async function createWorkingCopy(uri) {
  const result = await ImageManipulator.manipulateAsync(uri, [], {
    compress: WORKING_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return { uri: result.uri, width: result.width, height: result.height };
}

export async function detectReceiptRect(workingUri) {
  const small = await ImageManipulator.manipulateAsync(
    workingUri,
    [{ resize: { width: DETECT_WIDTH } }],
    { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  const decoded = jpeg.decode(Buffer.from(small.base64, "base64"), { useTArray: true, formatAsRGBA: true });
  const gray = rgbaToGray(decoded.data, decoded.width, decoded.height);
  const found = findDocumentRect(gray, decoded.width, decoded.height);
  if (!found || found.confidence < MIN_CONFIDENCE) return null;
  return found.rect;
}

// Applies rotation first, then crops in the rotated image's pixel space. Returns an asset shaped like image-picker output.
export async function exportEditedImage(working, { rotation, rect }, fileName) {
  const actions = [];
  if (rotation) actions.push({ rotate: rotation });

  if (!isFullRect(rect)) {
    const size = rotatedSize(working.width, working.height, rotation);
    const originX = Math.round(rect.left * size.width);
    const originY = Math.round(rect.top * size.height);
    actions.push({
      crop: {
        originX,
        originY,
        width: Math.min(size.width - originX, Math.round((rect.right - rect.left) * size.width)),
        height: Math.min(size.height - originY, Math.round((rect.bottom - rect.top) * size.height)),
      },
    });
  }

  const result = await ImageManipulator.manipulateAsync(working.uri, actions, {
    compress: OUTPUT_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  return {
    uri: result.uri,
    width: result.width,
    height: result.height,
    type: "image/jpeg",
    fileName: fileName || `receipt-${Date.now()}.jpg`,
  };
}
