import { useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { categories_meta } from '../constants/arrays';
import { extractData, reconstructLines } from './extractors';

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
      (fileName && fileName.includes('.') && '.' + fileName.split('.').pop()) ||
      '.jpg';
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
        const b64 = Buffer.from(buf).toString('base64');
        await FileSystem.writeAsStringAsync(dest, b64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        return dest;
      }
    }

    throw new Error('No usable uri/base64 on asset for OCR');
  };

  const openOcrModal = async (uri, { autoScan = true, newSession = false } = {}) => {
    setPreview({ uri });
    setOcrResult(null);
    setAcceptFlags({ amount: false, date: false, reference: false, category: false, vat: false });
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
      const text = reconstructedText || result?.text || '';
      // Prefer block-reconstructed text for extraction, fallback to raw OCR text
      const res = extractData(text);

      const categoryIndex =
        typeof res?.category === 'number' ? res.category : -1;
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
      console.error('❌ OCR error:', e);
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
    if (acceptFlags.reference && ocrResult.reference && typeof setReference === 'function') {
      setReference(ocrResult.reference);
    }
    if (acceptFlags.category && ocrResult.categoryName) {
      setSelectedCategory(ocrResult.categoryName);
      if (!vatRate && typeof ocrResult.categoryIndex === 'number') {
        const catRate = categories_meta[ocrResult.categoryIndex]?.vatRate ?? '';
        if (catRate !== '') {
          const rStr = String(catRate);
          setVatRate(rStr);
          setVatRateItems((prev) => {
            const has = prev.some((it) => it.value === rStr);
            return has
              ? prev
              : [...prev, { label: `${catRate}%`, value: rStr }].sort(
                  (a, b) => Number(a.value) - Number(b.value)
                );
          });
          if (!vatAmountEdited && amount) setVatAmount(computeVat(amount, rStr));
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
