import React, { useState, useEffect } from "react";
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
} from "react-native";
import { Button } from "react-native-paper";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import * as ImagePicker from "react-native-image-picker";
import DropDownPicker from "react-native-dropdown-picker";
import { db, auth } from "../firebaseConfig";
import { addDoc, collection } from "firebase/firestore";
import { categories } from "../constants/arrays";
import { Snackbar } from "react-native-paper";

const ReceiptScreen = ({ navigation }) => {
  const [amount, setAmount] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isDatePickerVisible, setDatePickerVisibility] = useState(false);
  const [receiptImage, setReceiptImage] = useState(null);
  const [open, setOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showConfirmReset, setConfirmReset] = useState(false);
  const [showConfirmLeaveModal, setShowConfirmLeaveModal] = useState(false);
  const [items, setItems] = useState(
    categories.map((cat) => ({
      label: cat.name,
      value: cat.name,
    }))
  );
  // State to manage confirmation modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        setShowConfirmLeaveModal(true); // show your confirmation modal
        return true; // prevent default back behavior
      }
    );

    return () => backHandler.remove(); // clean up
  }, []);

  // Handler to open modal
  const handleSavePress = () => {
    setShowConfirmModal(true);
  };

  const handleResetPress = () => {
    setConfirmReset(true);
  };

  const handleLeavePress = () => {
    setShowConfirmLeaveModal(true);
  };

  // Handler to confirm and upload receipt
  const handleConfirmReceipt = async () => {
    try {
      await uploadReceipt({
        amount,
        date: selectedDate,
        category: selectedCategory,
      });

      resetForm(); // only reset if upload succeeded
      setShowSuccess(true);
    } catch (err) {
      console.error("Upload failed:", err);
      // Optional: show error to user
    }
  };

  // Handler to cancel
  const handleCancel = () => {
    setShowConfirmModal(false);
  };

  // Handler to cancel
  const handleCancelReset = () => {
    setConfirmReset(false);
  };

  // Handler to cancel
  const handleCancelLeave = () => {
    setShowConfirmLeaveModal(false);
  };

  const handleConfirmReset = () => {
    resetForm();
    setConfirmReset(false);
  };

  const handleLeave = () => {
    navigation.navigate("Expenses");
  };

  // Rest the page
  const resetForm = () => {
    setAmount("");
    setSelectedDate(new Date());
    setSelectedCategory(null);
    setReceiptImage(null);
    setShowConfirmModal(false);
  };

  const uploadReceipt = async ({ amount, date, category }) => {
    try {
      const user = auth.currentUser;
      const docRef = await addDoc(collection(db, "receipts"), {
        amount: parseFloat(amount),
        date: date.toISOString(),
        category,
        userId: user.uid,
        createdAt: new Date().toISOString(), // optional, for sorting
      });
      console.log("Receipt added with ID:", docRef.id);
    } catch (error) {
      console.error("Error adding receipt:", error);
    }
  };

  const showDatePicker = () => {
    setDatePickerVisibility(true);
  };

  const hideDatePicker = () => {
    setDatePickerVisibility(false);
  };

  const handleConfirm = (date) => {
    setSelectedDate(date);
    hideDatePicker();
  };

  const pickImage = () => {
    ImagePicker.launchImageLibrary({ mediaType: "photo" }, (response) => {
      if (!response.didCancel && response.assets) {
        setReceiptImage(response.assets[0].uri);
      }
    });
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.container}>
          {/* Purple Border Container */}
          <View style={styles.borderContainer}>
            <Text style={styles.header}>Your Receipt</Text>

            <Text style={styles.label}>Amount:</Text>
            <View style={styles.inputRow}>
              <Text style={styles.currency}>£</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
              />
            </View>

            <Text style={styles.label}>Date:</Text>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={showDatePicker}
            >
              <Text style={styles.dateText}>
                {selectedDate.toLocaleDateString()}
              </Text>
            </TouchableOpacity>
            <DateTimePickerModal
              isVisible={isDatePickerVisible}
              mode="date"
              date={selectedDate}
              onConfirm={handleConfirm}
              onCancel={hideDatePicker}
            />

            <Text style={styles.label}>Category:</Text>
            <DropDownPicker
              open={open}
              value={selectedCategory}
              items={items}
              setOpen={setOpen}
              setValue={setSelectedCategory}
              setItems={setItems}
              placeholder="Select a category"
              style={styles.dropdown}
              dropDownContainerStyle={styles.dropdownContainer}
              zIndex={1000}
            />

            <View style={styles.receiptContainer}>
              {receiptImage ? (
                <Image
                  source={{ uri: receiptImage }}
                  style={styles.receiptImage}
                />
              ) : (
                <TouchableOpacity
                  style={styles.uploadPlaceholder}
                  onPress={pickImage}
                >
                  <Text style={styles.plus}>+</Text>
                </TouchableOpacity>
              )}
            </View>

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

            {/* Reset Button Below */}
            <Button
              mode="outlined"
              onPress={handleResetPress}
              style={styles.resetButton}
              textColor="#a60d49"
              icon="autorenew" // Optional: needs react-native-vector-icons setup if using custom icons
            >
              Reset Form
            </Button>
          </View>
        </View>
      </TouchableWithoutFeedback>

      <Modal
        visible={showConfirmModal}
        transparent={true}
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
              <RNButton
                title="Cancel"
                onPress={handleCancel}
                color="#aaa60d49a"
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
        visible={showConfirmReset}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setConfirmReset(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Confirm Reset</Text>

            <View style={styles.modalButtons}>
              <RNButton
                title="Cancel"
                onPress={handleCancelReset}
                color="#a60d49"
              />
              <RNButton
                title="Confirm"
                onPress={handleConfirmReset}
                color="#a60d49"
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showConfirmLeaveModal}
        transparent={true}
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
                onPress={handleCancelLeave}
                color="#a60d49"
              />
              <RNButton title="Confirm" onPress={handleLeave} color="#a60d49" />
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showSuccess}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowSuccess(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Receipt saved successfully! Add another?
            </Text>

            <View style={styles.modalButtons}>
              <RNButton
                title="No"
                onPress={() => navigation.navigate("Expenses")}
                color="#a60d49"
              />
              <RNButton
                title="Yes"
                onPress={() => setShowSuccess(false)}
                color="#a60d49"
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* <Snackbar
        visible={showSuccess}
        onDismiss={() => setShowSuccess(false)}
        duration={3000}
        action={{
          label: "OK",
          onPress: () => setShowSuccess(false),
        }}
        style={{ backgroundColor: "#4CAF50" }} // Optional: green background
      >
        Receipt saved successfully!
      </Snackbar> */}
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
    borderColor: "#312e74", // Purple border
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
    marginRight: 0,
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
    marginTop: 4,
    margin: 25,
    marginRight: 36,
    marginLeft: 44,
  },
  dateText: {
    fontSize: 16,
  },
  categoryButton: {
    backgroundColor: "#312e74",
    padding: 13.5,
    borderRadius: 25,
    marginTop: 7,
    width: 205,
    margin: 25,
  },
  categoryText: {
    color: "#fff",
    textAlign: "center",
    fontWeight: "bold",
  },
  receiptContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 20,
  },
  receiptImage: {
    width: 100,
    height: 150,
    resizeMode: "contain",
    borderRadius: 5,
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
    color: "#999",
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  button: {
    flex: 1,
    marginHorizontal: 5,
  },
  dropdown: {
    backgroundColor: "#fafafa",
    borderColor: "#ccc",
  },
  dropdownContainer: {
    backgroundColor: "#fafafa",
    borderColor: "#ccc",
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
