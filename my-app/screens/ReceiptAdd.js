import React, { useRef, useState, useEffect } from "react";
import {
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
  FlatList,
  ActivityIndicator,
} from "react-native";
import { Button, Checkbox } from "react-native-paper";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import * as ImagePicker from "react-native-image-picker";
import DropDownPicker from "react-native-dropdown-picker";
import { db, auth } from "../firebaseConfig";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { categories_meta } from "../constants/arrays";
import { formatDate } from "../utils/format_style";
import TextRecognition from "react-native-text-recognition";
import * as FileSystem from "expo-file-system";
import { extractData } from "../utils/extractors";
import ImageViewer from "react-native-image-zoom-viewer";

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

  // Category dropdown items
  const [items, setItems] = useState(
    categories_meta.map((cat) => ({ label: cat.name, value: cat.name }))
  );

  // VAT RATE DROPDOWN — options come from categories_meta unique vatRate values
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

      const lines = await TextRecognition.recognize(localUri);
      const text = Array.isArray(lines) ? lines.join("\n") : String(lines || "");
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
            return has ? prev : [...prev, { label: `${catRate}%`, value: rStr }].sort(
              (a, b) => Number(a.value) - Number(b.value)
            );
          });
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

  // Auto-calc VAT when amount/rate present but vatAmount blank
  useEffect(() => {
  if (!vatAmountEdited && amount && vatRate) {
    setVatAmount(computeVat(amount, vatRate));
  }
  }, [amount, vatRate, vatAmountEdited]);


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
      setIsUploading(true);
      await uploadReceipt({
        amount,
        date: selectedDate,
        category: selectedCategory,
        vatAmount: vatAmount ? vatAmount : calculateVatFromRate(),
        vatRate,
        images,
      });
      setIsUploading(false);
      resetForm();
      setShowSuccess(true);
    } catch (err) {
      console.error("Upload failed:", err);
      setIsUploading(false);
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
  const hideDatePicker = () => setDatePickerVisibility(false);
  const handleConfirmDate = (date) => {
    setSelectedDate(date);
    hideDatePicker();
  };

  const pickImageOption = () => {
    Alert.alert(
      "Add Image",
      "Choose an option",
      [
        {
          text: "Camera",
          onPress: () =>
            ImagePicker.launchCamera(
              { mediaType: "photo", includeBase64: true, quality: 0.9 },
              handleImagePicked
            ),
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
      <Image source={{ uri: item.uri }} style={styles.receiptImage} />
    </TouchableOpacity>
  );

  // ------- render -------
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.container}>
          <View style={styles.borderContainer}>
            <Text style={styles.header}>Your Receipt</Text>

            {/* Amount */}
            <Text style={styles.label}>Amount:</Text>
            <View style={styles.inputRow}>
              <Text style={styles.currency}>£</Text>
              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
              />
            </View>

            {/* VAT Section: labels above fields */}
            <View style={styles.vatRow}>
              {/* VAT Amount Column */}
              <View style={styles.vatColLeft}>
                <Text style={styles.label}>VAT Amount:</Text>
                <View style={styles.inputRow}>
                  <Text style={styles.vatCurrency}>£</Text>
                  <TextInput
                    style={styles.vatInput}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    value={vatAmount}
                    onChangeText={(v) => {
                      setVatAmount(v);
                      setVatAmountEdited(v.trim().length > 0); // user is taking control
                    }}
                    onBlur={() => {
                      // if user cleared the field, go back to auto mode
                      if (!vatAmount.trim()) setVatAmountEdited(false);
                    }}
                  />
                </View>
              </View>

              {/* Rate Column */}
              <View style={styles.vatColRight}>
                <Text style={styles.label}>Rate (%):</Text>
                <DropDownPicker
                  open={vatRateOpen}
                  value={vatRate}
                  items={vatRateItems}
                  setOpen={setVatRateOpen}
                  setValue={(set) => setVatRate(set(vatRate))}
                  setItems={setVatRateItems}
                  placeholder="Select"
                  style={styles.vatRatePicker}
                  dropDownContainerStyle={styles.vatRateDropdown}
                  zIndex={2000}
                  zIndexInverse={2000}
                  listMode="SCROLLVIEW"
                  onChangeValue={(val) => {
                    setVatRate(val ?? "");
                    if (!vatAmountEdited && val && amount) {
                      setVatAmount(computeVat(amount, val));
                    }
                  }}
                />
              </View>
            </View>

            {/* Date */}
            <Text style={styles.label}>Date:</Text>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={showDatePicker}
            >
              <Text style={styles.dateText}>{formatDate(selectedDate)}</Text>
            </TouchableOpacity>
            <DateTimePickerModal
              isVisible={isDatePickerVisible}
              mode="date"
              date={selectedDate}
              onConfirm={handleConfirmDate}
              onCancel={hideDatePicker}
            />

            {/* Category */}
            <Text style={styles.label}>Category:</Text>
            <DropDownPicker
              open={open}
              value={selectedCategory}
              items={items}
              setOpen={setOpen}
              setItems={setItems}
              setValue={(cb) => {
                const next = cb(selectedCategory);
                setSelectedCategory(next);
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
                  }
                }
              }}
              placeholder="Select a category"
              style={styles.dropdown}
              dropDownContainerStyle={styles.dropdownContainer}
              zIndex={1000}
              zIndexInverse={1000}
              dropDownDirection="AUTO"
            />

            {/* Images */}
            <FlatList
              ref={flatListRef}
              data={[...images, { addButton: true }]}
              horizontal
              keyExtractor={(item, index) => index.toString()}
              renderItem={({ item }) =>
                item.addButton ? (
                  <TouchableOpacity
                    style={styles.uploadPlaceholder}
                    onPress={pickImageOption}
                  >
                    <Text style={styles.plus}>+</Text>
                  </TouchableOpacity>
                ) : (
                  renderImage({ item })
                )
              }
              contentContainerStyle={{ marginVertical: 20 }}
              showsHorizontalScrollIndicator={true}
            />

            {/* Buttons */}
            <View style={styles.buttonContainer}>
              <Button
                mode="contained"
                buttonColor="#a60d49"
                style={styles.button}
                onPress={handleLeavePress}
              >
                Cancel
              </Button>

              <Button
                mode="contained"
                onPress={handleSavePress}
                buttonColor="#a60d49"
                style={styles.button}
                disabled={!selectedCategory || amount.trim() === ""}
              >
                Save
              </Button>
            </View>

            <Button
              mode="outlined"
              onPress={handleResetPress}
              style={styles.resetButton}
              textColor="#a60d49"
              icon="autorenew"
            >
              Reset Form
            </Button>
          </View>
        </View>
      </TouchableWithoutFeedback>

      {/* Confirmation Modal */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Confirm Receipt Details</Text>
            <Text>Amount: £{amount}</Text>
            <Text>Date: {selectedDate.toDateString()}</Text>
            <Text>Category: {selectedCategory}</Text>
            <Text>VAT Amount: £{vatAmount || calculateVatFromRate() || "0.00"}</Text>
            <Text>VAT Rate: {vatRate || "—"}%</Text>
            <View style={styles.modalButtons}>
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

      {/* Leave/Reset Modals */}
      <Modal
        visible={showConfirmReset}
        transparent
        animationType="slide"
        onRequestClose={() => setConfirmReset(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Confirm Reset</Text>
            <View style={styles.modalButtons}>
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

      <Modal
        visible={showConfirmLeaveModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowConfirmLeaveModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Are you sure you want to go back?
            </Text>
            <View style={styles.modalButtons}>
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
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: "90%" }]}>
            <Text style={styles.modalTitle}>Receipt Preview</Text>

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
                  <Image source={{ uri: preview.uri }} style={styles.modalImage} />
                </TouchableOpacity>
                {ocrLoading && <Text style={styles.scanningText}>Scanning…</Text>}
              </View>
            ) : null}

            {!ocrLoading && (
              <Text style={styles.fullscreenHint}>Tap image to view full screen</Text>
            )}

            {!ocrLoading && (
              <>
                {/* Amount */}
                <View style={styles.ocrRow}>
                  <Checkbox
                    status={acceptFlags.amount ? "checked" : "unchecked"}
                    onPress={() => toggleAccept("amount")}
                  />
                  <Text style={styles.ocrLabel}>Amount:</Text>
                  <Text style={styles.ocrValue}>
                    {ocrResult?.amount != null ? `£${ocrResult.amount}` : "—"}
                  </Text>
                </View>

                {/* Date */}
                <View style={styles.ocrRow}>
                  <Checkbox
                    status={acceptFlags.date ? "checked" : "unchecked"}
                    onPress={() => toggleAccept("date")}
                  />
                  <Text style={styles.ocrLabel}>Date:</Text>
                  <Text style={styles.ocrValue}>
                    {ocrResult?.date ? formatDate(new Date(ocrResult.date)) : "—"}
                  </Text>
                </View>

                {/* Category */}
                <View style={styles.ocrRow}>
                  <Checkbox
                    status={acceptFlags.category ? "checked" : "unchecked"}
                    onPress={() => toggleAccept("category")}
                  />
                  <Text style={styles.ocrLabel}>Category:</Text>
                  <Text style={styles.ocrValue}>
                    {ocrResult?.categoryName ?? "—"}
                  </Text>
                </View>

                {/* VAT */}
                <View style={styles.ocrRow}>
                  <Checkbox
                    status={acceptFlags.vat ? "checked" : "unchecked"}
                    onPress={() => toggleAccept("vat")}
                  />
                  <Text style={styles.ocrLabel}>VAT:</Text>
                  <Text style={styles.ocrValue}>
                    {ocrResult?.vat?.value != null ? `£${ocrResult.vat.value}` : "—"}
                    {`  (Rate ${ocrResult?.vat?.rate ?? "—"}%)`}
                  </Text>
                </View>

                <View style={styles.modalButtons}>
                  {!isNewImageSession && (
                    <Button
                      mode="outlined"
                      onPress={deleteCurrentImage}
                      textColor="#a60d49"
                    >
                      Delete Image
                    </Button>
                  )}
                  <Button mode="text" onPress={handleCancelModal}>
                    Cancel
                  </Button>
                  <Button mode="contained" onPress={applyAcceptedValues}>
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
            <View style={styles.fullScreenCloseButtonWrapper}>
              <TouchableOpacity
                style={styles.fullScreenCloseButton}
                onPress={() => {
                  setFullScreenImage(null);
                  if (returnToOcrAfterFullscreen) {
                    requestAnimationFrame(() => setOcrModalVisible(true));
                    setReturnToOcrAfterFullscreen(false);
                  }
                }}
              >
                <Text style={styles.fullScreenCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : null}
      </Modal>

      {/* Uploading overlay */}
      <Modal
        visible={isUploading}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={styles.uploadOverlay}>
          <View style={styles.uploadCard}>
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

const styles = StyleSheet.create({
  container: {
    padding: 12,
    backgroundColor: "#312e74",
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  borderContainer: {
    borderWidth: 5,
    borderColor: "#312e74",
    borderRadius: 35,
    padding: 20,
    width: "90%",
    backgroundColor: "#FFFFFF",
  },
  header: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#a60d49",
    marginBottom: 20,
    textAlign: "center",
  },
  label: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginTop: 10,
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  currency: {
    fontSize: 18,
    fontWeight: "bold",
    marginLeft: 25,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
    padding: 10,
    flex: 1,
    fontSize: 16,
    margin: 8,
  },

  // VAT layout
  vatRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  vatColLeft: {
    flex: 1,
  },
  vatColRight: {
    width: 100, // smaller dropdown
  },
  vatCurrency: {
    fontSize: 18,
    fontWeight: "bold",
    marginLeft: 10,
    paddingRight:5 // smaller so input gets more width
  },
  vatInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
    padding: 10,
    flex: 1,
    fontSize: 16,
    marginVertical: 8,
    marginRight: 8,
  },
  vatRatePicker: {
    backgroundColor: "#fafafa",
    borderColor: "#ccc",
    height: 44,
    paddingHorizontal: 8,
    marginTop: 8,
  },
  vatRateDropdown: {
    borderColor: "#ccc",
  },

  dateButton: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 5,
    padding: 10,
    margin: 25,
    marginRight: 36,
    marginLeft: 44,
  },
  dateText: { fontSize: 16 },

  dropdown: {
    backgroundColor: "#fafafa",
    borderColor: "#ccc",
  },
  dropdownContainer: {
    backgroundColor: "#fafafa",
    borderColor: "#ccc",
  },

  receiptImage: {
    width: 100,
    height: 150,
    resizeMode: "contain",
    borderRadius: 5,
    marginRight: 10,
  },
  uploadPlaceholder: {
    width: 100,
    height: 150,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#ccc",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
  },
  plus: { fontSize: 32, color: "#a60d49" },

  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 10,
  },
  button: { flex: 1, marginHorizontal: 5 },

  // Shared modal styling
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "white",
    borderRadius: 10,
    padding: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 10 },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
  },

  // OCR modal extras
  modalImage: {
    width: "100%",
    height: 320,
    resizeMode: "contain",
    borderRadius: 8,
    marginBottom: 12,
  },
  scanningText: { marginTop: 8, fontStyle: "italic", color: "#555" },
  ocrRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  ocrLabel: { fontWeight: "600", marginRight: 6 },
  ocrValue: { flexShrink: 1 },

  // Upload overlay
  uploadOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  uploadCard: {
    backgroundColor: "#fff",
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 180,
  },

  // Fullscreen close button
  fullScreenCloseButtonWrapper: {
    position: "absolute",
    bottom: 30,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  fullScreenCloseButton: {
    backgroundColor: "rgba(166, 13, 73, 0.9)",
    paddingVertical: 8,
    paddingHorizontal: 24,
    borderRadius: 20,
  },
  fullScreenCloseText: { color: "#fff", fontWeight: "bold", fontSize: 16 },

  // hint text
  fullscreenHint: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
    fontStyle: "italic",
    textAlign: "center",
    alignSelf: "center",
  },
});

export default ReceiptAdd;
