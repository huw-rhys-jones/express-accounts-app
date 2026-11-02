import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import TextRecognition from "@react-native-ml-kit/text-recognition";
import jpeg from "jpeg-js";
import { Buffer } from "buffer";
import { findDocumentRect, rgbaToGray } from "./documentRect";

const DETECT_WIDTH = 240;
const WORKING_QUALITY = 0.95;
const OUTPUT_QUALITY = 0.9;
const MIN_CONFIDENCE = 0.55;

export const FULL_RECT = { left: 0, top: 0, right: 1, bottom: 1 };

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function isFullRect(rect, epsilon = 0.02) {
  if (!rect) return true;
  return (
    rect.left <= epsilon &&
    rect.top <= epsilon &&
    rect.right >= 1 - epsilon &&
    rect.bottom >= 1 - epsilon
  );
}

// Rotating the image 90deg clockwise maps a point (x, y) to (1 - y, x).
export function rotateRectCw({ left, top, right, bottom }) {
  return { left: 1 - bottom, top: left, right: 1 - top, bottom: right };
}

export function rotateRectCcw({ left, top, right, bottom }) {
  return { left: top, top: 1 - right, right: bottom, bottom: 1 - left };
}

export function rotateRectByDegrees(rect, degrees = 0) {
  const normalized = ((Math.round(degrees / 90) * 90) % 360 + 360) % 360;
  const r = rect || FULL_RECT;
  if (normalized === 90) return rotateRectCw(r);
  if (normalized === 180) return rotateRectCw(rotateRectCw(r));
  if (normalized === 270) return rotateRectCcw(r);
  return r;
}

export function rotatedSize(width, height, rotation) {
  return rotation % 180 === 0 ? { width, height } : { width: height, height: width };
}

/**
 * Infers the clockwise rotation (0, 90, 180, or 270) needed to make recognized text upright.
 * Uses ML Kit cornerPoints orientation vectors first, with a receipt reading-order fallback for 180°.
 */
export function detectTextRotationFromBlocks(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) return 0;

  const votes = { 0: 0, 90: 0, 180: 0, 270: 0 };
  const positionedLines = [];

  for (const block of blocks) {
    const lines = Array.isArray(block?.lines) && block.lines.length > 0 ? block.lines : [block];
    for (const line of lines) {
      const text = String(line?.text || "").trim();
      if (!text) continue;

      const pts = line?.cornerPoints || block?.cornerPoints;
      if (Array.isArray(pts) && pts.length === 4 && pts[0] && pts[1]) {
        const dx = Number(pts[1].x) - Number(pts[0].x);
        const dy = Number(pts[1].y) - Number(pts[0].y);
        const len = Math.hypot(dx, dy);
        if (Number.isFinite(len) && len >= 8 && text.length >= 2) {
          const angle = Math.atan2(dy, dx) * (180 / Math.PI);
          const weight = len * Math.min(text.length, 30);
          if (angle >= -45 && angle <= 45) {
            votes[0] += weight;
          } else if (angle > 135 || angle < -135) {
            votes[180] += weight;
          } else if (angle > 45 && angle <= 135) {
            // Text baseline runs top-to-bottom (+y); rotating 270° CW (90° CCW) makes it left-to-right (+x)
            votes[270] += weight;
          } else {
            // Text baseline runs bottom-to-top (-y); rotating 90° CW makes it left-to-right (+x)
            votes[90] += weight;
          }
        }
      }

      const frame = line?.frame || block?.frame;
      let centerY = null;
      if (frame && Number.isFinite(frame.top) && Number.isFinite(frame.height)) {
        centerY = frame.top + frame.height / 2;
      } else if (Array.isArray(pts) && pts.length === 4) {
        const avgY = pts.reduce((acc, p) => acc + Number(p?.y || 0), 0) / 4;
        if (Number.isFinite(avgY)) centerY = avgY;
      }
      if (centerY != null) {
        positionedLines.push({ text, y: centerY });
      }
    }
  }

  const totalWeight = votes[0] + votes[90] + votes[180] + votes[270];
  if (totalWeight > 0) {
    let bestRotation = 0;
    let bestWeight = votes[0];
    for (const rot of [90, 180, 270]) {
      if (votes[rot] > bestWeight) {
        bestWeight = votes[rot];
        bestRotation = rot;
      }
    }
    if (bestRotation !== 0 && bestWeight / totalWeight >= 0.35) {
      return bestRotation;
    }
  }

  // Fallback layout check for upside-down (180°) receipts where cornerPoints may be axis-aligned:
  if (positionedLines.length >= 4) {
    const ys = positionedLines.map((l) => l.y);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanY = maxY - minY;
    if (spanY > 50) {
      const subtotalLine = positionedLines.find((l) => /\bsub\s*-?\s*total\b/i.test(l.text));
      const totalLine = positionedLines.find(
        (l) => /\b(total|amount\s+due|balance\s+due)\b/i.test(l.text) && !/\bsub\s*-?\s*total\b/i.test(l.text)
      );
      const headerLine = positionedLines.find(
        (l) =>
          /\b(vat\s*(no|reg|number)|tel\b|telephone|order(ed)?\s+at|takeaway|welcome)\b/i.test(l.text) ||
          /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i.test(l.text)
      );

      if (subtotalLine && totalLine) {
        const totalRelY = (totalLine.y - minY) / spanY;
        if (subtotalLine.y > totalLine.y + 5 && totalRelY < 0.45) {
          return 180;
        }
      }
      if (totalLine && headerLine) {
        const totalRelY = (totalLine.y - minY) / spanY;
        const headerRelY = (headerLine.y - minY) / spanY;
        if (totalRelY < 0.35 && headerRelY > 0.6) {
          return 180;
        }
      }
    }
  }

  return 0;
}

