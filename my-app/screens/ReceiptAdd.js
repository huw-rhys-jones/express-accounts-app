import React, { useRef, useState, useEffect } from "react";
import {
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
} from "react-native";
import { Button, Checkbox } from "react-native-paper";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import * as ImagePicker from "react-native-image-picker";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { SafeAreaView } from "react-native-safe-area-context";
import DropDownPicker from "react-native-dropdown-picker";
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
import { extractData, reconstructLines } from "../utils/extractors";
import { useReceiptOcr } from "../utils/ocrHelpers";
import ImageViewer from "react-native-image-zoom-viewer";
import { Colors, ReceiptStyles } from "../utils/sharedStyles";
import { getCurrentYearAprilSix, startOfDayLocal } from "../utils/financialPeriods";
import { triggerHaptic } from "../utils/haptics";

const ReceiptAdd = ({ navigation }) => {
  const [amount, setAmount] = useState("");
  const [vatAmount, setVatAmount] = useState("");
  const [vatRate, setVatRate] = useState(""); // string
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isDatePickerVisible, setDatePickerVisibility] = useState(false);
  const [images, setImages] = useState([]); // [{ uri }]
  const [open, setOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [label, setLabel] = useState("");
  const [vatAmountEdited, setVatAmountEdited] = useState(false);
  const [showTip, setShowTip] = useState(false);
  const [showOcrCheckboxTip, setShowOcrCheckboxTip] = useState(false);
  const [tipPosition, setTipPosition] = useState({ x: 0, y: 0 });

  // success + confirm modals
  const [showSuccess, setShowSuccess] = useState(false);
  const [showConfirmReset, setConfirmReset] = useState(false);
  const [showConfirmLeaveModal, setShowConfirmLeaveModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateReceiptDate, setDuplicateReceiptDate] = useState(null);
  const [recurringEnabled, setRecurringEnabled] = useState(false);
  const [recurrenceModalVisible, setRecurrenceModalVisible] = useState(false);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState(null);
  const [customEvery, setCustomEvery] = useState("1");
  const [customUnit, setCustomUnit] = useState("months");

  // OCR modal state and helpers will be provided by useReceiptOcr
  // (hook invocation inserted later).

  const [isUploading, setIsUploading] = useState(false);
  const [isPickerBusy, setIsPickerBusy] = useState(false);
  const [pickerBusyText, setPickerBusyText] = useState("Opening image options…");

  // Fullscreen viewer (separate, top-level modal)
  const [fullScreenImage, setFullScreenImage] = useState(null);
  const [returnToOcrAfterFullscreen, setReturnToOcrAfterFullscreen] =
    useState(false);

  const allCategoryItems = categories_meta.map((cat) => ({
    label: cat.name,
    value: cat.name,
  }));

  // 2. The 'items' state will now only hold what is visible
  const [items, setItems] = useState(allCategoryItems);

  // VAT rate options from categories_meta unique vatRate values
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
  const [vatRateItems, setVatRateItems] = useState(deriveVatRateItems());

  const flatListRef = useRef(null);

  const scrollRef = useRef(null);

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

  // create OCR hook after computeVat so the function is available
  const {
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
    setOcrModalVisible,
    setPreview,
    setOcrResult,
    setAcceptFlags,
    setIsNewImageSession,
  } = useReceiptOcr({ computeVat });

  // runOcr handled by hook; no local implementation needed.


  // OCR helpers (deleteCurrentImage, applyAcceptedValues, toggleAccept,
  // handleCancelModal) are supplied by the useReceiptOcr hook above; they
  // are invoked from the UI where needed and are passed the appropriate
  // setters and state values at that time.
  // ------- effects -------
  useEffect(() => {
    if (flatListRef.current) {
      flatListRef.current.scrollToEnd({ animated: false });
    }
  }, [images]);

  useEffect(() => {
    const sub = navigation.addListener("blur", () => {
      setShowSuccess(false);
      setShowConfirmModal(false);
      setConfirmReset(false);
      setShowConfirmLeaveModal(false);
    });
    return sub;
  }, [navigation]);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (ocrModalVisible) {
          handleCancelModal(setImages);
          return true;
        }
        if (showSuccess) {
          setShowSuccess(false);
          return true;
        }
        if (showConfirmModal) {
          setShowConfirmModal(false);
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
        if (!amount && !selectedCategory && images.length === 0) {
          navigation.goBack();
          return true;
        }
        setShowConfirmLeaveModal(true);
        return true;
      }
    );
    return () => backHandler.remove();
  }, [
    amount,
    selectedCategory,
    images,
    ocrModalVisible,
    showSuccess,
    showConfirmModal,
    showConfirmReset,
    showConfirmLeaveModal,
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

  const dismissOcrCheckboxTip = async () => {
    setShowOcrCheckboxTip(false);
    const user = auth.currentUser;
    if (!user) return;

    try {
      const userRef = doc(db, "users", user.uid);
      await setDoc(userRef, { hasSeenOcrCheckboxTip: true }, { merge: true });
    } catch (error) {
      console.log("Error updating OCR checkbox tooltip status:", error);
    }
  };

  useEffect(() => {
    if (!ocrModalVisible || ocrLoading) return;

    let isActive = true;

    const checkOcrCheckboxTipStatus = async () => {
      const user = auth.currentUser;
      if (!user) {
        if (isActive) setShowOcrCheckboxTip(true);
        return;
      }

      try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        if (isActive) {
          setShowOcrCheckboxTip(!userSnap.data()?.hasSeenOcrCheckboxTip);
        }
      } catch (error) {
        console.log("Error fetching OCR checkbox tooltip status:", error);
        if (isActive) setShowOcrCheckboxTip(true);
      }
    };

    checkOcrCheckboxTipStatus();

    return () => {
      isActive = false;
    };
  }, [ocrModalVisible, ocrLoading]);

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
      else if (unit === "weeks") current.setDate(current.getDate() + interval * 7);
      else if (unit === "months") current.setMonth(current.getMonth() + interval);
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
      category: String(selectedCategory || "").trim().toLowerCase(),
      date: toDateKey(selectedDate),
    };

    const q = query(collection(db, "receipts"), where("userId", "==", user.uid));
    const snapshot = await getDocs(q);

    for (const receiptDoc of snapshot.docs) {
      const data = receiptDoc.data() || {};
      const candidate = {
        amount: toMoneyKey(data.amount),
        vatAmount: toMoneyKey(data.vatAmount),
        category: String(data.category || "").trim().toLowerCase(),
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
    if (
      !amount ||
      isNaN(parseFloat(amount)) ||
      parseFloat(amount) <= 0 ||
      !selectedCategory ||
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
        setDuplicateReceiptDate(duplicate.date ? new Date(duplicate.date) : null);
        setShowDuplicateModal(true);
        return;
      }
    } catch (error) {
      console.error("Duplicate check failed", error);
    }

    setShowConfirmModal(true);
  };

  const handleResetPress = () => setConfirmReset(true);
  const handleLeavePress = () => setShowConfirmLeaveModal(true);

  const handleConfirmReceipt = async () => {
    try {
      // 1) Close the confirm modal FIRST (iOS can't layer modals)
      setShowConfirmModal(false);

      // 2) Yield one frame to let iOS fully dismiss it
      await new Promise((resolve) => requestAnimationFrame(resolve));

      // 3) Show the uploading overlay
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

      // 4) Hide uploading, reset form
      setIsUploading(false);
      resetForm();

      // 5) Yield one frame, then show success modal
      await new Promise((resolve) => requestAnimationFrame(resolve));
      triggerHaptic("success").catch(() => {});
      setShowSuccess(true);
    } catch (err) {
      console.error("Upload failed:", err);
      setIsUploading(false);

      // If confirm modal somehow re-opened, make sure it's closed
      setShowConfirmModal(false);

      Alert.alert("Upload failed", "Please try again.");
    }
  };

  const resetForm = () => {
    setAmount("");
    setVatAmount("");
    setVatRate("");
    setSelectedDate(new Date());
    setSelectedCategory(null);
    setLabel("");
    setImages([]);
    setConfirmReset(false);
    setShowConfirmModal(false);
    setVatAmountEdited(false);
    setRecurringEnabled(false);
    setRecurrenceFrequency(null);
    setCustomEvery("1");
    setCustomUnit("months");
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
          "This date appears to be in a previous financial year. Please verify your selection."
        );
      }
    }, 100);
  };

  const pickImageOption = () => {
    if (showTip) dismissTip();

    beginPickerHold("Opening image options…");
    requestAnimationFrame(() => {
      Alert.alert(
        "Add Image",
        "Choose an option",
        [
          {
            text: "Camera",
            onPress: async () => {
              beginPickerHold("Opening camera…");

              if (Platform.OS === "android") {
                const granted = await PermissionsAndroid.request(
                  PermissionsAndroid.PERMISSIONS.CAMERA
                );

                if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
                  endPickerHold();
                  Alert.alert(
                    "Permission Denied",
                    "You need to allow camera access to take photos of receipts."
                  );
                  return;
                }
              }

              requestAnimationFrame(() => {
                ImagePicker.launchCamera(
                  { mediaType: "photo", includeBase64: true, quality: 0.9 },
                  handleImagePickedWrapper
                );
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
                    selectionLimit: 1,
                    quality: 0.9,
                  },
                  handleImagePickedWrapper
                );
              });
            },
          },
          { text: "Cancel", style: "cancel" },
        ],
        { cancelable: true }
      );
      setTimeout(() => endPickerHold(), 140);
    });
  };

  // use hook-supplied image handler
  const handleImagePickedWrapper = (response) => {
    endPickerHold();
    handleImagePicked(response, setImages);
  };

  const renderImage = ({ item }) => (
    <TouchableOpacity
      onPress={() =>
        openOcrModal(item.uri, { autoScan: true, newSession: false })
      }
    >
      <Image source={{ uri: item.uri }} style={ReceiptStyles.receiptImage} />
    </TouchableOpacity>
  );

  const isReceiptFormValid =
    selectedCategory &&
    amount.trim().length > 0 &&
    vatAmount.trim().length > 0 &&
    vatRate.trim().length > 0 &&
    !Number.isNaN(parseFloat(amount)) &&
    !Number.isNaN(parseFloat(vatAmount)) &&
    !Number.isNaN(parseFloat(vatRate));

  // ------- render -------
  return (
    <SafeAreaView style={ReceiptStyles.safeArea}>

      <KeyboardAwareScrollView
        ref={scrollRef}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 600 }} // INCREASE THIS
        enableOnAndroid={true}
        enableAutomaticScroll={false} // Disable auto-scroll so our manual scroll doesn't fight it
        keyboardShouldPersistTaps="always"
        extraScrollHeight={0}
      >
        <View style={ReceiptStyles.container}>
          <View style={ReceiptStyles.borderContainer}>
            <Text style={ReceiptStyles.header}>Your Receipt</Text>

            {/* Amount */}
            <View style={localStyles.fieldGroup}>
              <Text style={[ReceiptStyles.label, localStyles.labelAligned]}>
                Amount:
              </Text>
              <View
                style={[
                  ReceiptStyles.inputRow,
                  localStyles.fieldRow,
                  localStyles.currencyField,
                ]}
              >
                <View style={localStyles.currencyWrapper}>
                  <Text style={localStyles.currencyInside}>£</Text>
                </View>
                <TextInput
                  style={[
                    ReceiptStyles.input,
                    localStyles.inputAligned,
                    localStyles.inputWithCurrency,
                  ]}
                  keyboardType="decimal-pad"
                  value={amount}
                  onChangeText={(v) => {
                    setAmount(v);
                    // live auto-calc while typing (unless user manually edited)
                    if (!vatAmountEdited && v && vatRate) {
                      setVatAmount(computeVat(v, vatRate));
                    }
                  }}
                />
              </View>
            </View>

            {/* VAT Section: labels above fields */}
            <View style={localStyles.fieldGroup}>
              <View
                style={[
                  ReceiptStyles.vatRow,
                  localStyles.vatRowAligned,
                  { zIndex: 2000, elevation: 5 },
                ]}
              >
                {/* VAT Amount Column */}
                <View style={ReceiptStyles.vatColLeft}>
                  <Text style={ReceiptStyles.label}>VAT Amount:</Text>
                  <View
                    style={[ReceiptStyles.inputRow, localStyles.currencyField]}
                  >
                    <View style={localStyles.currencyWrapper}>
                      <Text style={localStyles.currencyInside}>£</Text>
                    </View>
                    <TextInput
                      style={[
                        ReceiptStyles.vatInput,
                        localStyles.vatInputWithCurrency,
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
                  <Text style={ReceiptStyles.label}>Rate (%):</Text>
                  <DropDownPicker
                    open={vatRateOpen}
                    value={vatRate}
                    items={vatRateItems}
                    setOpen={setVatRateOpen}
                    setValue={(set) => setVatRate(set(vatRate))}
                    setItems={setVatRateItems}
                    placeholder="Select"
                    style={ReceiptStyles.vatRatePicker}
                    dropDownContainerStyle={ReceiptStyles.vatRateDropdown}
                    containerStyle={localStyles.fieldTopSpacingTight}
                    zIndex={3000}
                    zIndexInverse={1000}
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
            </View>

            {/* Date */}
            <View
              style={localStyles.fieldGroup}
              pointerEvents={vatRateOpen ? "none" : "auto"}
            >
              <Text style={[ReceiptStyles.label, localStyles.labelAligned]}>
                Date:
              </Text>
              <TouchableOpacity
                style={ReceiptStyles.dateButton}
                onPress={showDatePicker}
              >
                <Text style={ReceiptStyles.dateText}>
                  {formatDate(selectedDate)}
                </Text>
              </TouchableOpacity>
            </View>
            <DateTimePickerModal
              isVisible={isDatePickerVisible}
              mode="date"
              date={selectedDate}
              maximumDate={new Date()}
              onConfirm={handleConfirmDate}
              onCancel={hideDatePicker}
            />

            <View
              ref={categoryWrapperRef}
              collapsable={false} // CRITICAL for Android measurement
              style={[localStyles.fieldGroup, { zIndex: 1000 }]}
            >
              {/* Category */}
              <Text
                style={[ReceiptStyles.label, localStyles.labelAligned]}
                onLayout={(event) => setCategoryY(event.nativeEvent.layout.y)}
              >
                Category:
              </Text>
              <DropDownPicker
                open={open}
                value={selectedCategory}
                items={items}
                setOpen={setOpen}
                setItems={setItems}
                searchable={true}
                disableLocalSearch={true} // We are taking the wheel
                // 1. Make the placeholder look like a search instruction
                placeholder="Search categories..."
                searchPlaceholder="Type to filter..."
                // 2. Add an icon to the right side (optional but looks great)
                // You can use a library like FontAwesome or a simple emoji/Text
                ArrowDownIconComponent={() => (
                  <Text style={{ marginRight: 10 }}>🔍</Text>
                )}
                ArrowUpIconComponent={() => (
                  <Text style={{ marginRight: 10 }}>🔍</Text>
                )}
                showArrowIcon={true}
                // 3. Ensure the keyboard is ready immediately
                searchTextInputProps={{
                  autoFocus: true,
                  clearButtonMode: "while-editing", // iOS only, adds a 'X' to clear
                }}
                onChangeSearchText={(text) => {
                  categoryWrapperRef.current.measureLayout(
                    findNodeHandle(scrollRef.current),
                    (x, y) =>
                      scrollRef.current?.scrollToPosition(0, y - 50, true)
                  );

                  // ... your existing filter logic ...
                  const query = text.toLowerCase().trim();
                  if (!query) {
                    setItems(allCategoryItems);
                    return;
                  }
                  const filtered = allCategoryItems.filter((item) => {
                    const categoryData = categories_meta.find(
                      (c) => c.name === item.value
                    );
                    return (
                      item.label.toLowerCase().includes(query) ||
                      categoryData?.meta?.some((kw) =>
                        kw.toLowerCase().includes(query)
                      )
                    );
                  });
                  setItems(filtered);
                }}
                // 3. Return to SCROLLVIEW mode for stability
                listMode="SCROLLVIEW"
                scrollViewProps={{ keyboardShouldPersistTaps: "always" }}
                nestedScrollEnabled={true}
                // 4. Force a Height to fix the scrolling
                // This ensures the picker has a defined boundary so the phone knows when to scroll
                dropDownContainerStyle={[
                  ReceiptStyles.dropdownContainer,
                  { position: "relative", top: 0, maxHeight: 250 },
                ]}
                setValue={(callback) => {
                  // 1. Get the next value by calling the callback with the current state
                  const next = callback(selectedCategory);

                  // 2. Update your state variable
                  setSelectedCategory(next);

                  // 3. Trigger your VAT logic
                  if (next) {
                    const cat = categories_meta.find((c) => c.name === next);
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
                              (a, b) => Number(a.value) - Number(b.value)
                            );
                      });
                      if (!vatAmountEdited && amount) {
                        setVatAmount(computeVat(amount, rStr));
                      }
                    }
                  }
                }}
                onOpen={() => {
                  setItems(allCategoryItems); // Reset to show everything when opened

                  // Use measureLayout to find exactly where this view is inside the ScrollView
                  categoryWrapperRef.current.measureLayout(
                    findNodeHandle(scrollRef.current),
                    (x, y) => {
                      // Now 'y' is the absolute distance from the top of the list
                      scrollRef.current?.scrollToPosition(0, y - 50, true);
                    },
                    (error) => console.log("Measurement failed", error)
                  );
                }}
                style={[ReceiptStyles.dropdown, localStyles.dropdownAligned]}
                zIndex={1000}
                zIndexInverse={3000}
              />
            </View>

            <View style={localStyles.fieldGroup}>
              <Text style={[ReceiptStyles.label, localStyles.labelAligned]}>Label (optional):</Text>
              <TextInput
                style={[ReceiptStyles.input, localStyles.labelInputAligned]}
                value={label}
                onChangeText={setLabel}
                placeholder="An optional label"
                placeholderTextColor={Colors.textSecondary}
              />
            </View>

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

            {/* Images Section */}
            <View style={[localStyles.fieldGroup, { zIndex: 1, elevation: 1 }]}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ alignItems: "center", paddingHorizontal: 10 }}
              >
                {/* Map through images instead of using FlatList to avoid nesting errors */}
                {images.map((item, index) => (
                  <View key={index.toString()}>
                    <TouchableOpacity
                      onPress={() =>
                        openOcrModal(item.uri, {
                          autoScan: true,
                          newSession: false,
                        })
                      }
                    >
                      <Image
                        source={{ uri: item.uri }}
                        style={ReceiptStyles.receiptImage}
                      />
                    </TouchableOpacity>
                  </View>
                ))}

                {/* The + Button and Tooltip aligned in a row */}
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <TouchableOpacity
                    style={[
                      ReceiptStyles.uploadPlaceholder,
                      { marginRight: 0 },
                    ]}
                    onPress={pickImageOption}
                  >
                    <Text style={ReceiptStyles.plus}>+</Text>
                  </TouchableOpacity>

                  {/* This now calls the component defined at the bottom */}
                  {showTip && <ScannerTooltip onDismiss={dismissTip} />}
                </View>
              </ScrollView>
            </View>

            {/* Buttons */}
            <View style={ReceiptStyles.buttonContainer}>
              <Button
                mode="contained"
                buttonColor="#a60d49"
                style={ReceiptStyles.button}
                onPress={handleLeavePress}
              >
                Cancel
              </Button>

              <Button
                mode="contained"
                onPress={handleSavePress}
                buttonColor="#a60d49"
                style={ReceiptStyles.button}
                disabled={!isReceiptFormValid}
              >
                Save
              </Button>
            </View>

            <Button
              mode="outlined"
              onPress={handleResetPress}
              style={ReceiptStyles.resetButton}
              textColor="#a60d49"
              icon="autorenew"
            >
              Reset Form
            </Button>
          </View>
        </View>
      </KeyboardAwareScrollView>

      {/* Confirmation Modal */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <View style={ReceiptStyles.modalOverlay}>
          <View style={ReceiptStyles.modalContent}>
            <Text style={ReceiptStyles.modalTitle}>
              Confirm Receipt Details
            </Text>
            <Text style={ReceiptStyles.modalDetailText}>Amount: £{amount}</Text>
            <Text style={ReceiptStyles.modalDetailText}>
              Date: {selectedDate.toDateString()}
            </Text>
            <Text style={ReceiptStyles.modalDetailText}>
              Category: {selectedCategory}
            </Text>
            <Text style={ReceiptStyles.modalDetailText}>
              VAT Amount: £{vatAmount || calculateVatFromRate() || "0.00"}
            </Text>
            <Text style={ReceiptStyles.modalDetailText}>
              VAT Rate: {vatRate || "—"}%
            </Text>
            <View style={ReceiptStyles.modalButtons}>
              <RNButton
                title="Cancel"
                onPress={() => setShowConfirmModal(false)}
                color="black"
              />
              <RNButton
                title="Confirm"
                onPress={handleConfirmReceipt}
                color="#a60d49"
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
              {duplicateReceiptDate ? formatDate(duplicateReceiptDate) : "this date"}.
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
                  setShowConfirmModal(true);
                }}
                color="#a60d49"
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* ✅ Success Modal (was missing) */}
      <Modal
        visible={showSuccess}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSuccess(false)}
      >
        <View style={ReceiptStyles.modalOverlay}>
          <View style={ReceiptStyles.modalContent}>
            <Text style={[ReceiptStyles.modalTitle, { textAlign: "center" }]}>
              Receipt saved 🎉
            </Text>
            <Text style={{ textAlign: "center", marginTop: 4, color: "#555" }}>
              Do you want to add another?
            </Text>
            <View style={[ReceiptStyles.modalButtons, { marginTop: 16 }]}>
              <RNButton
                title="Go to Expenses"
                onPress={() => {
                  setShowSuccess(false);
                  navigation.reset({
                    index: 0,
                    routes: [
                      {
                        name: "MainTabs",
                        state: { routes: [{ name: "Expenses" }] },
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
                  // form already reset in handleConfirmReceipt()
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
                        state: { routes: [{ name: "Expenses" }] },
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
                <Text style={localStyles.recurrenceOptionText}>{item.label}</Text>
                <Text>{recurrenceFrequency === item.key ? "✓" : ""}</Text>
              </TouchableOpacity>
            ))}

            {recurrenceFrequency === "custom" ? (
              <View style={localStyles.customRecurrenceWrap}>
                <Text style={localStyles.customRecurrenceTitle}>Repeat every</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={localStyles.everyChipRow}
                >
                  {Array.from({ length: 24 }, (_, i) => String(i + 1)).map((value) => {
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
                            selected ? localStyles.everyChipTextSelected : null,
                          ]}
                        >
                          {value}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
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
                            selected ? localStyles.customUnitChipTextSelected : null,
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
              <RNButton title="Cancel" color="#555" onPress={() => setRecurrenceModalVisible(false)} />
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

      <Modal
        visible={ocrModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => handleCancelModal(setImages)}
      >
        <View style={ReceiptStyles.modalOverlay}>
          <View style={[ReceiptStyles.modalContent, { maxHeight: "90%" }]}>
            <Text style={ReceiptStyles.modalTitle}>Receipt Preview</Text>

            <ScrollView
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 12 }}
            >

            {preview?.uri ? (
              <View style={{ alignItems: "center" }}>
                <TouchableOpacity
                  style={{
                    alignSelf: "stretch",
                    opacity: ocrLoading ? 0.6 : 1,
                  }}
                  activeOpacity={0.7}
                  disabled={ocrLoading}
                  onPress={() => {
                    const current = preview?.uri;
                    if (!current) return;
                    setReturnToOcrAfterFullscreen(true);
                    setOcrModalVisible(false);
                    requestAnimationFrame(() =>
                      setFullScreenImage({ uri: current })
                    );
                  }}
                >
                  <Image
                    source={{ uri: preview.uri }}
                    style={ReceiptStyles.modalImage}
                  />
                </TouchableOpacity>
                {ocrLoading && (
                  <Text style={ReceiptStyles.scanningText}>Scanning…</Text>
                )}
              </View>
            ) : null}

            {!ocrLoading && (
              <Text style={ReceiptStyles.fullscreenHint}>
                Tap image to view full screen
              </Text>
            )}

            {!ocrLoading && showOcrCheckboxTip && (
              <View style={localStyles.ocrTipWrapper}>
                <View style={localStyles.ocrTipBox}>
                  <Text style={localStyles.ocrTipText}>
                    You can edit these values in the next screen. Uncheck
                    any you immediately disagree with.
                  </Text>
                  <TouchableOpacity onPress={dismissOcrCheckboxTip}>
                    <Text style={localStyles.ocrTipDismiss}>Got it</Text>
                  </TouchableOpacity>
                </View>
                <View style={localStyles.ocrTipArrow} />
              </View>
            )}

            {!ocrLoading && (
              <>
                {/* Amount */}
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

                {/* Date */}
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

                {/* Category */}
                <View style={ReceiptStyles.ocrRow}>
                  <Checkbox
                    status={acceptFlags.category ? "checked" : "unchecked"}
                    onPress={() => toggleAccept("category")}
                    color={Colors.accent}
                    disabled={!ocrResult?.categoryName}
                  />
                  <Text style={ReceiptStyles.ocrLabel}>Category:</Text>
                  <Text style={ReceiptStyles.ocrValue}>
                    {ocrResult?.categoryName ?? "Not detected"}
                  </Text>
                </View>

                {/* VAT */}
                <View style={ReceiptStyles.ocrRow}>
                  <Checkbox
                    status={acceptFlags.vat ? "checked" : "unchecked"}
                    onPress={() => toggleAccept("vat")}
                    color={Colors.accent}
                    disabled={
                      ocrResult?.vat?.value == null &&
                      ocrResult?.vat?.rate == null
                    }
                  />
                  <Text style={ReceiptStyles.ocrLabel}>VAT:</Text>
                  <Text style={ReceiptStyles.ocrValue}>
                    {ocrResult?.vat?.value != null
                      ? `£${ocrResult.vat.value}`
                      : "Not detected"}
                    {`  (Rate ${ocrResult?.vat?.rate ?? "—"}%)`}
                  </Text>
                </View>

                <View style={ReceiptStyles.modalButtons}>
                  {!isNewImageSession && (
                    <Button
                      mode="outlined"
                      onPress={() => deleteCurrentImage(setImages)}
                      textColor={Colors.accent}
                    >
                      Delete Image
                    </Button>
                  )}
                  <Button
                    buttonColor={Colors.accent}
                    mode="contained"
                    onPress={() => handleCancelModal(setImages)}
                  >
                    Cancel
                  </Button>
                  <Button
                    buttonColor={Colors.accent}
                    mode="contained"
                    onPress={() =>
                      applyAcceptedValues({
                        setAmount,
                        setVatAmount,
                        setVatRate,
                        setSelectedDate,
                        setSelectedCategory,
                        vatAmountEdited,
                        amount,
                        vatRate,
                        setVatRateItems,
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

      {/* Full-screen Image Modal */}
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

      {/* Uploading overlay (spinner/holding animation) */}
      <Modal
        visible={isUploading || isPickerBusy}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen" // 👈 important on iOS
        statusBarTranslucent // optional, nicer on iOS
        onRequestClose={() => {}}
      >
        <View style={ReceiptStyles.uploadOverlay}>
          <View style={ReceiptStyles.uploadCard}>
            <ActivityIndicator size="large" color="#a60d49" />
            <Text style={{ marginTop: 12, fontWeight: "600" }}>
              {isUploading ? "Uploading…" : pickerBusyText}
            </Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const localStyles = StyleSheet.create({
  labelAligned: {
    marginLeft: 10,
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
    marginHorizontal: 10,
  },
  dropdownAligned: {
    marginHorizontal: 10,
  },
  vatRowAligned: {
    marginHorizontal: 10,
  },
  fieldGroup: {
    marginBottom: 16,
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
