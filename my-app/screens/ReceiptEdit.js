import React, { useRef, useMemo, useState, useEffect } from "react";
import {
  Animated,
  PanResponder,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Pressable,
  Image,
  ScrollView,
  findNodeHandle,
  FlatList,
  Alert,
  Keyboard,
  InteractionManager,
  Modal,
  ActivityIndicator,
  Platform,
  PermissionsAndroid,
  KeyboardAvoidingView,
  StyleSheet,
  Dimensions,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Checkbox } from "react-native-paper";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import DropDownPicker from "react-native-dropdown-picker";
import * as ImagePicker from "react-native-image-picker";
import { db, auth } from "../firebaseConfig";
import { doc, updateDoc, deleteDoc, getDoc, setDoc } from "firebase/firestore";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { categories_meta } from "../constants/arrays";
import { formatDate } from "../utils/format_style";
import { extractData } from "../utils/extractors";
import ImageViewer from "react-native-image-zoom-viewer";
import { Colors, ReceiptStyles } from "../utils/sharedStyles";
import { useReceiptOcr } from "../utils/ocrHelpers";
import { getCurrentYearAprilSix } from "../utils/financialPeriods";
import { triggerHaptic } from "../utils/haptics";

const IMAGE_HEIGHT = Math.round(Dimensions.get("window").height * 0.45);
const HERO_EXPANDED_HEIGHT = Math.round(Dimensions.get("window").height * 0.45);
const HERO_COLLAPSED_HEIGHT = Math.round(Dimensions.get("window").height * 0.35);
const DEBUG_DISABLE_KEYBOARD_DISMISS_WRAPPER = true;
const ANNOTATION_MIN_BOX_WIDTH = 64;
const ANNOTATION_MIN_BOX_HEIGHT = 26;
const ANNOTATIONS = [
  { key: "amount", label: "Amount", color: "#2E9F46" },
  { key: "date", label: "Date", color: "#1A73E8" },
  { key: "vat", label: "VAT", color: "#E06B6B" },
];