/**
 * Computes a normalized 0..1 bounding rectangle around the receipt/invoice text column
 * in the unrotated coordinate space, filtering out off-receipt background text (e.g. laptop keys).
 */
export function detectTextCropRect(blocks, width, height, rotation = 0) {
  if (!Array.isArray(blocks) || blocks.length === 0 || !width || !height) return null;

  const rawLines = [];
  for (const block of blocks) {
    const lines = Array.isArray(block?.lines) && block.lines.length > 0 ? block.lines : [block];
    for (const line of lines) {
      const text = String(line?.text || "").trim();
      if (!text) continue;

      const frame = line?.frame || block?.frame;
      const pts = line?.cornerPoints || block?.cornerPoints;
      let leftPx = null;
      let topPx = null;
      let rightPx = null;
      let bottomPx = null;

      if (
        frame &&
        Number.isFinite(frame.left) &&
        Number.isFinite(frame.top) &&
        Number.isFinite(frame.width) &&
        Number.isFinite(frame.height)
      ) {
        leftPx = frame.left;
        topPx = frame.top;
        rightPx = frame.left + frame.width;
        bottomPx = frame.top + frame.height;
      } else if (Array.isArray(pts) && pts.length === 4) {
        const xs = pts.map((p) => Number(p?.x)).filter(Number.isFinite);
        const ys = pts.map((p) => Number(p?.y)).filter(Number.isFinite);
        if (xs.length === 4 && ys.length === 4) {
          leftPx = Math.min(...xs);
          rightPx = Math.max(...xs);
          topPx = Math.min(...ys);
          bottomPx = Math.max(...ys);
        }
      }

      if (leftPx == null || rightPx <= leftPx || bottomPx <= topPx) continue;

      const unrotatedNorm = {
        left: clamp(leftPx / width, 0, 1),
        top: clamp(topPx / height, 0, 1),
        right: clamp(rightPx / width, 0, 1),
        bottom: clamp(bottomPx / height, 0, 1),
      };
      // Map into upright space so "horizontal column" filtering works regardless of 0/90/180/270 orientation
      const upright = rotateRectByDegrees(unrotatedNorm, rotation);
      const isReceiptAnchor =
        text.length >= 6 ||
        /\d+[.,]\d{2}|\b(total|subtotal|vat|tax|date|sale|amount|card|visa|mastercard|auth|receipt|invoice|order|qty|duplicate)\b/i.test(
          text
        );

      rawLines.push({
        text,
        unrotatedNorm,
        upright,
        isReceiptAnchor,
      });
    }
  }

  if (rawLines.length < 2) return null;

  const anchors = rawLines.filter((l) => l.isReceiptAnchor);
  const referenceSet = anchors.length >= 2 ? anchors : rawLines;

  const sortedLefts = referenceSet.map((l) => l.upright.left).sort((a, b) => a - b);
  const sortedRights = referenceSet.map((l) => l.upright.right).sort((a, b) => a - b);
  const sortedTops = referenceSet.map((l) => l.upright.top).sort((a, b) => a - b);
  const sortedBottoms = referenceSet.map((l) => l.upright.bottom).sort((a, b) => a - b);

  const coreLeft = sortedLefts[Math.floor(sortedLefts.length * 0.1)];
  const coreRight = sortedRights[Math.floor((sortedRights.length - 1) * 0.9)];
  const coreTop = sortedTops[Math.floor(sortedTops.length * 0.05)];
  const coreBottom = sortedBottoms[Math.floor((sortedBottoms.length - 1) * 0.95)];

  // Filter out isolated off-column noise (e.g. keyboard keys next to the receipt)
  const kept = rawLines.filter((l) => {
    const u = l.upright;
    const horizOverlap = u.right >= coreLeft - 0.08 && u.left <= coreRight + 0.08;
    const vertOverlap = u.bottom >= coreTop - 0.12 && u.top <= coreBottom + 0.12;
    if (!horizOverlap || !vertOverlap) return false;
    if (l.text.length <= 2 && !l.isReceiptAnchor) {
      return u.left >= coreLeft && u.right <= coreRight;
    }
    return true;
  });

  const finalSet = kept.length >= 2 ? kept : referenceSet;
  const minX = Math.min(...finalSet.map((l) => l.upright.left));
  const maxX = Math.max(...finalSet.map((l) => l.upright.right));
  const minY = Math.min(...finalSet.map((l) => l.upright.top));
  const maxY = Math.max(...finalSet.map((l) => l.upright.bottom));

  const spanX = Math.max(0.1, maxX - minX);
  const spanY = Math.max(0.1, maxY - minY);
  const padX = Math.max(0.035, spanX * 0.08);
  const padY = Math.max(0.04, spanY * 0.07);

  const uprightCrop = {
    left: clamp(minX - padX, 0, 1),
    top: clamp(minY - padY, 0, 1),
    right: clamp(maxX + padX, 0, 1),
    bottom: clamp(maxY + padY, 0, 1),
  };

  // Convert back to unrotated coordinate space so callers that rotate after have a consistent contract,
  // and also return uprightCrop directly.
  const inverseRotation = (360 - (rotation % 360)) % 360;
  return {
    unrotatedRect: rotateRectByDegrees(uprightCrop, inverseRotation),
    uprightRect: uprightCrop,
    rawUprightTextBounds: { left: minX, top: minY, right: maxX, bottom: maxY },
  };
}

