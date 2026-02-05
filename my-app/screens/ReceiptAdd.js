import React, { useRef, useState, useEffect } from "react";
import {
  PermissionsAndroid,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  TouchableWithoutFeedback,
  Keyboard,
  KeyboardAvoidingView,
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
import DropDownPicker from "react-native-dropdown-picker";
import { db, auth } from "../firebaseConfig";
import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { categories_meta } from "../constants/arrays";
import { formatDate } from "../utils/format_style";
import TextRecognition from '@react-native-ml-kit/text-recognition';
import * as FileSystem from "expo-file-system/legacy";
import { extractData } from "../utils/extractors";
import ImageViewer from "react-native-image-zoom-viewer";
import { Colors, ReceiptStyles } from "../utils/sharedStyles";



const ReceiptAdd = ({ navigation }) => {
  const [amount, setAmount] = useState("");
  const [vatAmount, setVatAmount] = useState("");
  const [vatRate, setVatRate] = useState(""); // string
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isDatePickerVisible, setDatePickerVisibility] = useState(false);
  const [images, setImages] = useState([]); // [{ uri }]
  const [open, setOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [vatAmountEdited, setVatAmountEdited] = useState(false);
  const [showTip, setShowTip] = useState(false);
  const [tipPosition, setTipPosition] = useState({ x: 0, y: 0 });

  // success + confirm modals
  const [showSuccess, setShowSuccess] = useState(false);
  const [showConfirmReset, setConfirmReset] = useState(false);
  const [showConfirmLeaveModal, setShowConfirmLeaveModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // OCR modal state
  const [ocrModalVisible, setOcrModalVisible] = useState(false);
  const [preview, setPreview] = useState(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState(null);
  const [acceptFlags, setAcceptFlags] = useState({
    amount: false,
    date: false,
    category: false,
    vat: false,
  });
  const [isNewImageSession, setIsNewImageSession] = useState(false);

  const [isUploading, setIsUploading] = useState(false);

  // Fullscreen viewer (separate, top-level modal)
  const [fullScreenImage, setFullScreenImage] = useState(null);
  const [returnToOcrAfterFullscreen, setReturnToOcrAfterFullscreen] = useState(false);

  const allCategoryItems = categories_meta.map((cat) => ({ 
    label: cat.name, 
    value: cat.name 
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

  // ------- helpers -------
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

    throw new Error("No uri/base64 on asset for OCR");
  };

  const computeVat = (grossStr, rateStr) => {
    const gross = parseFloat(grossStr);
    const rate = parseFloat(rateStr);
    if (!isFinite(gross) || !isFinite(rate)) return "";
    const net = gross / (1 + rate / 100);
    const vat = gross - net;
    return vat.toFixed(2);
  };

  const openOcrModal = async (uri, { autoScan = true, newSession = false } = {}) => {
    setPreview({ uri });
    setOcrResult(null);
    setAcceptFlags({ amount: false, date: false, category: false, vat: false });
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

      // Call the ML Kit recognize method
      const result = await TextRecognition.recognize(localUri);
      const text = result?.text || ""; 
      const res = extractData(text);

      const categoryIndex = typeof res?.category === "number" ? res.category : -1;
      const categoryName =
        categoryIndex >= 0 && categories_meta[categoryIndex]
          ? categories_meta[categoryIndex].name
          : null;

      setOcrResult({
        amount: res?.money?.value ?? null,
        date: res?.date ?? null,
        vat: res?.vat ?? null,
        categoryIndex,
        categoryName,
        raw: text,
      });
      setAcceptFlags({
        amount: !!res?.money?.value,
        date: !!res?.date,
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

  const deleteCurrentImage = () => {
    if (!preview?.uri) return;
    setImages((prev) => prev.filter((img) => img.uri !== preview.uri));
    setOcrModalVisible(false);
    setReturnToOcrAfterFullscreen(false);
  };

  const applyAcceptedValues = () => {
    if (!ocrResult) return;
    if (acceptFlags.amount && ocrResult.amount != null) {
      setAmount(String(ocrResult.amount));
    }
    if (acceptFlags.date && ocrResult.date) {
      const d = new Date(ocrResult.date);
      if (!isNaN(d.getTime())) setSelectedDate(d);
    }
    if (acceptFlags.category && ocrResult.categoryName) {
      setSelectedCategory(ocrResult.categoryName);
      if (!(ocrResult.vat && ocrResult.vat.rate)) {
        const catRate = categories_meta[ocrResult.categoryIndex]?.vatRate ?? "";
        if (catRate !== "") {
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
          if (!vatAmountEdited && amount) {
            setVatAmount(computeVat(amount, rStr));
          }
        }
      }
    }
    if (acceptFlags.vat) {
      if (ocrResult.vat?.value != null) setVatAmount(String(ocrResult.vat.value));
      if (ocrResult.vat?.rate != null) setVatRate(String(ocrResult.vat.rate));
    }
    setOcrModalVisible(false);
    setReturnToOcrAfterFullscreen(false);
  };

  const handleCancelModal = () => {
    if (isNewImageSession && preview?.uri) {
      setImages((prev) => prev.filter((img) => img.uri !== preview.uri));
    }
    setOcrModalVisible(false);
    setReturnToOcrAfterFullscreen(false);
  };

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
    const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
      if (ocrModalVisible) {
        handleCancelModal();
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
    });
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

  const handleSavePress = () => {
    if (
      !amount ||
      isNaN(parseFloat(amount)) ||
      parseFloat(amount) <= 0 ||
      !selectedCategory
    ) {
      Alert.alert("Invalid Input", "Please fill in all fields correctly.");
      return;
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
      vatAmount: vatAmount ? vatAmount : calculateVatFromRate(),
      vatRate,
      images,
    });

    // 4) Hide uploading, reset form
    setIsUploading(false);
    resetForm();

    // 5) Yield one frame, then show success modal
    await new Promise((resolve) => requestAnimationFrame(resolve));
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
    setImages([]);
    setConfirmReset(false);
    setShowConfirmModal(false);
    setVatAmountEdited(false);
  };

  const uploadReceipt = async ({ amount, date, category, vatAmount, vatRate, images }) => {
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

    await addDoc(collection(db, "receipts"), {
      amount: parseFloat(amount),
      date: date.toISOString(),
      category,
      vatAmount: vatAmount ? parseFloat(vatAmount) : null,
      vatRate: vatRate ? parseFloat(vatRate) : null,
      images: imageUrls,
      userId: user.uid,
      createdAt: serverTimestamp(),
    });
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
          if (Platform.OS === 'android') {
            const granted = await PermissionsAndroid.request(
              PermissionsAndroid.PERMISSIONS.CAMERA
            );
            
            if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
              Alert.alert(
                "Permission Denied", 
                "You need to allow camera access to take photos of receipts."
              );
              return;
            }
          }

          // Launch camera only after permission is confirmed
          ImagePicker.launchCamera(
            { mediaType: "photo", includeBase64: true, quality: 0.9 },
            handleImagePicked
          );
        },
      },
      {
        text: "Gallery",
        onPress: () =>
          ImagePicker.launchImageLibrary(
            {
              mediaType: "photo",
              includeBase64: true,
              selectionLimit: 1,
              quality: 0.9,
            },
            handleImagePicked
          ),
      },
      { text: "Cancel", style: "cancel" },
    ],
    { cancelable: true }
  );
  };

  const handleImagePicked = async (response) => {
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

  const renderImage = ({ item }) => (
    <TouchableOpacity
      onPress={() =>
        openOcrModal(item.uri, { autoScan: true, newSession: false })
      }
    >
      <Image source={{ uri: item.uri }} style={ReceiptStyles.receiptImage} />
    </TouchableOpacity>
  );

  // ------- render -------
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAwareScrollView
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }}
          enableOnAndroid={true}
          keyboardShouldPersistTaps="handled"
        >
          <View style={ReceiptStyles.container}>
            <View style={ReceiptStyles.borderContainer}>
              <Text style={ReceiptStyles.header}>Your Receipt</Text>

            {/* Amount */}
            <Text style={ReceiptStyles.label}>Amount:</Text>
            <View style={ReceiptStyles.inputRow}>
              <Text style={ReceiptStyles.currency}>£</Text>
              <TextInput
                style={ReceiptStyles.input}
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

            {/* VAT Section: labels above fields */}
            <View style={[ReceiptStyles.vatRow, { zIndex: 2000, elevation: 5 }]}>
              {/* VAT Amount Column */}
              <View style={ReceiptStyles.vatColLeft}>
                <Text style={ReceiptStyles.label}>VAT Amount:</Text>
                <View style={ReceiptStyles.inputRow}>
                  <Text style={ReceiptStyles.vatCurrency}>£</Text>
                  <TextInput
                    style={ReceiptStyles.vatInput}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
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
                  containerStyle={{ marginTop: 8 }} // Move margin here for better stability
                  zIndex={2000}
                  zIndexInverse={2000}
                  listMode="SCROLLVIEW"
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

            {/* Date */}
            <Text style={ReceiptStyles.label}>Date:</Text>
            <TouchableOpacity
              style={ReceiptStyles.dateButton}
              onPress={showDatePicker}
            >
              <Text style={ReceiptStyles.dateText}>{formatDate(selectedDate)}</Text>
            </TouchableOpacity>
            <DateTimePickerModal
              isVisible={isDatePickerVisible}
              mode="date"
              date={selectedDate}
              onConfirm={handleConfirmDate}
              onCancel={hideDatePicker}
            />

            {/* Category */}
            <Text style={ReceiptStyles.label}>Category:</Text>
            <DropDownPicker
              open={open}
              value={selectedCategory}
              items={items}
              setOpen={setOpen}
              setItems={setItems}
              
              searchable={true}
              disableLocalSearch={true} // We are taking the wheel
              onChangeSearchText={(text) => {
                const query = text.toLowerCase().trim();
                if (!query) {
                  setItems(allCategoryItems);
                  return;
                }

                // Custom filtering logic: Check label OR Meta
                const filtered = allCategoryItems.filter((item) => {
                  const categoryData = categories_meta.find((c) => c.name === item.value);
                  const labelMatch = item.label.toLowerCase().includes(query);
                  const metaMatch = categoryData?.meta?.some((kw) => kw.toLowerCase().includes(query));
                  
                  return labelMatch || metaMatch;
                });

                setItems(filtered);
              }}

              // 3. Return to SCROLLVIEW mode for stability
              listMode="SCROLLVIEW"
              nestedScrollEnabled={true}
              
              // 4. Force a Height to fix the scrolling
              // This ensures the picker has a defined boundary so the phone knows when to scroll
              dropDownContainerStyle={[
                ReceiptStyles.dropdownContainer,
                { position: 'relative', top: 0, maxHeight: 250 }
              ]}

              setValue={(callback) => {
                // 1. Get the next value by calling the callback with the current state
                const next = callback(selectedCategory);
                
                // 2. Update your state variable
                setSelectedCategory(next);
              
                // 3. Trigger your VAT logic
                if (!vatRate && next) {
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

              placeholder="Select a category"
              style={ReceiptStyles.dropdown}
              zIndex={1000}
              zIndexInverse={3000}
          />

            {/* Images Section */}
            <View style={{ marginVertical: 20, zIndex: 1, elevation: 1 }}>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ alignItems: 'center' }}
              >
                {/* Map through images instead of using FlatList to avoid nesting errors */}
                {images.map((item, index) => (
                  <View key={index.toString()}>
                    <TouchableOpacity
                      onPress={() => openOcrModal(item.uri, { autoScan: true, newSession: false })}
                    >
                      <Image source={{ uri: item.uri }} style={ReceiptStyles.receiptImage} />
                    </TouchableOpacity>
                  </View>
                ))}
                
                {/* The + Button and Tooltip aligned in a row */}
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TouchableOpacity
                    style={[ReceiptStyles.uploadPlaceholder, { marginRight: 0 }]}
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
                disabled={!selectedCategory || amount.trim() === ""}
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
      </TouchableWithoutFeedback>

      {/* Confirmation Modal */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <View style={ReceiptStyles.modalOverlay}>
          <View style={ReceiptStyles.modalContent}>
            <Text style={ReceiptStyles.modalTitle}>Confirm Receipt Details</Text>
            <Text style={ReceiptStyles.modalDetailText}>Amount: £{amount}</Text>
            <Text style={ReceiptStyles.modalDetailText}>Date: {selectedDate.toDateString()}</Text>
            <Text style={ReceiptStyles.modalDetailText}>Category: {selectedCategory}</Text>
            <Text style={ReceiptStyles.modalDetailText}>VAT Amount: £{vatAmount || calculateVatFromRate() || "0.00"}</Text>
            <Text style={ReceiptStyles.modalDetailText}>VAT Rate: {vatRate || "—"}%</Text>
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
        visible={ocrModalVisible}
        transparent
        animationType="slide"
        onRequestClose={handleCancelModal}
      >
        <View style={ReceiptStyles.modalOverlay}>
          <View style={[ReceiptStyles.modalContent, { maxHeight: "90%" }]}>
            <Text style={ReceiptStyles.modalTitle}>Receipt Preview</Text>

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
                    requestAnimationFrame(() =>
                      setFullScreenImage({ uri: current })
                    );
                  }}
                >
                  <Image source={{ uri: preview.uri }} style={ReceiptStyles.modalImage} />
                </TouchableOpacity>
                {ocrLoading && <Text style={ReceiptStyles.scanningText}>Scanning…</Text>}
              </View>
            ) : null}

            {!ocrLoading && (
              <Text style={ReceiptStyles.fullscreenHint}>Tap image to view full screen</Text>
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
                    {ocrResult?.amount != null ? `£${ocrResult.amount}` : "Not detected"}
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
                    {ocrResult?.date ? formatDate(new Date(ocrResult.date)) : "Not detected"}
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
                    disabled={ocrResult?.vat?.value == null && ocrResult?.vat?.rate == null}
                  />
                  <Text style={ReceiptStyles.ocrLabel}>VAT:</Text>
                  <Text style={ReceiptStyles.ocrValue}>
                    {ocrResult?.vat?.value != null ? `£${ocrResult.vat.value}` : "Not detected"}
                    {`  (Rate ${ocrResult?.vat?.rate ?? "—"}%)`}
                  </Text>
                </View>

                <View style={ReceiptStyles.modalButtons}>
                  {!isNewImageSession && (
                    <Button
                      mode="outlined"
                      onPress={deleteCurrentImage}
                      textColor={Colors.accent}
                    >
                      Delete Image
                    </Button>
                  )}
                  <Button buttonColor={Colors.accent} mode="contained" onPress={handleCancelModal}>
                    Cancel
                  </Button>
                  <Button buttonColor={Colors.accent} mode="contained" onPress={applyAcceptedValues}>
                    Accept
                  </Button>
                </View>
              </>
            )}
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
        visible={isUploading}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"   // 👈 important on iOS
        statusBarTranslucent                  // optional, nicer on iOS
        onRequestClose={() => {}}
      >
        <View style={ReceiptStyles.uploadOverlay}>
          <View style={ReceiptStyles.uploadCard}>
            <ActivityIndicator size="large" color="#a60d49" />
            <Text style={{ marginTop: 12, fontWeight: "600" }}>
              Uploading…
            </Text>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};