export default function ReceiptDetailsScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const heroHeightAnim = useRef(new Animated.Value(HERO_EXPANDED_HEIGHT)).current;
  const receipt = route?.params?.receipt;
  const initialReceiptList = useMemo(() => {
    if (Array.isArray(route?.params?.receiptList) && route.params.receiptList.length > 0) {
      return route.params.receiptList;
    }
    return receipt ? [receipt] : [];
  }, [receipt, route?.params?.receiptList]);
  const [editableReceiptList, setEditableReceiptList] = useState(initialReceiptList);
  const [currentIndex, setCurrentIndex] = useState(route?.params?.initialIndex || 0);

  useEffect(() => {
    setEditableReceiptList(initialReceiptList);
    setCurrentIndex(route?.params?.initialIndex || 0);
  }, [initialReceiptList, route?.params?.initialIndex]);

  const currentReceipt = editableReceiptList[currentIndex] || receipt;

  // --- base form state
  const [amount, setAmount] = useState(
    receipt?.amount != null ? String(receipt.amount) : ""
  );

  // VAT state (mirrors ReceiptAdd.js)
  const [vatAmount, setVatAmount] = useState(
    receipt?.vatAmount != null ? String(receipt.vatAmount) : ""
  );
  const [vatRate, setVatRate] = useState(
    receipt?.vatRate != null ? String(receipt.vatRate) : ""
  ); // string
  const [vatAmountEdited, setVatAmountEdited] = useState(
    receipt?.vatAmount != null && receipt.vatAmount !== ""
  );

  const [selectedDate, setSelectedDate] = useState(
    receipt?.date ? new Date(receipt.date) : new Date()
  );
  const [selectedCategory, setSelectedCategory] = useState(
    receipt?.category || ""
  );
  const [label, setLabel] = useState(receipt?.label || "");
  const [images, setImages] = useState(
    (receipt?.images || []).map((url) => ({ uri: url }))
  );

  const originalUrls = useMemo(
    () => new Set(currentReceipt?.images || []),
    [currentReceipt?.id],
  );

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(
    categories_meta.map((cat) => ({ label: cat.name, value: cat.name }))
  );
  const [debugScrollState, setDebugScrollState] = useState("idle");
  const [debugPanState, setDebugPanState] = useState("idle");
  const [debugKeyboardState, setDebugKeyboardState] = useState("hidden");
  const [debugLastEvent, setDebugLastEvent] = useState("init");
  const [isDatePickerVisible, setDatePickerVisibility] = useState(false);

  const [isUploading, setIsUploading] = useState(false);
  const [isPickerBusy, setIsPickerBusy] = useState(false);
  const [pickerBusyText, setPickerBusyText] = useState("Opening image options…");
  const [showOcrCheckboxTip, setShowOcrCheckboxTip] = useState(false);

  // VAT helper used by hook as well as local logic
  const computeVat = (grossStr, rateStr) => {
    const gross = parseFloat(grossStr);
    const rate = parseFloat(rateStr);
    if (!isFinite(gross) || !isFinite(rate)) return "";
    const net = gross / (1 + rate / 100);
    const vat = gross - net;
    return vat.toFixed(2);
  };

  const beginPickerHold = (text = "Opening image options…") => {
    setPickerBusyText(text);
    setIsPickerBusy(true);
  };

  const endPickerHold = () => {
    setIsPickerBusy(false);
  };

  // OCR state and helpers provided by shared hook
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
  // ===== Fullscreen viewer =====
  const [fullScreenImage, setFullScreenImage] = useState(null);
  const [imageContainerWidth, setImageContainerWidth] = useState(0);
  const [imageContainerHeight, setImageContainerHeight] = useState(HERO_EXPANDED_HEIGHT);
  const [fullScreenImageIndex, setFullScreenImageIndex] = useState(null);
  const [imageAnnotationsByUrl, setImageAnnotationsByUrl] = useState({});

  const allCategoryItems = categories_meta.map((cat) => ({
    label: cat.name,
    value: cat.name,
  }));

  // ===== VAT rate options from categories_meta =====
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
  const isFormScrollActiveRef = useRef(false);

  const categoryWrapperRef = useRef(null);

  const [categoryY, setCategoryY] = useState(0);
  const markDebugEvent = (label) => {
    setDebugLastEvent(`${new Date().toLocaleTimeString()} ${label}`);
  };

  const detailSwipeResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onPanResponderTerminationRequest: () => true,
        onShouldBlockNativeResponder: () => false,
        onPanResponderGrant: () => {
          setDebugPanState("active");
          markDebugEvent("pan grant");
        },
        onPanResponderTerminate: () => {
          setDebugPanState("terminated");
          markDebugEvent("pan terminate");
        },
        onMoveShouldSetPanResponder: (_, gestureState) => {
          if (editableReceiptList.length <= 1) return false;
          if (isFormScrollActiveRef.current) return false;
          if (open || vatRateOpen) return false;
          const { dx, dy } = gestureState;
          const shouldSet = Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy) * 1.8;
          if (shouldSet) {
            setDebugPanState("captured");
            markDebugEvent(`pan capture dx=${Math.round(dx)} dy=${Math.round(dy)}`);
          }
          return shouldSet;
        },
        onPanResponderRelease: (_, gestureState) => {
          const { dx, dy } = gestureState;
          setDebugPanState("released");
          markDebugEvent(`pan release dx=${Math.round(dx)} dy=${Math.round(dy)}`);
          if (editableReceiptList.length <= 1) return;
          if (Math.abs(dx) < 72 || Math.abs(dx) < Math.abs(dy) * 1.2) return;

          Keyboard.dismiss();
          setOpen(false);
          setVatRateOpen(false);

          if (dx < 0) {
            setCurrentIndex((prev) => Math.min(prev + 1, editableReceiptList.length - 1));
          } else {
            setCurrentIndex((prev) => Math.max(prev - 1, 0));
          }
        },
      }),
    [editableReceiptList.length, open, vatRateOpen],
  );

  useEffect(() => {
    if (!currentReceipt) return;
    setAmount(
      currentReceipt?.amount != null ? String(currentReceipt.amount) : "",
    );
    setVatAmount(
      currentReceipt?.vatAmount != null ? String(currentReceipt.vatAmount) : "",
    );
    setVatRate(
      currentReceipt?.vatRate != null ? String(currentReceipt.vatRate) : "",
    );
    setVatAmountEdited(
      currentReceipt?.vatAmount != null && currentReceipt?.vatAmount !== "",
    );
    setSelectedDate(
      currentReceipt?.date ? new Date(currentReceipt.date) : new Date(),
    );
    setSelectedCategory(currentReceipt?.category || "");
    setLabel(currentReceipt?.label || "");
    setImages((currentReceipt?.images || []).map((url) => ({ uri: url })));
    setImageAnnotationsByUrl(currentReceipt?.imageAnnotations || {});
  }, [currentReceipt?.id]);

  // ===== helpers =====
  // computeVat defined earlier to satisfy hook dependency
  // Auto-calc VAT when amount/rate present but vatAmount not manually overridden
  useEffect(() => {
    if (!vatAmountEdited && amount && vatRate) {
      setVatAmount(computeVat(amount, vatRate));
    }
  }, [amount, vatRate, vatAmountEdited]);

  // Seed rate from category on mount if blank (use existing category)
  useEffect(() => {
    if (!vatRate && selectedCategory) {
      const cat = categories_meta.find((c) => c.name === selectedCategory);
      const r = cat?.vatRate;
      if (r !== undefined && r !== null && !Number.isNaN(r)) {
        const rStr = String(r);
        setVatRate(rStr);
        // include in the dropdown items if missing
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  useEffect(() => {
    const shrinkHero = () => {
      setDebugKeyboardState("visible");
      markDebugEvent("keyboard show");
      Animated.timing(heroHeightAnim, {
        toValue: HERO_COLLAPSED_HEIGHT,
        duration: 220,
        useNativeDriver: false,
      }).start();
    };

    const expandHero = () => {
      setDebugKeyboardState("hidden");
      markDebugEvent("keyboard hide");
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

  // ✅ Safe navigate back
  const safeNavigateToExpenses = () => {
    Keyboard.dismiss();
    setOpen(false);
    setDatePickerVisibility(false);
    requestAnimationFrame(() => {
      InteractionManager.runAfterInteractions(() => {
        navigation.reset({
          index: 0,
          routes: [
            {
              name: "MainTabs",
              state: {
                routes: [{ name: "Expenses" }],
              },
            },
          ],
        });
      });
    });
  };

  // OCR utilities are provided by the hook; no local helper needed here.

  // handleCancelModal provided by hook
  const pickImageOption = () => {
    beginPickerHold("Opening image options…");
    requestAnimationFrame(() => {
      Alert.alert(
        "Add Image",
        "Choose an option",
        [
          {
            text: "Camera",
            onPress: async () => {
              try {
                beginPickerHold("Opening camera…");

                if (Platform.OS === "android") {
                  const granted = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.CAMERA,
                    {
                      title: "Camera Permission",
                      message:
                        "Express Accounts needs camera access to scan receipts.",
                      buttonPositive: "OK",
                    }
                  );

                  if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
                    endPickerHold();
                    Alert.alert(
                      "Permission Denied",
                      "Camera access is required."
                    );
                    return;
                  }
                }

                requestAnimationFrame(() => {
                  ImagePicker.launchCamera(
                    { mediaType: "photo", includeBase64: true, quality: 0.9 },
                    (res) => handleImagePickedWrapper(res)
                  );
                });
              } catch (err) {
                endPickerHold();
                console.warn(err);
              }
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
                  (res) => handleImagePickedWrapper(res)
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

  // wrapper that delegates to hook version
  const handleImagePickedWrapper = (response) => {
    endPickerHold();
    handleImagePicked(response, setImages);
  };

  // ===== SAVE CHANGES =====
  const saveChanges = async () => {
    try {
      if (!amount || parseFloat(amount) <= 0 || !selectedCategory) {
        Alert.alert("Invalid Input", "Please fill in all fields correctly.");
        return;
      }

      triggerHaptic("selection").catch(() => {});

      setIsUploading(true);

      const storage = getStorage();

      const currentUrls = new Set(
        images.filter((i) => i.uri.startsWith("http")).map((i) => i.uri)
      );

      const removedUrls = [...originalUrls].filter((u) => !currentUrls.has(u));

      for (const url of removedUrls) {
        try {
          const fileRef = ref(storage, url);
          await deleteObject(fileRef);
        } catch (err) {
          console.warn("Could not delete from storage:", url, err?.message);
        }
      }

      const uploadedImageUrls = [];
      const nextImageAnnotations = {};

      for (let img of images) {
        if (img.uri.startsWith("http")) {
          uploadedImageUrls.push(img.uri);
          if (imageAnnotationsByUrl?.[img.uri]) {
            nextImageAnnotations[img.uri] = imageAnnotationsByUrl[img.uri];
          }
        } else {
          const storageRef = ref(
            storage,
            `receipts/${currentReceipt.userId}/${Date.now()}-${Math.random()
              .toString(36)
              .substring(7)}.jpg`
          );
          const response = await fetch(img.uri);
          const blob = await response.blob();
          await uploadBytes(storageRef, blob);
          const downloadURL = await getDownloadURL(storageRef);
          uploadedImageUrls.push(downloadURL);
        }
      }

      const hasAnnotations = Object.keys(nextImageAnnotations).length > 0;

      await updateDoc(doc(db, "receipts", currentReceipt.id), {
        amount: parseFloat(amount),
        date: selectedDate.toISOString(),
        category: selectedCategory,
        label: label.trim(),
        vatAmount: vatAmount ? parseFloat(vatAmount) : null,
        vatRate: vatRate ? parseFloat(vatRate) : null,
        images: uploadedImageUrls,
        imageAnnotations: hasAnnotations ? nextImageAnnotations : null,
      });

      triggerHaptic("success").catch(() => {});

      setIsUploading(false);
      safeNavigateToExpenses();
    } catch (err) {
      console.error("Update failed:", err);
      setIsUploading(false);
      Alert.alert("Error", "Could not update receipt");
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

  const deleteReceipt = async () => {
    Alert.alert("Confirm", "Are you sure you want to delete this receipt?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteDoc(doc(db, "receipts", receipt.id));
          safeNavigateToExpenses();
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

  const isReceiptFormValid =
    selectedCategory &&
    amount.trim().length > 0 &&
    vatAmount.trim().length > 0 &&
    vatRate.trim().length > 0 &&
    !Number.isNaN(parseFloat(amount)) &&
    !Number.isNaN(parseFloat(vatAmount)) &&
    !Number.isNaN(parseFloat(vatRate));

  const buildPercentOverlay = (frame) => {
    const naturalW = frame?.imageW;
    const naturalH = frame?.imageH;
    const containerW = imageContainerWidth;
    const containerH = imageContainerHeight || HERO_EXPANDED_HEIGHT;
    if (!frame || !naturalW || !naturalH || !containerW || !containerH) return null;

    const scale = Math.min(containerW / naturalW, containerH / naturalH);
    const renderedW = naturalW * scale;
    const renderedH = naturalH * scale;
    const offsetX = (containerW - renderedW) / 2;
    const offsetY = (containerH - renderedH) / 2;
    const PAD = 8;

    const left = frame.left * scale + offsetX - PAD;
    const top = frame.top * scale + offsetY - PAD;
    const rawWidth = frame.width * scale + PAD * 2;
    const width = Math.max(rawWidth, ANNOTATION_MIN_BOX_WIDTH);
    const height = Math.max(frame.height * scale + PAD * 2, ANNOTATION_MIN_BOX_HEIGHT);

    const clampedLeft = Math.max(0, Math.min(left, containerW - width));
    const clampedTop = Math.max(0, Math.min(top, containerH - height));
    const toPct = (value, total) => `${Math.max(0, (value / total) * 100).toFixed(4)}%`;

    return {
      left: toPct(clampedLeft, containerW),
      top: toPct(clampedTop, containerH),
      width: toPct(width, containerW),
      height: toPct(height, containerH),
    };
  };

  return (
    <SafeAreaView
      style={[ReceiptStyles.safeArea, localStyles.safeAreaLight]}
      edges={["left", "right"]}
    >
      <View style={[localStyles.header, { paddingTop: Math.max(insets.top + 10, 24) }]}>
        <TouchableOpacity
          onPress={safeNavigateToExpenses}
          style={localStyles.headerBtn}
          activeOpacity={0.8}
        >
          <Text style={localStyles.headerBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={localStyles.headerTitle}>Edit Receipt</Text>
        {editableReceiptList.length > 1 ? (
          <Text style={localStyles.indexPill}>{`${currentIndex + 1}/${editableReceiptList.length}`}</Text>
        ) : null}
        <View style={localStyles.headerBtn} />
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
        style={[localStyles.imageSection, { height: heroHeightAnim }]}
        onLayout={(e) => {
          setImageContainerWidth(e.nativeEvent.layout.width);
          setImageContainerHeight(e.nativeEvent.layout.height);
        }}
        {...(editableReceiptList.length > 1 ? detailSwipeResponder.panHandlers : {})}
      >
        {imageContainerWidth > 0 ? (
          <ScrollView
            ref={flatListRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={{ width: imageContainerWidth }}
          >
            {images.map((item, index) => (
              <View key={String(index)} style={{ position: "relative" }}>
                <TouchableOpacity
                  style={[localStyles.carouselPage, { width: imageContainerWidth }]}
                  activeOpacity={0.9}
                  onPress={() => setFullScreenImageIndex(index)}
                >
                  <Image
                    source={{ uri: item.uri }}
                    style={[localStyles.carouselImage, { width: imageContainerWidth }]}
                    resizeMode="contain"
                  />
                  {imageAnnotationsByUrl?.[item.uri] ? (
                    <View style={localStyles.annotationOverlay} pointerEvents="none">
                      {ANNOTATIONS.filter(({ key }) => imageAnnotationsByUrl[item.uri]?.[key]).map(({ key, label, color }) => {
                        const frame = imageAnnotationsByUrl[item.uri][key];
                        const overlayBox = buildPercentOverlay({
                          ...frame,
                          imageW: imageAnnotationsByUrl[item.uri].imageW,
                          imageH: imageAnnotationsByUrl[item.uri].imageH,
                        });
                        if (!overlayBox) return null;
                        return (
                          <View key={`${item.uri}-${key}`} style={[localStyles.annBox, { ...overlayBox, borderColor: color }]}> 
                            <View style={[localStyles.annChip, { backgroundColor: color }]}> 
                              <Text style={localStyles.annChipText} numberOfLines={1}>{label}</Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                </TouchableOpacity>
                <TouchableOpacity
                  style={localStyles.carouselRemoveBtn}
                  onPress={() =>
                    confirmRemoveImage(() => {
                      setImages((prev) => prev.filter((_, imageIndex) => imageIndex !== index));
                    })
                  }
                >
                  <Text style={localStyles.carouselRemoveText}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
            <View style={[localStyles.carouselPage, { width: imageContainerWidth }]}>
              <TouchableOpacity style={localStyles.carouselAddBtn} onPress={pickImageOption}>
                <Text style={ReceiptStyles.plus}>+</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        ) : null}
      </Animated.View>

      <KeyboardAwareScrollView
        ref={scrollRef}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 160 }}
        enableOnAndroid={true}
        enableAutomaticScroll={false}
        keyboardShouldPersistTaps="always"
        extraScrollHeight={0}
        style={{ marginTop: 8 }}
        onScrollBeginDrag={() => {
          isFormScrollActiveRef.current = true;
          setDebugScrollState("dragging");
          markDebugEvent("scroll begin drag");
        }}
        onScrollEndDrag={() => {
          isFormScrollActiveRef.current = false;
          setDebugScrollState("idle");
          markDebugEvent("scroll end drag");
        }}
        onMomentumScrollBegin={() => {
          isFormScrollActiveRef.current = true;
          setDebugScrollState("momentum");
          markDebugEvent("scroll momentum begin");
        }}
        onMomentumScrollEnd={() => {
          isFormScrollActiveRef.current = false;
          setDebugScrollState("idle");
          markDebugEvent("scroll momentum end");
        }}
      >
        <View
          style={[
            ReceiptStyles.container,
            {
              justifyContent: "flex-start",
              paddingTop: 8,
              paddingBottom: 12,
              paddingHorizontal: 12,
            },
          ]}
        >
          <View style={ReceiptStyles.borderContainer}>
            <View style={localStyles.amountDateRow}>
              <View style={localStyles.amountDateField}>
                <Text style={[ReceiptStyles.label, localStyles.labelAligned]}>
                  Amount:
                </Text>
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
                      ReceiptStyles.input,
                      localStyles.inputAligned,
                      localStyles.inputWithCurrency,
                      { height: 42 },
                    ]}
                    keyboardType="decimal-pad"
                    value={amount}
                    onChangeText={(v) => {
                      setAmount(v);
                      if (!vatAmountEdited && v && vatRate) {
                        setVatAmount(computeVat(v, vatRate));
                      }
                    }}
                    onFocus={() => {
                      Animated.timing(heroHeightAnim, {
                        toValue: HERO_COLLAPSED_HEIGHT,
                        duration: 220,
                        useNativeDriver: false,
                      }).start();
                    }}
                  />
                </View>
              </View>

              <View
                style={localStyles.amountDateField}
                pointerEvents={vatRateOpen ? "none" : "auto"}
              >
                <Text style={[ReceiptStyles.label, localStyles.labelAligned]}>
                  Date:
                </Text>
                <TouchableOpacity
                  style={[ReceiptStyles.dateButton, { height: 42 }]}
                  onPress={showDatePicker}
                >
                  <Text style={ReceiptStyles.dateText}>
                    {formatDate(selectedDate)}
                  </Text>
                </TouchableOpacity>
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
                        if (!edited && amount && vatRate) {
                          setVatAmount(computeVat(amount, vatRate));
                        }
                      }}
                      onBlur={() => {
                        if (!vatAmount.trim()) setVatAmountEdited(false);
                      }}
                      onFocus={() => {
                        Animated.timing(heroHeightAnim, {
                          toValue: HERO_COLLAPSED_HEIGHT,
                          duration: 220,
                          useNativeDriver: false,
                        }).start();
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
                      setVatAmountEdited(false);
                      if (next && amount) {
                        setVatAmount(computeVat(amount, next));
                      }
                    }}
                  />
                </View>
              </View>
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
                // Use FLATLIST to avoid nested ScrollView gesture contention with the parent form scroll
                listMode="FLATLIST"
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
                      setVatRate(rStr);
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

                  if (!categoryWrapperRef.current || !scrollRef.current) return;
                  requestAnimationFrame(() => {
                    categoryWrapperRef.current.measureLayout(
                      findNodeHandle(scrollRef.current),
                      (_, y) => {
                        scrollRef.current?.scrollToPosition(0, y - 50, true);
                      },
                      () => {}
                    );
                  });
                }}
                style={[ReceiptStyles.dropdown, localStyles.dropdownAligned]}
                zIndex={4000}
                zIndexInverse={5000}
              />
            </View>

            <View style={localStyles.fieldGroup}>
              <Text style={[ReceiptStyles.label, localStyles.labelAligned]}>
                Label (optional):
              </Text>
              <TextInput
                style={[ReceiptStyles.input, localStyles.labelInputAligned]}
                value={label}
                onChangeText={setLabel}
                placeholder="An optional label"
                placeholderTextColor={Colors.textSecondary}
                onFocus={() => {
                  Animated.timing(heroHeightAnim, {
                    toValue: HERO_COLLAPSED_HEIGHT,
                    duration: 220,
                    useNativeDriver: false,
                  }).start();
                }}
              />
            </View>

          </View>
        </View>
      </KeyboardAwareScrollView>
      </View>
      </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      {open ? (
        <Pressable
          style={localStyles.dropdownDismissOverlay}
          onPress={() => setOpen(false)}
        />
      ) : null}

      <View
        style={[
          localStyles.bottomBar,
          {
            paddingBottom:
              Platform.OS === "android"
                ? Math.max(insets.bottom, 24)
                : Math.max(insets.bottom, 16),
          },
        ]}
      >
        <Button
          mode="outlined"
          onPress={deleteReceipt}
          textColor={Colors.accent}
          style={localStyles.bottomActionBtn}
        >
          Delete
        </Button>
        <Button
          mode="contained"
          onPress={saveChanges}
          buttonColor={Colors.accent}
          style={localStyles.bottomActionBtn}
          disabled={!isReceiptFormValid}
        >
          Save
        </Button>
      </View>

      {/* OCR Preview + Accept Modal */}
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
                  onPress={() => setFullScreenImage(preview)}
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
                <View style={ReceiptStyles.ocrRow}>
                  <Checkbox
                    status={acceptFlags.amount ? "checked" : "unchecked"}
                    onPress={() => toggleAccept("amount")}
                    color={Colors.accent}
                    disabled={ocrResult?.amount == null}
                  />
                  <Text
                    style={[
                      ReceiptStyles.ocrLabel,
                      !acceptFlags.amount && ReceiptStyles.strike,
                    ]}
                  >
                    Amount:
                  </Text>
                  <Text
                    style={[
                      ReceiptStyles.ocrValue,
                      !acceptFlags.amount && ReceiptStyles.strike,
                    ]}
                  >
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
                  <Text
                    style={[
                      ReceiptStyles.ocrLabel,
                      !acceptFlags.date && ReceiptStyles.strike,
                    ]}
                  >
                    Date:
                  </Text>
                  <Text
                    style={[
                      ReceiptStyles.ocrValue,
                      !acceptFlags.date && ReceiptStyles.strike,
                    ]}
                  >
                    {ocrResult?.date
                      ? formatDate(new Date(ocrResult.date))
                      : "Not detected"}
                  </Text>
                </View>

                <View style={ReceiptStyles.ocrRow}>
                  <Checkbox
                    status={acceptFlags.category ? "checked" : "unchecked"}
                    onPress={() => toggleAccept("category")}
                    color={Colors.accent}
                    disabled={!ocrResult?.categoryName}
                  />
                  <Text
                    style={[
                      ReceiptStyles.ocrLabel,
                      !acceptFlags.category && ReceiptStyles.strike,
                    ]}
                  >
                    Category:
                  </Text>
                  <Text
                    style={[
                      ReceiptStyles.ocrValue,
                      !acceptFlags.category && ReceiptStyles.strike,
                    ]}
                  >
                    {ocrResult?.categoryName ?? "Not detected"}
                  </Text>
                </View>

                {/* (Optional) Show OCR VAT if your extractor returns it */}
                {ocrResult?.vat ? (
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
                    <Text
                      style={[
                        ReceiptStyles.ocrLabel,
                        !acceptFlags.vat && ReceiptStyles.strike,
                      ]}
                    >
                      VAT:
                    </Text>
                    <Text
                      style={[
                        ReceiptStyles.ocrValue,
                        !acceptFlags.vat && ReceiptStyles.strike,
                      ]}
                    >
                      {ocrResult?.vat?.value != null
                        ? `£${ocrResult.vat.value}`
                        : "—"}{" "}
                      (Rate {ocrResult?.vat?.rate ?? "Not detected"}%)
                    </Text>
                  </View>
                ) : null}

                <View style={ReceiptStyles.modalButtons}>
                  {!isNewImageSession && (
                    <Button
                      mode="outlined"
                      onPress={() =>
                        confirmRemoveImage(() => {
                          deleteCurrentImage(setImages);
                        })
                      }
                      textColor="#a60d49"
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

      {/* Uploading overlay */}
      <Modal
        visible={isUploading || isPickerBusy}
        transparent
        animationType="fade"
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

      {/* Carousel fullscreen modal */}
      <Modal
        visible={fullScreenImageIndex !== null}
        animationType="fade"
        presentationStyle="overFullScreen"
        transparent
        onRequestClose={() => setFullScreenImageIndex(null)}
      >
        {fullScreenImageIndex !== null ? (
          <View style={localStyles.fullScreenOverlayRoot}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              contentOffset={{ x: fullScreenImageIndex * (imageContainerWidth || Dimensions.get("window").width), y: 0 }}
              style={{ width: imageContainerWidth || Dimensions.get("window").width }}
            >
              {images.map((item, index) => (
                <View
                  key={`fullscreen-${index}`}
                  style={{
                    width: imageContainerWidth || Dimensions.get("window").width,
                    height: "100%",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Image
                    source={{ uri: item.uri }}
                    style={{
                      width: imageContainerWidth || Dimensions.get("window").width,
                      height: "100%",
                    }}
                    resizeMode="contain"
                  />
                  {imageAnnotationsByUrl?.[item.uri] ? (
                    <View style={localStyles.annotationOverlay} pointerEvents="none">
                      {ANNOTATIONS.filter(({ key }) => imageAnnotationsByUrl[item.uri]?.[key]).map(({ key, label, color }) => {
                        const frame = imageAnnotationsByUrl[item.uri][key];
                        const overlayBox = buildPercentOverlay({
                          ...frame,
                          imageW: imageAnnotationsByUrl[item.uri].imageW,
                          imageH: imageAnnotationsByUrl[item.uri].imageH,
                        });
                        if (!overlayBox) return null;
                        return (
                          <View key={`fullscreen-${item.uri}-${key}`} style={[localStyles.annBox, { ...overlayBox, borderColor: color }]}> 
                            <View style={[localStyles.annChip, { backgroundColor: color }]}> 
                              <Text style={localStyles.annChipText} numberOfLines={1}>{label}</Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={ReceiptStyles.fullScreenCloseButton}
              onPress={() => setFullScreenImageIndex(null)}
            >
              <Text style={ReceiptStyles.fullScreenCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </Modal>

      {/* Full-screen Image Modal */}
      <Modal
        visible={!!fullScreenImage}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setFullScreenImage(null)}
      >
        <ImageViewer
          imageUrls={[{ url: fullScreenImage?.uri }]}
          enableSwipeDown
          onSwipeDown={() => setFullScreenImage(null)}
          backgroundColor="black"
        />

        <View style={ReceiptStyles.fullScreenCloseButtonWrapper}>
          <TouchableOpacity
            style={ReceiptStyles.fullScreenCloseButton}
            onPress={() => setFullScreenImage(null)}
          >
            <Text style={ReceiptStyles.fullScreenCloseText}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const localStyles = StyleSheet.create({
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
  imageSection: {
    height: HERO_EXPANDED_HEIGHT,
    overflow: "hidden",
    backgroundColor: "#000",
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  annotationOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  annBox: {
    position: "absolute",
    borderWidth: 2,
    borderRadius: 4,
    overflow: "visible",
    minWidth: ANNOTATION_MIN_BOX_WIDTH,
    minHeight: ANNOTATION_MIN_BOX_HEIGHT,
  },
  annChip: {
    position: "absolute",
    top: -18,
    left: 0,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    minWidth: 52,
  },
  annChipText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
    flexShrink: 0,
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
  dropdownDismissOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3000,
    elevation: 3000,
    backgroundColor: "transparent",
  },
  bottomBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e8e8e8",
  },
  bottomActionBtn: {
    flex: 1,
  },
  amountDateRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  amountDateField: {
    flex: 1,
  },
  labelAligned: {
    marginLeft: 10,
  },
  fieldRow: {
    marginHorizontal: 10,
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
    marginBottom: 8,
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
  debugOverlayWrap: {
    position: "absolute",
    top: 110,
    right: 10,
    zIndex: 9000,
    elevation: 9000,
  },
  debugOverlayCard: {
    minWidth: 210,
    maxWidth: 260,
    backgroundColor: "rgba(15,15,20,0.9)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  debugOverlayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  debugOverlayTitle: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  debugOverlayHide: {
    color: "#b8d5ff",
    fontSize: 12,
    fontWeight: "600",
  },
  debugOverlayText: {
    color: "#fff",
    fontSize: 11,
    marginTop: 2,
  },
  debugOverlayLast: {
    color: "#d0d0d0",
    fontSize: 10,
    marginTop: 6,
  },
  debugOverlayToggle: {
    position: "absolute",
    right: 10,
    top: 110,
    zIndex: 9000,
    elevation: 9000,
    backgroundColor: "rgba(15,15,20,0.9)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  debugOverlayToggleText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  fullScreenOverlayRoot: {
    flex: 1,
    backgroundColor: "#000",
  },
});
