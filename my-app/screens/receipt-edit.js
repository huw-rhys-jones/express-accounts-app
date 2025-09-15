import React, { useMemo, useState } from "react";
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
} from "react-native";
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
import TextRecognition from "react-native-text-recognition";
import * as FileSystem from "expo-file-system";
import { extractData } from "../utils/extractors";
import ImageViewer from "react-native-image-zoom-viewer";

export default function ReceiptDetailsScreen({ route, navigation }) {
  const { receipt } = route.params;

  // --- base form state
  const [amount, setAmount] = useState(receipt.amount.toString());
  const [selectedDate, setSelectedDate] = useState(new Date(receipt.date));
  const [selectedCategory, setSelectedCategory] = useState(receipt.category);
  const [images, setImages] = useState(
    (receipt.images || []).map((url) => ({ uri: url }))
  );

  const originalUrls = useMemo(() => new Set(receipt.images || []), [receipt.id]);

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
  });
  const [isNewImageSession, setIsNewImageSession] = useState(false);

  // ===== Fullscreen viewer =====
  const [fullScreenImage, setFullScreenImage] = useState(null);

  // ✅ Safe navigate back
  const safeNavigateToExpenses = () => {
    Keyboard.dismiss();
    setOpen(false);
    setDatePickerVisibility(false);
    requestAnimationFrame(() => {
      InteractionManager.runAfterInteractions(() => {
        navigation.reset({
          index: 0,
          routes: [{ name: "Expenses" }],
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
    setAcceptFlags({ amount: false, date: false, category: false });
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
      const categoryIndex =
        typeof res?.category === "number" ? res.category : -1;
      const categoryName =
        categoryIndex >= 0 && categories_meta[categoryIndex]
          ? categories_meta[categoryIndex].name
          : null;

      setOcrResult({
        amount: res?.money?.value ?? null,
        date: res?.date ?? null,
        categoryIndex,
        categoryName,
        raw: text,
      });
      setAcceptFlags({
        amount: !!res?.money?.value,
        date: !!res?.date,
        category: categoryIndex >= 0,
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
    }
    if (acceptFlags.date && ocrResult.date) {
      const d = new Date(ocrResult.date);
      if (!isNaN(d.getTime())) setSelectedDate(d);
    }
    if (acceptFlags.category && ocrResult.categoryName) {
      setSelectedCategory(ocrResult.categoryName);
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
              { mediaType: "photo", includeBase64: true, quality: 0.9 },
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
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.header}>Edit Receipt</Text>

        <Text style={styles.label}>Amount (£)</Text>
        <TextInput
          style={styles.input}
          value={amount}
          keyboardType="numeric"
          onChangeText={setAmount}
        />

        <Text style={styles.label}>Date</Text>
        <TouchableOpacity
          style={styles.dateButton}
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

        <Text style={styles.label}>Category</Text>
        <DropDownPicker
          listMode="MODAL"
          open={open}
          value={selectedCategory}
          items={items}
          setOpen={setOpen}
          setItems={setItems}
          setValue={setSelectedCategory}
          placeholder="Select a category"
          style={styles.dropdown}
          dropDownContainerStyle={styles.dropdownContainer}
        />

        <FlatList
          data={[...images, { addButton: true }]}
          horizontal
          keyExtractor={(_, index) => index.toString()}
          renderItem={({ item }) =>
            item.addButton ? (
              <TouchableOpacity
                style={styles.uploadPlaceholder}
                onPress={pickImageOption}
              >
                <Text style={styles.plus}>+</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() =>
                  openOcrModal(item.uri, { autoScan: true, newSession: false })
                }
              >
                <Image source={{ uri: item.uri }} style={styles.receiptImage} />
              </TouchableOpacity>
            )
          }
          contentContainerStyle={{ marginVertical: 20 }}
          showsHorizontalScrollIndicator
        />

        {/* Bottom actions */}
        <View style={styles.bottomButtons}>
          <View style={styles.primaryRow}>
            <Button
              mode="outlined"
              onPress={safeNavigateToExpenses}
              textColor="#555"
              style={styles.actionBtn}
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={saveChanges}
              buttonColor="#a60d49"
              style={styles.actionBtn}
            >
              Save Changes
            </Button>
          </View>

          <View style={styles.deleteRow}>
            <Button
              mode="outlined"
              onPress={deleteReceipt}
              textColor="#a60d49"
              style={styles.deleteBtn}
            >
              Delete Receipt
            </Button>
          </View>
        </View>
      </View>

      {/* OCR Preview + Accept Modal */}
      <Modal
        visible={ocrModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setOcrModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: "90%" }]}>
            <Text style={styles.modalTitle}>Receipt Preview</Text>

            {preview?.uri ? (
              <View style={{ alignItems: "center" }}>
                <TouchableOpacity
                  style={{ alignSelf: "stretch" }}
                  onPress={() => setFullScreenImage(preview)}
                >
                  <Image source={{ uri: preview.uri }} style={styles.modalImage} />
                </TouchableOpacity>
                {ocrLoading && <Text style={styles.scanningText}>Scanning…</Text>}
              </View>
            ) : null}

            <Text style={styles.fullscreenHint}>
              Tap image to view full screen
            </Text>

            {!ocrLoading && (
              <>
                <View style={styles.ocrRow}>
                  <Checkbox
                    status={acceptFlags.amount ? "checked" : "unchecked"}
                    onPress={() => toggleAccept("amount")}
                  />
                  <Text
                    style={[styles.ocrLabel, !acceptFlags.amount && styles.strike]}
                  >
                    Amount:
                  </Text>
                  <Text
                    style={[styles.ocrValue, !acceptFlags.amount && styles.strike]}
                  >
                    {ocrResult?.amount != null ? `£${ocrResult.amount}` : "—"}
                  </Text>
                </View>

                <View style={styles.ocrRow}>
                  <Checkbox
                    status={acceptFlags.date ? "checked" : "unchecked"}
                    onPress={() => toggleAccept("date")}
                  />
                  <Text
                    style={[styles.ocrLabel, !acceptFlags.date && styles.strike]}
                  >
                    Date:
                  </Text>
                  <Text
                    style={[styles.ocrValue, !acceptFlags.date && styles.strike]}
                  >
                    {ocrResult?.date ? formatDate(new Date(ocrResult.date)) : "—"}
                  </Text>
                </View>

                <View style={styles.ocrRow}>
                  <Checkbox
                    status={acceptFlags.category ? "checked" : "unchecked"}
                    onPress={() => toggleAccept("category")}
                  />
                  <Text
                    style={[styles.ocrLabel, !acceptFlags.category && styles.strike]}
                  >
                    Category:
                  </Text>
                  <Text
                    style={[styles.ocrValue, !acceptFlags.category && styles.strike]}
                  >
                    {ocrResult?.categoryName ?? "—"}
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

        <View style={styles.fullScreenCloseButtonWrapper}>
          <TouchableOpacity
            style={styles.fullScreenCloseButton}
            onPress={() => setFullScreenImage(null)}
          >
            <Text style={styles.fullScreenCloseText}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#fff",
  },
  container: {
    flex: 1,
    padding: 16,
  },
  header: { fontSize: 22, fontWeight: "bold", marginBottom: 16 },
  label: { fontSize: 16, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 8,
    borderRadius: 5,
    marginTop: 5,
  },
  dateButton: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 8,
    borderRadius: 5,
    marginTop: 5,
  },
  dropdown: { marginTop: 5 },
  dropdownContainer: {},

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
    backgroundColor: "#f0f0f0",
    borderRadius: 5,
    marginRight: 10,
  },
  plus: { fontSize: 30, color: "#a60d49" },

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
    backgroundColor: "white",
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
  scanningText: { marginTop: 8, fontStyle: "italic", color: "#555" },
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
    backgroundColor: "#fff",
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