const localStyles = StyleSheet.create({
  tipWrapper: {
    position: 'absolute',
    // Position it roughly 110 pixels above the button's Y coordinate
    left: 10,
    right: 20,
    zIndex: 5000,
    alignItems: 'center', // Centers the bubble and triangle
  },
  tipBox: {
    backgroundColor: '#F0D1FF',
    padding: 15,
    borderRadius: 15,
    width: '100%', // Takes up the width of the container
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 4 },
  },
  tipText: {
    color: '#4A148C',
    fontSize: 14,
    lineHeight: 20,
  },
  tipButton: {
    marginTop: 10,
    alignSelf: 'flex-end',
    backgroundColor: '#4A148C',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 10,
  },
  tipButtonText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  triangle: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderTopWidth: 18,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#F0D1FF',
    marginTop: -1, // Merges triangle into the box
  },
  sideTipContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 10, // Allows it to take up remaining horizontal space
    marginLeft: 5, // Pulls the triangle closer to the box
  },
  leftTriangle: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderTopWidth: 8,
    borderBottomWidth: 8,
    borderRightWidth: 12,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderRightColor: '#F0D1FF', // Matches box color
    zIndex: 3001,
  },
  sideTipBox: {
    backgroundColor: '#F0D1FF',
    padding: 10,
    borderRadius: 12,
    maxWidth: 160,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 2, height: 2 },
  },
  sideTipText: {
    color: '#4A148C',
    fontSize: 11,
    lineHeight: 15,
  },
  sideGotIt: {
    color: '#4A148C',
    fontWeight: 'bold',
    fontSize: 10,
    marginTop: 5,
    textAlign: 'right',
  },
  sideTipWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 5, // Pulls the triangle right up to the box edge
    zIndex: 5000,
  },
  leftTriangle: {
    width: 0,
    height: 0,
    borderTopWidth: 7,
    borderBottomWidth: 7,
    borderRightWidth: 10,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderRightColor: '#F0D1FF',
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