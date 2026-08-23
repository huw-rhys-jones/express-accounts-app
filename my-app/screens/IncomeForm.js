import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
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
  TouchableWithoutFeedback,
  View,
} from "react-native";
import ImageViewer from "react-native-image-zoom-viewer";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
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
import {
  getCurrentFinancialQuarter,
  getCurrentYearAprilSix,
  startOfDayLocal,
} from "../utils/financialPeriods";
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
import { getIncomeFilterKey, setIncomeFilterKey } from "../utils/appSettings";
import { useData } from "../contexts/DataContext";
import { calculateCis, isVatRegistered, VAT_TREATMENTS } from "../utils/taxCalculations";

const IMAGE_HEIGHT = Math.round(Dimensions.get("window").height * 0.45);

const ANNOTATIONS = [
  { key: "amount", label: "Amount", color: "#2E9F46" },
  { key: "date",   label: "Date",   color: "#1A73E8" },
  { key: "vat",    label: "VAT",    color: "#E06B6B" },
];

const DEBUG_DISABLE_KEYBOARD_DISMISS_WRAPPER = true;

function extractCisMaterialsAmount(rawText) {
  const match = String(rawText || "").match(
    /\bmaterials?(?:\s+(?:amount|total))?\s*[:=-]?\s*(?:£\s*)?([0-9][0-9,]*\.\d{2})\b/i,
  );
  return match ? Number(match[1].replace(/,/g, "")) : null;
}

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
  const insets = useSafeAreaInsets();
  const { refreshIncome, userProfile } = useData();
  const heroHeightAnim = useRef(new Animated.Value(HERO_EXPANDED_HEIGHT)).current;
  const [heroHeight, setHeroHeight] = useState(HERO_EXPANDED_HEIGHT);
  const income = route?.params?.income;
  const initialIncomeList = useMemo(() => {
    if (Array.isArray(route?.params?.incomeList) && route.params.incomeList.length > 0) {
      return route.params.incomeList;
    }
    return income ? [income] : [];
  }, [income, route?.params?.incomeList]);
  const [editableIncomeList, setEditableIncomeList] = useState(initialIncomeList);
  const [currentIndex, setCurrentIndex] = useState(route?.params?.initialIndex || 0);

  useEffect(() => {
    setEditableIncomeList(initialIncomeList);
    setCurrentIndex(route?.params?.initialIndex || 0);
  }, [initialIncomeList, route?.params?.initialIndex]);

  const currentIncome = mode === "edit"
    ? editableIncomeList[currentIndex] || income
    : income;
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
  const [cisApplies, setCisApplies] = useState(Boolean(income?.cis?.applies));
  const [cisMaterialsAmount, setCisMaterialsAmount] = useState(
    income?.cis?.materialsAmount != null ? String(income.cis.materialsAmount) : "0",
  );
  const [cisDeductionRate, setCisDeductionRate] = useState(
    income?.cis?.deductionRate != null ? String(income.cis.deductionRate) : "20",
  );
  const [vatTreatment, setVatTreatment] = useState(
    income?.vat?.treatment || income?.vatTreatment || VAT_TREATMENTS.STANDARD,
  );
  const vatEnabled = isVatRegistered(userProfile) || income?.vatAmount != null || currentIncome?.vatAmount != null;

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
  const [imageContainerHeight, setImageContainerHeight] = useState(HERO_EXPANDED_HEIGHT);
  const [fullScreenImageIndex, setFullScreenImageIndex] = useState(null);
  const [ocrFrames, setOcrFrames] = useState(null);

  // Multi-statement draft mode (when multiple income images are detected)
  const [incomeDrafts, setIncomeDrafts] = useState([]);
  const [currentDraftIndex, setCurrentDraftIndex] = useState(0);
  const [draftReviewStates, setDraftReviewStates] = useState([]); // "pending"|"confirmed"|"skipped"
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectProgress, setDetectProgress] = useState(0);
  const [detectMode, setDetectMode] = useState("auto");
  const pendingDetectionAssetsRef = useRef([]);
  const detectRequestIdRef = useRef(0);
  const [showBatchSummaryModal, setShowBatchSummaryModal] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const toastOpacity = useRef(new Animated.Value(0)).current;
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
  incomeFormStateRef.current = { amount, vatAmount, vatRate, vatAmountEdited, reference, label, notes, selectedDate, attachments, cisApplies, cisMaterialsAmount, cisDeductionRate, vatTreatment };

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

  const createIncomeDraftFromGroup = ({ analysis, assets, ocrFrames: groupOcrFrames }) => {
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
      cisApplies: /\bCIS\b|CONSTRUCTION INDUSTRY SCHEME/i.test(String(analysis?.raw || "")),
      cisMaterialsAmount: String(extractCisMaterialsAmount(analysis?.raw) || 0),
      cisDeductionRate: "20",
      vatTreatment: VAT_TREATMENTS.STANDARD,
      selectedDate: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : new Date(),
      attachments: (assets || []).map((asset) => createImageAttachment(asset)),
      ocrFrames: groupOcrFrames || null,
    };
  };

  const applyIncomeDraftToForm = (draft) => {
    setAmount(draft?.amount || "");
    setVatAmount(draft?.vatAmount || "");
    setVatRate(draft?.vatRate || "");
    setVatAmountEdited(Boolean(draft?.vatAmountEdited));
    setCisApplies(Boolean(draft?.cisApplies));
    setCisMaterialsAmount(draft?.cisMaterialsAmount || "0");
    setCisDeductionRate(draft?.cisDeductionRate || "20");
    setVatTreatment(draft?.vatTreatment || VAT_TREATMENTS.STANDARD);
    setReference(draft?.reference || "");
    setLabel(draft?.label || "");
    setNotes(draft?.notes || "");
    setSelectedDate(draft?.selectedDate ? new Date(draft.selectedDate) : new Date());
    setAttachments(Array.isArray(draft?.attachments) ? [...draft.attachments] : []);
    setOcrFrames(draft?.ocrFrames || null);
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
      cisApplies: f.cisApplies,
      cisMaterialsAmount: f.cisMaterialsAmount,
      cisDeductionRate: f.cisDeductionRate,
      vatTreatment: f.vatTreatment,
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

  const detailSwipeResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          if (mode !== "edit" || isMultiDraftMode || editableIncomeList.length <= 1) {
            return false;
          }
          const { dx, dy } = gestureState;
          return Math.abs(dx) > 22 && Math.abs(dx) > Math.abs(dy) * 1.4;
        },
        onPanResponderRelease: (_, gestureState) => {
          if (mode !== "edit" || isMultiDraftMode || editableIncomeList.length <= 1) {
            return;
          }
          const { dx, dy } = gestureState;
          if (Math.abs(dx) < 72 || Math.abs(dx) < Math.abs(dy) * 1.2) return;

          Keyboard.dismiss();
          if (dx < 0) {
            setCurrentIndex((prev) => Math.min(prev + 1, editableIncomeList.length - 1));
          } else {
            setCurrentIndex((prev) => Math.max(prev - 1, 0));
          }
        },
      }),
    [editableIncomeList.length, isMultiDraftMode, mode],
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
        const cis = draft.cisApplies
          ? { applies: true, materialsAmount: Number(draft.cisMaterialsAmount) || 0, deductionRate: Number(draft.cisDeductionRate) || 0, ...calculateCis({ grossAmount: draft.amount, vatAmount: draft.vatAmount, materialsAmount: draft.cisMaterialsAmount, deductionRate: draft.cisDeductionRate }) }
          : null;
        await addDoc(collection(db, "income"), {
          amount: Number(draft.amount),
          vatAmount: Number(draft.vatAmount),
          vatRate: Number(draft.vatRate),
          vat: { applies: vatEnabled, treatment: draft.vatTreatment || VAT_TREATMENTS.STANDARD },
          cis,
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

      await refreshIncome();

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
    if (/\bCIS\b|CONSTRUCTION INDUSTRY SCHEME/i.test(String(extracted?.raw || ""))) {
      setCisApplies(true);
      const materialsAmount = extractCisMaterialsAmount(extracted.raw);
      if (materialsAmount != null) setCisMaterialsAmount(String(materialsAmount));
    }
    if (extracted?.ocrFrames) {
      setOcrFrames(extracted.ocrFrames);
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
    () => normalizeStoredAttachments((mode === "edit" ? currentIncome?.attachments : income?.attachments) || []),
    [currentIncome?.attachments, income?.attachments, mode]
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
    if (vatEnabled && !vatAmountEdited && amount && vatRate) {
      const gross = parseFloat(amount);
      const rate = parseFloat(vatRate);
      if (isFinite(gross) && isFinite(rate)) {
        const net = gross / (1 + rate / 100);
        setVatAmount((gross - net).toFixed(2));
      }
    }
  }, [amount, vatRate, vatAmountEdited]);

  useEffect(() => {
    if (mode !== "edit" || !currentIncome) return;
    setAmount(currentIncome?.amount != null ? String(currentIncome.amount) : "");
    setVatAmount(currentIncome?.vatAmount != null ? String(currentIncome.vatAmount) : "");
    setVatRate(currentIncome?.vatRate != null ? String(currentIncome.vatRate) : "");
    setVatAmountEdited(currentIncome?.vatAmount != null && currentIncome?.vatAmount !== "");
    setCisApplies(Boolean(currentIncome?.cis?.applies));
    setCisMaterialsAmount(currentIncome?.cis?.materialsAmount != null ? String(currentIncome.cis.materialsAmount) : "0");
    setCisDeductionRate(currentIncome?.cis?.deductionRate != null ? String(currentIncome.cis.deductionRate) : "20");
    setVatTreatment(currentIncome?.vat?.treatment || currentIncome?.vatTreatment || VAT_TREATMENTS.STANDARD);
    setReference(currentIncome?.reference || "");
    setLabel(currentIncome?.label || "");
    setNotes(currentIncome?.notes || "");
    setSelectedDate(currentIncome?.date ? new Date(currentIncome.date) : new Date());
    setAttachments(normalizeStoredAttachments(currentIncome?.attachments || []));
  }, [currentIncome?.id, mode]);

  useEffect(() => {
    const id = heroHeightAnim.addListener(({ value }) => {
      setHeroHeight(value);
      setImageContainerHeight(value);
    });
    return () => heroHeightAnim.removeListener(id);
  }, [heroHeightAnim]);

  useEffect(() => {
    const shrinkHero = () => {
      Animated.timing(heroHeightAnim, {
        toValue: HERO_COLLAPSED_HEIGHT,
        duration: 220,
        useNativeDriver: false,
      }).start();
    };

    const expandHero = () => {
      Animated.timing(heroHeightAnim, {
        toValue: HERO_EXPANDED_HEIGHT,
        duration: 220,
        useNativeDriver: false,
      }).start();
    };

    const showSub = Keyboard.addListener("keyboardDidShow", shrinkHero);
    const hideSub = Keyboard.addListener("keyboardDidHide", expandHero);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [heroHeightAnim]);

  const processInitialImages = React.useCallback(async (initialImages, { preferLocal = false } = {}) => {
    const requestId = detectRequestIdRef.current + 1;
    detectRequestIdRef.current = requestId;
    pendingDetectionAssetsRef.current = initialImages;
    setIsDetecting(true);
    setDetectProgress(0);
    setDetectMode("auto");

    if (preferLocal) {
      setDetectMode("local");
    } else {
      setIsDetecting(true);
      try {
        const user = auth.currentUser;
        if (!user) {
          setDetectMode("local");
        } else {
          const userSnap = await getDoc(doc(db, "users", user.uid));
          const isVerified = userSnap.exists() && userSnap.data()?.verificationStatus === "verified";
          setDetectMode(isVerified ? "cloud" : "local");
        }
      } catch {
        setDetectMode("local");
      }
    }

    try {
      const groups = await detectReceiptGroupsFromAssets(
        initialImages,
        (progress) => {
          if (detectRequestIdRef.current === requestId) setDetectProgress(progress);
        },
        { preferLocal },
      );
      if (detectRequestIdRef.current !== requestId) return;

      const effectiveGroups = groups.length > 0
        ? groups
        : [{ assets: initialImages, analysis: {} }];

      if (effectiveGroups.length === 1) {
        const group = effectiveGroups[0];
        setAttachments((group.assets || []).map(createImageAttachment));
        applyOcrResult({ ...(group.analysis || {}), ocrFrames: group.ocrFrames || group.analysis?.ocrFrames || null });
      } else {
        const drafts = effectiveGroups.map((group) => createIncomeDraftFromGroup(group));
        setIncomeDrafts(drafts);
        setDraftReviewStates(Array(drafts.length).fill("pending"));
        setCurrentDraftIndex(0);
        applyIncomeDraftToForm(drafts[0]);
        showToast(`${drafts.length} income statements detected`);
      }
    } catch (error) {
      if (detectRequestIdRef.current !== requestId) return;
      console.error("OCR error (income):", error);
      setAttachments(initialImages.map(createImageAttachment));
    } finally {
      if (detectRequestIdRef.current === requestId) {
        setIsDetecting(false);
        setDetectProgress(0);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancelDetectionAndExit = () => {
    detectRequestIdRef.current += 1;
    setIsDetecting(false);
    setDetectProgress(0);
    navigateBackToIncome(navigation);
  };

  const processDetectionLocally = () => {
    const assets = pendingDetectionAssetsRef.current;
    if (assets.length > 0) processInitialImages(assets, { preferLocal: true });
  };

  // Process images passed via route params (from AddReceiptSheet)
  useEffect(() => {
    const initialImages = route?.params?.initialImages;
    if (!initialImages?.length) return;
    processInitialImages(initialImages);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.params?.initialImages]);

  const showToast = (message) => {
    setToastMessage(message);
    setToastVisible(true);
    toastOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(toastOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => setToastVisible(false));
  };

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

    if (vatEnabled && (!vatAmount || Number(vatAmount) < 0 || !vatRate || Number(vatRate) < 0)) {
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
      const maybeSwitchIncomeFilterToAllTime = async (savedDate) => {
        try {
          const activeKey = await getIncomeFilterKey();
          if (activeKey !== "current-quarter") return;

          const quarter = getCurrentFinancialQuarter(new Date());
          const start = startOfDayLocal(quarter.startDate).getTime();
          const end = startOfDayLocal(quarter.endDate).getTime();
          const t = startOfDayLocal(savedDate).getTime();

          if (t < start || t > end) {
            await setIncomeFilterKey("all-time");
          }
        } catch {
          // Non-blocking filter adjustment
        }
      };

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

      const cis = cisApplies
        ? { applies: true, materialsAmount: Number(cisMaterialsAmount) || 0, deductionRate: Number(cisDeductionRate) || 0, ...calculateCis({ grossAmount: amount, vatAmount, materialsAmount: cisMaterialsAmount, deductionRate: cisDeductionRate }) }
        : null;
      const payload = {
        amount: Number(amount),
        vatAmount: vatEnabled ? Number(vatAmount) : 0,
        vatRate: vatEnabled ? Number(vatRate) : 0,
        vat: { applies: vatEnabled, treatment: vatEnabled ? vatTreatment : VAT_TREATMENTS.LEGACY },
        cis,
        date: selectedDate.toISOString(),
        reference: reference.trim(),
        label: label.trim(),
        notes: notes.trim(),
        attachments: uploadedAttachments,
        userId: user.uid,
        updatedAt: serverTimestamp(),
      };

      if (mode === "edit" && currentIncome?.id) {
        await updateDoc(doc(db, "income", currentIncome.id), payload);
      } else {
        await addDoc(collection(db, "income"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }

      await maybeSwitchIncomeFilterToAllTime(selectedDate);
      await refreshIncome();

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
    if (!(mode === "edit" && currentIncome?.id)) return;

    Alert.alert("Delete Income", "Delete this income record and its attachments?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setIsSaving(true);
          try {
            await deleteStoredAttachments(attachments);
            await deleteDoc(doc(db, "income", currentIncome.id));
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

  const confirmRemoveImage = (onConfirm) => {
    Alert.alert("Remove Image", "Are you sure you want to remove this image?", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: onConfirm },
    ]);
  };

  const removeAttachmentByUri = (uriToRemove) => {
    if (!uriToRemove) return;
    setAttachments((current) =>
      current.filter((item) => getAttachmentUri(item) !== uriToRemove)
    );
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
            confirmRemoveImage(() => {
              removeAttachmentByUri(uri);
            })
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
    confirmRemoveImage(() => {
      removeAttachmentByUri(preview.uri);
      setOcrModalVisible(false);
    });
  };

  const amountNumber = parseFloat(amount);
  const vatAmountNumber = parseFloat(vatAmount);
  const vatRateNumber = parseFloat(vatRate);
  const isAmountValid = Number.isFinite(amountNumber) && amountNumber > 0;
  const isDateValid = selectedDate instanceof Date && !Number.isNaN(selectedDate.getTime());
  const isVatAmountValid = Number.isFinite(vatAmountNumber) && vatAmountNumber >= 0;
  const isVatRateValid = Number.isFinite(vatRateNumber) && vatRateNumber >= 0;
  const isIncomeFormValid =
    isAmountValid &&
    isDateValid &&
    (!vatEnabled || (isVatAmountValid && isVatRateValid));

  const buildPercentOverlay = (frame) => {
    const naturalW = ocrFrames?.imageW;
    const naturalH = ocrFrames?.imageH;
    const containerW = imageContainerWidth;
    const containerH = imageContainerHeight || heroHeight;
    if (!frame || !naturalW || !naturalH || !containerW || !containerH) return null;

    const scale = Math.min(containerW / naturalW, containerH / naturalH);
    const renderedW = naturalW * scale;
    const renderedH = naturalH * scale;
    const offsetX = (containerW - renderedW) / 2;
    const offsetY = (containerH - renderedH) / 2;
    const PAD = 8;

    const left = frame.left * scale + offsetX - PAD;
    const top = frame.top * scale + offsetY - PAD;
    const width = frame.width * scale + PAD * 2;
    const height = frame.height * scale + PAD * 2;

    const toPct = (value, total) => `${Math.max(0, (value / total) * 100).toFixed(4)}%`;
    return {
      left: toPct(left, containerW),
      top: toPct(top, containerH),
      width: toPct(width, containerW),
      height: toPct(height, containerH),
    };
  };

  return (
    <SafeAreaView
      style={[ReceiptStyles.safeArea, styles.safeAreaLight]}
      edges={["left", "right"]}
    >
      <View style={[styles.header, { paddingTop: Math.max(insets.top + 10, 24) }]}>
        <TouchableOpacity
          onPress={() => navigateBackToIncome(navigation)}
          style={styles.headerBtn}
          activeOpacity={0.8}
        >
          <Text style={styles.headerBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {mode === "edit" ? "Edit Income" : isMultiDraftMode ? "Review Income" : "Add Income"}
        </Text>
        {mode === "edit" && editableIncomeList.length > 1 ? (
          <Text style={styles.indexPill}>{`${currentIndex + 1}/${editableIncomeList.length}`}</Text>
        ) : null}
        <View style={styles.headerBtn} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
      <TouchableWithoutFeedback
        onPress={Keyboard.dismiss}
        accessible={false}
        disabled={DEBUG_DISABLE_KEYBOARD_DISMISS_WRAPPER}
      >
      <View style={{ flex: 1 }}>
      {/* Fixed image panel */}
      <Animated.View
        style={[styles.imageSection, { height: heroHeightAnim }]}
        onLayout={(e) => {
          setImageContainerWidth(e.nativeEvent.layout.width);
          setImageContainerHeight(e.nativeEvent.layout.height);
        }}
        {...detailSwipeResponder.panHandlers}
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
              const isAnnotated = ocrFrames?.imageUri === uri;
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
                  {isAnnotated ? (
                    <View style={styles.annotationOverlay} pointerEvents="none">
                      {ANNOTATIONS.filter(({ key }) => ocrFrames[key]).map(({ key, label, color }) => {
                        const frame = ocrFrames[key];
                        const overlayBox = buildPercentOverlay(frame);
                        if (!overlayBox) return null;
                        return (
                          <View key={key} style={[styles.annBox, { ...overlayBox, borderColor: color }]}> 
                            <View style={[styles.annChip, { backgroundColor: color }]}> 
                              <Text style={styles.annChipText}>{label}</Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                  <TouchableOpacity
                    style={styles.carouselRemoveBtn}
                    onPress={() =>
                      confirmRemoveImage(() => {
                        removeAttachmentByUri(uri);
                      })
                    }
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
      </Animated.View>

      <KeyboardAwareScrollView
        contentContainerStyle={styles.scrollContent}
        enableOnAndroid
        keyboardShouldPersistTaps="handled"
        style={{ marginTop: 8 }}
      >
        <View
          style={[
            ReceiptStyles.container,
            {
              justifyContent: "flex-start",
              paddingTop: 0,
              paddingBottom: 12,
              paddingHorizontal: 12,
            },
          ]}
        >
          <Animated.View
            style={[
              ReceiptStyles.borderContainer,
              {
                transform: [{ translateX: draftSlideX }],
                opacity: draftFade,
                paddingVertical: 12,
                paddingHorizontal: 12,
                borderRadius: 16,
                borderWidth: 3,
              },
            ]}
            {...(isMultiDraftMode ? draftSwipeResponder.panHandlers : {})}
          >
            <View style={styles.moneyRow}>
              <Animated.View style={[styles.moneyColumn, {
                  backgroundColor: flashAmount.interpolate({ inputRange: [0, 1], outputRange: ["transparent", "rgba(253,224,71,0.45)"] }),
                  borderRadius: 6,
                }]}>
                <Text style={[ReceiptStyles.label, styles.formLabel]}>Amount:</Text>
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
                    onFocus={() => {
                      Animated.timing(heroHeightAnim, {
                        toValue: HERO_COLLAPSED_HEIGHT,
                        duration: 220,
                        useNativeDriver: false,
                      }).start();
                    }}
                    style={[
                      ReceiptStyles.input,
                      styles.amountInput,
                      styles.inputWithCurrency,
                      styles.compactInput,
                      isAmountValid ? styles.validFieldInput : styles.invalidFieldInput,
                    ]}
                  />
                </View>
              </Animated.View>

              <Animated.View style={[styles.moneyColumn, {
                  backgroundColor: flashDate.interpolate({ inputRange: [0, 1], outputRange: ["transparent", "rgba(253,224,71,0.45)"] }),
                  borderRadius: 6,
                }]}>
                <Text style={[ReceiptStyles.label, styles.formLabel]}>Date:</Text>
                <TouchableOpacity
                  style={[
                    ReceiptStyles.dateButton,
                    styles.dateButtonAligned,
                    styles.compactField,
                    isDateValid ? styles.validFieldInput : styles.invalidFieldInput,
                  ]}
                  onPress={() => setDatePickerVisibility(true)}
                >
                  <Text style={ReceiptStyles.dateText}>{formatDate(selectedDate)}</Text>
                </TouchableOpacity>
              </Animated.View>
            </View>

            <Animated.View style={[styles.fieldGroup, {
                backgroundColor: flashReference.interpolate({ inputRange: [0, 1], outputRange: ["transparent", "rgba(253,224,71,0.45)"] }),
                borderRadius: 6,
              }]}>
              <Text style={[ReceiptStyles.label, styles.formLabel]}>Reference (optional):</Text>
              <TextInput
                value={reference}
                onChangeText={setReference}
                placeholder="Optional invoice number or source"
                placeholderTextColor={stylesConst.placeholder}
                onFocus={() => {
                  Animated.timing(heroHeightAnim, {
                    toValue: HERO_COLLAPSED_HEIGHT,
                    duration: 220,
                    useNativeDriver: false,
                  }).start();
                }}
                style={[ReceiptStyles.input, styles.compactInput]}
              />
            </Animated.View>

            {vatEnabled ? (
              <>
            <View style={styles.moneyRow}>
              <Animated.View style={[styles.moneyColumn, {
                  backgroundColor: flashVat.interpolate({ inputRange: [0, 1], outputRange: ["transparent", "rgba(253,224,71,0.45)"] }),
                  borderRadius: 6,
                }]}>
                <Text style={[ReceiptStyles.label, styles.formLabel]}>VAT Amount:</Text>
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
                    onFocus={() => {
                      Animated.timing(heroHeightAnim, {
                        toValue: HERO_COLLAPSED_HEIGHT,
                        duration: 220,
                        useNativeDriver: false,
                      }).start();
                    }}
                    style={[
                      ReceiptStyles.input,
                      styles.inputWithCurrency,
                      styles.compactInput,
                      isVatAmountValid ? styles.validFieldInput : styles.invalidFieldInput,
                    ]}
                  />
                </View>
              </Animated.View>
              <View style={[styles.moneyColumn, { zIndex: 3000 }]}>
                <Text style={[ReceiptStyles.label, styles.formLabel]}>VAT Rate (%):</Text>
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
                  style={[
                    ReceiptStyles.vatRatePicker,
                    styles.compactPicker,
                    isVatRateValid ? styles.validFieldInput : styles.invalidFieldInput,
                  ]}
                  dropDownContainerStyle={ReceiptStyles.vatRateDropdown}
                  zIndex={3000}
                  zIndexInverse={1000}
                  listMode="SCROLLVIEW"
                  scrollViewProps={{ keyboardShouldPersistTaps: "always" }}
                />
              </View>
            </View>
            <TouchableOpacity style={styles.cisToggleRow} onPress={() => setVatTreatment((current) => current === VAT_TREATMENTS.DOMESTIC_REVERSE_CHARGE ? VAT_TREATMENTS.STANDARD : VAT_TREATMENTS.DOMESTIC_REVERSE_CHARGE)}>
              <Checkbox status={vatTreatment === VAT_TREATMENTS.DOMESTIC_REVERSE_CHARGE ? "checked" : "unchecked"} color={Colors.accent} />
              <Text style={ReceiptStyles.ocrLabel}>Domestic reverse charge construction</Text>
            </TouchableOpacity>
              </>
            ) : null}

            <View style={styles.fieldGroup}>
              <TouchableOpacity style={styles.cisToggleRow} onPress={() => setCisApplies((current) => !current)}>
                <Checkbox status={cisApplies ? "checked" : "unchecked"} color={Colors.accent} />
                <Text style={ReceiptStyles.ocrLabel}>CIS deduction applies</Text>
              </TouchableOpacity>
              {cisApplies ? (
                <>
                  <View style={styles.moneyRow}>
                    <View style={styles.moneyColumn}>
                      <Text style={[ReceiptStyles.label, styles.formLabel]}>Materials (excl. VAT):</Text>
                      <TextInput value={cisMaterialsAmount} onChangeText={setCisMaterialsAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={Colors.textSecondary} style={[ReceiptStyles.input, styles.compactInput]} />
                    </View>
                    <View style={styles.moneyColumn}>
                      <Text style={[ReceiptStyles.label, styles.formLabel]}>CIS rate (%):</Text>
                      <TextInput value={cisDeductionRate} onChangeText={setCisDeductionRate} keyboardType="decimal-pad" placeholder="20" placeholderTextColor={Colors.textSecondary} style={[ReceiptStyles.input, styles.compactInput]} />
                    </View>
                  </View>
                  {(() => {
                    const cis = calculateCis({ grossAmount: amount, vatAmount: vatEnabled ? vatAmount : 0, materialsAmount: cisMaterialsAmount, deductionRate: cisDeductionRate });
                    return <Text style={styles.cisCalculationText}>CIS withheld: £{cis.deductionAmount.toFixed(2)}   Net received: £{cis.netPaid.toFixed(2)}</Text>;
                  })()}
                </>
              ) : null}
            </View>

            <View style={[styles.fieldGroup, styles.notesSection]}>
              <Text style={[ReceiptStyles.label, styles.formLabel]}>Notes:</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder="Optional notes"
                placeholderTextColor={stylesConst.placeholder}
                onFocus={() => {
                  Animated.timing(heroHeightAnim, {
                    toValue: HERO_COLLAPSED_HEIGHT,
                    duration: 220,
                    useNativeDriver: false,
                  }).start();
                }}
                style={[ReceiptStyles.input, styles.compactInput, styles.notesInput]}
                multiline
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[ReceiptStyles.label, styles.formLabel]}>Label (optional):</Text>
              <TextInput
                value={label}
                onChangeText={setLabel}
                placeholder="An optional label"
                placeholderTextColor={stylesConst.placeholder}
                onFocus={() => {
                  Animated.timing(heroHeightAnim, {
                    toValue: HERO_COLLAPSED_HEIGHT,
                    duration: 220,
                    useNativeDriver: false,
                  }).start();
                }}
                style={[ReceiptStyles.input, styles.compactInput]}
              />
            </View>

          </Animated.View>
        </View>
      </KeyboardAwareScrollView>
      </View>
      </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

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
              {detectMode === "local"
                ? "Processing income locally…"
                : detectMode === "cloud"
                ? "Processing income in the cloud…"
                : "Processing income…"}
            </Text>
            <Text style={{ marginTop: 4, color: "#666", fontSize: 12, textAlign: "center" }}>
              {detectMode === "local"
                ? "This may be faster, but results can be less accurate."
                : detectMode === "cloud"
                ? "Please wait while we process your images in the cloud."
                : "Selecting the best processing mode for your account."}
            </Text>
            <View style={{ alignSelf: "stretch", marginTop: 16 }}>
              <ProgressBar progress={detectProgress} color={Colors.accent} style={{ borderRadius: 4 }} />
            </View>
            <View style={styles.detectingActions}>
              <Button mode="outlined" onPress={cancelDetectionAndExit}>
                Cancel
              </Button>
              <Button
                mode="contained"
                buttonColor={Colors.accent}
                onPress={processDetectionLocally}
                disabled={detectMode === "local"}
              >
                Process locally
              </Button>
            </View>
            {detectMode === "cloud" ? (
              <Text style={styles.detectingHint}>
                Local processing can be quicker, but is usually less accurate.
              </Text>
            ) : null}
          </View>
        </View>
      )}

      {/* Sticky bottom action bar */}
      {isMultiDraftMode && allDraftsReviewed ? (
        <View style={styles.submitButtonContainer}>
          <Button
            mode="contained"
            buttonColor={Colors.accent}
            onPress={handleSaveReviewedIncomes}
            style={styles.submitButtonInner}
            disabled={isSaving}
          >
            Save Income Records
          </Button>
        </View>
      ) : null}
      <View
        style={[
          styles.stickyButtonBar,
          {
            paddingBottom:
              Platform.OS === "android"
                ? Math.max(insets.bottom, 10)
                : 10,
          },
          isMultiDraftMode && { borderTopWidth: 0 },
        ]}
      >
        {isMultiDraftMode ? (
          <>
            {(() => {
              const isCurrentConfirmed = draftReviewStates[currentDraftIndex] === "confirmed";
              const isCurrentSkipped = draftReviewStates[currentDraftIndex] === "skipped";
              return (
                <>
                  <Text style={styles.draftCounter}>
                    {currentDraftIndex + 1} / {incomeDrafts.length}
                  </Text>
                  <Button
                    mode={isCurrentSkipped ? "contained" : "outlined"}
                    buttonColor={isCurrentSkipped ? "#555" : undefined}
                    textColor={isCurrentSkipped ? "#fff" : Colors.accent}
                    style={[styles.stickyActionButton, isCurrentConfirmed ? styles.multiActionFaded : null]}
                    onPress={skipIncomeDraft}
                  >
                    {isCurrentSkipped ? "Skipped" : "Skip"}
                  </Button>
                  <Button
                    mode={isCurrentConfirmed ? "contained" : "outlined"}
                    buttonColor={isCurrentConfirmed ? Colors.accent : undefined}
                    textColor={isCurrentConfirmed ? "#fff" : Colors.accent}
                    style={[styles.stickyActionButton, isCurrentSkipped ? styles.multiActionFaded : null]}
                    onPress={confirmIncomeDraft}
                    disabled={!isIncomeFormValid}
                  >
                    {isCurrentConfirmed ? "Confirmed" : "Confirm"}
                  </Button>
                </>
              );
            })()}
          </>
        ) : (
          <>
            {mode === "edit" ? (
              <>
                <Button
                  mode="outlined"
                  textColor={Colors.accent}
                  style={styles.stickyActionButton}
                  onPress={deleteIncome}
                >
                  Delete
                </Button>
                <Button
                  mode="contained"
                  buttonColor={Colors.accent}
                  style={styles.stickyActionButton}
                  onPress={saveIncome}
                  disabled={isSaving || !isIncomeFormValid}
                >
                  Save
                </Button>
              </>
            ) : (
              <>
                <Button
                  mode="contained"
                  buttonColor={Colors.accent}
                  style={styles.stickyActionButton}
                  onPress={() => navigateBackToIncome(navigation)}
                >
                  Cancel
                </Button>
                <Button
                  mode="contained"
                  buttonColor={Colors.accent}
                  style={styles.stickyActionButton}
                  onPress={saveIncome}
                  disabled={isSaving || !isIncomeFormValid}
                >
                  Save
                </Button>
              </>
            )}
          </>
        )}
      </View>

      {isSaving || pickerBusy ? (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={Colors.accent} />
            <Text style={styles.loadingText}>{isSaving ? "Saving income…" : pickerBusyText}</Text>
          </View>
        </View>
      ) : null}

      {/* Toast notification */}
      {toastVisible ? (
        <Animated.View style={[styles.toastContainer, { opacity: toastOpacity }]}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </Animated.View>
      ) : null}
    </SafeAreaView>
  );
}

const HERO_EXPANDED_HEIGHT = Math.round(Dimensions.get("window").height * 0.45);
const HERO_COLLAPSED_HEIGHT = Math.round(Dimensions.get("window").height * 0.35);

const stylesConst = {
  placeholder: "#8f8f95",
};

const styles = StyleSheet.create({
  safeAreaLight: {
    backgroundColor: "#fff",
  },
  header: {
    backgroundColor: "#1C1C4E",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  headerTitle: { color: "#fff", fontSize: 17, fontWeight: "700" },
  headerBtn: { width: 40, alignItems: "center" },
  headerBtnText: { color: "#fff", fontWeight: "600", fontSize: 22 },
  indexPill: {
    position: "absolute",
    right: 54,
    top: 12,
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  scrollContent: { flexGrow: 1, paddingBottom: 12 },
  imageSection: {
    height: HERO_EXPANDED_HEIGHT,
    overflow: "hidden",
    backgroundColor: "#000",
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  carouselPage: {
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  carouselImage: {
    height: "100%",
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
  fieldGroup: { marginBottom: 6 },
  formLabel: { marginLeft: 10, marginBottom: 1, fontSize: 13 },
  attachmentSection: { marginTop: 16 },
  dateButtonAligned: { marginHorizontal: 0 },
  compactField: { height: 42 },
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
  notesInput: { height: 96, textAlignVertical: "top", paddingTop: 8 },
  moneyRow: { flexDirection: "row", justifyContent: "space-between", gap: 8, marginBottom: 6, zIndex: 2000 },
  compactInput: { height: 42, paddingVertical: 8, borderRadius: 5 },
  compactPicker: { height: 42, minHeight: 42, borderRadius: 5 },
  validFieldInput: {
    backgroundColor: "#fff",
    borderColor: "#2E9F46",
    borderWidth: 1,
  },
  invalidFieldInput: {
    backgroundColor: "#fff",
    borderColor: "#E06B6B",
    borderWidth: 1,
  },
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
    alignItems: "center",
    marginTop: 8,
    zIndex: 10,
  },
  topTriangle: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 10,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#F0D1FF",
    marginBottom: -1,
  },
  sideTipBox: {
    backgroundColor: "#F0D1FF",
    padding: 10,
    borderRadius: 12,
    maxWidth: 190,
  },
  sideTipText: {
    color: "#4A148C",
    fontSize: 11,
    lineHeight: 15,
    textAlign: "center",
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
  cisToggleRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  cisCalculationText: { color: Colors.textPrimary, fontWeight: "600", marginTop: 12 },
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
  detectingActions: {
    marginTop: 16,
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  detectingHint: {
    marginTop: 8,
    color: "#666",
    fontSize: 11,
    textAlign: "center",
  },
  annBox: {
    position: "absolute",
    borderWidth: 2,
    borderRadius: 4,
    overflow: "visible",
  },
  annChip: {
    position: "absolute",
    top: -18,
    left: 0,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  annotationOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  annChipText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  stickyButtonBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#e8e8e8",
    backgroundColor: "#fff",
    gap: 12,
  },
  stickyActionButton: {
    flex: 1,
  },
  draftCounter: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.accent,
    minWidth: 40,
    textAlign: "center",
  },
  submitButtonContainer: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: "#fff",
  },
  submitButtonInner: {
    borderRadius: 25,
  },
  toastContainer: {
    position: "absolute",
    bottom: 100,
    left: 30,
    right: 30,
    backgroundColor: "rgba(28,28,78,0.9)",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: "center",
    zIndex: 9999,
    elevation: 10,
  },
  toastText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
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
    <View style={styles.topTriangle} />
    <View style={styles.sideTipBox}>
      <Text style={styles.sideTipText}>{text}</Text>
      <TouchableOpacity onPress={onDismiss}>
        <Text style={styles.sideGotIt}>Got it</Text>
      </TouchableOpacity>
    </View>
  </View>
);