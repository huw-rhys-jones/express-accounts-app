import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  Modal,
  PanResponder,
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
import { Button, Checkbox, ProgressBar } from "react-native-paper";
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
import { useReceiptOcr, runOcrOnAssets, detectReceiptGroupsFromAssets } from "../utils/ocrHelpers";
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

const IMAGE_HEIGHT = Math.round(Dimensions.get("window").height * 0.45);

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
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [imageContainerWidth, setImageContainerWidth] = useState(0);
  const [fullScreenImageIndex, setFullScreenImageIndex] = useState(null);

  // Multi-statement draft mode (when multiple income images are detected)
  const [incomeDrafts, setIncomeDrafts] = useState([]);
  const [currentDraftIndex, setCurrentDraftIndex] = useState(0);
  const [draftReviewStates, setDraftReviewStates] = useState([]); // "pending"|"confirmed"|"skipped"
  const [isDetecting, setIsDetecting] = useState(false);
  const [showDetectedIncomeModal, setShowDetectedIncomeModal] = useState(false);
  const [showBatchSummaryModal, setShowBatchSummaryModal] = useState(false);
  const [batchSaveSummary, setBatchSaveSummary] = useState({ saved: [], skippedCount: 0 });
  const isMultiDraftMode = incomeDrafts.length > 1;
  const allDraftsReviewed =
    isMultiDraftMode &&
    draftReviewStates.length === incomeDrafts.length &&
    draftReviewStates.length > 0 &&
    draftReviewStates.every((s) => s !== "pending");

  // Refs to prevent stale closures in PanResponder
  const incomeDraftsRef = useRef(incomeDrafts);
  const currentDraftIndexRef = useRef(currentDraftIndex);
  const incomeFormStateRef = useRef(null);
  incomeDraftsRef.current = incomeDrafts;
  currentDraftIndexRef.current = currentDraftIndex;
  incomeFormStateRef.current = { amount, vatAmount, vatRate, vatAmountEdited, reference, label, notes, selectedDate, attachments };

  const draftSlideX = useRef(new Animated.Value(0)).current;
  const draftFade = useRef(new Animated.Value(1)).current;

  // Flash animations for OCR-populated fields
  const flashAmount = useRef(new Animated.Value(0)).current;
  const flashVat = useRef(new Animated.Value(0)).current;
  const flashDate = useRef(new Animated.Value(0)).current;
  const flashReference = useRef(new Animated.Value(0)).current;

  const flashField = (animValue) => {
    animValue.setValue(1);
    Animated.timing(animValue, {
      toValue: 0,
      duration: 1800,
      useNativeDriver: false,
    }).start();
  };

  // ─── Multi-draft helpers ────────────────────────────────────────────────────

  const createIncomeDraftFromGroup = ({ analysis, assets }) => {
    const draftAmount = analysis?.amount != null ? Number(analysis.amount).toFixed(2) : "";
    const draftVatAmount = analysis?.vat?.value != null ? Number(analysis.vat.value).toFixed(2) : "";
    const draftVatRate = analysis?.vat?.rate != null ? String(analysis.vat.rate) : "";
    const parsedDate = analysis?.date ? new Date(analysis.date) : null;
    return {
      amount: draftAmount,
      vatAmount: draftVatAmount,
      vatRate: draftVatRate,
      vatAmountEdited: Boolean(draftVatAmount),
      reference: analysis?.reference || "",
      label: "",
      notes: "",
      selectedDate: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : new Date(),
      attachments: (assets || []).map((asset) => createImageAttachment(asset)),
    };
  };

  const applyIncomeDraftToForm = (draft) => {
    setAmount(draft?.amount || "");
    setVatAmount(draft?.vatAmount || "");
    setVatRate(draft?.vatRate || "");
    setVatAmountEdited(Boolean(draft?.vatAmountEdited));
    setReference(draft?.reference || "");
    setLabel(draft?.label || "");
    setNotes(draft?.notes || "");
    setSelectedDate(draft?.selectedDate ? new Date(draft.selectedDate) : new Date());
    setAttachments(Array.isArray(draft?.attachments) ? [...draft.attachments] : []);
  };

  const buildCurrentIncomeDraft = () => {
    const f = incomeFormStateRef.current || { amount, vatAmount, vatRate, vatAmountEdited, reference, label, notes, selectedDate, attachments };
    return {
      amount: f.amount,
      vatAmount: f.vatAmount,
      vatRate: f.vatRate,
      vatAmountEdited: f.vatAmountEdited,
      reference: f.reference,
      label: f.label,
      notes: f.notes,
      selectedDate: new Date(f.selectedDate),
      attachments: [...f.attachments],
    };
  };

  const syncIncomeDrafts = () => {
    const drafts = incomeDraftsRef.current;
    const index = currentDraftIndexRef.current;
    if (drafts.length <= 1) return drafts;
    const snapshot = buildCurrentIncomeDraft();
    const next = drafts.map((d, i) => i === index ? { ...d, ...snapshot } : d);
    setIncomeDrafts(next);
    return next;
  };

  const animateDraftTransition = (direction = "next") => {
    draftSlideX.setValue(direction === "next" ? 28 : -28);
    draftFade.setValue(0.75);
    Animated.parallel([
      Animated.timing(draftSlideX, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(draftFade, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  };

  const navigateToIncomeDraft = (index) => {
    const drafts = incomeDraftsRef.current;
    const currentIndex = currentDraftIndexRef.current;
    if (index < 0 || index >= drafts.length) return;
    const synced = syncIncomeDrafts();
    const direction = index > currentIndex ? "next" : "previous";
    const target = synced[index];
    if (!target) return;
    setCurrentDraftIndex(index);
    applyIncomeDraftToForm(target);
    animateDraftTransition(direction);
  };

  const draftSwipeResponder = React.useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        isMultiDraftMode && Math.abs(dx) > 18 && Math.abs(dx) > Math.abs(dy) * 1.4,
      onPanResponderRelease: (_, { dx, dy }) => {
        if (!isMultiDraftMode) return;
        if (Math.abs(dx) < 72 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
        if (dx < 0) navigateToIncomeDraft(currentDraftIndexRef.current + 1);
        else navigateToIncomeDraft(currentDraftIndexRef.current - 1);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isMultiDraftMode],
  );

  const confirmIncomeDraft = () => {
    const synced = syncIncomeDrafts();
    setDraftReviewStates((prev) => {
      const next = [...prev];
      next[currentDraftIndexRef.current] = "confirmed";
      return next;
    });
    triggerHaptic("success").catch(() => {});
    const nextIndex = currentDraftIndexRef.current + 1;
    if (nextIndex < synced.length) {
      navigateToIncomeDraft(nextIndex);
    }
  };

  const skipIncomeDraft = () => {
    syncIncomeDrafts();
    setDraftReviewStates((prev) => {
      const next = [...prev];
      next[currentDraftIndexRef.current] = "skipped";
      return next;
    });
    triggerHaptic("selection").catch(() => {});
    const nextIndex = currentDraftIndexRef.current + 1;
    if (nextIndex < incomeDraftsRef.current.length) {
      navigateToIncomeDraft(nextIndex);
    }
  };

  const handleSaveReviewedIncomes = async () => {
    if (!allDraftsReviewed) return;
    const user = auth.currentUser;
    if (!user) { Alert.alert("Authentication Error", "Please sign in again."); return; }

    setIsSaving(true);
    try {
      const synced = syncIncomeDrafts();
      const savedRows = [];

      for (let i = 0; i < synced.length; i += 1) {
        if (draftReviewStates[i] !== "confirmed") continue;
        const draft = synced[i];
        const uploaded = await uploadAttachmentEntries({
          folder: "income",
          userId: user.uid,
          attachments: draft.attachments,
        });
        await addDoc(collection(db, "income"), {
          amount: Number(draft.amount),
          vatAmount: Number(draft.vatAmount),
          vatRate: Number(draft.vatRate),
          date: new Date(draft.selectedDate).toISOString(),
          reference: (draft.reference || "").trim(),
          label: (draft.label || "").trim(),
          notes: (draft.notes || "").trim(),
          attachments: uploaded,
          userId: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        savedRows.push({
          amount: draft.amount,
          vatAmount: draft.vatAmount,
          date: formatDate(new Date(draft.selectedDate)),
          reference: draft.reference,
        });
      }

      setBatchSaveSummary({
        saved: savedRows,
        skippedCount: draftReviewStates.filter((s) => s === "skipped").length,
      });
      setShowBatchSummaryModal(true);
      triggerHaptic("success").catch(() => {});
    } catch (err) {
      console.error("Batch income save failed:", err);
      Alert.alert("Save Failed", "Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  // ─── End multi-draft helpers ─────────────────────────────────────────────────

  const applyOcrResult = (extracted) => {    if (extracted.amount) {
      setAmount(String(extracted.amount));
      flashField(flashAmount);
    }
    if (extracted.vat?.value != null) {
      setVatAmount(String(extracted.vat.value.toFixed(2)));
      setVatAmountEdited(true);
      flashField(flashVat);
    }
    if (extracted.date) {
      try {
        const d = new Date(extracted.date);
        if (!isNaN(d.getTime())) {
          setSelectedDate(d);
          flashField(flashDate);
        }
      } catch (_) {}
    }
    if (extracted.vendor) {
      setReference(extracted.vendor);
      flashField(flashReference);
    }
  };


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

  // Process images passed via route params (from AddReceiptSheet)
  useEffect(() => {
    const initialImages = route?.params?.initialImages;
    if (!initialImages?.length) return;
    let cancelled = false;

    (async () => {
      setIsDetecting(true);
      try {
        const groups = await detectReceiptGroupsFromAssets(initialImages);
        if (cancelled) return;

        const effectiveGroups = groups.length > 0
          ? groups
          : [{ assets: initialImages, analysis: {} }];

        if (effectiveGroups.length === 1) {
          // Single income statement — populate form directly
          const newAttachments = (effectiveGroups[0].assets || []).map(createImageAttachment);
          setAttachments((prev) => [...prev, ...newAttachments]);
          const extracted = await runOcrOnAssets(effectiveGroups[0].assets || initialImages);
          if (!cancelled) applyOcrResult(extracted);
        } else {
          // Multiple income statements detected — enter multi-draft mode
          const drafts = effectiveGroups.map((g) => createIncomeDraftFromGroup(g));
          setIncomeDrafts(drafts);
          setDraftReviewStates(Array(drafts.length).fill("pending"));
          setCurrentDraftIndex(0);
          applyIncomeDraftToForm(drafts[0]);
          setShowDetectedIncomeModal(true);
        }
      } catch (err) {
        console.error("OCR error (income):", err);
        // Fallback: add all images as attachments
        const newAttachments = initialImages.map(createImageAttachment);
        if (!cancelled) setAttachments((prev) => [...prev, ...newAttachments]);
      } finally {
        if (!cancelled) setIsDetecting(false);
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      {/* Fixed image panel */}
      <View
        style={styles.imageSection}
        onLayout={(e) => setImageContainerWidth(e.nativeEvent.layout.width)}
      >
        {imageContainerWidth > 0 ? (
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={{ width: imageContainerWidth }}
          >
            {attachments.filter(isImageAttachment).map((att, index) => {
              const uri = getAttachmentUri(att);
              return (
                <View key={att.id || String(index)} style={{ position: "relative" }}>
                  <TouchableOpacity
                    style={[styles.carouselPage, { width: imageContainerWidth }]}
                    activeOpacity={0.9}
                    onPress={() => setFullScreenImageIndex(index)}
                  >
                    <Image
                      source={{ uri }}
                      style={[styles.carouselImage, { width: imageContainerWidth }]}
                      resizeMode="contain"
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.carouselRemoveBtn}
                    onPress={() => setAttachments((current) => current.filter((item) => item.id !== att.id))}
                  >
                    <Text style={styles.carouselRemoveText}>×</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
            <View style={[styles.carouselPage, { width: imageContainerWidth }]}>
              <TouchableOpacity style={styles.carouselAddBtn} onPress={pickImageOption}>
                <Text style={ReceiptStyles.plus}>+</Text>
              </TouchableOpacity>
              {tipStatusLoaded && showTip ? <ScannerTooltip onDismiss={dismissTip} text="Tap here to scan an invoice" /> : null}
            </View>
          </ScrollView>
        ) : null}
        {ocrProcessing && (
          <View style={styles.scanningBanner}>
            <View style={styles.scanningBannerRow}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.scanningBannerText}>Scanning…</Text>
            </View>
            <ProgressBar
              indeterminate
              color="#fff"
              style={{ alignSelf: "stretch", marginTop: 6, borderRadius: 4 }}
            />
          </View>
        )}
      </View>

      {/* Floating X close button */}
      <TouchableOpacity
        style={styles.floatingCloseBtn}
        onPress={() => navigateBackToIncome(navigation)}
        activeOpacity={0.8}
      >
        <Text style={styles.floatingCloseBtnText}>✕</Text>
      </TouchableOpacity>

      <KeyboardAwareScrollView
        contentContainerStyle={styles.scrollContent}
        enableOnAndroid
        keyboardShouldPersistTaps="handled"
      >
        <View style={ReceiptStyles.container}>
          <Animated.View
            style={[ReceiptStyles.borderContainer, { transform: [{ translateX: draftSlideX }], opacity: draftFade }]}
            {...(isMultiDraftMode ? draftSwipeResponder.panHandlers : {})}
          >
            <Text style={ReceiptStyles.header}>
              {mode === "edit" ? "Edit Income" : isMultiDraftMode ? "Review Income" : "Add Income"}
            </Text>
            {isMultiDraftMode && (
              <View style={{ alignItems: "center", marginBottom: 6 }}>
                <Text style={{ color: Colors.accent, fontWeight: "700", fontSize: 14 }}>
                  Income {currentDraftIndex + 1} / {incomeDrafts.length}
                </Text>
                <Text style={{ color: Colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                  Swipe left or right to move between statements.
                </Text>
                <Text style={{ color: Colors.textSecondary, fontSize: 12 }}>
                  Confirmed: {draftReviewStates.filter((s) => s === "confirmed").length}  Skipped: {draftReviewStates.filter((s) => s === "skipped").length}
                </Text>
              </View>
            )}

            <Animated.View style={[styles.fieldGroup, {
                backgroundColor: flashAmount.interpolate({ inputRange: [0, 1], outputRange: ["transparent", "rgba(253,224,71,0.45)"] }),
                borderRadius: 6,
              }]}>
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
            </Animated.View>

            <Animated.View style={[styles.fieldGroup, {
                backgroundColor: flashDate.interpolate({ inputRange: [0, 1], outputRange: ["transparent", "rgba(253,224,71,0.45)"] }),
                borderRadius: 6,
              }]}>
              <Text style={ReceiptStyles.label}>Date:</Text>
              <TouchableOpacity
                style={[ReceiptStyles.dateButton, styles.dateButtonAligned]}
                onPress={() => setDatePickerVisibility(true)}
              >
                <Text style={ReceiptStyles.dateText}>{formatDate(selectedDate)}</Text>
              </TouchableOpacity>
            </Animated.View>

            <Animated.View style={[styles.fieldGroup, {
                backgroundColor: flashReference.interpolate({ inputRange: [0, 1], outputRange: ["transparent", "rgba(253,224,71,0.45)"] }),
                borderRadius: 6,
              }]}>
              <Text style={ReceiptStyles.label}>Reference:</Text>
              <TextInput
                value={reference}
                onChangeText={setReference}
                placeholder="Invoice number or source"
                placeholderTextColor={stylesConst.placeholder}
                style={ReceiptStyles.input}
              />
            </Animated.View>

            <View style={styles.moneyRow}>
              <Animated.View style={[styles.moneyColumn, {
                  backgroundColor: flashVat.interpolate({ inputRange: [0, 1], outputRange: ["transparent", "rgba(253,224,71,0.45)"] }),
                  borderRadius: 6,
                }]}>
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
              </Animated.View>
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

            {(() => {
              const isCurrentConfirmed = draftReviewStates[currentDraftIndex] === "confirmed";
              const isCurrentSkipped = draftReviewStates[currentDraftIndex] === "skipped";
              return (
                <View style={styles.actionRow}>
                  {isMultiDraftMode ? (
                    <>
                      <Button
                        mode={isCurrentSkipped ? "contained" : "outlined"}
                        buttonColor={isCurrentSkipped ? "#555" : undefined}
                        textColor={isCurrentSkipped ? "#fff" : Colors.accent}
                        style={[
                          styles.multiActionButton,
                          isCurrentConfirmed ? styles.multiActionFaded : null,
                        ]}
                        onPress={skipIncomeDraft}
                      >
                        {isCurrentSkipped ? "Skipped" : "Skip"}
                      </Button>
                      <Button
                        mode={isCurrentConfirmed ? "contained" : "outlined"}
                        buttonColor={isCurrentConfirmed ? Colors.accent : undefined}
                        textColor={isCurrentConfirmed ? "#fff" : Colors.accent}
                        style={[
                          styles.multiActionButton,
                          isCurrentSkipped ? styles.multiActionFaded : null,
                        ]}
                        onPress={confirmIncomeDraft}
                        disabled={!isIncomeFormValid}
                      >
                        {isCurrentConfirmed ? "Confirmed" : "Confirm"}
                      </Button>
                    </>
                  ) : (
                    <>
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
                    </>
                  )}
                </View>
              );
            })()}

            {isMultiDraftMode ? (
              <>
                <Button
                  mode="contained"
                  onPress={handleSaveReviewedIncomes}
                  buttonColor={allDraftsReviewed ? Colors.accent : "#c6c6c6"}
                  textColor={allDraftsReviewed ? "#fff" : "#8a8a8a"}
                  style={styles.saveAllButton}
                  disabled={!allDraftsReviewed || isSaving}
                >
                  Save Income Records
                </Button>
                <Button
                  mode="text"
                  onPress={() => navigateBackToIncome(navigation)}
                  textColor={Colors.accent}
                  style={styles.cancelTextButton}
                >
                  Cancel
                </Button>
              </>
            ) : null}

            <View style={[styles.fieldGroup, styles.notesSection]}>
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
          </Animated.View>
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

      {/* Carousel fullscreen modal */}
      <Modal
        visible={fullScreenImageIndex !== null}
        animationType="fade"
        presentationStyle="fullScreen"
        transparent={false}
        onRequestClose={() => setFullScreenImageIndex(null)}
      >
        {fullScreenImageIndex !== null ? (
          <>
            <ImageViewer
              imageUrls={attachments.filter(isImageAttachment).map(att => ({ url: getAttachmentUri(att) }))}
              index={fullScreenImageIndex}
              enableSwipeDown
              onSwipeDown={() => setFullScreenImageIndex(null)}
              onClick={() => setFullScreenImageIndex(null)}
              backgroundColor="black"
              renderIndicator={attachments.filter(isImageAttachment).length > 1 ? undefined : () => null}
              saveToLocalByLongPress={false}
            />
            <TouchableOpacity
              style={ReceiptStyles.fullScreenCloseButton}
              onPress={() => setFullScreenImageIndex(null)}
            >
              <Text style={ReceiptStyles.fullScreenCloseText}>✕</Text>
            </TouchableOpacity>
          </>
        ) : null}
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
              <Text style={ReceiptStyles.fullScreenCloseText}>✕</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </Modal>

      {/* Detected income modal */}
      <Modal
        visible={showDetectedIncomeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDetectedIncomeModal(false)}
      >
        <View style={ReceiptStyles.modalOverlay}>
          <View style={ReceiptStyles.modalContent}>
            <Text style={ReceiptStyles.modalTitle}>Multiple income statements detected</Text>
            <Text style={ReceiptStyles.modalDetailText}>
              We detected {incomeDrafts.length} income statement{incomeDrafts.length === 1 ? "" : "s"}. We will now go through each one so you can confirm or skip the detected details.
            </Text>
            <View style={ReceiptStyles.modalButtons}>
              <Button
                mode="contained"
                buttonColor={Colors.accent}
                onPress={() => setShowDetectedIncomeModal(false)}
              >
                Start review
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      {/* Batch summary modal */}
      <Modal
        visible={showBatchSummaryModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBatchSummaryModal(false)}
      >
        <View style={ReceiptStyles.modalOverlay}>
          <View style={ReceiptStyles.modalContent}>
            <Text style={ReceiptStyles.modalTitle}>Income saved</Text>
            <Text style={[ReceiptStyles.modalDetailText, styles.summaryHeading]}>Saved -</Text>
            {batchSaveSummary.saved.length > 0 ? (
              <View style={styles.summaryListWrap}>
                {batchSaveSummary.saved.map((entry, index) => (
                  <Text key={`${entry.date}-${entry.amount}-${index}`} style={ReceiptStyles.modalDetailText}>
                    £{entry.amount} — {entry.reference || "—"} — {entry.date}
                  </Text>
                ))}
              </View>
            ) : (
              <Text style={ReceiptStyles.modalDetailText}>None</Text>
            )}
            <Text style={[ReceiptStyles.modalDetailText, styles.summaryHeading]}>
              Skipped — {batchSaveSummary.skippedCount}
            </Text>
            <View style={ReceiptStyles.modalButtons}>
              <Button
                mode="outlined"
                textColor={Colors.accent}
                onPress={() => {
                  setShowBatchSummaryModal(false);
                  setIncomeDrafts([]);
                  setDraftReviewStates([]);
                  setCurrentDraftIndex(0);
                  navigateBackToIncome(navigation);
                }}
              >
                Go to Income
              </Button>
              <Button
                mode="contained"
                buttonColor={Colors.accent}
                onPress={() => {
                  setShowBatchSummaryModal(false);
                  setIncomeDrafts([]);
                  setDraftReviewStates([]);
                  setCurrentDraftIndex(0);
                }}
              >
                Add another
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      {/* Detecting overlay */}
      {isDetecting && (
        <View style={styles.detectingOverlay}>
          <View style={ReceiptStyles.uploadCard}>
            <ActivityIndicator size="large" color={Colors.accent} />
            <Text style={{ marginTop: 12, fontWeight: "700", fontSize: 15 }}>
              Detecting income statements…
            </Text>
            <Text style={{ marginTop: 4, color: "#666", fontSize: 12, textAlign: "center" }}>
              Please wait while we analyse your images
            </Text>
          </View>
        </View>
      )}

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
  imageSection: {
    height: IMAGE_HEIGHT,
    overflow: "hidden",
    backgroundColor: "#000",
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  carouselPage: {
    height: IMAGE_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
  },
  carouselImage: {
    height: IMAGE_HEIGHT,
  },
  carouselAddBtn: {
    flex: 1,
    alignSelf: "stretch",
    justifyContent: "center",
    alignItems: "center",
  },
  carouselRemoveBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
  },
  carouselRemoveText: {
    color: "#fff",
    fontSize: 20,
    lineHeight: 20,
    fontWeight: "bold",
  },
  scanningBanner: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.65)",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  scanningBannerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  scanningBannerText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  floatingCloseBtn: {
    position: "absolute",
    top: 12,
    left: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#a60d49",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 200,
    elevation: 6,
  },
  floatingCloseBtnText: {
    color: "#fff",
    fontSize: 18,
    lineHeight: 20,
    fontWeight: "bold",
  },
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
  multiActionButton: {
    flex: 1,
    marginHorizontal: 4,
  },
  multiActionFaded: {
    opacity: 0.45,
  },
  saveAllButton: {
    marginTop: 12,
    borderRadius: 8,
  },
  cancelTextButton: {
    marginTop: 4,
  },
  summaryHeading: {
    fontWeight: "700",
    marginTop: 8,
    marginBottom: 2,
  },
  summaryListWrap: {
    marginBottom: 6,
  },
  detectingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,1)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1200,
  },
  notesSection: { marginTop: 10 },
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