export async function detectReceiptOrientation(workingUri) {
  try {
    const result = await TextRecognition.recognize(workingUri);
    return detectTextRotationFromBlocks(result?.blocks || []);
  } catch (error) {
    console.warn("Receipt orientation detection failed", error);
    return 0;
  }
}

// Re-encodes once so EXIF orientation is baked in; every later coordinate refers to this upright copy.
export async function createWorkingCopy(uri) {
  let localUri = uri;
  if (typeof uri === "string" && (uri.startsWith("http://") || uri.startsWith("https://"))) {
    try {
      const ext = uri.toLowerCase().includes(".png") ? ".png" : ".jpg";
      const tempPath = `${FileSystem.cacheDirectory}remote-edit-${Date.now()}${ext}`;
      const downloaded = await FileSystem.downloadAsync(uri, tempPath);
      localUri = downloaded.uri;
    } catch (err) {
      console.warn("Could not cache remote image, attempting direct manipulation", err);
    }
  }

  const result = await ImageManipulator.manipulateAsync(localUri, [], {
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

/**
 * Combined detection of rotation (0/90/180/270) and crop rectangle (in rotated/upright coordinates).
 * Uses both ML Kit text column bounds and pixel brightness edge detection so receipts on cluttered
 * backgrounds (like laptop keyboards or bright tables) are still cropped tightly around the receipt.
 */
export async function detectReceiptAdjustments(working) {
  const [docRectUnrotated, mlKitResult] = await Promise.all([
    detectReceiptRect(working.uri).catch(() => null),
    TextRecognition.recognize(working.uri).catch(() => null),
  ]);

  const blocks = mlKitResult?.blocks || [];
  const rotation = detectTextRotationFromBlocks(blocks);
  const docRectUpright = docRectUnrotated ? rotateRectByDegrees(docRectUnrotated, rotation) : null;
  const textCrop = detectTextCropRect(blocks, working.width, working.height, rotation);

  if (textCrop) {
    const tRect = textCrop.uprightRect;
    const rawText = textCrop.rawUprightTextBounds;
    if (docRectUpright) {
      // Allow pixel-detected paper edges to refine text-based crop only when close to the text bounds
      const pickEdge = (docVal, textVal, rawBound, isMin) => {
        const enclosesText = isMin ? docVal <= rawBound : docVal >= rawBound;
        const closeToText = Math.abs(docVal - textVal) <= 0.08;
        return enclosesText && closeToText ? docVal : textVal;
      };
      return {
        rotation,
        rect: {
          left: pickEdge(docRectUpright.left, tRect.left, rawText.left, true),
          top: pickEdge(docRectUpright.top, tRect.top, rawText.top, true),
          right: pickEdge(docRectUpright.right, tRect.right, rawText.right, false),
          bottom: pickEdge(docRectUpright.bottom, tRect.bottom, rawText.bottom, false),
        },
      };
    }
    return { rotation, rect: tRect };
  }

  return {
    rotation,
    rect: docRectUpright || FULL_RECT,
  };
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

function buildAdjustmentMessage(label, { didRotate, didCrop }) {
  if (didRotate && didCrop) return `${label} auto-rotated & cropped`;
  if (didRotate) return `${label} auto-rotated`;
  if (didCrop) return `${label} auto-cropped`;
  return null;
}

/**
 * Automatically inspects an asset, normalizes orientation, and applies document rotation/cropping if detected.
 * Returns { asset, adjusted, didRotate, didCrop, message }
 */
export async function autoAdjustImage(rawAsset, { kind = "receipt" } = {}) {
  const asset = typeof rawAsset === "string" ? { uri: rawAsset } : { ...rawAsset };
  if (!asset?.uri) return { asset, adjusted: false, didRotate: false, didCrop: false, message: null };

  try {
    const working = await createWorkingCopy(asset.uri);
    const { rotation, rect } = await detectReceiptAdjustments(working);

    const didRotate = rotation !== 0;
    const didCrop = Boolean(rect && !isFullRect(rect));

    if (didRotate || didCrop) {
      const exported = await exportEditedImage(
        working,
        { rotation, rect },
        asset.fileName || `auto-${Date.now()}.jpg`
      );
      const label = kind === "income" ? "Invoice" : "Receipt";
      const message = buildAdjustmentMessage(label, { didRotate, didCrop });
      return {
        asset: {
          ...asset,
          uri: exported.uri,
          originalUri: asset.originalUri || asset.uri,
          width: exported.width,
          height: exported.height,
          autoRect: rect,
          autoRotation: rotation,
          appliedRect: rect,
          appliedRotation: rotation,
        },
        adjusted: true,
        didRotate,
        didCrop,
        message,
      };
    }

    return {
      asset: {
        ...asset,
        originalUri: asset.originalUri || asset.uri,
        width: working.width,
        height: working.height,
        autoRect: FULL_RECT,
        autoRotation: 0,
        appliedRect: FULL_RECT,
        appliedRotation: 0,
      },
      adjusted: false,
      didRotate: false,
      didCrop: false,
      message: null,
    };
  } catch (error) {
    console.warn("Auto-adjust failed, using original asset", error);
    return {
      asset: {
        ...asset,
        originalUri: asset.originalUri || asset.uri,
      },
      adjusted: false,
      didRotate: false,
      didCrop: false,
      message: null,
    };
  }
}

/**
 * Runs autoAdjustImage over an array of assets.
 * Returns { assets, anyAdjusted, message }
 */
export async function autoAdjustImages(assets, { kind = "receipt" } = {}) {
  if (!Array.isArray(assets) || assets.length === 0) {
    return { assets: [], anyAdjusted: false, message: null };
  }

  const adjustedList = [];
  let anyRotated = false;
  let anyCropped = false;

  for (const asset of assets) {
    const res = await autoAdjustImage(asset, { kind });
    adjustedList.push(res.asset);
    if (res.didRotate) anyRotated = true;
    if (res.didCrop) anyCropped = true;
  }

  const anyAdjusted = anyRotated || anyCropped;
  const label = kind === "income" ? "Invoice" : "Receipt";
  const message = anyAdjusted
    ? buildAdjustmentMessage(label, { didRotate: anyRotated, didCrop: anyCropped })
    : null;

  return {
    assets: adjustedList,
    anyAdjusted,
    message,
  };
}
