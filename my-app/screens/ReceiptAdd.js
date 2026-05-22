import React, { useRef, useState, useEffect } from "react";
import {
  Animated,
  PanResponder,
  PermissionsAndroid,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  findNodeHandle,
  Platform,
  Modal,
  Button as RNButton,
  BackHandler,
  Alert,
  ScrollView,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { Button, Checkbox, ProgressBar } from "react-native-paper";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import * as ImagePicker from "react-native-image-picker";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { SafeAreaView } from "react-native-safe-area-context";
import DropDownPicker from "react-native-dropdown-picker";
import CategorySelector from "../components/CategorySelector";
import { db, auth } from "../firebaseConfig";
import {
  doc,
  getDoc,
  setDoc,
  addDoc,
  collection,
  serverTimestamp,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { categories_meta } from "../constants/arrays";
import { formatDate } from "../utils/format_style";
import {
  runOcrOnAssets,
  detectReceiptGroupsFromAssets,
} from "../utils/ocrHelpers";
import ImageViewer from "react-native-image-zoom-viewer";

import { Colors, ReceiptStyles } from "../utils/sharedStyles";
import {
  getCurrentYearAprilSix,
  startOfDayLocal,
} from "../utils/financialPeriods";
import { triggerHaptic } from "../utils/haptics";

const ReceiptAdd = ({ navigation, route }) => {
  const [amount, setAmount] = useState("");
  const [vatAmount, setVatAmount] = useState("");
  const [vatRate, setVatRate] = useState(""); // string
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isDatePickerVisible, setDatePickerVisibility] = useState(false);
  const [images, setImages] = useState([]); // [{ uri }]
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [label, setLabel] = useState("");
  const [vatAmountEdited, setVatAmountEdited] = useState(false);
  const [showTip, setShowTip] = useState(false);
  const [tipPosition, setTipPosition] = useState({ x: 0, y: 0 });

  // success + confirm modals
  const [showSuccess, setShowSuccess] = useState(false);
  const [showConfirmReset, setConfirmReset] = useState(false);
  const [showConfirmLeaveModal, setShowConfirmLeaveModal] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [showAllProcessedModal, setShowAllProcessedModal] = useState(false);
  const [duplicateReceiptDate, setDuplicateReceiptDate] = useState(null);
  const [recurringEnabled, setRecurringEnabled] = useState(false);
  const [recurrenceModalVisible, setRecurrenceModalVisible] = useState(false);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState(null);
  const [customEvery, setCustomEvery] = useState("1");
  const [customUnit, setCustomUnit] = useState("months");

  const [isUploading, setIsUploading] = useState(false);
  const [isPickerBusy, setIsPickerBusy] = useState(false);
  const [pickerBusyText, setPickerBusyText] = useState(
    "Opening image options…",
  );
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [receiptDrafts, setReceiptDrafts] = useState([]);
  const [currentReceiptIndex, setCurrentReceiptIndex] = useState(0);
  const [receiptReviewStates, setReceiptReviewStates] = useState([]);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const [imageContainerWidth, setImageContainerWidth] = useState(0);
  const [showBatchSummaryModal, setShowBatchSummaryModal] = useState(false);
  const [batchSaveSummary, setBatchSaveSummary] = useState({
    saved: [],
    skippedCount: 0,
  });
  const [successMode, setSuccessMode] = useState("single");

  // isMultiReceiptMode is true when we have multiple detected receipt drafts
  const isMultiReceiptMode = receiptDrafts.length > 1;
  const allReceiptsReviewed =
    isMultiReceiptMode &&
    receiptReviewStates.length === receiptDrafts.length &&
    receiptReviewStates.length > 0 &&
    receiptReviewStates.every((state) => state !== "pending");

  // Field flash animations — briefly highlight when OCR auto-populates a value
  const flashAmount = useRef(new Animated.Value(0)).current;
  const flashVat = useRef(new Animated.Value(0)).current;
  const flashDate = useRef(new Animated.Value(0)).current;
  const flashCategory = useRef(new Animated.Value(0)).current;

  const flashField = (animValue) => {
    animValue.setValue(1);
    Animated.timing(animValue, {
      toValue: 0,
      duration: 1800,
      useNativeDriver: false,
    }).start();
  };

  // Fullscreen viewer (separate, top-level modal)
  const [fullScreenImageIndex, setFullScreenImageIndex] = useState(null);
  const [ocrFrames, setOcrFrames] = useState(null);
  const [detectProgress, setDetectProgress] = useState(0);

  const getCanonicalCategoryName = (value) => {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized) return null;

    const match = categories_meta.find(
      (cat) => String(cat?.name || "").trim().toLowerCase() === normalized,
    );

    return match?.name || null;
  };

  // VAT rate options from categories_meta unique vatRate values
  const deriveVatRateItems = () => {
    const unique = Array.from(
      new Set(
        (categories_meta || [])
          .map((c) => c?.vatRate)
          .filter((r) => r !== undefined && r !== null && !Number.isNaN(r)),
      ),
    ).sort((a, b) => Number(a) - Number(b));
    return unique.map((r) => ({ label: `${r}%`, value: String(r) }));
  };
  const [vatRateOpen, setVatRateOpen] = useState(false);
  const [vatRateItems, setVatRateItems] = useState(deriveVatRateItems());

  const flatListRef = useRef(null);

  const scrollRef = useRef(null);
  const processedInitialImagesKeyRef = useRef(null);
  const draftSlideX = useRef(new Animated.Value(0)).current;
  const draftFade = useRef(new Animated.Value(1)).current;

  // Refs always pointing at latest values — prevents stale closures in PanResponder
  const formStateRef = useRef(null);
  const receiptDraftsRef = useRef(receiptDrafts);
  const currentReceiptIndexRef = useRef(currentReceiptIndex);

  // Keep refs in sync on every render
  formStateRef.current = { amount, vatAmount, vatRate, selectedDate, images, selectedCategory, label, vatAmountEdited };
  receiptDraftsRef.current = receiptDrafts;
  currentReceiptIndexRef.current = currentReceiptIndex;

  const scrollToTop = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToPosition?.(0, 0, true);
    });
  };

  const categoryWrapperRef = useRef(null);

  const [categoryY, setCategoryY] = useState(0);

  const beginPickerHold = (text = "Opening image options…") => {
    setPickerBusyText(text);
    setIsPickerBusy(true);
  };

  const endPickerHold = () => {
    setIsPickerBusy(false);
  };

  // ------- helpers -------
  // ensureFileFromAsset is now provided by the OCR hook; no local copy needed.

  const computeVat = (grossStr, rateStr) => {
    const gross = parseFloat(grossStr);
    const rate = parseFloat(rateStr);
    if (!isFinite(gross) || !isFinite(rate)) return "";
    const net = gross / (1 + rate / 100);
    const vat = gross - net;
    return vat.toFixed(2);
  };

  const isDraftValid = (draft) => {
    if (!draft) return false;
    const a = String(draft.amount || "").trim();
    const v = String(draft.vatAmount || "").trim();
    const r = String(draft.vatRate || "").trim();
    return (
      Boolean(getCanonicalCategoryName(draft.selectedCategory)) &&
      a.length > 0 &&
      v.length > 0 &&
      r.length > 0 &&
      !Number.isNaN(parseFloat(a)) &&
      !Number.isNaN(parseFloat(v)) &&
      !Number.isNaN(parseFloat(r))
    );
  };

  const showToast = (message) => {
    setToastMessage(message);
    setToastVisible(true);
    toastOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(toastOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => setToastVisible(false));
  };

  const ensureVatRateOption = (rateValue) => {
    const rStr = String(rateValue || "");
    if (!rStr) return;
    setVatRateItems((prev) => {
      const has = prev.some((it) => it.value === rStr);
      return has
        ? prev
        : [...prev, { label: `${rStr}%`, value: rStr }].sort(
            (a, b) => Number(a.value) - Number(b.value),
          );
    });
  };

  const createDraftFromAnalysis = ({ analysis, assets, ocrFrames: groupOcrFrames }) => {
    const categoryRate =
      typeof analysis?.categoryIndex === "number" && analysis.categoryIndex >= 0
        ? categories_meta[analysis.categoryIndex]?.vatRate
        : null;
    const draftVatRate =
      analysis?.vat?.rate != null
        ? String(analysis.vat.rate)
        : Number.isFinite(categoryRate)
          ? String(categoryRate)
          : "";
    const draftAmount = analysis?.amount != null ? Number(analysis.amount).toFixed(2) : "";
    const draftVatAmount =
      analysis?.vat?.value != null
        ? Number(analysis.vat.value).toFixed(2)
        : draftAmount && draftVatRate
          ? computeVat(draftAmount, draftVatRate)
          : "";
    const parsedDate = analysis?.date ? new Date(analysis.date) : null;

    return {
      amount: draftAmount,
      vatAmount: draftVatAmount,
      vatRate: draftVatRate,
      selectedDate:
        parsedDate && !Number.isNaN(parsedDate.getTime())
          ? parsedDate
          : new Date(),
      images: (assets || []).map((asset) => ({ uri: asset.uri })),
      selectedCategory: getCanonicalCategoryName(analysis?.categoryName),
      label: "",
      vatAmountEdited: false,
      ocrFrames: groupOcrFrames || null,
    };
  };

  const buildCurrentDraft = () => {
    // Always read from ref to avoid stale closure values in PanResponder callbacks
    const f = formStateRef.current || { amount, vatAmount, vatRate, selectedDate, images, selectedCategory, label, vatAmountEdited };
    return {
      amount: f.amount,
      vatAmount: f.vatAmount,
      vatRate: f.vatRate,
      selectedDate: new Date(f.selectedDate),
      images: (f.images || []).map((img) => ({ ...img })),
      selectedCategory: f.selectedCategory,
      label: f.label,
      vatAmountEdited: f.vatAmountEdited,
    };
  };

  const applyDraftToForm = (draft) => {
    setAmount(draft?.amount || "");
    setVatAmount(draft?.vatAmount || "");
    setVatRate(draft?.vatRate || "");
    setSelectedDate(
      draft?.selectedDate ? new Date(draft.selectedDate) : new Date(),
    );
    setImages(
      Array.isArray(draft?.images)
        ? draft.images.map((img) => ({ ...img }))
        : [],
    );
    setSelectedCategory(draft?.selectedCategory || null);
    setLabel(draft?.label || "");
    setVatAmountEdited(Boolean(draft?.vatAmountEdited));
    ensureVatRateOption(draft?.vatRate || "");
    setOcrFrames(draft?.ocrFrames || null);
  };

  const syncCurrentDrafts = () => {
    // Read from refs so we always get the true current state, not a stale closure
    const drafts = receiptDraftsRef.current;
    const index = currentReceiptIndexRef.current;
    if (drafts.length <= 1) return drafts;

    const snapshot = buildCurrentDraft();
    const nextDrafts = drafts.map((draft, i) =>
      i === index ? { ...draft, ...snapshot } : draft,
    );
    setReceiptDrafts(nextDrafts);
    return nextDrafts;
  };

  const animateDraftTransition = (direction = "next") => {
    const slideOffset = Dimensions.get("window").width * 0.55;
    draftSlideX.setValue(direction === "next" ? slideOffset : -slideOffset);
    draftFade.setValue(0.75);

    Animated.parallel([
      Animated.timing(draftSlideX, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(draftFade, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const loadDraftAtIndex = (
    index,
    drafts = receiptDrafts,
    { animateDirection = null } = {},
  ) => {
    const nextDraft = drafts[index];
    if (!nextDraft) return;
    setCurrentReceiptIndex(index);
    applyDraftToForm(nextDraft);
    if (animateDirection) {
      animateDraftTransition(animateDirection);
    }
    scrollToTop();
  };

  const navigateToDraftIndex = (index) => {
    const drafts = receiptDraftsRef.current;
    const currentIndex = currentReceiptIndexRef.current;
    if (index < 0 || index >= drafts.length) return;
    const synced = syncCurrentDrafts();
    const direction = index > currentIndex ? "next" : "previous";
    loadDraftAtIndex(index, synced, { animateDirection: direction });
  };

  const goToPreviousReceipt = () => {
    if (!isMultiReceiptMode) return;
    navigateToDraftIndex(currentReceiptIndex - 1);
  };

  const goToNextReceipt = () => {
    if (!isMultiReceiptMode) return;
    navigateToDraftIndex(currentReceiptIndex + 1);
  };

  const draftSwipeResponder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          const { dx, dy } = gestureState;
          return (
            isMultiReceiptMode &&
            Math.abs(dx) > 18 &&
            Math.abs(dx) > Math.abs(dy) * 1.4
          );
        },
        onPanResponderRelease: (_, gestureState) => {
          if (!isMultiReceiptMode) return;
          const { dx, dy } = gestureState;
          if (Math.abs(dx) < 72 || Math.abs(dx) < Math.abs(dy) * 1.2) {
            return;
          }

          if (dx < 0) {
            goToNextReceipt();
          } else {
            goToPreviousReceipt();
          }
        },
      }),
    [isMultiReceiptMode, currentReceiptIndex, receiptDrafts],
  );

  const clearBatchState = () => {
    setReceiptDrafts([]);
    setReceiptReviewStates([]);
    setCurrentReceiptIndex(0);
    setShowBatchSummaryModal(false);
    setBatchSaveSummary({ saved: [], skippedCount: 0 });
    processedInitialImagesKeyRef.current = null;
  };

  // ------- effects -------

  // Process images passed in from AddReceiptSheet (camera/gallery flow)
  useEffect(() => {
    const initialImages = route?.params?.initialImages;
    if (!initialImages?.length) return;

    const modeKey = initialImages.map((asset) => asset.uri).join("|");
    if (processedInitialImagesKeyRef.current === modeKey) {
      return;
    }
    processedInitialImagesKeyRef.current = modeKey;

    setIsDetecting(true);
    setDetectProgress(0);

    detectReceiptGroupsFromAssets(initialImages, (p) => setDetectProgress(p))
      .then((groups) => {
        const effectiveGroups =
          groups.length > 0
            ? groups
            : [{ assets: initialImages, analysis: {} }];

        if (effectiveGroups.length === 1) {
          // Single receipt — just populate the form directly
          const draft = createDraftFromAnalysis(effectiveGroups[0]);
          applyDraftToForm(draft);
          setReceiptDrafts([]);
          setReceiptReviewStates([]);
          scrollToTop();
        } else {
          // Multiple receipts detected
          const nextDrafts = effectiveGroups.map((group) =>
            createDraftFromAnalysis(group),
          );
          setReceiptDrafts(nextDrafts);
          setReceiptReviewStates(Array(nextDrafts.length).fill("pending"));
          setCurrentReceiptIndex(0);
          applyDraftToForm(nextDrafts[0]);
          scrollToTop();
          showToast(`${nextDrafts.length} receipts detected`);
        }
      })
      .catch((error) => {
        console.error("❌ OCR error:", error);
        const fallbackDraft = createDraftFromAnalysis({
          analysis: {},
          assets: initialImages,
        });
        applyDraftToForm(fallbackDraft);
        setReceiptDrafts([]);
        setReceiptReviewStates([]);
        scrollToTop();
      })
      .finally(() => { setIsDetecting(false); setDetectProgress(0); });
  }, [route?.params?.initialImages]);

  useEffect(() => {
    if (flatListRef.current && imageContainerWidth > 0 && images.length > 0) {
      flatListRef.current.scrollTo?.({
        x: (images.length - 1) * imageContainerWidth,
        animated: false,
      });
    }
  }, [images]);

  useEffect(() => {
    const sub = navigation.addListener("blur", () => {
      setShowSuccess(false);
      setConfirmReset(false);
      setShowConfirmLeaveModal(false);
      setShowBatchSummaryModal(false);
      setShowAllProcessedModal(false);
    });
    return sub;
  }, [navigation]);

  useEffect(() => {
    if (allReceiptsReviewed) {
      setShowAllProcessedModal(true);
    }
  }, [allReceiptsReviewed]);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (showSuccess) {
          setShowSuccess(false);
          return true;
        }
        if (showConfirmReset) {
          setConfirmReset(false);
          return true;
        }
        if (showConfirmLeaveModal) {
          setShowConfirmLeaveModal(false);
          return true;
        }
        if (showAllProcessedModal) {
          setShowAllProcessedModal(false);
          return true;
        }
        if (showBatchSummaryModal) {
          setShowBatchSummaryModal(false);
          return true;
        }
        if (!amount && !selectedCategory && images.length === 0) {
          navigation.goBack();
          return true;
        }
        setShowConfirmLeaveModal(true);
        return true;
      },
    );
    return () => backHandler.remove();
  }, [
    amount,
    selectedCategory,
    images,
    showSuccess,
    showConfirmReset,
    showConfirmLeaveModal,
    showAllProcessedModal,
    showBatchSummaryModal,
    navigation,
  ]);

  // Auto-calc VAT when amount/rate present but vatAmount blank (and not manually overridden)
  useEffect(() => {
    if (!vatAmountEdited && amount && vatRate) {
      setVatAmount(computeVat(amount, vatRate));
    }
  }, [amount, vatRate, vatAmountEdited]);

  // Check Firebase for "seen" status on mount
  useEffect(() => {
    const checkTooltipStatus = async () => {
      const user = auth.currentUser;
      if (user) {
        try {
          const userRef = doc(db, "users", user.uid);
          const userSnap = await getDoc(userRef);

          // Only show the tip if they haven't seen it and no images are added yet
          if (!userSnap.data()?.hasSeenScannerTip && images.length === 0) {
            setShowTip(true);
          }
        } catch (error) {
          console.log("Error fetching tooltip status:", error);
        }
      }
    };
    checkTooltipStatus();
  }, []);

  const dismissTip = async () => {
    setShowTip(false);
    const user = auth.currentUser;
    if (user) {
      try {
        const userRef = doc(db, "users", user.uid);
        // setDoc with merge: true is safer than updateDoc for new profiles
        await setDoc(userRef, { hasSeenScannerTip: true }, { merge: true });
      } catch (error) {
        console.log("Error updating tooltip status:", error);
      }
    }
  };

  // ------- save helpers -------
  const calculateVatFromRate = () => {
    if (!amount || !vatRate) return "";
    const gross = parseFloat(amount);
    const rate = parseFloat(vatRate);
    if (!isFinite(gross) || !isFinite(rate)) return "";
    const net = gross / (1 + rate / 100);
    const vat = gross - net;
    return vat.toFixed(2);
  };

  const toMoneyKey = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "0.00";
    return numeric.toFixed(2);
  };

  const toDateKey = (value) => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const local = startOfDayLocal(d);
    const yyyy = local.getFullYear();
    const mm = String(local.getMonth() + 1).padStart(2, "0");
    const dd = String(local.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const getRecurrenceConfig = () => {
    if (!recurringEnabled || !recurrenceFrequency) return null;
    if (recurrenceFrequency === "custom") {
      const interval = Math.max(1, parseInt(customEvery, 10) || 1);
      return { frequency: "custom", interval, unit: customUnit };
    }
    const map = {
      daily: { frequency: "daily", interval: 1, unit: "days" },
      weekly: { frequency: "weekly", interval: 1, unit: "weeks" },
      monthly: { frequency: "monthly", interval: 1, unit: "months" },
      annually: { frequency: "annually", interval: 1, unit: "years" },
    };
    return map[recurrenceFrequency] || null;
  };

  const buildRecurringDates = (startDate, config) => {
    if (!config) return [];
    const interval = Math.max(1, Number(config.interval) || 1);
    const unit = config.unit || "months";
    const occurrences = [];
    const current = new Date(startDate);

    const limitByUnit = {
      days: 30,
      weeks: 26,
      months: 12,
      years: 5,
    };
    const max = limitByUnit[unit] || 12;

    for (let i = 0; i < max; i += 1) {
      if (unit === "days") current.setDate(current.getDate() + interval);
      else if (unit === "weeks")
        current.setDate(current.getDate() + interval * 7);
      else if (unit === "months")
        current.setMonth(current.getMonth() + interval);
      else current.setFullYear(current.getFullYear() + interval);

      occurrences.push(new Date(current));
    }

    return occurrences;
  };

  const findDuplicateReceipt = async () => {
    const user = auth.currentUser;
    if (!user) return null;

    const expectedVat = vatAmount ? vatAmount : calculateVatFromRate();
    const current = {
      amount: toMoneyKey(amount),
      vatAmount: toMoneyKey(expectedVat),
      category: String(selectedCategory || "")
        .trim()
        .toLowerCase(),
      date: toDateKey(selectedDate),
    };

    const q = query(
      collection(db, "receipts"),
      where("userId", "==", user.uid),
    );
    const snapshot = await getDocs(q);

    for (const receiptDoc of snapshot.docs) {
      const data = receiptDoc.data() || {};
      const candidate = {
        amount: toMoneyKey(data.amount),
        vatAmount: toMoneyKey(data.vatAmount),
        category: String(data.category || "")
          .trim()
          .toLowerCase(),
        date: toDateKey(data.date),
      };

      if (
        current.amount === candidate.amount &&
        current.vatAmount === candidate.vatAmount &&
        current.category === candidate.category &&
        current.date === candidate.date
      ) {
        return data;
      }
    }

    return null;
  };

  const handleSavePress = async () => {
    if (isMultiReceiptMode) {
      handleAcceptCurrentReceipt();
      return;
    }

    if (
      !amount ||
      isNaN(parseFloat(amount)) ||
      parseFloat(amount) <= 0 ||
      !isCategoryValid ||
      !vatRate ||
      !vatAmount
    ) {
      Alert.alert("Invalid Input", "Please fill in all fields correctly.");
      return;
    }

    triggerHaptic("selection").catch(() => {});

    try {
      const duplicate = await findDuplicateReceipt();
      if (duplicate) {
        setDuplicateReceiptDate(
          duplicate.date ? new Date(duplicate.date) : null,
        );
        setShowDuplicateModal(true);
        return;
      }
    } catch (error) {
      console.error("Duplicate check failed", error);
    }

    handleUploadSingleReceipt();
  };

  const handleResetPress = () => setConfirmReset(true);
  const handleLeavePress = () => setShowConfirmLeaveModal(true);

  const handleRejectCurrentReceipt = () => {
    if (!isMultiReceiptMode || receiptDrafts.length === 0) return;

    const syncedDrafts = syncCurrentDrafts();
    setReceiptReviewStates((prev) => {
      const next = [...prev];
      next[currentReceiptIndex] = "rejected";
      return next;
    });

    triggerHaptic("selection").catch(() => {});

    const nextIndex = currentReceiptIndex + 1;
    if (nextIndex < syncedDrafts.length) {
      loadDraftAtIndex(nextIndex, syncedDrafts);
    }
  };

  const handleAcceptCurrentReceipt = () => {
    if (!isMultiReceiptMode || receiptDrafts.length === 0) {
      return;
    }

    if (
      !amount ||
      isNaN(parseFloat(amount)) ||
      parseFloat(amount) <= 0 ||
      !isCategoryValid ||
      !vatRate ||
      !vatAmount
    ) {
      Alert.alert("Invalid Input", "Please fill in all fields correctly.");
      return;
    }

    const syncedDrafts = syncCurrentDrafts();
    setReceiptReviewStates((prev) => {
      const next = [...prev];
      next[currentReceiptIndex] = "accepted";
      return next;
    });

    triggerHaptic("success").catch(() => {});

    const nextIndex = currentReceiptIndex + 1;
    if (nextIndex < syncedDrafts.length) {
      loadDraftAtIndex(nextIndex, syncedDrafts);
    }
  };

  const handleSaveReviewedReceipts = async () => {
    if (!isMultiReceiptMode || !allReceiptsReviewed) {
      return;
    }

    try {
      setIsUploading(true);
      const syncedDrafts = syncCurrentDrafts();
      const savedRows = [];

      for (let i = 0; i < syncedDrafts.length; i += 1) {
        if (receiptReviewStates[i] !== "accepted") continue;
        const draft = syncedDrafts[i];

        await uploadReceipt({
          amount: draft.amount,
          date: draft.selectedDate,
          category: draft.selectedCategory,
          label: draft.label,
          vatAmount:
            draft.vatAmount && String(draft.vatAmount).trim().length > 0
              ? draft.vatAmount
              : computeVat(draft.amount, draft.vatRate),
          vatRate: draft.vatRate,
          images: draft.images,
          recurrenceConfig: null,
        });

        savedRows.push({
          amount: draft.amount,
          vatAmount: draft.vatAmount,
          date: formatDate(new Date(draft.selectedDate)),
          category: draft.selectedCategory,
        });
      }

      setBatchSaveSummary({
        saved: savedRows,
        skippedCount: receiptReviewStates.filter((state) => state === "rejected")
          .length,
      });
      setShowBatchSummaryModal(true);
      setIsUploading(false);
      triggerHaptic("success").catch(() => {});
    } catch (err) {
      console.error("Batch upload failed:", err);
      setIsUploading(false);
      Alert.alert("Upload failed", "Please try again.");
    }
  };

  const handleUploadSingleReceipt = async () => {
    try {
      // Show the uploading overlay
      setIsUploading(true);

      await uploadReceipt({
        amount,
        date: selectedDate,
        category: selectedCategory,
        label,
        vatAmount: vatAmount ? vatAmount : calculateVatFromRate(),
        vatRate,
        images,
        recurrenceConfig: getRecurrenceConfig(),
      });

      setIsUploading(false);

      resetForm();

      triggerHaptic("success").catch(() => {});
      setSuccessMode("single");
      setShowSuccess(true);
    } catch (err) {
      console.error("Upload failed:", err);
      setIsUploading(false);
      Alert.alert("Upload failed", "Please try again.");
    }
  };

  const resetForm = ({ clearBatch = false } = {}) => {
    setAmount("");
    setVatAmount("");
    setVatRate("");
    setSelectedDate(new Date());
    setSelectedCategory(null);
    setLabel("");
    setImages([]);
    setConfirmReset(false);
    setVatAmountEdited(false);
    setRecurringEnabled(false);
    setRecurrenceFrequency(null);
    setCustomEvery("1");
    setCustomUnit("months");
    if (clearBatch) {
      clearBatchState();
    }
  };

  const uploadReceipt = async ({
    amount,
    date,
    category,
    label,
    vatAmount,
    vatRate,
    images,
    recurrenceConfig,
  }) => {
    const user = auth.currentUser;
    const storage = getStorage();
    const imageUrls = [];

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const filename = `${Date.now()}-${i}-${Math.random()
        .toString(36)
        .slice(2, 8)}.jpg`;
      const storageRef = ref(storage, `receipts/${user.uid}/${filename}`);
      const response = await fetch(img.uri);
      const blob = await response.blob();
      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);
      imageUrls.push(downloadURL);
    }

    const basePayload = {
      amount: parseFloat(amount),
      date: date.toISOString(),
      category,
      label: String(label || "").trim(),
      vatAmount: vatAmount ? parseFloat(vatAmount) : null,
      vatRate: vatRate ? parseFloat(vatRate) : null,
      images: imageUrls,
      recurrence: recurrenceConfig,
      userId: user.uid,
      createdAt: serverTimestamp(),
    };

    const baseDoc = await addDoc(collection(db, "receipts"), basePayload);

    if (recurrenceConfig) {
      const recurringDates = buildRecurringDates(date, recurrenceConfig);
      for (const nextDate of recurringDates) {
        await addDoc(collection(db, "receipts"), {
          ...basePayload,
          date: nextDate.toISOString(),
          recurringParentId: baseDoc.id,
          createdAt: serverTimestamp(),
        });
      }
    }
  };

  // ------- date & image picking -------
  const showDatePicker = () => setDatePickerVisibility(true);
  const hideDatePicker = () => {
    setDatePickerVisibility(false);
  };

  const handleConfirmDate = (date) => {
    // 1. Hide the picker first
    hideDatePicker();

    // 2. Wrap the value setting in a tiny delay to let
    // the Android native bridge finish dismissing the modal
    setTimeout(() => {
      setSelectedDate(date);

      const previousFinancialYearThreshold = getCurrentYearAprilSix(new Date());
      if (date < previousFinancialYearThreshold) {
        Alert.alert(
          "Check date",
          "This date appears to be in a previous financial year. Please verify your selection.",
        );
      }
    }, 100);
  };

  const pickImageOption = () => {
    if (showTip) dismissTip();
    Alert.alert(
      "Add Image",
      "Choose an option",
      [
        {
          text: "Camera",
          onPress: async () => {
            if (Platform.OS === "android") {
              const granted = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.CAMERA,
              );
              if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
                Alert.alert("Permission Denied", "Camera access is required.");
                return;
              }
            }

            const newAssets = [];
            const shootLoop = async () => {
              const result = await ImagePicker.launchCamera({
                mediaType: "photo",
                includeBase64: true,
                quality: 0.9,
              });
              if (!result.didCancel && result.assets?.length) {
                newAssets.push(...result.assets);
                await new Promise((resolve) => {
                  Alert.alert(
                    "Photo added",
                    "Add another page?",
                    [
                      { text: "Add another", onPress: () => resolve("again") },
                      {
                        text: "Done",
                        onPress: () => resolve("done"),
                        style: "default",
                      },
                    ],
                    { cancelable: false },
                  );
                }).then(async (choice) => {
                  if (choice === "again") await shootLoop();
                });
              }
            };
            await shootLoop();

            if (newAssets.length > 0) {
              const uris = newAssets.map((a) => ({ uri: a.uri }));
              setImages((prev) => [...prev, ...uris]);
              setOcrProcessing(true);
              runOcrOnAssets(newAssets)
                .then((result) => applyOcrResult(result))
                .catch((e) => console.error("❌ OCR error:", e))
                .finally(() => setOcrProcessing(false));
            }
          },
        },
        {
          text: "Gallery",
          onPress: async () => {
            const result = await ImagePicker.launchImageLibrary({
              mediaType: "photo",
              includeBase64: true,
              selectionLimit: 0,
              quality: 0.9,
            });
            if (!result.didCancel && result.assets?.length) {
              const uris = result.assets.map((a) => ({ uri: a.uri }));
              setImages((prev) => [...prev, ...uris]);
              setOcrProcessing(true);
              runOcrOnAssets(result.assets)
                .then((r) => applyOcrResult(r))
                .catch((e) => console.error("❌ OCR error:", e))
                .finally(() => setOcrProcessing(false));
            }
          },
        },
        { text: "Cancel", style: "cancel" },
      ],
      { cancelable: true },
    );
  };

  const applyOcrResult = (result) => {
    if (result.amount != null) {
      setAmount(Number(result.amount).toFixed(2));
      flashField(flashAmount);
    }
    if (result.date) {
      const d = new Date(result.date);
      if (!isNaN(d.getTime())) {
        setSelectedDate(d);
        flashField(flashDate);
      }
    }

    const resolvedCategory = getCanonicalCategoryName(result.categoryName);
    if (resolvedCategory) {
      setSelectedCategory(resolvedCategory);
      flashField(flashCategory);
      if (typeof result.categoryIndex === "number") {
        const catRate = categories_meta[result.categoryIndex]?.vatRate ?? "";
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
        }
      }
    }

    if (result.vat?.value != null) {
      setVatAmount(String(result.vat.value));
      flashField(flashVat);
    }
  };

  const amountNumber = parseFloat(amount);
  const vatAmountNumber = parseFloat(vatAmount);
  const vatRateNumber = parseFloat(vatRate);
  const isAmountValid = Number.isFinite(amountNumber) && amountNumber > 0;
  const isVatAmountValid = Number.isFinite(vatAmountNumber) && vatAmountNumber >= 0;
  const isVatRateValid = Number.isFinite(vatRateNumber) && vatRateNumber >= 0;
  const isDateValid = selectedDate instanceof Date && !Number.isNaN(selectedDate.getTime());
  const isCategoryValid = Boolean(getCanonicalCategoryName(selectedCategory));

  const isReceiptFormValid =
    isCategoryValid &&
    amount.trim().length > 0 &&
    vatAmount.trim().length > 0 &&
    vatRate.trim().length > 0 &&
    !Number.isNaN(parseFloat(amount)) &&
    !Number.isNaN(parseFloat(vatAmount)) &&
    !Number.isNaN(parseFloat(vatRate));
  const acceptedCount = receiptReviewStates.filter(
    (state) => state === "accepted",
  ).length;
  const rejectedCount = receiptReviewStates.filter(
    (state) => state === "rejected",
  ).length;
  const currentReviewState = isMultiReceiptMode
    ? receiptReviewStates[currentReceiptIndex] || "pending"
    : "pending";
  const isCurrentRejected = currentReviewState === "rejected";
  const isCurrentAccepted = currentReviewState === "accepted";

  // ------- render -------
  return (
    <SafeAreaView style={ReceiptStyles.safeArea}>
      {/* IMAGE SECTION — large fixed panel at top with inline annotation boxes */}
      <View
        style={localStyles.imageSection}
        onLayout={(e) => setImageContainerWidth(e.nativeEvent.layout.width)}
      >
        {imageContainerWidth > 0 ? (
          <ScrollView
            ref={flatListRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={{ width: imageContainerWidth }}
          >
            {images.map((item, index) => {
              const isAnnotated = ocrFrames?.imageUri === item.uri;
              return (
                <TouchableOpacity
                  key={String(index)}
                  style={[localStyles.carouselPage, { width: imageContainerWidth }]}
                  activeOpacity={0.9}
                  onPress={() => setFullScreenImageIndex(index)}
                >
                  <Image
                    source={{ uri: item.uri }}
                    style={[localStyles.carouselImage, { width: imageContainerWidth }]}
                    resizeMode="contain"
                  />
                  {isAnnotated && ANNOTATIONS.filter(({ key }) => ocrFrames[key]).map(({ key, label, color }) => {
                    const naturalW = ocrFrames.imageW;
                    const naturalH = ocrFrames.imageH;
                    if (!naturalW) return null;
                    const scale = Math.min(imageContainerWidth / naturalW, IMAGE_HEIGHT / naturalH);
                    const renderedW = naturalW * scale;
                    const renderedH = naturalH * scale;
                    const offsetX = (imageContainerWidth - renderedW) / 2;
                    const offsetY = (IMAGE_HEIGHT - renderedH) / 2;
                    const frame = ocrFrames[key];
                    const box = {
                      left: frame.left * scale + offsetX,
                      top: frame.top * scale + offsetY,
                      width: frame.width * scale,
                      height: frame.height * scale,
                    };
                    const PAD = 8;
                    const padded = {
                      left: box.left - PAD,
                      top: box.top - PAD,
                      width: box.width + PAD * 2,
                      height: box.height + PAD * 2,
                    };
                    return (
                      <React.Fragment key={key}>
                        <View style={[localStyles.annBox, { ...padded, borderColor: color }]} />
                        <View style={[localStyles.annChip, { backgroundColor: color, top: padded.top - 18, left: padded.left - 1 }]}>
                          <Text style={localStyles.annChipText}>{label}</Text>
                        </View>
                      </React.Fragment>
                    );
                  })}
                </TouchableOpacity>
              );
            })}
            {ocrProcessing ? (
              <View style={[localStyles.carouselPage, { width: imageContainerWidth }]}>
                <View style={localStyles.carouselAddBtn}>
                  <ActivityIndicator color={Colors.accent} size="small" />
                  <Text style={localStyles.scanningText}>Scanning…</Text>
                </View>
              </View>
            ) : null}
            <View style={[localStyles.carouselPage, { width: imageContainerWidth }]}>
              <TouchableOpacity style={localStyles.carouselAddBtn} onPress={pickImageOption}>
                <Text style={ReceiptStyles.plus}>+</Text>
              </TouchableOpacity>
              {showTip && !isMultiReceiptMode && <ScannerTooltip onDismiss={dismissTip} />}
            </View>
          </ScrollView>
        ) : null}
        {ocrProcessing && (
          <View style={localStyles.scanningBanner}>
            <View style={localStyles.scanningBannerRow}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={localStyles.scanningBannerText}>Scanning…</Text>
            </View>
            <ProgressBar
              indeterminate
              color="#fff"
              style={{ alignSelf: "stretch", marginTop: 6, borderRadius: 4 }}
            />
          </View>
        )}
      </View>
      {/* Floating X close button — top-left of screen */}
      <TouchableOpacity
        style={localStyles.floatingCloseBtn}
        onPress={!isMultiReceiptMode ? handleResetPress : handleLeavePress}
        activeOpacity={0.8}
      >
        <Text style={localStyles.floatingCloseBtnText}>✕</Text>
      </TouchableOpacity>
      <KeyboardAwareScrollView
        ref={scrollRef}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 20 }}
        enableOnAndroid={true}
        enableAutomaticScroll={false} // Disable auto-scroll so our manual scroll doesn't fight it
        keyboardShouldPersistTaps="always"
        extraScrollHeight={0}
        style={{ flex: 1 }}
      >
        <View style={[ReceiptStyles.container, { justifyContent: "flex-start", paddingTop: 4 }]}>
          <Animated.View
            style={[
              ReceiptStyles.borderContainer,
              {
                transform: [{ translateX: draftSlideX }],
                opacity: draftFade,
                paddingVertical: 14,
                borderRadius: 16,
                borderWidth: 3,
              },
            ]}
            {...(isMultiReceiptMode ? draftSwipeResponder.panHandlers : {})}
          >
            {!isMultiReceiptMode ? (
              <Text style={ReceiptStyles.header}>Your Receipt</Text>
            ) : null}

            {/* Amount + Date row */}
            <View style={localStyles.amountDateRow}>
              <Animated.View
                style={[
                  localStyles.amountDateField,
                  {
                    backgroundColor: flashAmount.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["transparent", "rgba(253,224,71,0.45)"],
                    }),
                  },
                ]}
              >
                <Text style={[ReceiptStyles.label, localStyles.labelAligned]}>
                  Amount:
                </Text>
                <View style={[ReceiptStyles.inputRow, localStyles.currencyField]}>
                  <View style={localStyles.currencyWrapper}>
                    <Text style={localStyles.currencyInside}>£</Text>
                  </View>
                  <TextInput
                    style={[
                      ReceiptStyles.input,
                      localStyles.inputAligned,
                      localStyles.inputWithCurrency,
                      { height: 42 },
                      isAmountValid
                        ? localStyles.validFieldInput
                        : localStyles.invalidFieldInput,
                    ]}
                    keyboardType="decimal-pad"
                    value={amount}
                    onChangeText={(v) => {
                      setAmount(v);
                      if (!vatAmountEdited && v && vatRate) {
                        setVatAmount(computeVat(v, vatRate));
                      }
                    }}
                  />
                </View>
              </Animated.View>

              <Animated.View
                style={[
                  localStyles.amountDateField,
                  {
                    backgroundColor: flashDate.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["transparent", "rgba(253,224,71,0.45)"],
                    }),
                  },
                ]}
                pointerEvents={vatRateOpen ? "none" : "auto"}
              >
                <Text style={[ReceiptStyles.label, localStyles.labelAligned]}>
                  Date:
                </Text>
                <TouchableOpacity
                  style={[
                    ReceiptStyles.dateButton,
                    { height: 42 },
                    isDateValid
                      ? localStyles.validFieldInput
                      : localStyles.invalidFieldInput,
                  ]}
                  onPress={showDatePicker}
                >
                  <Text style={ReceiptStyles.dateText}>
                    {formatDate(selectedDate)}
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            </View>

            {/* VAT Section: labels above fields */}
            <Animated.View
              style={[
                localStyles.fieldGroup,
                {
                  backgroundColor: flashVat.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["transparent", "rgba(253,224,71,0.45)"],
                  }),
                },
              ]}
            >
              <View
                style={[
                  ReceiptStyles.vatRow,
                  localStyles.vatRowAligned,
                  { zIndex: 2000, elevation: 5 },
                ]}
              >
                {/* VAT Amount Column */}
                <View style={ReceiptStyles.vatColLeft}>
                  <Text style={[ReceiptStyles.label, { fontSize: 13 }]}>VAT Amount:</Text>
                  <View
                    style={[
                      ReceiptStyles.inputRow,
                      localStyles.currencyField,
                    ]}
                  >
                    <View style={localStyles.currencyWrapper}>
                      <Text style={localStyles.currencyInside}>£</Text>
                    </View>
                    <TextInput
                      style={[
                        ReceiptStyles.vatInput,
                        localStyles.vatInputWithCurrency,
                        { height: 42 },
                        isVatAmountValid
                          ? localStyles.validFieldInput
                          : localStyles.invalidFieldInput,
                      ]}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={Colors.textSecondary}
                      value={vatAmount}
                      onChangeText={(v) => {
                        setVatAmount(v);
                        const edited = v.trim().length > 0;
                        setVatAmountEdited(edited);
                        // if cleared, return to auto mode immediately
                        if (!edited && amount && vatRate) {
                          setVatAmount(computeVat(amount, vatRate));
                        }
                      }}
                      onBlur={() => {
                        if (!vatAmount.trim()) setVatAmountEdited(false);
                      }}
                    />
                  </View>
                </View>

                {/* Rate Column */}
                <View style={ReceiptStyles.vatColRight}>
                  <Text style={[ReceiptStyles.label, { fontSize: 13 }]}>Rate (%):</Text>
                  <DropDownPicker
                    open={vatRateOpen}
                    value={vatRate}
                    items={vatRateItems}
                    setOpen={setVatRateOpen}
                    setValue={(set) => setVatRate(set(vatRate))}
                    setItems={setVatRateItems}
                    placeholder="Select"
                    style={{
                      backgroundColor: Colors.surface,
                      borderColor: isVatRateValid ? "#2E9F46" : "#E06B6B",
                      borderWidth: 1,
                      borderRadius: 5,
                      height: 42,
                      minHeight: 42,
                      paddingHorizontal: 8,
                    }}
                    dropDownContainerStyle={ReceiptStyles.vatRateDropdown}
                    containerStyle={{ marginTop: 0, height: 42 }}
                    zIndex={3000}
                    zIndexInverse={1000}
                    dropDownDirection="TOP"
                    listMode="SCROLLVIEW"
                    scrollViewProps={{ keyboardShouldPersistTaps: "always" }}
                    onChangeValue={(val) => {
                      const next = val ?? "";
                      setVatRate(next);
                      // changing rate => return to auto mode & recalc if possible
                      setVatAmountEdited(false);
                      if (next && amount) {
                        setVatAmount(computeVat(amount, next));
                      }
                    }}
                  />
                </View>
              </View>
            </Animated.View>

            <DateTimePickerModal
              isVisible={isDatePickerVisible}
              mode="date"
              date={selectedDate}
              maximumDate={new Date()}
              onConfirm={handleConfirmDate}
              onCancel={hideDatePicker}
            />

            <Animated.View
              ref={categoryWrapperRef}
              collapsable={false}
              style={[
                localStyles.fieldGroup,
                {
                  zIndex: 1000,
                  backgroundColor: flashCategory.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["transparent", "rgba(253,224,71,0.45)"],
                  }),
                },
              ]}
            >
              {/* Category */}
              <Text
                style={[ReceiptStyles.label, localStyles.labelAligned]}
                onLayout={(event) => setCategoryY(event.nativeEvent.layout.y)}
              >
                Category:
              </Text>
              <TouchableOpacity
                style={[
                  ReceiptStyles.dateButton,
                  { height: 42, marginHorizontal: 0 },
                  isCategoryValid
                    ? localStyles.validFieldInput
                    : localStyles.invalidFieldInput,
                ]}
                onPress={() => setCategoryModalVisible(true)}
              >
                <Text
                  style={[
                    ReceiptStyles.dateText,
                    !selectedCategory && { color: Colors.textSecondary },
                  ]}
                >
                  {selectedCategory || "Select a category..."}
                </Text>
              </TouchableOpacity>
            </Animated.View>

            <View style={localStyles.fieldGroup}>
              <Text style={[ReceiptStyles.label, localStyles.labelAligned]}>
                Label (optional):
              </Text>
              <TextInput
                style={[ReceiptStyles.input, localStyles.labelInputAligned, { height: 42 }]}
                value={label}
                onChangeText={setLabel}
                placeholder="An optional label"
                placeholderTextColor={Colors.textSecondary}
              />
            </View>

            {!isMultiReceiptMode ? (
              <View style={localStyles.fieldGroup}>
                <View style={ReceiptStyles.ocrRow}>
                  <Checkbox
                    status={recurringEnabled ? "checked" : "unchecked"}
                    onPress={() => {
                      if (recurringEnabled) {
                        setRecurringEnabled(false);
                        setRecurrenceFrequency(null);
                        return;
                      }
                      setRecurrenceModalVisible(true);
                    }}
                    color={Colors.accent}
                  />
                  <Text style={ReceiptStyles.ocrLabel}>Recurring expense</Text>
                  <Text style={ReceiptStyles.ocrValue}>
                    {recurringEnabled
                      ? recurrenceFrequency === "custom"
                        ? `Every ${Math.max(1, parseInt(customEvery, 10) || 1)} ${customUnit}`
                        : recurrenceFrequency
                      : "Off"}
                  </Text>
                </View>
              </View>
            ) : null}



          </Animated.View>
        </View>
      </KeyboardAwareScrollView>

      {/* Dark red divider line — top of fixed area */}
      {isMultiReceiptMode ? <View style={localStyles.buttonBarDivider} /> : null}

      {/* Receipt indicator dots */}
      {isMultiReceiptMode && receiptDrafts.length > 0 ? (
        <View style={localStyles.receiptIndicatorRow}>
          {receiptDrafts.map((draft, index) => {
            const isActive = index === currentReceiptIndex;
            const state = receiptReviewStates[index];
            let dotColor;
            if (state === "accepted") dotColor = "#2E9F46";
            else if (state === "rejected") dotColor = "#555";
            else {
              const valid =
                index === currentReceiptIndex
                  ? isReceiptFormValid
                  : isDraftValid(draft);
              dotColor = valid ? "#4A90D9" : "#E06B6B";
            }
            return (
              <TouchableOpacity
                key={String(index)}
                style={localStyles.indicatorDotWrapper}
                onPress={() => navigateToDraftIndex(index)}
              >
                <View
                  style={
                    isActive
                      ? localStyles.indicatorTriangle
                      : localStyles.indicatorTriangleHidden
                  }
                />
                <View
                  style={[localStyles.indicatorDot, { backgroundColor: dotColor }]}
                />
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {/* Submit & Save — shown after all receipts reviewed */}
      {isMultiReceiptMode && allReceiptsReviewed ? (
        <View style={localStyles.submitButtonContainer}>
          <Button
            mode="contained"
            buttonColor={Colors.accent}
            onPress={() => setShowAllProcessedModal(true)}
            style={localStyles.submitButtonInner}
          >
            Submit and Save
          </Button>
        </View>
      ) : null}

      {/* Sticky action bar — always visible above keyboard */}
      <View style={[localStyles.stickyButtonBar, isMultiReceiptMode && { borderTopWidth: 0 }]}>
        {isMultiReceiptMode ? (
          <>
            <Button
              mode={isCurrentRejected ? "contained" : "outlined"}
              buttonColor={isCurrentRejected ? "#555" : undefined}
              textColor={isCurrentRejected ? "#fff" : "#a60d49"}
              style={[
                localStyles.stickyActionButton,
                !isCurrentRejected && !isCurrentAccepted
                  ? localStyles.multiActionDefaultButton
                  : null,
                isCurrentAccepted ? localStyles.multiActionFadedButton : null,
              ]}
              onPress={handleRejectCurrentReceipt}
            >
              {isCurrentRejected ? "Rejected" : "Reject"}
            </Button>

            <Button
              mode={isCurrentAccepted ? "contained" : "outlined"}
              onPress={handleSavePress}
              buttonColor={isCurrentAccepted ? "#a60d49" : undefined}
              textColor={isCurrentAccepted ? "#fff" : "#a60d49"}
              disabled={!isReceiptFormValid && !isCurrentAccepted}
              style={[
                localStyles.stickyActionButton,
                !isCurrentRejected && !isCurrentAccepted
                  ? localStyles.multiActionDefaultButton
                  : null,
                isCurrentRejected ? localStyles.multiActionFadedButton : null,
              ]}
            >
              {isCurrentAccepted ? "Accepted" : "Accept"}
            </Button>
          </>
        ) : (
          <>
            <Button
              mode="contained"
              buttonColor="#a60d49"
              style={localStyles.stickyActionButton}
              onPress={handleLeavePress}
            >
              Cancel
            </Button>

            <Button
              mode="contained"
              onPress={handleSavePress}
              buttonColor="#a60d49"
              style={localStyles.stickyActionButton}
              disabled={!isReceiptFormValid}
            >
              Save
            </Button>
          </>
        )}
      </View>

      <Modal
        visible={showAllProcessedModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAllProcessedModal(false)}
      >
        <View style={ReceiptStyles.modalOverlay}>
          <View style={ReceiptStyles.modalContent}>
            <Text style={ReceiptStyles.modalTitle}>All receipts processed</Text>

            <Text style={[ReceiptStyles.modalDetailText, localStyles.summaryHeading]}>
              Accepted ({acceptedCount}):
            </Text>
            {receiptDrafts.filter((_, i) => receiptReviewStates[i] === "accepted").length > 0 ? (
              <View style={localStyles.summaryListWrap}>
                {receiptDrafts
                  .filter((_, i) => receiptReviewStates[i] === "accepted")
                  .map((draft, idx) => (
                    <Text key={idx} style={ReceiptStyles.modalDetailText}>
                      £{draft.amount} · {formatDate(new Date(draft.selectedDate))} · {draft.selectedCategory || "—"}
                    </Text>
                  ))}
              </View>
            ) : (
              <Text style={ReceiptStyles.modalDetailText}>None</Text>
            )}

            <Text style={[ReceiptStyles.modalDetailText, localStyles.summaryHeading]}>
              Rejected: {rejectedCount}
            </Text>

            <View style={ReceiptStyles.modalButtons}>
              <RNButton
                title="Back"
                color="#555"
                onPress={() => setShowAllProcessedModal(false)}
              />
              <RNButton
                title="Confirm"
                color="#a60d49"
                onPress={() => {
                  setShowAllProcessedModal(false);
                  handleSaveReviewedReceipts();
                }}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showDuplicateModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDuplicateModal(false)}
      >
        <View style={ReceiptStyles.modalOverlay}>
          <View style={ReceiptStyles.modalContent}>
            <Text style={ReceiptStyles.modalTitle}>Possible Duplicate</Text>
            <Text style={ReceiptStyles.modalDetailText}>
              Are you sure? A similar receipt was already submitted on{" "}
              {duplicateReceiptDate
                ? formatDate(duplicateReceiptDate)
                : "this date"}
              .
            </Text>
            <View style={ReceiptStyles.modalButtons}>
              <RNButton
                title="Cancel"
                onPress={() => setShowDuplicateModal(false)}
                color="black"
              />
              <RNButton
                title="Continue"
                onPress={() => {
                  setShowDuplicateModal(false);
                  handleUploadSingleReceipt();
                }}
                color="#a60d49"
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showBatchSummaryModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBatchSummaryModal(false)}
      >
        <View style={ReceiptStyles.modalOverlay}>
          <View style={ReceiptStyles.modalContent}>
            <Text style={ReceiptStyles.modalTitle}>Receipts saved</Text>

            <Text style={[ReceiptStyles.modalDetailText, localStyles.summaryHeading]}>
              Saved -
            </Text>
            {batchSaveSummary.saved.length > 0 ? (
              <View style={localStyles.summaryListWrap}>
                {batchSaveSummary.saved.map((entry, index) => (
                  <Text key={`${entry.date}-${entry.amount}-${index}`} style={ReceiptStyles.modalDetailText}>
                    {entry.amount} - {entry.vatAmount || "0.00"} - {entry.date} - {entry.category}
                  </Text>
                ))}
              </View>
            ) : (
              <Text style={ReceiptStyles.modalDetailText}>None</Text>
            )}

            <Text style={[ReceiptStyles.modalDetailText, localStyles.summaryHeading]}>
              Rejected - {batchSaveSummary.skippedCount}
            </Text>

            <View style={ReceiptStyles.modalButtons}>
              <RNButton
                title="Go to Receipts"
                onPress={() => {
                  setShowBatchSummaryModal(false);
                  resetForm({ clearBatch: true });
                  navigation.reset({
                    index: 0,
                    routes: [
                      {
                        name: "MainTabs",
                        state: { routes: [{ name: "Receipts" }] },
                      },
                    ],
                  });
                }}
                color="#555"
              />
              <RNButton
                title="Add another"
                onPress={() => {
                  setShowBatchSummaryModal(false);
                  resetForm({ clearBatch: true });
                }}
                color="#a60d49"
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showSuccess}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSuccess(false)}
      >
        <View style={ReceiptStyles.modalOverlay}>
          <View style={ReceiptStyles.modalContent}>
            <Text style={[ReceiptStyles.modalTitle, { textAlign: "center" }]}>
              {successMode === "multi"
                ? "Receipts reviewed 🎉"
                : "Receipt saved 🎉"}
            </Text>
            <Text style={{ textAlign: "center", marginTop: 4, color: "#555" }}>
              {successMode === "multi"
                ? "All detected receipts have been handled. Do you want to add another batch?"
                : "Do you want to add another?"}
            </Text>
            <View style={[ReceiptStyles.modalButtons, { marginTop: 16 }]}>
              <RNButton
                title="Go to Receipts"
                onPress={() => {
                  setShowSuccess(false);
                  navigation.reset({
                    index: 0,
                    routes: [
                      {
                        name: "MainTabs",
                        state: { routes: [{ name: "Receipts" }] },
                      },
                    ],
                  });
                }}
                color="#555"
              />
              <RNButton
                title="Add another"
                onPress={() => {
                  setShowSuccess(false);
                  // form already reset in handleUploadSingleReceipt()
                }}
                color="#a60d49"
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Reset Modal */}
      <Modal
        visible={showConfirmReset}
        transparent
        animationType="slide"
        onRequestClose={() => setConfirmReset(false)}
      >
        <View style={ReceiptStyles.modalOverlay}>
          <View style={ReceiptStyles.modalContent}>
            <Text style={ReceiptStyles.modalTitle}>Confirm Reset</Text>
            <View style={ReceiptStyles.modalButtons}>
              <RNButton
                title="Cancel"
                onPress={() => setConfirmReset(false)}
                color="#aaa"
              />
              <RNButton title="Confirm" onPress={resetForm} color="#a60d49" />
            </View>
          </View>
        </View>
      </Modal>

      {/* Leave Modal */}
      <Modal
        visible={showConfirmLeaveModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowConfirmLeaveModal(false)}
      >
        <View style={ReceiptStyles.modalOverlay}>
          <View style={ReceiptStyles.modalContent}>
            <Text style={ReceiptStyles.modalTitle}>
              Are you sure you want to go back?
            </Text>
            <View style={ReceiptStyles.modalButtons}>
              <RNButton
                title="Cancel"
                onPress={() => setShowConfirmLeaveModal(false)}
                color="#aaa"
              />
              <RNButton
                title="Confirm"
                onPress={() => {
                  setShowConfirmLeaveModal(false);
                  navigation.reset({
                    index: 0,
                    routes: [
                      {
                        name: "MainTabs",
                        state: { routes: [{ name: "Receipts" }] },
                      },
                    ],
                  });
                }}
                color="#a60d49"
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* OCR Preview + Accept Modal */}
      <Modal
        visible={recurrenceModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRecurrenceModalVisible(false)}
      >
        <View style={ReceiptStyles.modalOverlay}>
          <View style={ReceiptStyles.modalContent}>
            <Text style={ReceiptStyles.modalTitle}>Recurring expense</Text>
            {[
              { key: "daily", label: "Daily" },
              { key: "weekly", label: "Weekly" },
              { key: "monthly", label: "Monthly" },
              { key: "annually", label: "Annually" },
              { key: "custom", label: "Custom" },
            ].map((item) => (
              <TouchableOpacity
                key={item.key}
                style={localStyles.recurrenceOption}
                onPress={() => setRecurrenceFrequency(item.key)}
              >
                <Text style={localStyles.recurrenceOptionText}>
                  {item.label}
                </Text>
                <Text>{recurrenceFrequency === item.key ? "✓" : ""}</Text>
              </TouchableOpacity>
            ))}

            {recurrenceFrequency === "custom" ? (
              <View style={localStyles.customRecurrenceWrap}>
                <Text style={localStyles.customRecurrenceTitle}>
                  Repeat every
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={localStyles.everyChipRow}
                >
                  {Array.from({ length: 24 }, (_, i) => String(i + 1)).map(
                    (value) => {
                      const selected = customEvery === value;
                      return (
                        <TouchableOpacity
                          key={value}
                          onPress={() => setCustomEvery(value)}
                          style={[
                            localStyles.everyChip,
                            selected ? localStyles.everyChipSelected : null,
                          ]}
                        >
                          <Text
                            style={[
                              localStyles.everyChipText,
                              selected
                                ? localStyles.everyChipTextSelected
                                : null,
                            ]}
                          >
                            {value}
                          </Text>
                        </TouchableOpacity>
                      );
                    },
                  )}
                </ScrollView>

                <View style={localStyles.customUnitRow}>
                  {["days", "weeks", "months", "years"].map((unit) => {
                    const selected = customUnit === unit;
                    return (
                      <TouchableOpacity
                        key={unit}
                        onPress={() => setCustomUnit(unit)}
                        style={[
                          localStyles.customUnitChip,
                          selected ? localStyles.customUnitChipSelected : null,
                        ]}
                      >
                        <Text
                          style={[
                            localStyles.customUnitChipText,
                            selected
                              ? localStyles.customUnitChipTextSelected
                              : null,
                          ]}
                        >
                          {unit}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <View style={ReceiptStyles.modalButtons}>
              <RNButton
                title="Cancel"
                color="#555"
                onPress={() => setRecurrenceModalVisible(false)}
              />
              <RNButton
                title="Confirm"
                color="#a60d49"
                onPress={() => {
                  if (!recurrenceFrequency) return;
                  setRecurringEnabled(true);
                  setRecurrenceModalVisible(false);
                }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Full-screen Image Modal */}
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
              imageUrls={images.map(img => ({ url: img.uri }))}
              index={fullScreenImageIndex}
              enableSwipeDown
              onSwipeDown={() => setFullScreenImageIndex(null)}
              onClick={() => setFullScreenImageIndex(null)}
              backgroundColor="black"
              renderIndicator={images.length > 1 ? undefined : () => null}
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



      {/* Uploading overlay — plain View avoids iOS modal-stacking conflicts with the native image picker */}
      {(isUploading || isPickerBusy) && (
        <View style={localStyles.uploadOverlay}>
          <View style={ReceiptStyles.uploadCard}>
            <ActivityIndicator size="large" color="#a60d49" />
            <Text style={{ marginTop: 12, fontWeight: "600" }}>
              {isUploading ? "Uploading…" : pickerBusyText}
            </Text>
          </View>
        </View>
      )}

      {/* Detecting receipts overlay — shown while OCR/grouping runs on new images */}
      {isDetecting && (
        <View style={localStyles.detectingOverlay}>
          <View style={ReceiptStyles.uploadCard}>
            <ActivityIndicator size="large" color="#a60d49" />
            <Text style={{ marginTop: 12, fontWeight: "700", fontSize: 15 }}>
              Detecting receipts…
            </Text>
            <Text style={{ marginTop: 4, color: "#666", fontSize: 12, textAlign: "center" }}>
              Please wait while we analyse your images
            </Text>
            <View style={{ alignSelf: "stretch", marginTop: 16 }}>
              <ProgressBar progress={detectProgress} color="#a60d49" style={{ borderRadius: 4 }} />
            </View>
          </View>
        </View>
      )}

      {/* Category Selector Modal */}
      <CategorySelector
        visible={categoryModalVisible}
        onClose={() => setCategoryModalVisible(false)}
        onSelect={(categoryName) => {
          setSelectedCategory(categoryName);
          setCategoryModalVisible(false);

          // Trigger VAT logic when category is selected
          const cat = categories_meta.find((c) => c.name === categoryName);
          const r = cat?.vatRate;
          if (r !== undefined && r !== null && !Number.isNaN(r)) {
            const rStr = String(r);
            if (rStr !== vatRate) {
              setVatRate(rStr);
            }
            setVatRateItems((prev) => {
              const has = prev.some((it) => it.value === rStr);
              return has
                ? prev
                : [...prev, { label: `${r}%`, value: rStr }].sort(
                    (a, b) => Number(a.value) - Number(b.value),
                  );
            });
            if (!vatAmountEdited && amount) {
              setVatAmount(computeVat(amount, rStr));
            }
          }
        }}
        selectedCategory={selectedCategory}
      />

      {/* Toast notification */}
      {toastVisible ? (
        <Animated.View style={[localStyles.toastContainer, { opacity: toastOpacity }]}>
          <Text style={localStyles.toastText}>{toastMessage}</Text>
        </Animated.View>
      ) : null}
    </SafeAreaView>
  );
};

const IMAGE_HEIGHT = Math.round(Dimensions.get("window").height * 0.55);

const ANNOTATIONS = [
  { key: "amount", label: "Amount", color: "#2E9F46" },
  { key: "date",   label: "Date",   color: "#1A73E8" },
  { key: "vat",    label: "VAT",    color: "#E06B6B" },
];

const localStyles = StyleSheet.create({
  imageSection: {
    height: IMAGE_HEIGHT,
    overflow: "hidden",
    backgroundColor: "#000",
    borderBottomWidth: 1,
    borderBottomColor: "#333",
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
  annBox: {
    position: "absolute",
    borderWidth: 2,
    borderRadius: 4,
  },
  annChip: {
    position: "absolute",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  annChipText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
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
  stickyButtonBar: {
    flexDirection: "row",
    justifyContent: "space-between",
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
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999,
  },
  detectingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,1)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1200,
  },
  labelAligned: {
    marginLeft: 10,
    fontSize: 13,
    marginBottom: 1,
  },
  fieldRow: {
    marginHorizontal: 10,
  },
  currencyAligned: {
    marginLeft: 0,
    marginRight: 8,
  },
  inputAligned: {
    margin: 0,
  },
  labelInputAligned: {
    marginHorizontal: 0,
  },
  dropdownAligned: {
    marginHorizontal: 10,
  },
  vatRowAligned: {
    marginHorizontal: 0,
  },
  fieldGroup: {
    marginBottom: 8,
  },
  multiReceiptHeader: {
    marginTop: 6,
    marginBottom: 14,
    alignItems: "center",
  },
  multiReceiptCounter: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.accent,
  },
  multiReceiptSubtext: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: Colors.textMuted,
    textAlign: "center",
  },
  multiReceiptProgress: {
    marginTop: 4,
    fontSize: 12,
    color: "#666",
  },
  multiSwipeHintTop: {
    marginTop: 4,
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: "center",
  },
  fieldTopSpacing: {
    marginTop: 6,
  },
  fieldTopSpacingTight: {
    marginTop: 0,
  },
  currencyField: {
    position: "relative",
  },
  currencyWrapper: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 40,
    zIndex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  currencyInside: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  inputWithCurrency: {
    paddingLeft: 28,
  },
  vatInputWithCurrency: {
    paddingLeft: 28,
  },
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
  ocrTipWrapper: {
    marginTop: 10,
    marginBottom: 4,
    alignItems: "stretch",
  },
  ocrTipBox: {
    backgroundColor: "#F0D1FF",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: "100%",
  },
  ocrTipText: {
    color: "#4A148C",
    fontSize: 13,
    lineHeight: 18,
    textAlign: "left",
  },
  ocrTipDismiss: {
    marginTop: 6,
    textAlign: "right",
    color: "#4A148C",
    fontWeight: "700",
    fontSize: 12,
  },
  ocrTipArrow: {
    alignSelf: "flex-start",
    marginLeft: 28,
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderTopWidth: 11,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#F0D1FF",
  },
  tipWrapper: {
    position: "absolute",
    // Position it roughly 110 pixels above the button's Y coordinate
    left: 10,
    right: 20,
    zIndex: 5000,
    alignItems: "center", // Centers the bubble and triangle
  },
  tipBox: {
    backgroundColor: "#F0D1FF",
    padding: 15,
    borderRadius: 15,
    width: "100%", // Takes up the width of the container
    elevation: 10,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 4 },
  },
  tipText: {
    color: "#4A148C",
    fontSize: 14,
    lineHeight: 20,
  },
  tipButton: {
    marginTop: 10,
    alignSelf: "flex-end",
    backgroundColor: "#4A148C",
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 10,
  },
  tipButtonText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "bold",
  },
  triangle: {
    width: 0,
    height: 0,
    backgroundColor: "transparent",
    borderStyle: "solid",
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderTopWidth: 18,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#F0D1FF",
    marginTop: -1, // Merges triangle into the box
  },
  sideTipContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 10, // Allows it to take up remaining horizontal space
    marginLeft: 5, // Pulls the triangle closer to the box
  },
  leftTriangle: {
    width: 0,
    height: 0,
    backgroundColor: "transparent",
    borderStyle: "solid",
    borderTopWidth: 8,
    borderBottomWidth: 8,
    borderRightWidth: 12,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
    borderRightColor: "#F0D1FF", // Matches box color
    zIndex: 3001,
  },
  sideTipBox: {
    backgroundColor: "#F0D1FF",
    padding: 10,
    borderRadius: 12,
    maxWidth: 160,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 2, height: 2 },
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
  sideTipWrapper: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 5, // Pulls the triangle right up to the box edge
    zIndex: 5000,
  },
  skipButton: {
    marginTop: 2,
  },
  multiActionDefaultButton: {
    borderColor: "#b5b5b5",
    borderWidth: 1,
  },
  multiActionFadedButton: {
    opacity: 0.45,
  },
  saveAllButton: {
    marginTop: 12,
  },
  summaryHeading: {
    marginTop: 8,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  summaryListWrap: {
    marginTop: 4,
    marginBottom: 6,
    gap: 4,
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
  recurrenceOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ececf0",
  },
  recurrenceOptionText: {
    color: Colors.textPrimary,
    fontSize: 16,
  },
  customRecurrenceWrap: {
    marginTop: 10,
  },
  customRecurrenceTitle: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  everyChipRow: {
    paddingBottom: 6,
  },
  everyChip: {
    minWidth: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    backgroundColor: Colors.card,
  },
  everyChipSelected: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  everyChipText: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: "600",
  },
  everyChipTextSelected: {
    color: "#fff",
  },
  customUnitRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 10,
    gap: 8,
  },
  customUnitChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  customUnitChipSelected: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  customUnitChipText: {
    color: Colors.textPrimary,
    fontWeight: "600",
  },
  customUnitChipTextSelected: {
    color: "#fff",
  },
  amountDateRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  amountDateField: {
    flex: 1,
  },
  // Receipt indicator dots
  receiptIndicatorRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "flex-end",
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 14,
    backgroundColor: "#fff",
  },
  indicatorDotWrapper: {
    alignItems: "center",
  },
  indicatorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  indicatorTriangle: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#1C1C4E",
    marginBottom: 3,
  },
  indicatorTriangleHidden: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "transparent",
    marginBottom: 3,
  },
  buttonBarDivider: {
    height: 2,
    backgroundColor: "#a60d49",
    width: "100%",
  },
  submitButtonContainer: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: "#fff",
  },
  submitButtonInner: {
    borderRadius: 25,
  },
  // Image carousel
  imageCarouselOuter: {
    overflow: "hidden",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#bbb",
  },
  carouselPage: {
    height: IMAGE_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  carouselImage: {
    height: IMAGE_HEIGHT,
  },
  carouselAddBtn: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    backgroundColor: "#f9f9f9",
  },
  scanningText: {
    fontSize: 11,
    color: "#999",
    marginTop: 6,
  },
  // Toast
  toastContainer: {
    position: "absolute",
    top: 60,
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
});

export default ReceiptAdd;

const ScannerTooltip = ({ onDismiss }) => (
  <View style={localStyles.sideTipWrapper}>
    <View style={localStyles.leftTriangle} />
    <View style={localStyles.sideTipBox}>
      <Text style={localStyles.sideTipText}>
        Tap to scan your receipt. We'll auto-fill the details! ✨
      </Text>
      <TouchableOpacity onPress={onDismiss}>
        <Text style={localStyles.sideGotIt}>Got it</Text>
      </TouchableOpacity>
    </View>
  </View>
);
