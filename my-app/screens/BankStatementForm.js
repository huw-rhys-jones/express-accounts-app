import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
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
  const [notes, setNotes] = useState(statement?.notes || "");
  const [attachments, setAttachments] = useState(
    normalizeStoredAttachments(statement?.attachments || [])
  );
  const [isSaving, setIsSaving] = useState(false);
  const [showTip, setShowTip] = useState(false);
  const [attachmentPickerVisible, setAttachmentPickerVisible] = useState(false);
  const [fullScreenImage, setFullScreenImage] = useState(null);
  const [returnToOcrAfterFullscreen, setReturnToOcrAfterFullscreen] = useState(false);

  const [ocrModalVisible, setOcrModalVisible] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrPreviewUri, setOcrPreviewUri] = useState(null);
  const [ocrNewImageSession, setOcrNewImageSession] = useState(false);
  const [ocrResult, setOcrResult] = useState(null);
  const [acceptFlags, setAcceptFlags] = useState({
    accountName: false,
    startDate: false,
    endDate: false,
    moneyInTotal: false,
    moneyOutTotal: false,
  });

  const existingRemoteAttachments = useMemo(
    () => normalizeStoredAttachments(statement?.attachments || []),
    [statement?.attachments]
  );

  useEffect(() => {
    let active = true;
    const loadTipStatus = async () => {
      const user = auth.currentUser;
      if (!user || attachments.length > 0) return;

      if (active) setShowTip(true);

      try {
        const userSnap = await getDoc(doc(db, "users", user.uid));
        if (active && userSnap.data()?.hasSeenBankScannerTip) {
          setShowTip(false);
        }
      } catch {
        // keep tip visible when profile read fails
      }
    };

    loadTipStatus();
    return () => {
      active = false;
    };
  }, [attachments.length]);

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
      endDate: Boolean(result?.statementEndDate),
      moneyInTotal: Number.isFinite(result?.moneyInTotal),
      moneyOutTotal: Number.isFinite(result?.moneyOutTotal),
    });
  };

  const runBankOcr = async (localUri) => {
    try {
      setOcrLoading(true);
      const result = await TextRecognition.recognize(localUri);
      const reconstructedText = reconstructLines(result?.blocks || []);
      const text = reconstructedText || result?.text || "";
      const extracted = extractBankStatementData(text);
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
      });
      Alert.alert("OCR Failed", "Could not scan this image. Please enter values manually.");
    } finally {
      setOcrLoading(false);
    }
  };

  const openOcrModal = async (uri, { newSession = false } = {}) => {
    setOcrPreviewUri(uri);
    setOcrNewImageSession(newSession);
    setOcrResult(null);
    setOcrModalVisible(true);
    await runBankOcr(uri);
  };

  const requestCameraAndLaunch = async () => {
    if (Platform.OS === "android") {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        Alert.alert("Permission Denied", "Camera access is required.");
        return;
      }
    }

    ImagePicker.launchCamera(
      { mediaType: "photo", includeBase64: true, quality: 0.9 },
      async (response) => {
        if (!response?.assets?.length) return;
        try {
          const firstAsset = response.assets[0];
          const localUri = await ensureLocalImageUri(firstAsset);
          const attachment = {
            ...createImageAttachment(firstAsset),
            id: localUri,
            localUri,
          };
          setAttachments((current) => [...current, attachment]);
          await openOcrModal(localUri, { newSession: true });
        } catch (error) {
          console.error("Camera attachment handling failed", error);
          Alert.alert("Image Error", "Could not process this captured image.");
        }
      }
    );
  };

  const pickGalleryImages = () => {
    ImagePicker.launchImageLibrary(
      {
        mediaType: "photo",
        includeBase64: true,
        selectionLimit: 0,
        quality: 0.9,
      },
      async (response) => {
        if (!response?.assets?.length) return;
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
          const first = mapped[0];
          if (first?.localUri) {
            await openOcrModal(first.localUri, { newSession: true });
          }
        } catch (error) {
          console.error("Gallery attachment handling failed", error);
          Alert.alert("Image Error", "Could not process one or more selected images.");
        }
      }
    );
  };

  const pickPdfOption = async () => {
    try {
      const moduleName = "expo-document-picker";
      const documentPicker = require(moduleName);
      const result = await documentPicker.getDocumentAsync({
        type: "application/pdf",
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (result?.canceled || !result?.assets?.length) {
        return;
      }

      setAttachments((current) => [
        ...current,
        ...result.assets.map(createDocumentAttachment),
      ]);
    } catch (error) {
      console.error("PDF picker unavailable", error);
      Alert.alert(
        "PDF Upload Unavailable",
        "PDF picker is not available in this build yet. Please rebuild the app client and try again."
      );
    }
  };

  const pickAttachmentOption = () => {
    if (showTip) {
      dismissTip().catch(() => {});
    }
    setAttachmentPickerVisible(true);
  };

  const closeAttachmentPicker = () => setAttachmentPickerVisible(false);

  const closeOcrModal = () => {
    if (ocrNewImageSession && ocrPreviewUri) {
      setAttachments((current) =>
        current.filter((item) => getAttachmentUri(item) !== ocrPreviewUri)
      );
    }
    setOcrModalVisible(false);
    setOcrPreviewUri(null);
    setOcrNewImageSession(false);
  };

  const deletePreviewImage = () => {
    if (!ocrPreviewUri) return;
    setAttachments((current) =>
      current.filter((item) => getAttachmentUri(item) !== ocrPreviewUri)
    );
    setOcrModalVisible(false);
    setOcrPreviewUri(null);
    setOcrNewImageSession(false);
  };

  const toggleAccept = (key) => {
    setAcceptFlags((current) => ({ ...current, [key]: !current[key] }));
  };

  const applyAcceptedOcr = () => {
    if (!ocrResult) {
      setOcrModalVisible(false);
      return;
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

    setOcrModalVisible(false);
    setOcrPreviewUri(null);
    setOcrNewImageSession(false);
  };

  const saveStatement = async () => {
    if (!accountName.trim()) {
      Alert.alert("Invalid Input", "Please enter an account name.");
      return;
    }

    const incomingMoney = parseMoneyInput(moneyInTotal || 0);
    const outgoingMoney = parseMoneyInput(moneyOutTotal || 0);
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
        statementStartDate: statementStartDate.toISOString(),
        statementEndDate: statementEndDate.toISOString(),
        date: statementEndDate.toISOString(),
        moneyInTotal: incomingMoney,
        moneyOutTotal: outgoingMoney,
        netMovement: incomingMoney - outgoingMoney,
        notes: notes.trim(),
        attachments: uploadedAttachments,
        transactions: statement?.transactions || [],
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
          disabled={!isImageAttachment(attachment)}
          onPress={() => {
            if (isImageAttachment(attachment)) {
              openOcrModal(uri, { newSession: false }).catch(() => {});
            }
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
              {mode === "edit" ? "Edit Bank Statement" : "Add Bank Statement"}
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
                  {showTip ? <ScannerTooltip onDismiss={dismissTip} text="Tap here to upload your bank statement" /> : null}
                </View>
              </ScrollView>
            </View>

            <View style={styles.actionRow}>
              <Button mode="outlined" onPress={() => navigateBackToBankStatements(navigation)}>
                Cancel
              </Button>
              <Button
                mode="contained"
                buttonColor={Colors.accent}
                onPress={saveStatement}
                disabled={isSaving}
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
            <Text style={ReceiptStyles.modalTitle}>Bank Statement OCR Preview</Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              {ocrPreviewUri ? (
                <View style={{ alignItems: "center" }}>
                  <TouchableOpacity
                    style={{ alignSelf: "stretch", opacity: ocrLoading ? 0.6 : 1 }}
                    activeOpacity={0.7}
                    disabled={ocrLoading}
                    onPress={() => {
                      if (!ocrPreviewUri) return;
                      setReturnToOcrAfterFullscreen(true);
                      setOcrModalVisible(false);
                      requestAnimationFrame(() => setFullScreenImage({ uri: ocrPreviewUri }));
                    }}
                  >
                    <Image source={{ uri: ocrPreviewUri }} style={ReceiptStyles.modalImage} />
                  </TouchableOpacity>
                  {!ocrLoading ? (
                    <Text style={ReceiptStyles.fullscreenHint}>Tap image to view full screen</Text>
                  ) : null}
                </View>
              ) : null}

              {ocrLoading ? (
                <Text style={ReceiptStyles.scanningText}>Scanning…</Text>
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

                  <View style={ReceiptStyles.ocrRow}>
                    <Checkbox
                      status={acceptFlags.moneyInTotal ? "checked" : "unchecked"}
                      onPress={() => toggleAccept("moneyInTotal")}
                      color={Colors.accent}
                      disabled={!Number.isFinite(ocrResult?.moneyInTotal)}
                    />
                    <Text style={ReceiptStyles.ocrLabel}>Money In:</Text>
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
                    <Text style={ReceiptStyles.ocrLabel}>Money Out:</Text>
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
                pickPdfOption().catch(() => {});
              }}
            >
              <Text style={styles.pickerOptionText}>PDF</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.pickerOption}
              onPress={() => {
                closeAttachmentPicker();
                requestCameraAndLaunch().catch(() => {});
              }}
            >
              <Text style={styles.pickerOptionText}>Camera</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.pickerOption}
              onPress={() => {
                closeAttachmentPicker();
                pickGalleryImages();
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
              imageUrls={[{ url: fullScreenImage.uri }]}
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

      {isSaving ? (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <Text style={styles.loadingText}>Saving bank statement…</Text>
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
  },
  loadingText: { color: Colors.textPrimary, fontWeight: "600" },
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
