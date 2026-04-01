import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import DropDownPicker from "react-native-dropdown-picker";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import * as ImagePicker from "react-native-image-picker";
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
import { getCurrentYearAprilSix } from "../utils/financialPeriods";
import { useReceiptOcr } from "../utils/ocrHelpers";
import {
  createImageAttachment,
  deleteStoredAttachments,
  getAttachmentUri,
  isImageAttachment,
  normalizeStoredAttachments,
  uploadAttachmentEntries,
} from "../utils/documentAttachments";
import { triggerHaptic } from "../utils/haptics";
import { categories_meta } from "../constants/arrays";

function navigateBackToIncome(navigation) {
  navigation.reset({
    index: 0,
    routes: [
      {
        name: "MainTabs",
        state: { routes: [{ name: "Income" }] },
      },
    ],
  });
}

export default function IncomeFormScreen({ navigation, route, mode }) {
  const income = route?.params?.income;
  const [amount, setAmount] = useState(
    income?.amount != null ? String(income.amount) : ""
  );
  const [vatAmount, setVatAmount] = useState(
    income?.vatAmount != null ? String(income.vatAmount) : ""
  );
  const [vatRate, setVatRate] = useState(
    income?.vatRate != null ? String(income.vatRate) : ""
  );
  const [vatAmountEdited, setVatAmountEdited] = useState(
    income?.vatAmount != null && income?.vatAmount !== ""
  );

  const deriveVatRateItems = () => {
    const unique = Array.from(
      new Set(
        (categories_meta || [])
          .map((c) => c?.vatRate)
          .filter((r) => r !== undefined && r !== null && !Number.isNaN(r))
      )
    ).sort((a, b) => Number(a) - Number(b));
    return unique.map((r) => ({ label: `${r}%`, value: String(r) }));
  };
  const [vatRateOpen, setVatRateOpen] = useState(false);
  const [vatRateItems, setVatRateItems] = useState(deriveVatRateItems);
  const [reference, setReference] = useState(income?.reference || "");
  const [label, setLabel] = useState(income?.label || "");
  const [notes, setNotes] = useState(income?.notes || "");
  const [selectedDate, setSelectedDate] = useState(
    income?.date ? new Date(income.date) : new Date()
  );
  const [attachments, setAttachments] = useState(
    normalizeStoredAttachments(income?.attachments || [])
  );
  const [isDatePickerVisible, setDatePickerVisibility] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [fullScreenImage, setFullScreenImage] = useState(null);
  const [returnToOcrAfterFullscreen, setReturnToOcrAfterFullscreen] = useState(false);
  const [showTip, setShowTip] = useState(false);
  const [tipStatusLoaded, setTipStatusLoaded] = useState(false);
  const [pickerBusy, setPickerBusy] = useState(false);
  const [pickerBusyText, setPickerBusyText] = useState("Opening attachment options…");

  const {
    ensureFileFromAsset,
    preview,
    ocrResult,
    acceptFlags,
    ocrLoading,
    ocrModalVisible,
    isNewImageSession,
    openOcrModal,
    toggleAccept,
    applyAcceptedValues,
    setOcrModalVisible,
  } = useReceiptOcr({
    computeVat: (grossStr, rateStr) => {
      const gross = parseFloat(grossStr);
      const rate = parseFloat(rateStr);
      if (!isFinite(gross) || !isFinite(rate)) return "";
      const net = gross / (1 + rate / 100);
      const vat = gross - net;
      return vat.toFixed(2);
    },
  });

  const existingRemoteAttachments = useMemo(
    () => normalizeStoredAttachments(income?.attachments || []),
    [income?.attachments]
  );

  useEffect(() => {
    let active = true;
    const loadTipStatus = async () => {
      const user = auth.currentUser;
      if (!user || attachments.length > 0) {
        if (active) {
          setShowTip(false);
          setTipStatusLoaded(true);
        }
        return;
      }

      try {
        const userSnap = await getDoc(doc(db, "users", user.uid));
        if (active) {
          setShowTip(!userSnap.data()?.hasSeenIncomeScannerTip);
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
  }, [attachments.length]);

  useEffect(() => {
    if (attachments.length > 0) {
      setShowTip(false);
    }
  }, [attachments.length]);

  useEffect(() => {
    if (!vatAmountEdited && amount && vatRate) {
      const gross = parseFloat(amount);
      const rate = parseFloat(vatRate);
      if (isFinite(gross) && isFinite(rate)) {
        const net = gross / (1 + rate / 100);
        setVatAmount((gross - net).toFixed(2));
      }
    }
  }, [amount, vatRate, vatAmountEdited]);

  const dismissTip = async () => {
    setShowTip(false);
    const user = auth.currentUser;
    if (!user) return;
    try {
      await setDoc(doc(db, "users", user.uid), { hasSeenIncomeScannerTip: true }, { merge: true });
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

  const handleConfirmDate = (date) => {
    setDatePickerVisibility(false);
    setTimeout(() => {
      setSelectedDate(date);
      const previousFinancialYearThreshold = getCurrentYearAprilSix(new Date());
      if (date < previousFinancialYearThreshold) {
        Alert.alert(
          "Check date",
          "This date appears to be in a previous financial year. Please verify your selection."
        );
      }
    }, 100);
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
          const asset = response.assets[0];
          const localUri = await ensureFileFromAsset(asset);
          const attachment = {
            ...createImageAttachment(asset),
            id: localUri,
            localUri,
          };
          setAttachments((current) => [...current, attachment]);
          endPickerHold();
          await openOcrModal(localUri, { autoScan: true, newSession: true });
        } finally {
          endPickerHold();
        }
      }
    );
  };

  const pickImageOption = () => {
    if (showTip) {
      dismissTip().catch(() => {});
    }

    beginPickerHold("Opening attachment options…");
    requestAnimationFrame(() => {
      Alert.alert("Add Image", "Choose an option", [
        {
          text: "Camera",
          onPress: () => {
            requestAnimationFrame(() => {
              requestCameraAndLaunch().catch(() => {
                endPickerHold();
              });
            });
          },
        },
        {
          text: "Gallery",
          onPress: () => {
            beginPickerHold("Opening gallery…");
            requestAnimationFrame(() => {
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
                    const mapped = response.assets.map(createImageAttachment);
                    setAttachments((current) => [...current, ...mapped]);
                    const first = mapped[0];
                    endPickerHold();
                    if (first?.localUri) {
                      await openOcrModal(first.localUri, {
                        autoScan: true,
                        newSession: true,
                      });
                    }
                  } finally {
                    endPickerHold();
                  }
                }
              );
            });
          },
        },
        { text: "Cancel", style: "cancel" },
      ]);
      setTimeout(() => endPickerHold(), 140);
    });
  };

  const saveIncome = async () => {
    if (!amount || Number(amount) <= 0) {
      Alert.alert("Invalid Input", "Please enter a valid amount.");
      return;
    }

    if (!reference.trim()) {
      Alert.alert("Invalid Input", "Please enter a reference number.");
      return;
    }

    if (!vatAmount || Number(vatAmount) < 0 || !vatRate || Number(vatRate) < 0) {
      Alert.alert("Invalid Input", "Please enter valid VAT amount and VAT rate.");
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
        folder: "income",
        userId: user.uid,
        attachments,
      });

      const payload = {
        amount: Number(amount),
        vatAmount: Number(vatAmount),
        vatRate: Number(vatRate),
        date: selectedDate.toISOString(),
        reference: reference.trim(),
        label: label.trim(),
        notes: notes.trim(),
        attachments: uploadedAttachments,
        userId: user.uid,
        updatedAt: serverTimestamp(),
      };

      if (mode === "edit" && income?.id) {
        await updateDoc(doc(db, "income", income.id), payload);
      } else {
        await addDoc(collection(db, "income"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }

      triggerHaptic("success").catch(() => {});
      navigateBackToIncome(navigation);
    } catch (error) {
      console.error("Error saving income", error);
      Alert.alert("Save Failed", "Could not save this income record.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteIncome = async () => {
    if (!(mode === "edit" && income?.id)) return;

    Alert.alert("Delete Income", "Delete this income record and its attachments?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setIsSaving(true);
          try {
            await deleteStoredAttachments(attachments);
            await deleteDoc(doc(db, "income", income.id));
            navigateBackToIncome(navigation);
          } catch (error) {
            console.error("Error deleting income", error);
            Alert.alert("Delete Failed", "Could not delete this income record.");
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
      <View key={attachment.id || `${uri}-${index}`} style={styles.attachmentCard}>
        <TouchableOpacity
          disabled={!isImageAttachment(attachment)}
          onPress={() => {
            if (isImageAttachment(attachment)) {
              openOcrModal(uri, { autoScan: true, newSession: false }).catch(() => {});
            }
          }}
        >
          <Image source={{ uri }} style={ReceiptStyles.receiptImage} />
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

  const closeOcrModal = () => {
    if (isNewImageSession && preview?.uri) {
      setAttachments((current) =>
        current.filter((item) => getAttachmentUri(item) !== preview.uri)
      );
    }
    setOcrModalVisible(false);
  };

  const deletePreviewImage = () => {
    if (!preview?.uri) return;
    setAttachments((current) =>
      current.filter((item) => getAttachmentUri(item) !== preview.uri)
    );
    setOcrModalVisible(false);
  };

  const isIncomeFormValid =
    Number(amount) > 0 &&
    reference.trim().length > 0 &&
    vatAmount.trim().length > 0 &&
    vatRate.trim().length > 0 &&
    !Number.isNaN(Number(vatAmount)) &&
    !Number.isNaN(Number(vatRate));

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
              {mode === "edit" ? "Edit Income" : "Add Income"}
            </Text>

            <View style={styles.fieldGroup}>
              <Text style={ReceiptStyles.label}>Amount:</Text>
              <View style={[ReceiptStyles.inputRow, styles.currencyField]}>
                <View style={styles.currencyWrapper}>
                  <Text style={styles.currencyText}>£</Text>
                </View>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={Colors.textSecondary}
                  style={[ReceiptStyles.input, styles.amountInput, styles.inputWithCurrency]}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={ReceiptStyles.label}>Date:</Text>
              <TouchableOpacity
                style={[ReceiptStyles.dateButton, styles.dateButtonAligned]}
                onPress={() => setDatePickerVisibility(true)}
              >
                <Text style={ReceiptStyles.dateText}>{formatDate(selectedDate)}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={ReceiptStyles.label}>Reference:</Text>
              <TextInput
                value={reference}
                onChangeText={setReference}
                placeholder="Invoice number or source"
                placeholderTextColor={stylesConst.placeholder}
                style={ReceiptStyles.input}
              />
            </View>

            <View style={styles.moneyRow}>
              <View style={styles.moneyColumn}>
                <Text style={ReceiptStyles.label}>VAT Amount:</Text>
                <View style={[ReceiptStyles.inputRow, styles.currencyField]}>
                  <View style={styles.currencyWrapper}>
                    <Text style={styles.currencyText}>£</Text>
                  </View>
                  <TextInput
                    value={vatAmount}
                    onChangeText={(value) => {
                      setVatAmount(value);
                      setVatAmountEdited(value.trim().length > 0);
                    }}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={Colors.textSecondary}
                    style={[ReceiptStyles.input, styles.inputWithCurrency]}
                  />
                </View>
              </View>
              <View style={[styles.moneyColumn, { zIndex: 3000 }]}>
                <Text style={ReceiptStyles.label}>VAT Rate (%):</Text>
                <DropDownPicker
                  open={vatRateOpen}
                  value={vatRate}
                  items={vatRateItems}
                  setOpen={setVatRateOpen}
                  setValue={(callback) => {
                    const next = callback(vatRate);
                    setVatRate(next ?? "");
                    setVatAmountEdited(false);
                  }}
                  setItems={setVatRateItems}
                  placeholder="Select"
                  style={ReceiptStyles.vatRatePicker}
                  dropDownContainerStyle={ReceiptStyles.vatRateDropdown}
                  zIndex={3000}
                  zIndexInverse={1000}
                  listMode="SCROLLVIEW"
                  scrollViewProps={{ keyboardShouldPersistTaps: "always" }}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={ReceiptStyles.label}>Label (optional):</Text>
              <TextInput
                value={label}
                onChangeText={setLabel}
                placeholder="An optional label"
                placeholderTextColor={stylesConst.placeholder}
                style={ReceiptStyles.input}
              />
            </View>

            <View style={[styles.fieldGroup, styles.attachmentSection]}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ alignItems: "center" }}
              >
                {attachments.map(renderAttachment)}
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <TouchableOpacity style={ReceiptStyles.uploadPlaceholder} onPress={pickImageOption}>
                    <Text style={ReceiptStyles.plus}>+</Text>
                  </TouchableOpacity>
                  {tipStatusLoaded && showTip ? <ScannerTooltip onDismiss={dismissTip} text="Tap here to scan an invoice" /> : null}
                </View>
              </ScrollView>
            </View>

            <View style={styles.actionRow}>
              <Button mode="outlined" textColor={Colors.accent} onPress={() => navigateBackToIncome(navigation)}>
                Cancel
              </Button>
              <Button
                mode="contained"
                buttonColor={Colors.accent}
                onPress={saveIncome}
                disabled={isSaving || !isIncomeFormValid}
              >
                Save
              </Button>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={ReceiptStyles.label}>Notes:</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Optional notes"
                placeholderTextColor={stylesConst.placeholder}
                style={[ReceiptStyles.input, styles.notesInput]}
                multiline
              />
            </View>

            {mode === "edit" ? (
              <Button
                mode="outlined"
                textColor={Colors.accent}
                onPress={deleteIncome}
                style={styles.deleteButton}
              >
                Delete Income
              </Button>
            ) : null}
          </View>
        </View>
      </KeyboardAwareScrollView>

      <DateTimePickerModal
        isVisible={isDatePickerVisible}
        mode="date"
        date={selectedDate}
        maximumDate={new Date()}
        onConfirm={handleConfirmDate}
        onCancel={() => setDatePickerVisibility(false)}
      />

      <Modal
        visible={ocrModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeOcrModal}
      >
        <View style={ReceiptStyles.modalOverlay}>
          <View style={[ReceiptStyles.modalContent, { maxHeight: "88%" }]}>
            <Text style={ReceiptStyles.modalTitle}>Income OCR Preview</Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              {preview?.uri ? (
                <View style={{ alignItems: "center" }}>
                  <TouchableOpacity
                    style={{ alignSelf: "stretch", opacity: ocrLoading ? 0.6 : 1 }}
                    activeOpacity={0.7}
                    disabled={ocrLoading}
                    onPress={() => {
                      const current = preview?.uri;
                      if (!current) return;
                      setReturnToOcrAfterFullscreen(true);
                      setOcrModalVisible(false);
                      requestAnimationFrame(() => setFullScreenImage({ uri: current }));
                    }}
                  >
                    <Image source={{ uri: preview.uri }} style={ReceiptStyles.modalImage} />
                  </TouchableOpacity>
                  {ocrLoading ? (
                    <Text style={ReceiptStyles.scanningText}>Scanning…</Text>
                  ) : (
                    <Text style={ReceiptStyles.fullscreenHint}>Tap image to view full screen</Text>
                  )}
                </View>
              ) : null}

              {ocrLoading ? null : (
                <>
                  <View style={ReceiptStyles.ocrRow}>
                    <Checkbox
                      status={acceptFlags.amount ? "checked" : "unchecked"}
                      onPress={() => toggleAccept("amount")}
                      color={Colors.accent}
                      disabled={ocrResult?.amount == null}
                    />
                    <Text style={ReceiptStyles.ocrLabel}>Amount:</Text>
                    <Text style={ReceiptStyles.ocrValue}>
                      {ocrResult?.amount != null
                        ? `£${Number(ocrResult.amount).toFixed(2)}`
                        : "Not detected"}
                    </Text>
                  </View>

                  <View style={ReceiptStyles.ocrRow}>
                    <Checkbox
                      status={acceptFlags.date ? "checked" : "unchecked"}
                      onPress={() => toggleAccept("date")}
                      color={Colors.accent}
                      disabled={!ocrResult?.date}
                    />
                    <Text style={ReceiptStyles.ocrLabel}>Date:</Text>
                    <Text style={ReceiptStyles.ocrValue}>
                      {ocrResult?.date
                        ? formatDate(new Date(ocrResult.date))
                        : "Not detected"}
                    </Text>
                  </View>

                  <View style={ReceiptStyles.ocrRow}>
                    <Checkbox
                      status={acceptFlags.reference ? "checked" : "unchecked"}
                      onPress={() => toggleAccept("reference")}
                      color={Colors.accent}
                      disabled={!ocrResult?.reference}
                    />
                    <Text style={ReceiptStyles.ocrLabel}>Reference:</Text>
                    <Text style={ReceiptStyles.ocrValue}>
                      {ocrResult?.reference || "Not detected"}
                    </Text>
                  </View>

                  <View style={ReceiptStyles.ocrRow}>
                    <Checkbox
                      status={acceptFlags.vat ? "checked" : "unchecked"}
                      onPress={() => toggleAccept("vat")}
                      color={Colors.accent}
                      disabled={ocrResult?.vat?.value == null && ocrResult?.vat?.rate == null}
                    />
                    <Text style={ReceiptStyles.ocrLabel}>VAT:</Text>
                    <Text style={ReceiptStyles.ocrValue}>
                      {ocrResult?.vat?.value != null ? `£${Number(ocrResult.vat.value).toFixed(2)}` : "Not detected"}
                      {`  (Rate ${ocrResult?.vat?.rate ?? "—"}%)`}
                    </Text>
                  </View>

                  <View style={ReceiptStyles.modalButtons}>
                    {!isNewImageSession ? (
                      <Button
                        mode="outlined"
                        textColor={Colors.accent}
                        onPress={deletePreviewImage}
                      >
                        Delete Image
                      </Button>
                    ) : null}
                    <Button mode="outlined" onPress={closeOcrModal}>
                      Cancel
                    </Button>
                    <Button
                      mode="contained"
                      buttonColor={Colors.accent}
                      onPress={() =>
                        applyAcceptedValues({
                          setAmount,
                          setVatAmount,
                          setVatRate,
                          setSelectedDate,
                          setReference,
                          setSelectedCategory: () => {},
                          vatAmountEdited,
                          amount,
                          vatRate,
                          setVatRateItems: () => {},
                        })
                      }
                    >
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

      {isSaving || pickerBusy ? (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={Colors.accent} />
            <Text style={styles.loadingText}>{isSaving ? "Saving income…" : pickerBusyText}</Text>
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
  scrollContent: { flexGrow: 1, paddingBottom: 160 },
  fieldGroup: { marginBottom: 18 },
  attachmentSection: { marginTop: 16 },
  dateButtonAligned: { marginHorizontal: 0 },
  currencyField: { position: "relative" },
  currencyWrapper: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 40,
    zIndex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  currencyText: { color: Colors.textSecondary, fontSize: 16, fontWeight: "600" },
  amountInput: { flex: 1 },
  inputWithCurrency: { paddingLeft: 28 },
  notesInput: { height: 110, textAlignVertical: "top", paddingTop: 10 },
  moneyRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, marginBottom: 18, zIndex: 2000 },
  moneyColumn: { flex: 1 },
  attachmentCard: { marginRight: 12, position: "relative" },
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