import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  FlatList,
  Alert,
} from "react-native";
import { Button } from "react-native-paper";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import DropDownPicker from "react-native-dropdown-picker";
import * as ImagePicker from "react-native-image-picker";
import { db } from "../firebaseConfig";
import { doc, updateDoc, deleteDoc } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { categories } from "../constants/arrays";
import { formatDate } from "../utils";

export default function ReceiptDetailsScreen({ route, navigation }) {
  const { receipt } = route.params; // passed from ExpensesScreen
  const [amount, setAmount] = useState(receipt.amount.toString());
  const [selectedDate, setSelectedDate] = useState(new Date(receipt.date));
  const [selectedCategory, setSelectedCategory] = useState(receipt.category);
  const [images, setImages] = useState(
    (receipt.images || []).map((url) => ({ uri: url }))
  );

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(
    categories.map((cat) => ({
      label: cat.name,
      value: cat.name,
    }))
  );
  const [isDatePickerVisible, setDatePickerVisibility] = useState(false);

  const pickImageOption = () => {
    Alert.alert(
      "Add Image",
      "Choose an option",
      [
        {
          text: "Camera",
          onPress: () =>
            ImagePicker.launchCamera({ mediaType: "photo" }, handleImagePicked),
        },
        {
          text: "Gallery",
          onPress: () =>
            ImagePicker.launchImageLibrary(
              { mediaType: "photo" },
              handleImagePicked
            ),
        },
        { text: "Cancel", style: "cancel" },
      ],
      { cancelable: true }
    );
  };

  const handleImagePicked = (response) => {
    if (!response.didCancel && response.assets) {
      const newImages = response.assets.map((asset) => ({
        uri: asset.uri,
      }));
      setImages((prev) => [...prev, ...newImages]);
    }
  };

  const saveChanges = async () => {
    try {
      if (!amount || parseFloat(amount) <= 0 || !selectedCategory) {
        Alert.alert("Invalid Input", "Please fill in all fields correctly.");
        return;
      }

      const storage = getStorage();
      const uploadedImageUrls = [];

      // upload only new images (those without firebase URL)
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

      navigation.navigate("Expenses", {
        toast: { type: "success", message: "Receipt updated successfully" },
      });
      
    } catch (err) {
      console.error("Update failed:", err);
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
          navigation.navigate("Expenses");
        },
      },
    ]);
  };

  return (
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
        open={open}
        value={selectedCategory}
        items={items}
        setOpen={setOpen}
        setValue={setSelectedCategory}
        setItems={setItems}
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
            <Image source={{ uri: item.uri }} style={styles.receiptImage} />
          )
        }
        contentContainerStyle={{ marginVertical: 20 }}
      />

      <Button mode="contained" onPress={saveChanges} buttonColor="#a60d49">
        Save Changes
      </Button>
      <Button
        mode="outlined"
        onPress={deleteReceipt}
        textColor="#a60d49"
        style={{ marginTop: 10 }}
      >
        Delete Receipt
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
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
});
