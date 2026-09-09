import { useState } from "react";
import * as FileSystem from "expo-file-system/legacy";
import TextRecognition from "@react-native-ml-kit/text-recognition";
import { categories_meta } from "../constants/arrays";
import { extractReceiptImagesInCloud } from "./cloudReceiptOcr";
import { extractData, reconstructLines } from "./extractors";
import { auth, db } from "../firebaseConfig";
import { doc, getDoc } from "firebase/firestore";

// ─── Standalone OCR helpers (no hook state) ──────────────────────────────────

export async function ensureFileFromAssetStandalone(asset) {
  const { base64, fileName, uri } = asset || {};
  const ext =
    (fileName && fileName.includes(".") && "." + fileName.split(".").pop()) ||
    ".jpg";
  const dest =
    FileSystem.cacheDirectory +
    `ocr-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;

  if (base64) {
    await FileSystem.writeAsStringAsync(dest, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return dest;
  }

  if (uri) {
    try {
      if (/^(file|content):\/\//i.test(uri)) {
        await FileSystem.copyAsync({ from: uri, to: dest });
        return dest;
      }
      if (/^https?:\/\//i.test(uri)) {
        const { uri: localUri } = await FileSystem.downloadAsync(uri, dest);
        return localUri;
      }
    } catch {
      const res = await fetch(uri);
      const blob = await res.blob();
      const buf = await blob.arrayBuffer();
      const b64 = Buffer.from(buf).toString("base64");
      await FileSystem.writeAsStringAsync(dest, b64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return dest;
    }
  }

  throw new Error("No usable uri/base64 on asset for OCR");
}

export async function extractRawTextFromFile(fileUri) {
  const result = await TextRecognition.recognize(fileUri);
  return reconstructLines(result?.blocks || []) || result?.text || "";
}

/**
 * Search ML Kit blocks for lines whose text contains each extracted value.
 * Returns a map of field → frame ({ top, left, width, height } in image pixels).
 */
function findFramesForValues(blocks, structured, imageUri, imageW, imageH) {
  if (!blocks || !blocks.length || !structured) {
    console.log('[Annotation] findFramesForValues: no blocks or structured data', { blocksLen: blocks?.length, structured });
    return null;
  }

  const allLines = [];
  blocks.forEach((block) => {
    (block.lines || []).forEach((line) => {
      if (line.frame && line.text) {
        allLines.push({ text: line.text, frame: line.frame });
      }
    });
  });
  if (!allLines.length) {
    console.log('[Annotation] findFramesForValues: no lines with frames found');
    return null;
  }

  console.log('[Annotation] ML Kit lines (' + allLines.length + '):', allLines.map(l => l.text));
  console.log('[Annotation] Looking for — amount:', structured.amount, ' date:', structured.date, ' vat:', structured.vat?.value);
  console.log('[Annotation] asset pixel dimensions:', imageW, 'x', imageH);

  const frames = { imageUri };
  if (imageW > 0 && imageH > 0) {
    frames.imageW = imageW;
    frames.imageH = imageH;
  }

  // Amount — search for the numeric value string (e.g. "14.35")
  if (structured.amount != null) {
    const valStr = Number(structured.amount).toFixed(2);
    const re = new RegExp(valStr.replace('.', '\.'));
    console.log('[Annotation] Amount search string:', valStr);
    for (const line of allLines) {
      const stripped = line.text.replace(/[\s£$€]/g, '');
      const matched = re.test(stripped);
      if (matched) {
        console.log('[Annotation] Amount matched line:', line.text, '→ frame:', JSON.stringify(line.frame));
        frames.amount = line.frame;
        break;
      }
    }
    if (!frames.amount) console.log('[Annotation] Amount NOT matched');
  }

  // Date — match common dd/mm/yyyy variants
  if (structured.date) {
    const parts = structured.date.split('-'); // [yyyy, mm, dd]
    if (parts.length === 3) {
      const [year, month, day] = parts;
      const shortYear = year.slice(2);
      const patterns = [
        `${day}/${month}/${year}`,
        `${day}/${month}/${shortYear}`,
        `${day}-${month}-${year}`,
        `${day}.${month}.${year}`,
        `${day}.${month}.${shortYear}`,
        `${year}-${month}-${day}`,
      ];
      console.log('[Annotation] Date patterns:', patterns);
      for (const line of allLines) {
        if (patterns.some((p) => line.text.includes(p))) {
          console.log('[Annotation] Date matched line:', line.text, '→ frame:', JSON.stringify(line.frame));
          frames.date = line.frame;
          break;
        }
      }
      if (!frames.date) console.log('[Annotation] Date NOT matched');
    }
  }

  // VAT — prefer VAT-context lines, fall back to any line with the value
  if (structured.vat?.value != null) {
    const vatStr = Number(structured.vat.value).toFixed(2);
    const vatRe = new RegExp(vatStr.replace('.', '\.'));
    for (const line of allLines) {
      if (/\bVAT\b|\bTAX\b/i.test(line.text) && vatRe.test(line.text.replace(/[\s£$€]/g, ''))) {
        console.log('[Annotation] VAT matched line:', line.text, '→ frame:', JSON.stringify(line.frame));
        frames.vat = line.frame;
        break;
      }
    }
    if (!frames.vat) {
      for (const line of allLines) {
        if (vatRe.test(line.text.replace(/[\s£$€]/g, ''))) {
          console.log('[Annotation] VAT (fallback) matched line:', line.text, '→ frame:', JSON.stringify(line.frame));
          frames.vat = line.frame;
          break;
        }
      }
    }
    if (!frames.vat) console.log('[Annotation] VAT NOT matched');
  }

  const result = Object.keys(frames).length > 1 ? frames : null;
  console.log('[Annotation] findFramesForValues result:', JSON.stringify(result));
  return result;
}

function toStructuredOcrResult(res, raw) {
  const categoryIndex = typeof res?.category === "number" ? res.category : -1;
  const categoryName =
    categoryIndex >= 0 && categories_meta[categoryIndex]
      ? categories_meta[categoryIndex].name
      : null;

  return {
    amount: res?.money?.value ?? null,
    date: res?.date ?? null,
    reference: res?.reference ?? null,
    vat: res?.vat ?? null,
    cis: res?.cis ?? { applies: false, materialsAmount: 0, deductionRate: 0, taxWithheld: 0 },
    categoryIndex,
    categoryName,
    raw: raw || "",
  };
}

function normalizeComparable(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getAnalysisScore(result) {
  if (!result) return 0;
  let score = 0;
  if (result.amount != null) score += 2;
  if (result.date) score += 2;
  if (result.categoryName) score += 1;
  if (result.vat?.value != null) score += 1;
  if (result.reference) score += 1.5;
  score += Math.min((result.raw || "").length, 200) / 200;
  return score;
}

function isWeakAnalysis(result) {
  return (
    result?.amount == null &&
    !result?.date &&
    !result?.categoryName &&
    !result?.reference
  );
}

function shouldMergeAnalyses(previous, next) {
  if (!previous || !next) return false;

  const previousReference = normalizeComparable(previous.reference);
  const nextReference = normalizeComparable(next.reference);
  if (
    previousReference &&
    nextReference &&
    previousReference === nextReference
  ) {
    return true;
  }

  if (
    previous.date &&
    next.date &&
    previous.date === next.date &&
    previous.amount != null &&
    next.amount != null &&
    Math.abs(Number(previous.amount) - Number(next.amount)) <= 0.01
  ) {
    return true;
  }

  if (
    previous.date &&
    next.date &&
    previous.date === next.date &&
    previous.categoryName &&
    next.categoryName &&
    previous.categoryName === next.categoryName
  ) {
    return true;
  }

  // Similar amounts (within 5% or 50p) likely means two photos of the same receipt
  if (previous.amount != null && next.amount != null) {
    const prevAmt = Number(previous.amount);
    const nextAmt = Number(next.amount);
    if (isFinite(prevAmt) && isFinite(nextAmt) && prevAmt > 0 && nextAmt > 0) {
      const diff = Math.abs(prevAmt - nextAmt);
      const threshold = Math.max(prevAmt * 0.05, 0.5);
      if (diff <= threshold) return true;
    }
  }

  if (isWeakAnalysis(previous) || isWeakAnalysis(next)) {
    return true;
  }

  return false;
}

function mergeStructuredResults(primary, fallback) {
  if (!fallback) return primary;
  if (!primary) return fallback;

  return {
    amount: primary.amount ?? fallback.amount ?? null,
    date: primary.date || fallback.date || null,
    reference: primary.reference || fallback.reference || null,
    vat: {
      value: primary.vat?.value ?? fallback.vat?.value ?? null,
      rate: primary.vat?.rate ?? fallback.vat?.rate ?? null,
    },
    cis: primary.cis?.applies ? primary.cis : fallback.cis,
    categoryIndex:
      primary.categoryIndex != null && primary.categoryIndex >= 0
        ? primary.categoryIndex
        : (fallback.categoryIndex ?? -1),
    categoryName: primary.categoryName || fallback.categoryName || null,
    raw: primary.raw || fallback.raw || "",
    ocrSource: primary.ocrSource || fallback.ocrSource || null,
    ocrProvider: primary.ocrProvider || fallback.ocrProvider || null,
    ocrFrames: primary.ocrFrames || fallback.ocrFrames || null,
  };
}

async function analyzeAsset(asset) {
  const filePath = await ensureFileFromAssetStandalone(asset);
  // Use ML Kit directly so we can also capture block frames for annotation
  const mlKitResult = await TextRecognition.recognize(filePath);
  const blocks = mlKitResult?.blocks || [];
  const raw = reconstructLines(blocks) || mlKitResult?.text || "";
  const extracted = extractData(raw);
  const structured = toStructuredOcrResult(extracted, raw);
  const ocrFrames = findFramesForValues(blocks, structured, asset.uri, asset.width, asset.height);
  return {
    asset,
    ...structured,
    ocrFrames: ocrFrames || null,
  };
}

async function isUserVerified() {
  try {
    const user = auth.currentUser;
    if (!user) return false;
    const snap = await getDoc(doc(db, "users", user.uid));
    return snap.exists() && snap.data()?.verificationStatus === "verified";
  } catch {
    return false;
  }
}

async function analyzeAssetsCloudFirst(assets, onProgress, options = {}) {
  const n = assets.length || 1;
  const { preferLocal = false } = options;
  const verified = await isUserVerified();
  if (verified && !preferLocal) {
    try {
      const response = await extractReceiptImagesInCloud(assets);
      const cloudImages = Array.isArray(response?.images) ? response.images : [];
      const responseProvider = response?.provider || cloudImages[0]?.provider || "cloud";

      if (cloudImages.length === assets.length) {
        console.log("Receipt OCR source: cloud (%s)", responseProvider);
        onProgress?.(0.3); // cloud batch complete

        // Build structured results from cloud text
        const cloudResults = cloudImages.map((entry, index) => {
          const raw = typeof entry?.rawText === "string" ? entry.rawText : "";
          return {
            asset: assets[index],
            ocrSource: "cloud",
            ocrProvider: entry?.provider || responseProvider,
            ...toStructuredOcrResult(extractData(raw), raw),
          };
        });

        // Run ML Kit locally in parallel — only to get block positions for annotation.
        // The extracted values from cloud are still used; local blocks just tell us
        // *where* those values appear in the image.
        let mlkitDone = 0;
        const framesArray = await Promise.all(
          assets.map(async (asset, index) => {
            try {
              const mlKitResult = await TextRecognition.recognize(asset.uri);
              const blocks = mlKitResult?.blocks || [];
              const result = findFramesForValues(blocks, cloudResults[index], asset.uri, asset.width, asset.height);
              mlkitDone++;
              onProgress?.(0.3 + (mlkitDone / n) * 0.7);
              return result;
            } catch {
              mlkitDone++;
              onProgress?.(0.3 + (mlkitDone / n) * 0.7);
              return null;
            }
          }),
        );

        return cloudResults.map((result, index) => ({
          ...result,
          ocrFrames: framesArray[index] || null,
        }));
      }
    } catch (error) {
      console.warn("Cloud receipt OCR unavailable, falling back to on-device OCR.", error);
    }
  } else if (!verified) {
    console.log("Receipt OCR source: local (ml-kit) — user not verified");
  } else if (preferLocal) {
    console.log("Receipt OCR source: local (ml-kit) — forced by user");
  }

  console.log("Receipt OCR source: local (ml-kit)");
  let localDone = 0;
  return Promise.all(
    (assets || []).map(async (asset) => {
      const analysis = await analyzeAsset(asset);
      localDone++;
      onProgress?.(localDone / n);
      return {
        ...analysis,
        ocrSource: "local",
        ocrProvider: "ml-kit",
      };
    }),
  );
}

/**
 * Run OCR on multiple image assets in parallel, combine all extracted text
 * into one block, then run data extraction once on the combined text.
 * Returns a structured result object (same shape as ocrResult in the hook).
 */
export async function runOcrOnAssets(assets, options = {}) {
  const analyses = await analyzeAssetsCloudFirst(assets || [], undefined, options);
  const combined = analyses.map((entry) => entry.raw).filter(Boolean).join("\n\n");
  const structured = toStructuredOcrResult(extractData(combined), combined);
  if (analyses.length === 1) {
    return mergeStructuredResults(structured, analyses[0]);
  }
  return {
    ...structured,
    ocrSource: analyses.some((entry) => entry.ocrSource === "cloud") ? "cloud" : "local",
    ocrProvider: analyses.find((entry) => entry.ocrProvider)?.ocrProvider || null,
  };
}

export async function detectReceiptGroupsFromAssets(assets, onProgress, options = {}) {
  const analyses = await analyzeAssetsCloudFirst(assets || [], onProgress, options);
  if (!analyses.length) return [];

  const groups = [];

  for (const analysis of analyses) {
    const previousGroup = groups[groups.length - 1];
    const previousBest = previousGroup?.bestAnalysis || null;

    if (previousGroup && shouldMergeAnalyses(previousBest, analysis)) {
      previousGroup.assets.push(analysis.asset);
      previousGroup.individualAnalyses.push(analysis);
      if (
        getAnalysisScore(analysis) >
        getAnalysisScore(previousGroup.bestAnalysis)
      ) {
        previousGroup.bestAnalysis = analysis;
      }
      continue;
    }

    groups.push({
      assets: [analysis.asset],
      individualAnalyses: [analysis],
      bestAnalysis: analysis,
    });
  }

  return groups.map((group, index) => {
    const combinedRaw = group.individualAnalyses
      .map((entry) => entry.raw)
      .filter(Boolean)
      .join("\n\n");
    const combinedAnalysis = toStructuredOcrResult(
      extractData(combinedRaw),
      combinedRaw,
    );

    return {
      id: `receipt-${index + 1}`,
      assets: group.assets,
      analysis: mergeStructuredResults(combinedAnalysis, group.bestAnalysis),
      individualAnalyses: group.individualAnalyses,
      ocrFrames: group.bestAnalysis?.ocrFrames || null,
    };
  });
}

/**
 * Hook that encapsulates OCR modal state and helper functions used by both
 * ReceiptAdd and ReceiptEdit screens.
 *
 * The caller must supply a `computeVat` helper which mirrors logic used in the
 * screen (justify by keeping vat calculation close to the UI and easily
 * testable).  When accepting values the hook will call that function if it
 * needs to recalc the vat amount.
 */
export function useReceiptOcr({ computeVat }) {
  const [preview, setPreview] = useState(null);
  const [ocrResult, setOcrResult] = useState(null);
  const [acceptFlags, setAcceptFlags] = useState({
    amount: false,
    date: false,
    reference: false,
    category: false,
    vat: false,
  });
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrModalVisible, setOcrModalVisible] = useState(false);
  const [isNewImageSession, setIsNewImageSession] = useState(false);

  const ensureFileFromAsset = async (asset) => {
    const { base64, fileName, uri } = asset || {};
    const ext =
      (fileName && fileName.includes(".") && "." + fileName.split(".").pop()) ||
      ".jpg";
    const dest = FileSystem.cacheDirectory + `ocr-${Date.now()}${ext}`;

    if (base64) {
      await FileSystem.writeAsStringAsync(dest, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return dest;
    }

    if (uri) {
      try {
        if (/^(file|content):\/\//i.test(uri)) {
          await FileSystem.copyAsync({ from: uri, to: dest });
          return dest;
        }
        if (/^https?:\/\//i.test(uri)) {
          const { uri: localUri } = await FileSystem.downloadAsync(uri, dest);
          return localUri;
        }
      } catch (e) {
        const res = await fetch(uri);
        const blob = await res.blob();
        const buf = await blob.arrayBuffer();
        const b64 = Buffer.from(buf).toString("base64");
        await FileSystem.writeAsStringAsync(dest, b64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        return dest;
      }
    }

    throw new Error("No usable uri/base64 on asset for OCR");
  };

  const openOcrModal = async (
    uri,
    { autoScan = true, newSession = false } = {},
  ) => {
    setPreview({ uri });
    setOcrResult(null);
    setAcceptFlags({
      amount: false,
      date: false,
      reference: false,
      category: false,
      vat: false,
    });
    setIsNewImageSession(!!newSession);
    setOcrModalVisible(true);

    if (autoScan) {
      await runOcr(uri);
    }
  };

  const runOcr = async (uriOrLocal) => {
    try {
      setOcrLoading(true);
      let localUri = uriOrLocal;
      if (!/^(file|content):\/\//i.test(uriOrLocal)) {
        const dest = FileSystem.cacheDirectory + `ocr-${Date.now()}.jpg`;
        try {
          await FileSystem.copyAsync({ from: uriOrLocal, to: dest });
          localUri = dest;
        } catch {
          const { uri: dl } = await FileSystem.downloadAsync(uriOrLocal, dest);
          localUri = dl;
        }
      }
      const result = await TextRecognition.recognize(localUri);
      const reconstructedText = reconstructLines(result?.blocks || []);
      const text = reconstructedText || result?.text || "";
      // Prefer block-reconstructed text for extraction, fallback to raw OCR text
      const res = extractData(text);

      const categoryIndex =
        typeof res?.category === "number" ? res.category : -1;
      const categoryName =
        categoryIndex >= 0 && categories_meta[categoryIndex]
          ? categories_meta[categoryIndex].name
          : null;

      setOcrResult({
        amount: res?.money?.value ?? null,
        date: res?.date ?? null,
        reference: res?.reference ?? null,
        vat: res?.vat ?? null,
        categoryIndex,
        categoryName,
        raw: text,
      });
      setAcceptFlags({
        amount: !!res?.money?.value,
        date: !!res?.date,
        reference: !!res?.reference,
        category: categoryIndex >= 0,
        vat: !!res?.vat?.value || !!res?.vat?.rate,
      });
    } catch (e) {
      console.error("❌ OCR error:", e);
      setOcrResult(null);
    } finally {
      setOcrLoading(false);
    }
  };

  const toggleAccept = (key) =>
    setAcceptFlags((prev) => ({ ...prev, [key]: !prev[key] }));

  const applyAcceptedValues = ({
    setAmount,
    setVatAmount,
    setVatRate,
    setSelectedDate,
    setReference,
    setSelectedCategory,
    vatAmountEdited,
    amount,
    vatRate,
    setVatRateItems,
  }) => {
    if (!ocrResult) return;
    if (acceptFlags.amount && ocrResult.amount != null) {
      setAmount(String(ocrResult.amount));
      if (!vatAmountEdited && vatRate)
        setVatAmount(computeVat(String(ocrResult.amount), vatRate));
    }
    if (acceptFlags.date && ocrResult.date) {
      const d = new Date(ocrResult.date);
      if (!isNaN(d.getTime())) setSelectedDate(d);
    }
    if (
      acceptFlags.reference &&
      ocrResult.reference &&
      typeof setReference === "function"
    ) {
      setReference(ocrResult.reference);
    }
    if (acceptFlags.category && ocrResult.categoryName) {
      setSelectedCategory(ocrResult.categoryName);
      if (!vatRate && typeof ocrResult.categoryIndex === "number") {
        const catRate = categories_meta[ocrResult.categoryIndex]?.vatRate ?? "";
        if (catRate !== "") {
          const rStr = String(catRate);
          setVatRate(rStr);
          setVatRateItems((prev) => {
            const has = prev.some((it) => it.value === rStr);
            return has
              ? prev
              : [...prev, { label: `${catRate}%`, value: rStr }].sort(
                  (a, b) => Number(a.value) - Number(b.value),
                );
          });
          if (!vatAmountEdited && amount)
            setVatAmount(computeVat(amount, rStr));
        }
      }
    }
    if (acceptFlags.vat) {
      if (ocrResult.vat?.value != null)
        setVatAmount(String(ocrResult.vat.value));
      if (ocrResult.vat?.rate != null) setVatRate(String(ocrResult.vat.rate));
    }
    setOcrModalVisible(false);
  };

  const deleteCurrentImage = (setImages) => {
    if (!preview?.uri) return;
    setImages((prev) => prev.filter((img) => img.uri !== preview.uri));
    setOcrModalVisible(false);
  };

  const handleCancelModal = (setImages) => {
    if (isNewImageSession && preview?.uri) {
      setImages((prev) => prev.filter((img) => img.uri !== preview.uri));
    }
    setOcrModalVisible(false);
  };

  const handleImagePicked = async (response, setImages) => {
    try {
      if (response?.didCancel || !response?.assets?.length) return;

      const first = response.assets[0];
      const filePath = await ensureFileFromAsset(first);

      const newImages = response.assets.map((asset, idx) => ({
        uri: idx === 0 ? filePath : asset.uri,
      }));
      setImages((prev) => [...prev, ...newImages]);

      await openOcrModal(filePath, { autoScan: true, newSession: true });
    } catch (e) {
      console.error("❌ OCR error:", e);
    }
  };

  return {
    preview,
    ocrResult,
    acceptFlags,
    ocrLoading,
    ocrModalVisible,
    isNewImageSession,
    ensureFileFromAsset,
    openOcrModal,
    runOcr,
    toggleAccept,
    applyAcceptedValues,
    deleteCurrentImage,
    handleCancelModal,
    handleImagePicked,
    // expose setters in case caller needs them
    setOcrResult,
    setAcceptFlags,
    setPreview,
    setOcrModalVisible,
    setIsNewImageSession,
  };
}
