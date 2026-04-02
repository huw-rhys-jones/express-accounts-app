import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import ImageViewer from "react-native-image-zoom-viewer";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { Button, Checkbox } from "react-native-paper";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import * as ImagePicker from "react-native-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import TextRecognition from "@react-native-ml-kit/text-recognition";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { Colors, ReceiptStyles } from "../utils/sharedStyles";
import { formatDate } from "../utils/format_style";
import { reconstructLines } from "../utils/extractors";
import { extractBankStatementData } from "../utils/bankStatementExtractors";
import { extractBankStatementPdfInCloud } from "../utils/cloudBankStatementOcr";
import {
  createDocumentAttachment,
  createImageAttachment,
  deleteStoredAttachments,
  getAttachmentUri,
  isImageAttachment,
  normalizeStoredAttachments,
  uploadAttachmentEntries,
} from "../utils/documentAttachments";

function navigateBackToBankStatements(navigation) {
  navigation.reset({
    index: 0,
    routes: [
      {
        name: "MainTabs",
        state: { routes: [{ name: "BankStatements" }] },
      },
    ],
  });
}

function parseMoneyInput(value) {
  const normalized = String(value || "").replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

export default function BankStatementForm({ navigation, route, mode }) {
  const statement = route?.params?.statement;
  const [accountName, setAccountName] = useState(statement?.accountName || "");
  const [statementType, setStatementType] = useState(statement?.statementType || "bank");
  const [statementStartDate, setStatementStartDate] = useState(
    statement?.statementStartDate ? new Date(statement.statementStartDate) : new Date()
  );
  const [statementEndDate, setStatementEndDate] = useState(
    statement?.statementEndDate ? new Date(statement.statementEndDate) : new Date()
  );
  const [datePickerTarget, setDatePickerTarget] = useState(null);
  const [moneyInTotal, setMoneyInTotal] = useState(
    statement?.moneyInTotal != null ? String(statement.moneyInTotal) : ""
  );
  const [moneyOutTotal, setMoneyOutTotal] = useState(
    statement?.moneyOutTotal != null ? String(statement.moneyOutTotal) : ""
  );
  const [statementBalance, setStatementBalance] = useState(
    statement?.statementBalance != null ? String(statement.statementBalance) : ""
  );
  const [notes, setNotes] = useState(statement?.notes || "");
  const [attachments, setAttachments] = useState(
    normalizeStoredAttachments(statement?.attachments || [])
  );
  const [isSaving, setIsSaving] = useState(false);
  const [showTip, setShowTip] = useState(false);
  const [tipStatusLoaded, setTipStatusLoaded] = useState(false);
  const [attachmentPickerVisible, setAttachmentPickerVisible] = useState(false);
  const [pickerBusy, setPickerBusy] = useState(false);
  const [pickerBusyText, setPickerBusyText] = useState("Opening attachment options…");
  const [fullScreenImage, setFullScreenImage] = useState(null);
  const [returnToOcrAfterFullscreen, setReturnToOcrAfterFullscreen] = useState(false);

  const [ocrModalVisible, setOcrModalVisible] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrPreviewUri, setOcrPreviewUri] = useState(null);
  const [ocrPreviewUris, setOcrPreviewUris] = useState([]);
  const [ocrPreviewIndex, setOcrPreviewIndex] = useState(0);
  const [ocrSessionUris, setOcrSessionUris] = useState([]);
  const [ocrNewImageSession, setOcrNewImageSession] = useState(false);
  const [ocrResult, setOcrResult] = useState(null);
  const [showOcrMore, setShowOcrMore] = useState(false);
  const [showSavedBreakdown, setShowSavedBreakdown] = useState(false);
  const [acceptFlags, setAcceptFlags] = useState({
    accountName: false,
    startDate: false,
    endDate: false,
    moneyInTotal: false,
    moneyOutTotal: false,
    statementBalance: false,
  });

  const existingRemoteAttachments = useMemo(
    () => normalizeStoredAttachments(statement?.attachments || []),
    [statement?.attachments]
  );

  const currentStatementInsights = useMemo(
    () => ({
      rawText: statement?.rawText || "",
      transactions: statement?.transactions || [],
      vendorTotals: statement?.vendorTotals || [],
      categoryTotals: statement?.categoryTotals || [],
      statementType: statement?.statementType || "bank",
      statementBalance: statement?.statementBalance ?? null,
    }),
    [
      statement?.categoryTotals,
      statement?.rawText,
      statement?.statementBalance,
      statement?.statementType,
      statement?.transactions,
      statement?.vendorTotals,
    ]
  );

  const displayInsights = ocrResult || currentStatementInsights;
  const hasDisplayInsights = Boolean(
    displayInsights?.rawText ||
      displayInsights?.transactions?.length ||
      displayInsights?.vendorTotals?.length ||
      displayInsights?.categoryTotals?.length
  );

  useEffect(() => {
    let active = true;
    const loadTipStatus = async () => {
      const user = auth.currentUser;
      if (!user || (statement?.attachments || []).length > 0) {
        if (active) {
          setShowTip(false);
          setTipStatusLoaded(true);
        }
        return;
      }

      try {
        const userSnap = await getDoc(doc(db, "users", user.uid));
        if (active) {
          setShowTip(!userSnap.data()?.hasSeenBankScannerTip);
          setTipStatusLoaded(true);
        }
      } catch {
        if (active) {
          setShowTip(true);
          setTipStatusLoaded(true);
        }
      }
    };

    loadTipStatus();
    return () => {
      active = false;
    };
  }, [statement?.attachments]);

  const dismissTip = async () => {
    setShowTip(false);
    const user = auth.currentUser;
    if (!user) return;
    try {
      await setDoc(doc(db, "users", user.uid), { hasSeenBankScannerTip: true }, { merge: true });
    } catch {
      // non-blocking tooltip persistence
    }
  };

  const beginPickerHold = (text = "Opening attachment options…") => {
    setPickerBusyText(text);
    setPickerBusy(true);
  };

  const endPickerHold = () => {
    setPickerBusy(false);
  };

  const ensureLocalImageUri = async (asset) => {
    if (!asset) throw new Error("No image asset provided");
    const { base64, fileName, uri } = asset;
    const ext =
      (fileName && fileName.includes(".") && `.${fileName.split(".").pop()}`) ||
      ".jpg";
    const dest = `${FileSystem.cacheDirectory}bank-ocr-${Date.now()}${ext}`;

    if (base64) {
      await FileSystem.writeAsStringAsync(dest, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return dest;
    }

    if (uri && /^(file|content):\/\//i.test(uri)) {
      await FileSystem.copyAsync({ from: uri, to: dest });
      return dest;
    }

    if (uri && /^https?:\/\//i.test(uri)) {
      const download = await FileSystem.downloadAsync(uri, dest);
      return download.uri;
    }

    if (uri) return uri;

    throw new Error("No usable image URI for OCR");
  };

  const setAcceptFlagsFromResult = (result) => {
    setAcceptFlags({
      accountName: Boolean(result?.accountName),
      startDate: Boolean(result?.statementStartDate),
      endDate: Boolean(result?.statementIssueDate || result?.statementEndDate),
      moneyInTotal: Number.isFinite(result?.moneyInTotal),
      moneyOutTotal: Number.isFinite(result?.moneyOutTotal),
      statementBalance: Number.isFinite(result?.statementBalance),
    });
  };

  const runBankOcr = async (localUriOrUris) => {
    const uris = (Array.isArray(localUriOrUris) ? localUriOrUris : [localUriOrUris]).filter(Boolean);

    try {
      setOcrLoading(true);
      const allTextParts = [];

      for (const localUri of uris) {
        const result = await TextRecognition.recognize(localUri);
        const reconstructedText = reconstructLines(result?.blocks || []);
        const text = reconstructedText || result?.text || "";
        if (text) {
          allTextParts.push(text);
        }
      }

      const combinedText = allTextParts.join("\n\n");
      console.log("BANK_STATEMENT_IMAGE_OCR_TEXT_START\n%s\nBANK_STATEMENT_IMAGE_OCR_TEXT_END", combinedText);
      const extracted = extractBankStatementData(combinedText);
      setOcrResult(extracted);
      setAcceptFlagsFromResult(extracted);
    } catch (error) {
      console.error("Bank statement OCR failed", error);
      setOcrResult(null);
      setAcceptFlags({
        accountName: false,
        startDate: false,
        endDate: false,
        moneyInTotal: false,
        moneyOutTotal: false,
        statementBalance: false,
      });
      Alert.alert("OCR Failed", "Could not scan this image. Please enter values manually.");
    } finally {
      setOcrLoading(false);
    }
  };

  const openOcrModal = async (uriOrUris, { newSession = false, initialIndex = 0 } = {}) => {
    const uris = (Array.isArray(uriOrUris) ? uriOrUris : [uriOrUris]).filter(Boolean);
    if (!uris.length) {
      return;
    }

    const safeIndex = Math.max(0, Math.min(initialIndex, uris.length - 1));
    setOcrPreviewUris(uris);
    setOcrPreviewIndex(safeIndex);
    setOcrPreviewUri(uris[safeIndex] || null);
    setOcrSessionUris(newSession ? uris : []);
    setOcrNewImageSession(newSession);
    setShowOcrMore(false);
    setOcrResult(null);
    setOcrModalVisible(true);
    await runBankOcr(uris);
  };

  const requestCameraAndLaunch = async () => {
    beginPickerHold("Opening camera…");

    if (Platform.OS === "android") {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        endPickerHold();
        Alert.alert("Permission Denied", "Camera access is required.");
        return;
      }
    }

    ImagePicker.launchCamera(
      { mediaType: "photo", includeBase64: true, quality: 0.9 },
      async (response) => {
        if (!response?.assets?.length) {
          endPickerHold();
          return;
        }
        try {
          const firstAsset = response.assets[0];
          const localUri = await ensureLocalImageUri(firstAsset);
          const attachment = {
            ...createImageAttachment(firstAsset),
            id: localUri,
            localUri,
          };
          setAttachments((current) => [...current, attachment]);
          endPickerHold();
          await openOcrModal(localUri, { newSession: true });
        } catch (error) {
          console.error("Camera attachment handling failed", error);
          Alert.alert("Image Error", "Could not process this captured image.");
        } finally {
          endPickerHold();
        }
      }
    );
  };

  const pickGalleryImages = () => {
    beginPickerHold("Opening gallery…");

    ImagePicker.launchImageLibrary(
      {
        mediaType: "photo",
        includeBase64: true,
        selectionLimit: 0,
        quality: 0.9,
      },
      async (response) => {
        if (!response?.assets?.length) {
          endPickerHold();
          return;
        }
        try {
          const mapped = await Promise.all(
            response.assets.map(async (asset, idx) => {
              const localUri = await ensureLocalImageUri(asset);
              return {
                ...createImageAttachment(asset),
                id: `${localUri}-${idx}`,
                localUri,
              };
            })
          );
          setAttachments((current) => [...current, ...mapped]);
          const selectedUris = mapped.map((item) => item.localUri).filter(Boolean);
          endPickerHold();
          if (selectedUris.length) {
            await openOcrModal(selectedUris, { newSession: true, initialIndex: 0 });
          }
        } catch (error) {
          console.error("Gallery attachment handling failed", error);
          Alert.alert("Image Error", "Could not process one or more selected images.");
        } finally {
          endPickerHold();
        }
      }
    );
  };

  const pickPdfOption = async () => {
    beginPickerHold("Opening PDF picker…");

    try {
      const moduleName = "expo-document-picker";
      const documentPicker = require(moduleName);
      const getDocumentAsync = documentPicker?.getDocumentAsync;

      if (typeof getDocumentAsync !== "function") {
        throw new Error("expo-document-picker native module unavailable");
      }

      const result = await getDocumentAsync({
        type: "application/pdf",
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (result?.canceled || !result?.assets?.length) {
        return;
      }

      const createdAttachments = result.assets.map(createDocumentAttachment);
      setAttachments((current) => [...current, ...createdAttachments]);
      endPickerHold();

      if (createdAttachments[0]) {
        await runPdfCloudOcr(createdAttachments[0]);
      }

      if (createdAttachments.length > 1) {
        Alert.alert(
          "PDFs Added",
          "The first PDF is being scanned now. The others were attached successfully."
        );
      }
    } catch (error) {
      console.error("PDF picker unavailable", error);
      Alert.alert(
        "PDF Upload Unavailable",
        error?.message || "PDF picker is not available in this build yet. Please rebuild the app client and try again."
      );
    } finally {
      endPickerHold();
    }
  };

  const openPdfAttachment = async (uri) => {
    if (!uri) return;

    beginPickerHold("Opening PDF…");

    try {
      const supported = await Linking.canOpenURL(uri);
      if (!supported) {
        Alert.alert(
          "Open PDF Failed",
          "This device could not open the PDF directly from here. You can still use the scan option to extract the statement totals and dates."
        );
        return;
      }

      await Linking.openURL(uri);
    } catch (error) {
      console.error("Could not open PDF attachment", error);
      Alert.alert(
        "Open PDF Failed",
        "This PDF is attached, but it could not be opened from here. Please try the scan option or open it from your files app."
      );
    } finally {
      endPickerHold();
    }
  };

  const runPdfCloudOcr = async (attachment) => {
    const uri = getAttachmentUri(attachment);
    if (!uri) {
      Alert.alert("Scan Failed", "This PDF does not have a readable file path.");
      return;
    }

    try {
      setOcrPreviewUri(null);
      setOcrPreviewUris([]);
      setOcrPreviewIndex(0);
      setOcrSessionUris([]);
      setOcrNewImageSession(false);
      setOcrResult(null);
      setOcrModalVisible(true);
      setOcrLoading(true);

      const response = await extractBankStatementPdfInCloud({
        uri,
        fileName: attachment?.name,
      });

      const rawText = typeof response?.rawText === "string" ? response.rawText : "";
      if (rawText) {
        console.log("BANK_STATEMENT_PDF_OCR_TEXT_START\n%s\nBANK_STATEMENT_PDF_OCR_TEXT_END", rawText);
      }

      const extracted = rawText ? extractBankStatementData(rawText) : response?.extracted || null;
      setShowOcrMore(false);
      setOcrResult(extracted);
      setAcceptFlagsFromResult(extracted);

      if (!extracted || Object.values(extracted).every((value) => value == null)) {
        Alert.alert(
          "Scan Complete",
          "The PDF was scanned, but no totals or statement dates were confidently detected. Please review the values manually."
        );
      }
    } catch (error) {
      console.error("Cloud PDF OCR failed", error);
      setOcrResult(null);
      setAcceptFlags({
        accountName: false,
        startDate: false,
        endDate: false,
        moneyInTotal: false,
        moneyOutTotal: false,
        statementBalance: false,
      });
      Alert.alert(
        "PDF OCR Failed",
        error?.message || "The secure PDF scan could not complete right now."
      );
      setOcrModalVisible(false);
    } finally {
      setOcrLoading(false);
    }
  };

  const showPdfAttachmentActions = (attachment) => {
    const uri = getAttachmentUri(attachment);
    beginPickerHold("Opening attachment options…");
    requestAnimationFrame(() => {
      Alert.alert("PDF Attachment", "Choose what you want to do with this statement.", [
        {
          text: "Scan PDF",
          onPress: () => {
            runPdfCloudOcr(attachment).catch(() => {});
          },
        },
        {
          text: "Open PDF",
          onPress: () => {
            openPdfAttachment(uri).catch(() => {});
          },
        },
        { text: "Cancel", style: "cancel" },
      ]);
      setTimeout(() => endPickerHold(), 140);
    });
  };

  const pickAttachmentOption = () => {
    if (showTip) {
      dismissTip().catch(() => {});
    }
    beginPickerHold("Opening attachment options…");
    requestAnimationFrame(() => {
      setAttachmentPickerVisible(true);
      setTimeout(() => endPickerHold(), 140);
    });
  };

  const closeAttachmentPicker = () => setAttachmentPickerVisible(false);

  const closeOcrModal = () => {
    if (ocrNewImageSession && ocrSessionUris.length > 0) {
      setAttachments((current) =>
        current.filter((item) => !ocrSessionUris.includes(getAttachmentUri(item)))
      );
    }
    setOcrModalVisible(false);
    setOcrPreviewUri(null);
    setOcrPreviewUris([]);
    setOcrPreviewIndex(0);
    setOcrSessionUris([]);
    setOcrNewImageSession(false);
    setShowOcrMore(false);
  };

  const deletePreviewImage = () => {
    if (!ocrPreviewUri) return;

    const nextUris = ocrPreviewUris.filter((uri) => uri !== ocrPreviewUri);
    setAttachments((current) =>
      current.filter((item) => getAttachmentUri(item) !== ocrPreviewUri)
    );

    if (!nextUris.length) {
      setOcrModalVisible(false);
      setOcrPreviewUri(null);
      setOcrPreviewUris([]);
      setOcrPreviewIndex(0);
      setOcrSessionUris([]);
      setOcrNewImageSession(false);
      setShowOcrMore(false);
      return;
    }

    const nextIndex = Math.min(ocrPreviewIndex, nextUris.length - 1);
    setOcrPreviewUris(nextUris);
    setOcrPreviewIndex(nextIndex);
    setOcrPreviewUri(nextUris[nextIndex]);
    setOcrSessionUris((current) => current.filter((uri) => uri !== ocrPreviewUri));
    runBankOcr(nextUris).catch(() => {});
  };

  const toggleAccept = (key) => {
    setAcceptFlags((current) => ({ ...current, [key]: !current[key] }));
  };

  const isBankStatementFormValid =
    accountName.trim().length > 0 &&
    !Number.isNaN(parseMoneyInput(moneyInTotal)) &&
    !Number.isNaN(parseMoneyInput(moneyOutTotal));

  const applyAcceptedOcr = () => {
    if (!ocrResult) {
      setOcrModalVisible(false);
      return;
    }

    if (ocrResult?.statementType) {
      setStatementType(ocrResult.statementType);
    }

    if (acceptFlags.accountName && ocrResult.accountName) {
      setAccountName(ocrResult.accountName);
    }

    if (acceptFlags.startDate && ocrResult.statementStartDate) {
      const nextStart = new Date(ocrResult.statementStartDate);
      if (!Number.isNaN(nextStart.getTime())) setStatementStartDate(nextStart);
    }

    if (acceptFlags.endDate && ocrResult.statementEndDate) {
      const nextEnd = new Date(ocrResult.statementEndDate);
      if (!Number.isNaN(nextEnd.getTime())) setStatementEndDate(nextEnd);
    }

    if (acceptFlags.moneyInTotal && Number.isFinite(ocrResult.moneyInTotal)) {
      setMoneyInTotal(String(Number(ocrResult.moneyInTotal).toFixed(2)));
    }

    if (acceptFlags.moneyOutTotal && Number.isFinite(ocrResult.moneyOutTotal)) {
      setMoneyOutTotal(String(Number(ocrResult.moneyOutTotal).toFixed(2)));
    }

    if (acceptFlags.statementBalance && Number.isFinite(ocrResult.statementBalance)) {
      setStatementBalance(String(Number(ocrResult.statementBalance).toFixed(2)));
    }

    setOcrModalVisible(false);
    setOcrPreviewUri(null);
    setOcrPreviewUris([]);
    setOcrPreviewIndex(0);
    setOcrSessionUris([]);
    setOcrNewImageSession(false);
    setShowOcrMore(false);
  };

  const saveStatement = async () => {
    if (!accountName.trim()) {
      Alert.alert("Invalid Input", "Please enter an account name.");
      return;
    }

    const incomingMoney = parseMoneyInput(moneyInTotal || 0);
    const outgoingMoney = parseMoneyInput(moneyOutTotal || 0);
    const parsedStatementBalance = String(statementBalance || "").trim()
      ? parseMoneyInput(statementBalance)
      : null;
    if (Number.isNaN(incomingMoney) || Number.isNaN(outgoingMoney)) {
      Alert.alert("Invalid Input", "Please enter valid totals for money in and money out.");
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      Alert.alert("Authentication Error", "Please sign in again.");
      return;
    }

    setIsSaving(true);
    try {
      const currentRemoteUrls = new Set(
        attachments.filter((item) => item.url && !item.localUri).map((item) => item.url)
      );
      const removedAttachments = existingRemoteAttachments.filter(
        (item) => item.url && !currentRemoteUrls.has(item.url)
      );
      if (removedAttachments.length > 0) {
        await deleteStoredAttachments(removedAttachments);
      }

      const uploadedAttachments = await uploadAttachmentEntries({
        folder: "bankStatements",
        userId: user.uid,
        attachments,
      });

      const payload = {
        accountName: accountName.trim(),
        statementType,
        statementBalance: Number.isFinite(parsedStatementBalance) ? parsedStatementBalance : null,
        statementStartDate: statementStartDate.toISOString(),
        statementEndDate: statementEndDate.toISOString(),
        date: statementEndDate.toISOString(),
        moneyInTotal: incomingMoney,
        moneyOutTotal: outgoingMoney,
        netMovement: incomingMoney - outgoingMoney,
        notes: notes.trim(),
        attachments: uploadedAttachments,
        transactions: ocrResult?.transactions || statement?.transactions || [],
        vendorTotals: ocrResult?.vendorTotals || statement?.vendorTotals || [],
        categoryTotals: ocrResult?.categoryTotals || statement?.categoryTotals || [],
        rawText: ocrResult?.rawText || statement?.rawText || "",
        extractionStatus: uploadedAttachments.length > 0 ? "manual-review-needed" : "manual-entry",
        userId: user.uid,
        updatedAt: serverTimestamp(),
      };

      if (mode === "edit" && statement?.id) {
        await updateDoc(doc(db, "bankStatements", statement.id), payload);
      } else {
        await addDoc(collection(db, "bankStatements"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }

      navigateBackToBankStatements(navigation);
    } catch (error) {
      console.error("Error saving bank statement", error);
      Alert.alert("Save Failed", "Could not save this bank statement.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteStatement = async () => {
    if (!(mode === "edit" && statement?.id)) return;

    Alert.alert("Delete Bank Statement", "Delete this statement and its attachments?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setIsSaving(true);
          try {
            await deleteStoredAttachments(attachments);
            await deleteDoc(doc(db, "bankStatements", statement.id));
            navigateBackToBankStatements(navigation);
          } catch (error) {
            console.error("Error deleting bank statement", error);
            Alert.alert("Delete Failed", "Could not delete this bank statement.");
          } finally {
            setIsSaving(false);
          }
        },
      },
    ]);
  };

  const renderAttachment = (attachment, index) => {
    const uri = getAttachmentUri(attachment);
    if (!uri) return null;

    return (
      <View key={attachment.id || `${uri}-${index}`} style={styles.attachmentShell}>
        <TouchableOpacity
          onPress={() => {
            if (isImageAttachment(attachment)) {
              const imageUris = attachments
                .filter((item) => isImageAttachment(item))
                .map((item) => getAttachmentUri(item))
                .filter(Boolean);
              const initialIndex = Math.max(0, imageUris.findIndex((imageUri) => imageUri === uri));
              openOcrModal(imageUris.length ? imageUris : uri, {
                newSession: false,
                initialIndex,
              }).catch(() => {});
              return;
            }

            showPdfAttachmentActions(attachment);
          }}
        >
          {isImageAttachment(attachment) ? (
            <Image source={{ uri }} style={ReceiptStyles.receiptImage} />
          ) : (
            <View style={styles.pdfCard}>
              <Text style={styles.pdfLabel}>PDF</Text>
              <Text style={styles.pdfName} numberOfLines={2}>
                {attachment.name || "Statement PDF"}
              </Text>
              <Text style={styles.pdfHint}>Tap to scan or open</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.removeAttachmentButton}
          onPress={() =>
            setAttachments((current) => current.filter((item) => item.id !== attachment.id))
          }
        >
          <Text style={styles.removeAttachmentText}>×</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={ReceiptStyles.safeArea}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scrollContent}
        enableOnAndroid
        keyboardShouldPersistTaps="handled"
      >
        <View style={ReceiptStyles.container}>
          <View style={ReceiptStyles.borderContainer}>
            <Text style={ReceiptStyles.header}>
              {mode === "edit" ? "Edit Statement" : "Add Statement"}
            </Text>

            <View style={styles.fieldGroup}>
              <Text style={ReceiptStyles.label}>Account Name:</Text>
              <TextInput
                value={accountName}
                onChangeText={setAccountName}
                placeholder="Main business account"
                placeholderTextColor={stylesConst.placeholder}
                style={ReceiptStyles.input}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={ReceiptStyles.label}>Statement Start:</Text>
              <TouchableOpacity
                style={[ReceiptStyles.dateButton, styles.dateButtonAligned]}
                onPress={() => setDatePickerTarget("start")}
              >
                <Text style={ReceiptStyles.dateText}>{formatDate(statementStartDate)}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={ReceiptStyles.label}>Statement End:</Text>
              <TouchableOpacity
                style={[ReceiptStyles.dateButton, styles.dateButtonAligned]}
                onPress={() => setDatePickerTarget("end")}
              >
                <Text style={ReceiptStyles.dateText}>{formatDate(statementEndDate)}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.moneyRow}>
              <View style={styles.moneyColumn}>
                <Text style={ReceiptStyles.label}>Money In:</Text>
                <View style={[ReceiptStyles.inputRow, styles.currencyField]}>
                  <View style={styles.currencyWrapper}>
                    <Text style={styles.currencyText}>£</Text>
                  </View>
                  <TextInput
                    value={moneyInTotal}
                    onChangeText={setMoneyInTotal}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={stylesConst.placeholder}
                    style={[ReceiptStyles.input, styles.inputWithCurrency]}
                  />
                </View>
              </View>
              <View style={styles.moneyColumn}>
                <Text style={ReceiptStyles.label}>Money Out:</Text>
                <View style={[ReceiptStyles.inputRow, styles.currencyField]}>
                  <View style={styles.currencyWrapper}>
                    <Text style={styles.currencyText}>£</Text>
                  </View>
                  <TextInput
                    value={moneyOutTotal}
                    onChangeText={setMoneyOutTotal}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={stylesConst.placeholder}
                    style={[ReceiptStyles.input, styles.inputWithCurrency]}
                  />
                </View>
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={ReceiptStyles.label}>Notes:</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Statement notes or review reminders"
                placeholderTextColor={stylesConst.placeholder}
                style={[ReceiptStyles.input, styles.notesInput]}
                multiline
              />
            </View>

            <View style={[styles.fieldGroup, styles.attachmentSection]}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: "center" }}>
                {attachments.map(renderAttachment)}
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <TouchableOpacity style={ReceiptStyles.uploadPlaceholder} onPress={pickAttachmentOption}>
                    <Text style={ReceiptStyles.plus}>+</Text>
                  </TouchableOpacity>
                  {tipStatusLoaded && showTip ? (
                    <ScannerTooltip onDismiss={dismissTip} text="Tap here to upload your bank or credit statement" />
                  ) : null}
                </View>
              </ScrollView>
            </View>

            {hasDisplayInsights ? (
              <View style={styles.fieldGroup}>
                <Button mode="text" textColor={Colors.accent} onPress={() => setShowSavedBreakdown((current) => !current)}>
                  {showSavedBreakdown ? "Hide statement breakdown" : "See statement breakdown"}
                </Button>
                {showSavedBreakdown ? <StatementBreakdown data={displayInsights} /> : null}
              </View>
            ) : null}

            <View style={styles.actionRow}>
              <Button mode="outlined" onPress={() => navigateBackToBankStatements(navigation)}>
                Cancel
              </Button>
              <Button
                mode="contained"
                buttonColor={Colors.accent}
                onPress={saveStatement}
                disabled={isSaving || !isBankStatementFormValid}
              >
                Save
              </Button>
            </View>

            {mode === "edit" ? (
              <Button
                mode="outlined"
                textColor={Colors.accent}
                onPress={deleteStatement}
                style={styles.deleteButton}
              >
                Delete Statement
              </Button>
            ) : null}
          </View>
        </View>
      </KeyboardAwareScrollView>

      <DateTimePickerModal
        isVisible={Boolean(datePickerTarget)}
        mode="date"
        date={datePickerTarget === "start" ? statementStartDate : statementEndDate}
        maximumDate={new Date()}
        onConfirm={(date) => {
          if (datePickerTarget === "start") {
            setStatementStartDate(date);
          } else {
            setStatementEndDate(date);
          }
          setDatePickerTarget(null);
        }}
        onCancel={() => setDatePickerTarget(null)}
      />

      <Modal
        visible={ocrModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeOcrModal}
      >
        <View style={ReceiptStyles.modalOverlay}>
          <View style={[ReceiptStyles.modalContent, { maxHeight: "88%" }]}>
            <Text style={ReceiptStyles.modalTitle}>
              {ocrResult?.statementType === "credit" ? "Credit Card Statement OCR Preview" : "Bank Statement OCR Preview"}
            </Text>
            {ocrResult?.statementType ? (
              <Text style={styles.detectedStatementText}>
                Detected: {ocrResult.statementType === "credit" ? "Credit statement" : "Bank statement"}
              </Text>
            ) : null}
            <ScrollView keyboardShouldPersistTaps="handled">
              {ocrPreviewUris.length > 0 ? (
                <View style={{ alignItems: "center" }}>
                  <ScrollView
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    contentOffset={{ x: ocrPreviewIndex * 260, y: 0 }}
                    onMomentumScrollEnd={(event) => {
                      const nextIndex = Math.round(event.nativeEvent.contentOffset.x / 260);
                      setOcrPreviewIndex(nextIndex);
                      setOcrPreviewUri(ocrPreviewUris[nextIndex] || null);
                    }}
                  >
                    {ocrPreviewUris.map((uri, index) => (
                      <TouchableOpacity
                        key={`${uri}-${index}`}
                        style={{ width: 260, opacity: ocrLoading ? 0.6 : 1 }}
                        activeOpacity={0.7}
                        disabled={ocrLoading}
                        onPress={() => {
                          if (!ocrPreviewUri) return;
                          setReturnToOcrAfterFullscreen(true);
                          setOcrModalVisible(false);
                          requestAnimationFrame(() =>
                            setFullScreenImage({
                              uri: ocrPreviewUri,
                              images: ocrPreviewUris.map((imageUri) => ({ url: imageUri })),
                              index: ocrPreviewIndex,
                            })
                          );
                        }}
                      >
                        <Image source={{ uri }} style={[ReceiptStyles.modalImage, styles.ocrCarouselImage]} />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  {!ocrLoading ? (
                    <Text style={ReceiptStyles.fullscreenHint}>
                      {ocrPreviewUris.length > 1
                        ? `Image ${ocrPreviewIndex + 1} of ${ocrPreviewUris.length} • swipe to review`
                        : "Tap image to view full screen"}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {ocrLoading ? (
                <Text style={ReceiptStyles.scanningText}>
                  {ocrPreviewUri ? "Scanning…" : "Scanning PDF securely in the cloud…"}
                </Text>
              ) : (
                <>
                  <View style={ReceiptStyles.ocrRow}>
                    <Checkbox
                      status={acceptFlags.accountName ? "checked" : "unchecked"}
                      onPress={() => toggleAccept("accountName")}
                      color={Colors.accent}
                      disabled={!ocrResult?.accountName}
                    />
                    <Text style={ReceiptStyles.ocrLabel}>Account:</Text>
                    <Text style={ReceiptStyles.ocrValue}>{ocrResult?.accountName || "Not detected"}</Text>
                  </View>

                  {ocrResult?.statementType === "credit" ? (
                    <>
                      <View style={ReceiptStyles.ocrRow}>
                        <Checkbox
                          status={acceptFlags.endDate ? "checked" : "unchecked"}
                          onPress={() => toggleAccept("endDate")}
                          color={Colors.accent}
                          disabled={!(ocrResult?.statementIssueDate || ocrResult?.statementEndDate)}
                        />
                        <Text style={ReceiptStyles.ocrLabel}>Issue Date:</Text>
                        <Text style={ReceiptStyles.ocrValue}>
                          {ocrResult?.statementIssueDate || ocrResult?.statementEndDate
                            ? formatDate(new Date(ocrResult.statementIssueDate || ocrResult.statementEndDate))
                            : "Not detected"}
                        </Text>
                      </View>

                      <View style={ReceiptStyles.ocrRow}>
                        <Checkbox
                          status={acceptFlags.statementBalance ? "checked" : "unchecked"}
                          onPress={() => toggleAccept("statementBalance")}
                          color={Colors.accent}
                          disabled={!Number.isFinite(ocrResult?.statementBalance)}
                        />
                        <Text style={ReceiptStyles.ocrLabel}>Balance:</Text>
                        <Text style={ReceiptStyles.ocrValue}>
                          {Number.isFinite(ocrResult?.statementBalance)
                            ? `£${Number(ocrResult.statementBalance).toFixed(2)}`
                            : "Not detected"}
                        </Text>
                      </View>

                      {ocrResult?.statementStartDate ? (
                        <View style={ReceiptStyles.ocrRow}>
                          <Checkbox
                            status={acceptFlags.startDate ? "checked" : "unchecked"}
                            onPress={() => toggleAccept("startDate")}
                            color={Colors.accent}
                            disabled={!ocrResult?.statementStartDate}
                          />
                          <Text style={ReceiptStyles.ocrLabel}>Period Start:</Text>
                          <Text style={ReceiptStyles.ocrValue}>
                            {formatDate(new Date(ocrResult.statementStartDate))}
                          </Text>
                        </View>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <View style={ReceiptStyles.ocrRow}>
                        <Checkbox
                          status={acceptFlags.startDate ? "checked" : "unchecked"}
                          onPress={() => toggleAccept("startDate")}
                          color={Colors.accent}
                          disabled={!ocrResult?.statementStartDate}
                        />
                        <Text style={ReceiptStyles.ocrLabel}>Start Date:</Text>
                        <Text style={ReceiptStyles.ocrValue}>
                          {ocrResult?.statementStartDate ? formatDate(new Date(ocrResult.statementStartDate)) : "Not detected"}
                        </Text>
                      </View>

                      <View style={ReceiptStyles.ocrRow}>
                        <Checkbox
                          status={acceptFlags.endDate ? "checked" : "unchecked"}
                          onPress={() => toggleAccept("endDate")}
                          color={Colors.accent}
                          disabled={!ocrResult?.statementEndDate}
                        />
                        <Text style={ReceiptStyles.ocrLabel}>End Date:</Text>
                        <Text style={ReceiptStyles.ocrValue}>
                          {ocrResult?.statementEndDate ? formatDate(new Date(ocrResult.statementEndDate)) : "Not detected"}
                        </Text>
                      </View>
                    </>
                  )}

                  <View style={ReceiptStyles.ocrRow}>
                    <Checkbox
                      status={acceptFlags.moneyInTotal ? "checked" : "unchecked"}
                      onPress={() => toggleAccept("moneyInTotal")}
                      color={Colors.accent}
                      disabled={!Number.isFinite(ocrResult?.moneyInTotal)}
                    />
                    <Text style={ReceiptStyles.ocrLabel}>
                      {ocrResult?.statementType === "credit" ? "Payments/Credits:" : "Money In:"}
                    </Text>
                    <Text style={ReceiptStyles.ocrValue}>
                      {Number.isFinite(ocrResult?.moneyInTotal)
                        ? `£${Number(ocrResult.moneyInTotal).toFixed(2)}`
                        : "Not detected"}
                    </Text>
                  </View>

                  <View style={ReceiptStyles.ocrRow}>
                    <Checkbox
                      status={acceptFlags.moneyOutTotal ? "checked" : "unchecked"}
                      onPress={() => toggleAccept("moneyOutTotal")}
                      color={Colors.accent}
                      disabled={!Number.isFinite(ocrResult?.moneyOutTotal)}
                    />
                    <Text style={ReceiptStyles.ocrLabel}>
                      {ocrResult?.statementType === "credit" ? "Spending:" : "Money Out:"}
                    </Text>
                    <Text style={ReceiptStyles.ocrValue}>
                      {Number.isFinite(ocrResult?.moneyOutTotal)
                        ? `£${Number(ocrResult.moneyOutTotal).toFixed(2)}`
                        : "Not detected"}
                    </Text>
                  </View>

                  <View style={ReceiptStyles.modalButtons}>
                    {!ocrNewImageSession ? (
                      <Button mode="outlined" textColor={Colors.accent} onPress={deletePreviewImage}>
                        Delete Image
                      </Button>
                    ) : null}
                    <Button mode="outlined" onPress={closeOcrModal}>
                      Cancel
                    </Button>
                    <Button mode="contained" buttonColor={Colors.accent} onPress={applyAcceptedOcr}>
                      Accept
                    </Button>
                  </View>

                  {ocrResult ? (
                    <Button mode="text" textColor={Colors.accent} onPress={() => setShowOcrMore((current) => !current)}>
                      {showOcrMore ? "Hide details" : "See more"}
                    </Button>
                  ) : null}

                  {showOcrMore ? <StatementBreakdown data={ocrResult} /> : null}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={attachmentPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={closeAttachmentPicker}
      >
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>Add Attachment</Text>

            <TouchableOpacity
              style={styles.pickerOption}
              onPress={() => {
                closeAttachmentPicker();
                requestAnimationFrame(() => {
                  pickPdfOption().catch(() => {});
                });
              }}
            >
              <Text style={styles.pickerOptionText}>PDF</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.pickerOption}
              onPress={() => {
                closeAttachmentPicker();
                requestAnimationFrame(() => {
                  requestCameraAndLaunch().catch(() => {});
                });
              }}
            >
              <Text style={styles.pickerOptionText}>Camera</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.pickerOption}
              onPress={() => {
                closeAttachmentPicker();
                requestAnimationFrame(() => {
                  pickGalleryImages();
                });
              }}
            >
              <Text style={styles.pickerOptionText}>Gallery</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.pickerOption, styles.pickerCancel]} onPress={closeAttachmentPicker}>
              <Text style={styles.pickerCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!fullScreenImage}
        animationType="fade"
        presentationStyle="fullScreen"
        transparent={false}
        onRequestClose={() => {
          setFullScreenImage(null);
          if (returnToOcrAfterFullscreen) {
            requestAnimationFrame(() => setOcrModalVisible(true));
            setReturnToOcrAfterFullscreen(false);
          }
        }}
      >
        {fullScreenImage ? (
          <>
            <ImageViewer
              imageUrls={fullScreenImage.images || [{ url: fullScreenImage.uri }]}
              index={fullScreenImage.index || 0}
              enableSwipeDown
              onSwipeDown={() => {
                setFullScreenImage(null);
                if (returnToOcrAfterFullscreen) {
                  requestAnimationFrame(() => setOcrModalVisible(true));
                  setReturnToOcrAfterFullscreen(false);
                }
              }}
              onClick={() => {
                setFullScreenImage(null);
                if (returnToOcrAfterFullscreen) {
                  requestAnimationFrame(() => setOcrModalVisible(true));
                  setReturnToOcrAfterFullscreen(false);
                }
              }}
              backgroundColor="black"
              renderIndicator={() => null}
              saveToLocalByLongPress={false}
            />
            <View style={ReceiptStyles.fullScreenCloseButtonWrapper}>
              <TouchableOpacity
                style={ReceiptStyles.fullScreenCloseButton}
                onPress={() => {
                  setFullScreenImage(null);
                  if (returnToOcrAfterFullscreen) {
                    requestAnimationFrame(() => setOcrModalVisible(true));
                    setReturnToOcrAfterFullscreen(false);
                  }
                }}
              >
                <Text style={ReceiptStyles.fullScreenCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : null}
      </Modal>

      {isSaving || pickerBusy ? (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={Colors.accent} />
            <Text style={styles.loadingText}>
              {isSaving ? "Saving bank statement…" : pickerBusyText}
            </Text>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const stylesConst = {
  placeholder: "#8f8f95",
};

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1, paddingBottom: 120 },
  fieldGroup: { marginBottom: 18 },
  attachmentSection: { marginTop: 16 },
  dateButtonAligned: { marginHorizontal: 0 },
  notesInput: {
    height: 110,
    textAlignVertical: "top",
    paddingTop: 10,
  },
  moneyRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, marginBottom: 18 },
  moneyColumn: { flex: 1 },
  currencyField: { position: "relative" },
  currencyWrapper: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 32,
    zIndex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  currencyText: { color: Colors.textSecondary, fontSize: 16, fontWeight: "600" },
  inputWithCurrency: { paddingLeft: 24 },
  attachmentShell: { marginRight: 12, position: "relative" },
  pdfCard: {
    width: 100,
    height: 150,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  pdfLabel: { color: Colors.accent, fontWeight: "700", fontSize: 18 },
  pdfName: { color: Colors.textPrimary, fontSize: 11, marginTop: 8, textAlign: "center" },
  pdfHint: { color: Colors.textMuted, fontSize: 10, marginTop: 6, textAlign: "center" },
  ocrCarouselImage: { width: 250, alignSelf: "center", marginRight: 10 },
  detectedStatementText: {
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: 10,
    fontWeight: "600",
  },
  breakdownCard: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  breakdownSection: {
    marginBottom: 10,
  },
  breakdownTitle: {
    color: Colors.textPrimary,
    fontWeight: "700",
    marginBottom: 4,
  },
  breakdownLine: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  breakdownRawText: {
    color: Colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
  },
  removeAttachmentButton: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
  removeAttachmentText: { color: Colors.surface, fontSize: 18, lineHeight: 18 },
  sideTipWrapper: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 8,
    zIndex: 10,
  },
  leftTriangle: {
    width: 0,
    height: 0,
    borderTopWidth: 7,
    borderBottomWidth: 7,
    borderRightWidth: 10,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderRightColor: "#F0D1FF",
  },
  sideTipBox: {
    backgroundColor: "#F0D1FF",
    padding: 10,
    borderRadius: 12,
    maxWidth: 170,
  },
  sideTipText: {
    color: "#4A148C",
    fontSize: 11,
    lineHeight: 15,
  },
  sideGotIt: {
    color: "#4A148C",
    fontWeight: "bold",
    fontSize: 10,
    marginTop: 5,
    textAlign: "right",
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 24,
  },
  pickerCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.textPrimary,
    marginBottom: 8,
    textAlign: "center",
  },
  pickerOption: {
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#ececf0",
  },
  pickerOptionText: {
    fontSize: 16,
    color: Colors.textPrimary,
    textAlign: "center",
  },
  pickerCancel: {
    borderBottomWidth: 0,
    marginTop: 2,
  },
  pickerCancelText: {
    fontSize: 16,
    color: Colors.accent,
    fontWeight: "700",
    textAlign: "center",
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  deleteButton: { marginTop: 16 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingCard: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: "center",
  },
  loadingText: { color: Colors.textPrimary, fontWeight: "600", marginTop: 10 },
});

const ScannerTooltip = ({ onDismiss, text }) => (
  <View style={styles.sideTipWrapper}>
    <View style={styles.leftTriangle} />
    <View style={styles.sideTipBox}>
      <Text style={styles.sideTipText}>{text}</Text>
      <TouchableOpacity onPress={onDismiss}>
        <Text style={styles.sideGotIt}>Got it</Text>
      </TouchableOpacity>
    </View>
  </View>
);

function extractTransactionRowsFromRawText(rawText) {
  const lines = String(rawText || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const rows = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const upper = line.toUpperCase();

    const startsWithDate = /^(?:\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}(?:\s+\d{4})?)\b/i.test(line);
    if (!startsWithDate) continue;
    if (/\b(ACCOUNT\s+SUMMARY|TOTAL\s+MONEY|BALANCE\s+BROUGHT\s+FORWARD|BALANCE\s+AT\s+CLOSE|YOUR\s+TRANSACTIONS?)\b/i.test(upper)) {
      continue;
    }

    let combined = line;
    if (!/(?:£|GBP|\d+[.,]\d{2})/i.test(combined) && lines[i + 1]) {
      combined = `${combined} ${lines[i + 1]}`.replace(/\s+/g, " ").trim();
      i += 1;
    }

    if (!/(?:£|GBP|\d+[.,]\d{2})/i.test(combined)) continue;
    rows.push(combined);
  }

  return Array.from(new Set(rows));
}

function parseRawTransactionRow(rawRow) {
  const normalized = String(rawRow || "")
    .replace(/(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})(?=\d)/g, "$1 ")
    .replace(/(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9})(?=\d)/gi, "$1 ")
    .replace(/\s+/g, " ")
    .trim();

  const direction = /\b(CREDIT|CR|FROM|PAID\s*IN|RECEIVED|REFUND|DEPOSIT|SALARY|INTEREST)\b/i.test(normalized)
    ? "in"
    : "out";

  const phraseMatch = normalized.match(
    /\b(?:PAYMENT\s+TO|PAYMENT\s+FROM|DIRECT\s+DEBIT\s+PAYMENT\s+TO|TO|FROM)\s+(.+?)(?:\s+ON\b|\s+REF\b|\s+MANDATE\b|$)/i
  );

  let vendor = phraseMatch?.[1] || "Unknown vendor";
  vendor = vendor
    .replace(/[*!]/g, " ")
    .replace(/(?:PAYPAL|PAYAL)/gi, " ")
    .replace(/\.(?:com|co\.uk|net|org)\b/gi, "")
    .replace(/\b(?:REF|REFERENCE|MANDATE|NO)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,:;\-]+$/g, "");

  vendor = vendor
    .split(" ")
    .filter(Boolean)
    .filter((word, index, arr) => index === 0 || word.toLowerCase() !== arr[index - 1].toLowerCase())
    .join(" ");

  if (/\bcredit\s+card\s+payment\b/i.test(normalized)) vendor = "Credit card payment";

  if (/your-saving/i.test(vendor)) vendor = "your-saving";
  else if (/national trust/i.test(vendor)) vendor = "National Trust";
  else if (/amazon/i.test(vendor)) vendor = "Amazon";

  const pair = normalized.match(/(\d{1,3}(?:,\d{3})*\.\d{2})(\d{1,3}(?:,\d{3})*\.\d{2})\b/);
  let amount = null;
  if (pair) {
    amount = Number(pair[1].replace(/,/g, ""));
  } else {
    const amounts = [...normalized.matchAll(/\b(\d{1,3}(?:,\d{3})*\.\d{2})\b/g)].map((m) =>
      Number(m[1].replace(/,/g, ""))
    );
    if (amounts.length >= 2) {
      amount = amounts[amounts.length - 2];
    } else if (amounts.length === 1) {
      amount = amounts[0];
    }
  }

  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (!vendor || /^(?:un?known|unkown)\s+vendor$/i.test(vendor)) vendor = "Unknown vendor";

  return {
    vendor,
    direction,
    amount: Number(amount.toFixed(2)),
  };
}

const StatementBreakdown = ({ data }) => {
  if (!data) return null;

  const transactions = Array.isArray(data.transactions) ? data.transactions : [];
  const rawText = String(data.rawText || "").trim();
  const fallbackTransactionRows = extractTransactionRowsFromRawText(rawText);
  const transactionRows = transactions.length
    ? transactions
        .map((entry) => ({
          vendor: String(entry.vendor || "Unknown vendor")
            .replace(/(?:PAYPAL|PAYAL)/gi, " ")
            .replace(/\s+/g, " ")
            .trim()
            .split(" ")
            .filter(Boolean)
            .filter((word, index, arr) => index === 0 || word.toLowerCase() !== arr[index - 1].toLowerCase())
            .join(" ")
            .replace(/^(?:un?known|unkown)\s+vendor$/i, "Unknown vendor") || "Unknown vendor",
          direction: entry.direction === "in" ? "in" : "out",
          amount: Number(entry.amount || 0),
        }))
        .filter((entry) => Number.isFinite(entry.amount) && entry.amount > 0)
    : fallbackTransactionRows.map(parseRawTransactionRow).filter(Boolean);

  const moneyInRows = transactionRows.filter((row) => row.direction === "in");
  const moneyOutRows = transactionRows.filter((row) => row.direction !== "in");

  const sumByVendor = (rows) => {
    const totals = new Map();
    for (const row of rows) {
      const key = row.vendor || "Unknown vendor";
      totals.set(key, (totals.get(key) || 0) + Number(row.amount || 0));
    }

    return Array.from(totals.entries())
      .map(([vendor, total]) => ({ vendor, total: Number(total.toFixed(2)) }))
      .sort((a, b) => b.total - a.total);
  };

  const moneyInTotals = sumByVendor(moneyInRows);
  const moneyOutTotals = sumByVendor(moneyOutRows);

  return (
    <View style={styles.breakdownCard}>
      {transactionRows.length ? (
        <View style={styles.breakdownSection}>
          <Text style={styles.breakdownTitle}>Money in</Text>
          {moneyInTotals.length ? moneyInTotals.map((row, index) => (
            <Text key={`in-${row.vendor}-${row.total}-${index}`} style={styles.breakdownLine}>
              {row.vendor} · £{Number(row.total || 0).toFixed(2)}
            </Text>
          )) : (
            <Text style={styles.breakdownRawText}>No money in rows detected.</Text>
          )}
        </View>
      ) : null}

      {transactionRows.length ? (
        <View style={styles.breakdownSection}>
          <Text style={styles.breakdownTitle}>Money out</Text>
          {moneyOutTotals.length ? moneyOutTotals.map((row, index) => (
            <Text key={`out-${row.vendor}-${row.total}-${index}`} style={styles.breakdownLine}>
              {row.vendor} · £{Number(row.total || 0).toFixed(2)}
            </Text>
          )) : (
            <Text style={styles.breakdownRawText}>No money out rows detected.</Text>
          )}
        </View>
      ) : (
        <View style={styles.breakdownSection}>
          <Text style={styles.breakdownTitle}>Transactions</Text>
          <Text style={styles.breakdownRawText}>No transaction rows detected yet.</Text>
        </View>
      )}
    </View>
  );
};
