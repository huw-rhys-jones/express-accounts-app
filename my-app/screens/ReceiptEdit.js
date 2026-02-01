import React, { useMemo, useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  FlatList,
  Alert,
  Keyboard,
  InteractionManager,
  Modal,
  ActivityIndicator,
  Platform,
  PermissionsAndroid,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Checkbox } from "react-native-paper";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import DropDownPicker from "react-native-dropdown-picker";
import * as ImagePicker from "react-native-image-picker";
import { db } from "../firebaseConfig";
import { doc, updateDoc, deleteDoc } from "firebase/firestore";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { categories_meta } from "../constants/arrays";
import { formatDate } from "../utils/format_style";
import TextRecognition from '@react-native-ml-kit/text-recognition';
import * as FileSystem from "expo-file-system/legacy";
import { extractData } from "../utils/extractors";
import ImageViewer from "react-native-image-zoom-viewer";
import { Colors, ReceiptStyles } from "../utils/sharedStyles";

export default function ReceiptDetailsScreen({ route, navigation }) {
  const { receipt } = route.params;

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
  const [selectedCategory, setSelectedCategory] = useState(receipt?.category || "");
  const [images, setImages] = useState(
    (receipt?.images || []).map((url) => ({ uri: url }))
  );

  const originalUrls = useMemo(() => new Set(receipt?.images || []), [receipt?.id]);

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(
    categories_meta.map((cat) => ({ label: cat.name, value: cat.name }))
  );
  const [isDatePickerVisible, setDatePickerVisibility] = useState(false);

  const [isUploading, setIsUploading] = useState(false);

  // ===== OCR preview modal state =====
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

  // ===== Fullscreen viewer =====
  const [fullScreenImage, setFullScreenImage] = useState(null);

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

  // ===== helpers =====
  const computeVat = (grossStr, rateStr) => {
    const gross = parseFloat(grossStr);
    const rate = parseFloat(rateStr);
    if (!isFinite(gross) || !isFinite(rate)) return "";
    const net = gross / (1 + rate / 100);
    const vat = gross - net;
    return vat.toFixed(2);
  };

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

  // ===== Ensure local file for OCR =====
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

    throw new Error("No usable uri/base64 on asset for OCR");
  };

  // ===== OCR helpers =====
  const openOcrModal = async (uri, { autoScan, newSession }) => {
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

      const categoryIndex =
        typeof res?.category === "number" ? res.category : -1;
      const categoryName =
        categoryIndex >= 0 && categories_meta[categoryIndex]
          ? categories_meta[categoryIndex].name
          : null;

      setOcrResult({
        amount: res?.money?.value ?? null,
        date: res?.date ?? null,
        vat: res?.vat ?? null, // keep for parity (might not be used if your extractor doesn't return VAT)
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

  const applyAcceptedValues = () => {
    if (!ocrResult) return;
    if (acceptFlags.amount && ocrResult.amount != null) {
      setAmount(String(ocrResult.amount));
      // recalc if we have a rate and user didn't override VAT manually
      if (!vatAmountEdited && vatRate) setVatAmount(computeVat(String(ocrResult.amount), vatRate));
    }
    if (acceptFlags.date && ocrResult.date) {
      const d = new Date(ocrResult.date);
      if (!isNaN(d.getTime())) setSelectedDate(d);
    }
    if (acceptFlags.category && ocrResult.categoryName) {
      setSelectedCategory(ocrResult.categoryName);
      // if rate blank, seed from category default
      if (!vatRate && typeof ocrResult.categoryIndex === "number") {
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
          if (!vatAmountEdited && amount) setVatAmount(computeVat(amount, rStr));
        }
      }
    }
    if (acceptFlags.vat) {
      if (ocrResult.vat?.value != null) setVatAmount(String(ocrResult.vat.value));
      if (ocrResult.vat?.rate != null) setVatRate(String(ocrResult.vat.rate));
    }
    setOcrModalVisible(false);
  };

  const deleteCurrentImage = () => {
    if (!preview?.uri) return;
    setImages((prev) => prev.filter((img) => img.uri !== preview.uri));
    setOcrModalVisible(false);
  };

  const handleCancelModal = () => {
    if (isNewImageSession && preview?.uri) {
      setImages((prev) => prev.filter((img) => img.uri !== preview.uri));
    }
    setOcrModalVisible(false);
  };

  const pickImageOption = () => {
  Alert.alert(
    "Add Image",
    "Choose an option",
    [
      {
        text: "Camera",
        onPress: async () => {
          try {
            if (Platform.OS === 'android') {
              // 1. Request Camera Permission
              const granted = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.CAMERA,
                {
                  title: "Camera Permission",
                  message: "Express Accounts needs camera access to scan receipts.",
                  buttonPositive: "OK",
                }
              );
              
              if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
                Alert.alert("Permission Denied", "Camera access is required.");
                return;
              }
            }

            // 2. Launch Camera - Use a tiny timeout to ensure the Alert has fully dismissed
            // This prevents the "Activity is not focused" error on Android
            setTimeout(() => {
              ImagePicker.launchCamera(
                { mediaType: "photo", includeBase64: true, quality: 0.9 },
                (res) => handleImagePicked(res) // Use arrow function to ensure context
              );
            }, 100);
          } catch (err) {
            console.warn(err);
          }
        },
      },
      {
        text: "Gallery",
        onPress: () => {
          // Gallery usually doesn't need explicit PermissionsAndroid on SDK 33+ 
          // because it uses the System Picker, but it's safer to wrap in a timeout.
          setTimeout(() => {
            ImagePicker.launchImageLibrary(
              {
                mediaType: "photo",
                includeBase64: true,
                selectionLimit: 1,
                quality: 0.9,
              },
              (res) => handleImagePicked(res)
            );
          }, 100);
        },
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
      console.error("❌ handleImagePicked error:", e);
    }
  };

  // ===== SAVE CHANGES =====
  const saveChanges = async () => {
    try {
      if (!amount || parseFloat(amount) <= 0 || !selectedCategory) {
        Alert.alert("Invalid Input", "Please fill in all fields correctly.");
        return;
      }

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

      for (let img of images) {
        if (img.uri.startsWith("http")) {
          uploadedImageUrls.push(img.uri);
        } else {
          const storageRef = ref(
            storage,
            `receipts/${receipt.userId}/${Date.now()}-${Math.random()
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

      await updateDoc(doc(db, "receipts", receipt.id), {
        amount: parseFloat(amount),
        date: selectedDate.toISOString(),
        category: selectedCategory,
        vatAmount: vatAmount ? parseFloat(vatAmount) : null,
        vatRate: vatRate ? parseFloat(vatRate) : null,
        images: uploadedImageUrls,
      });

      setIsUploading(false);
      safeNavigateToExpenses();
    } catch (err) {
      console.error("Update failed:", err);
      setIsUploading(false);
      Alert.alert("Error", "Could not update receipt");
    }
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

  return (
    <SafeAreaView style={ReceiptStyles.safeArea}>
      <KeyboardAwareScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        enableOnAndroid={true}
        keyboardShouldPersistTaps="handled"
      >
        <View style={ReceiptStyles.container}>
          <View style={ReceiptStyles.borderContainer}>
            <Text style={ReceiptStyles.header}>Edit Receipt</Text>

        {/* Amount */}
        <Text style={ReceiptStyles.label}>Amount (£)</Text>
        <TextInput
          style={ReceiptStyles.input}
          value={amount}
          keyboardType="decimal-pad"
          onChangeText={(v) => {
            setAmount(v);
            if (!vatAmountEdited && v && vatRate) {
              setVatAmount(computeVat(v, vatRate));
            }
          }}
        />

        {/* VAT Section */}
<View style={ReceiptStyles.vatRow}>
  {/* VAT Amount Column */}
  <View style={ReceiptStyles.vatColLeft}>
    <Text style={ReceiptStyles.label}>VAT Amount</Text>
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

  {/* VAT Rate Column */}
  <View style={ReceiptStyles.vatColRight}>
    <Text style={ReceiptStyles.label}>Rate (%)</Text>
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
      containerStyle={{ marginTop: 8 }} // This aligns the picker top with the "£" inputRow top
      zIndex={2000}
      zIndexInverse={2000}
      listMode="SCROLLVIEW"
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

        {/* Date */}
        <Text style={ReceiptStyles.label}>Date</Text>
        <TouchableOpacity
          style={ReceiptStyles.dateButton}
          onPress={() => setDatePickerVisibility(true)}
        >
          <Text>{formatDate(selectedDate)}</Text>
        </TouchableOpacity>
        <DateTimePickerModal
          isVisible={isDatePickerVisible}
          mode="date"
          date={selectedDate}
          onConfirm={(date) => {
            setSelectedDate(date);
            setDatePickerVisibility(false);
          }}
          onCancel={() => setDatePickerVisibility(false)}
        />

        {/* Category */}
        <Text style={ReceiptStyles.label}>Category</Text>
        <DropDownPicker
          listMode="MODAL"
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
                if (!vatAmountEdited && amount) {
                  setVatAmount(computeVat(amount, rStr));
                }
              }
            }
          }}
          placeholder="Select a category"
          style={ReceiptStyles.dropdown}
          dropDownContainerStyle={ReceiptStyles.dropdownContainer}
        />

        {/* Images */}
        <FlatList
          data={[...images, { addButton: true }]}
          horizontal
          nestedScrollEnabled={true}
          keyExtractor={(_, index) => index.toString()}
          renderItem={({ item }) =>
            item.addButton ? (
              <TouchableOpacity
                style={ReceiptStyles.uploadPlaceholder}
                onPress={pickImageOption}
              >
                <Text style={ReceiptStyles.plus}>+</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                disabled={ocrLoading}
                onPress={() =>
                  openOcrModal(item.uri, { autoScan: true, newSession: false })
                }
              >
                <Image source={{ uri: item.uri }} style={ReceiptStyles.receiptImage} />
              </TouchableOpacity>
            )
          }
          contentContainerStyle={{ marginVertical: 20 }}
          showsHorizontalScrollIndicator
        />

        {/* Bottom actions */}
        <View style={ReceiptStyles.bottomButtons}>
          <View style={ReceiptStyles.primaryRow}>
            <Button
              mode="outlined"
              onPress={safeNavigateToExpenses}
              textColor="#555"
              style={ReceiptStyles.actionBtn}
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={saveChanges}
              buttonColor="#a60d49"
              style={ReceiptStyles.actionBtn}
            >
              Save Changes
            </Button>
          </View>

          <View style={ReceiptStyles.deleteRow}>
            <Button
              mode="outlined"
              onPress={deleteReceipt}
              textColor="#a60d49"
              style={ReceiptStyles.deleteBtn}
            >
              Delete Receipt
            </Button>
          </View>
        </View>
          </View>
        </View>

      </KeyboardAwareScrollView>

      {/* OCR Preview + Accept Modal */}
      <Modal
        visible={ocrModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setOcrModalVisible(false)}
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
                  onPress={() => setFullScreenImage(preview)}
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
                <View style={ReceiptStyles.ocrRow}>
                  <Checkbox
                    status={acceptFlags.amount ? "checked" : "unchecked"}
                    onPress={() => toggleAccept("amount")}
                    color={Colors.accent}
                  />
                  <Text
                    style={[ReceiptStyles.ocrLabel, !acceptFlags.amount && ReceiptStyles.strike]}
                  >
                    Amount:
                  </Text>
                  <Text
                    style={[ReceiptStyles.ocrValue, !acceptFlags.amount && ReceiptStyles.strike]}
                  >
                    {ocrResult?.amount != null ? `£${ocrResult.amount}` : "—"}
                  </Text>
                </View>

                <View style={ReceiptStyles.ocrRow}>
                  <Checkbox
                    status={acceptFlags.date ? "checked" : "unchecked"}
                    onPress={() => toggleAccept("date")}
                    color={Colors.accent}
                  />
                  <Text
                    style={[ReceiptStyles.ocrLabel, !acceptFlags.date && ReceiptStyles.strike]}
                  >
                    Date:
                  </Text>
                  <Text
                    style={[ReceiptStyles.ocrValue, !acceptFlags.date && ReceiptStyles.strike]}
                  >
                    {ocrResult?.date ? formatDate(new Date(ocrResult.date)) : "—"}
                  </Text>
                </View>

                <View style={ReceiptStyles.ocrRow}>
                  <Checkbox
                    status={acceptFlags.category ? "checked" : "unchecked"}
                    onPress={() => toggleAccept("category")}
                    color={Colors.accent}
                  />
                  <Text
                    style={[ReceiptStyles.ocrLabel, !acceptFlags.category && ReceiptStyles.strike]}
                  >
                    Category:
                  </Text>
                  <Text
                    style={[ReceiptStyles.ocrValue, !acceptFlags.category && ReceiptStyles.strike]}
                  >
                    {ocrResult?.categoryName ?? "—"}
                  </Text>
                </View>

                {/* (Optional) Show OCR VAT if your extractor returns it */}
                {ocrResult?.vat ? (
                  <View style={ReceiptStyles.ocrRow}>
                    <Checkbox
                      status={acceptFlags.vat ? "checked" : "unchecked"}
                      onPress={() => toggleAccept("vat")}
                      color={Colors.accent}
                    />
                    <Text
                      style={[ReceiptStyles.ocrLabel, !acceptFlags.vat && ReceiptStyles.strike]}
                    >
                      VAT:
                    </Text>
                    <Text
                      style={[ReceiptStyles.ocrValue, !acceptFlags.vat && ReceiptStyles.strike]}
                    >
                      {ocrResult?.vat?.value != null
                        ? `£${ocrResult.vat.value}`
                        : "—"}{" "}
                      (Rate {ocrResult?.vat?.rate ?? "—"}%)
                    </Text>
                  </View>
                ) : null}

                <View style={ReceiptStyles.modalButtons}>
                  {!isNewImageSession && (
                    <Button
                      mode="outlined"
                      onPress={deleteCurrentImage}
                      textColor="#a60d49"
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

      {/* Uploading overlay */}
      <Modal
        visible={isUploading}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={ReceiptStyles.uploadOverlay}>
          <View style={ReceiptStyles.uploadCard}>
            <ActivityIndicator size="large" color="#a60d49" />
            <Text style={{ marginTop: 12, fontWeight: "600" }}>Uploading…</Text>
          </View>
        </View>
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
    padding: 16,
    alignItems: "center",
  },
  borderContainer: {
    borderWidth: 5,
    borderColor: Colors.background,
    borderRadius: 35,
    padding: 20,
    width: "90%",
    backgroundColor: Colors.surface,
  },
  header: { fontSize: 22, fontWeight: "bold", marginBottom: 16, color: Colors.accent },
  label: { fontSize: 16, marginTop: 10, marginBottom: 6, color: Colors.textSecondary },

  inputRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 10,
    borderRadius: 5,
    marginTop: 5,
    color: Colors.textSecondary,
    backgroundColor: Colors.surface,
  },

  // Standardized VAT layout
  vatRow: {
    flexDirection: "row",
    alignItems: "flex-start", // Keeps labels aligned at the top
    marginTop: 10,
  },
  vatColLeft: {
    flex: 1, // Stretches the amount box to fill available space
  },
  vatColRight: {
    width: 110, // Slightly wider to ensure "Select" or "20%" fits comfortably
    marginLeft: 12,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8, // Matches the containerStyle margin of the picker
  },
  vatCurrency: {
    fontSize: 18,
    fontWeight: "bold",
    marginRight: 6,
  },
  vatInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 5,
    height: 50,           // Standardized height
    flex: 1,
    fontSize: 16,
    paddingHorizontal: 12,
    backgroundColor: Colors.surface,
    color: Colors.textSecondary,
  },
  vatRatePicker: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    height: 50,           // Matches vatInput exactly
    paddingHorizontal: 8,
    // Removed marginTop here to prevent double-spacing
  },
  vatRateDropdown: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    zIndex: 5000,
  },

  dateButton: {
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 10,
    borderRadius: 5,
    marginTop: 5,
  },

  dropdown: { marginTop: 5, backgroundColor: Colors.surface, borderColor: Colors.border },
  dropdownContainer: { borderColor: Colors.border, backgroundColor: Colors.surface },

  receiptImage: {
    width: 100,
    height: 150,
    marginRight: 10,
    borderRadius: 5,
  },
  uploadPlaceholder: {
    width: 100,
    height: 150,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 5,
    marginRight: 10,
  },
  plus: { fontSize: 30, color: Colors.accent },

  bottomButtons: {
    marginTop: 6,
    paddingBottom: 20,
  },
  primaryRow: {
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    flex: 1,
  },
  deleteRow: {
    marginTop: 10,
  },
  deleteBtn: {
    width: "100%",
  },

  // ===== Modal shared styles =====
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 20,
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 10 },

  // ===== OCR modal extras =====
  modalImage: {
    width: "100%",
    height: 360,
    resizeMode: "contain",
    borderRadius: 8,
    marginTop: 8,
    marginBottom: 12,
  },
  scanningText: { marginTop: 8, fontStyle: "italic", color: Colors.textMuted },
  ocrRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  ocrLabel: { fontWeight: "600", marginRight: 6 },
  ocrValue: { flexShrink: 1 },
  strike: { textDecorationLine: "line-through", color: "#888" },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 20,
  },

  fullscreenHint: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
    fontStyle: "italic",
    textAlign: "center",
    alignSelf: "center",
  },

  // ===== Upload overlay =====
  uploadOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  uploadCard: {
    backgroundColor: Colors.surface,
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 180,
  },

  // ===== Fullscreen viewer =====
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
  fullScreenCloseText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
});
