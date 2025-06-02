import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
} from "react-native";
import { Button } from "react-native-paper";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "react-native-image-picker";

const ReceiptScreen = () => {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date(2024, 3, 6)); // Month is 0-based
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [receiptImage, setReceiptImage] = useState(null);

  const handleDateChange = (event, selectedDate) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setDate(selectedDate);
    }
  };

  const pickImage = () => {
    ImagePicker.launchImageLibrary({ mediaType: "photo" }, (response) => {
      if (!response.didCancel && response.assets) {
        setReceiptImage(response.assets[0].uri);
      }
    });
  };

  return (
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
          onPress={() => setShowDatePicker(true)}
        >
          <Text style={styles.dateText}>{date.toLocaleDateString()}</Text>
        </TouchableOpacity>
        {showDatePicker && (
          <DateTimePicker
            value={date}
            mode="date"
            display="default"
            onChange={handleDateChange}
          />
        )}

        <Text style={styles.label}>Category:</Text>
        <TouchableOpacity style={styles.categoryButton}>
          <Text style={styles.categoryText}>SUBSISTENCE</Text>
        </TouchableOpacity>

        <View style={styles.receiptContainer}>
          {receiptImage ? (
            <Image source={{ uri: receiptImage }} style={styles.receiptImage} />
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
          <Button mode="contained" buttonColor="#a60d49" style={styles.button}>
            Cancel
          </Button>
          <Button mode="contained" buttonColor="#a60d49" style={styles.button}>
            Save
          </Button>
        </View>
      </View>
    </View>
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
});

export default ReceiptScreen;
