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
} from "react-native";
import { Button } from "react-native-paper";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import * as ImagePicker from "react-native-image-picker";
import DropDownPicker from "react-native-dropdown-picker";
import { db, auth } from "../firebaseConfig";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { categories } from "../constants/arrays";
import { formatDate } from "../utils";
import TextRecognition from "react-native-text-recognition";
import * as FileSystem from "expo-file-system";

const ReceiptScreen = ({ navigation }) => {
  const [amount, setAmount] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isDatePickerVisible, setDatePickerVisibility] = useState(false);
  const [images, setImages] = useState([]); // multiple images
  const [open, setOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showConfirmReset, setConfirmReset] = useState(false);
  const [showConfirmLeaveModal, setShowConfirmLeaveModal] = useState(false);
  const [items, setItems] = useState(
    categories.map((cat) => ({ label: cat.name, value: cat.name }))
  );
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const flatListRef = useRef(null);

  const ensureFileFromAsset = async (asset) => {
  const { base64, fileName } = asset || {};
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

  // Fallback if base64 missing: try copying from the picker URI
  if (asset?.uri) {
    try {
      await FileSystem.copyAsync({ from: asset.uri, to: dest });
      return dest;
    } catch (e) {
      // last resort: fetch → base64 → write
      const res = await fetch(asset.uri);
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


  // Auto-scroll image list on mount/updates
  useEffect(() => {
    if (flatListRef.current) {
      flatListRef.current.scrollToEnd({ animated: false });
    }
  }, [images]);

  // Close modals when screen loses focus (prevents iOS lingering overlays)
  useEffect(() => {
    const sub = navigation.addListener("blur", () => {
      setShowSuccess(false);
      setShowConfirmModal(false);
      setConfirmReset(false);
      setShowConfirmLeaveModal(false);
    });
    return sub;
  }, [navigation]);

  // Android back button handling + modal-first dismissal
  useEffect(() => {
    const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
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
  }, [amount, selectedCategory, images, showSuccess, showConfirmModal, showConfirmReset, showConfirmLeaveModal, navigation]);

  const handleSavePress = () => {
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0 || !selectedCategory) {
      Alert.alert("Invalid Input", "Please fill in all fields correctly.");
      return;
    }
    setShowConfirmModal(true);
  };

  const handleResetPress = () => setConfirmReset(true);
  const handleLeavePress = () => setShowConfirmLeaveModal(true);

  const handleConfirmReceipt = async () => {
    try {
      await uploadReceipt({
        amount,
        date: selectedDate,
        category: selectedCategory,
        images,
      });
      resetForm();
      setShowSuccess(true);
    } catch (err) {
      console.error("Upload failed:", err);
      Alert.alert("Upload failed", "Please try again.");
    }
  };

  const resetForm = () => {
    setAmount("");
    setSelectedDate(new Date());
    setSelectedCategory(null);
    setImages([]);
    setConfirmReset(false);
    setShowConfirmModal(false);
  };

  const uploadReceipt = async ({ amount, date, category, images }) => {
    try {
      const user = auth.currentUser;
      const storage = getStorage();
      const imageUrls = [];

      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const filename = `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}.jpg`;
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
        images: imageUrls,
        userId: user.uid,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error adding receipt:", error);
      throw error;
    }
  };

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
              selectionLimit: 1, // change to 0 for multiple if you want
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

    // add image(s) to your UI as before
    const newImages = response.assets.map((asset) => ({ uri: asset.uri }));
    setImages((prev) => [...prev, ...newImages]);

    // run OCR for each selected image and log the text
    for (const asset of response.assets) {
      const filePath = await ensureFileFromAsset(asset);
      console.log("🔎 Running OCR on:", filePath);
      const lines = await TextRecognition.recognize(filePath);
      const text = Array.isArray(lines) ? lines.join("\n") : String(lines || "");
      console.log("🧾 OCR result:\n" + text);
    }
  } catch (e) {
    console.error("❌ OCR error:", e);
  }
};


  const renderImage = ({ item }) => (
    <Image source={{ uri: item.uri }} style={styles.receiptImage} />
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.container}>
          <View style={styles.borderContainer}>
            <Text style={styles.header}>Your Receipt</Text>

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

            <Text style={styles.label}>Date:</Text>
            <TouchableOpacity style={styles.dateButton} onPress={showDatePicker}>
              <Text style={styles.dateText}>{formatDate(selectedDate)}</Text>
            </TouchableOpacity>
            <DateTimePickerModal
              isVisible={isDatePickerVisible}
              mode="date"
              date={selectedDate}
              onConfirm={handleConfirmDate}
              onCancel={hideDatePicker}
            />

            <Text style={styles.label}>Category:</Text>
            <DropDownPicker
              open={open}
              value={selectedCategory}
              items={items}
              setOpen={setOpen}
              setItems={setItems}
              // Use library's controlled API: let the picker drive the state via setValue
              setValue={(cb) => setSelectedCategory(cb(selectedCategory))}
              placeholder="Select a category"
              style={styles.dropdown}
              dropDownContainerStyle={styles.dropdownContainer}
              zIndex={1000}
              zIndexInverse={1000}
              dropDownDirection="AUTO"
            />

            <FlatList
              ref={flatListRef}
              data={[...images, { addButton: true }]}
              horizontal
              keyExtractor={(item, index) => index.toString()}
              renderItem={({ item }) =>
                item.addButton ? (
                  <TouchableOpacity style={styles.uploadPlaceholder} onPress={pickImageOption}>
                    <Text style={styles.plus}>+</Text>
                  </TouchableOpacity>
                ) : (
                  renderImage({ item })
                )
              }
              contentContainerStyle={{ marginVertical: 20 }}
              showsHorizontalScrollIndicator={true}
            />

            <View style={styles.buttonContainer}>
              <Button mode="contained" buttonColor="#a60d49" style={styles.button} onPress={handleLeavePress}>
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

            <Button mode="outlined" onPress={handleResetPress} style={styles.resetButton} textColor="#a60d49" icon="autorenew">
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
            <View style={styles.modalButtons}>
              <RNButton title="Cancel" onPress={() => setShowConfirmModal(false)} color="black" />
              <RNButton title="Confirm" onPress={handleConfirmReceipt} color="#a60d49" />
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
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Confirm Reset</Text>
            <View style={styles.modalButtons}>
              <RNButton title="Cancel" onPress={() => setConfirmReset(false)} color="#aaa" />
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
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Are you sure you want to go back?</Text>
            <View style={styles.modalButtons}>
              <RNButton title="Cancel" onPress={() => setShowConfirmLeaveModal(false)} color="#aaa" />
              <RNButton
                title="Confirm"
                onPress={() => {
                  setShowConfirmLeaveModal(false);
                  navigation.navigate("Expenses");
                }}
                color="#a60d49"
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Success Modal */}
      <Modal
        visible={showSuccess}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSuccess(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Receipt saved successfully! Add another?</Text>
            <View style={styles.modalButtons}>
              <RNButton
                title="No"
                onPress={() => {
                  setShowSuccess(false);
                  setShowConfirmModal(false);
                  navigation.reset({ index: 0, routes: [{ name: "Expenses" }] });
                }}
                color="#a60d49"
              />
              <RNButton
                title="Yes"
                onPress={() => {
                  setShowSuccess(false);
                  setShowConfirmModal(false);
                }}
                color="#a60d49"
              />
            </View>
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
    marginRight: 35,
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
  dateText: {
    fontSize: 16,
  },
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
  plus: {
    fontSize: 32,
    color: "#a60d49",
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  button: {
    flex: 1,
    marginHorizontal: 5,
  },
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
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
  },
  resetButton: {
    marginTop: 10,
    borderColor: "#a60d49",
  },
});

export default ReceiptScreen;
