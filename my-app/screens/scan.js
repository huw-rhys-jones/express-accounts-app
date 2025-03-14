import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Image,
  Alert,
} from "react-native";
import { launchCamera, launchImageLibrary } from "react-native-image-picker";

const ScannerScreen = () => {
  const [receiptImage, setReceiptImage] = useState(null);

  // Function to open the camera
  const openCamera = () => {
    launchCamera(
      { mediaType: "photo", cameraType: "back", quality: 1 },
      (response) => {
        if (response.didCancel) {
          Alert.alert("Camera closed", "You did not take a photo.");
        } else if (response.errorMessage) {
          Alert.alert("Camera error", response.errorMessage);
        } else if (response.assets && response.assets.length > 0) {
          setReceiptImage(response.assets[0].uri);
        }
      }
    );
  };

  // Function to open the gallery
  const openGallery = () => {
    launchImageLibrary({ mediaType: "photo", quality: 1 }, (response) => {
      if (response.didCancel) {
        Alert.alert("Upload cancelled", "No image selected.");
      } else if (response.errorMessage) {
        Alert.alert("Gallery error", response.errorMessage);
      } else if (response.assets && response.assets.length > 0) {
        setReceiptImage(response.assets[0].uri);
      }
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Instruction Text */}
      <Text style={styles.instructionText}>
        Place your receipt on a flat surface, center in the view and press scan
      </Text>

      {/* Display the selected/scanned image */}
      {receiptImage && (
        <Image source={{ uri: receiptImage }} style={styles.receiptImage} />
      )}

      {/* Scan Button */}
      <TouchableOpacity style={styles.scanButton} onPress={openCamera}>
        <Text style={styles.scanButtonText}>Scan</Text>
      </TouchableOpacity>

      {/* Upload from Gallery */}
      <TouchableOpacity style={styles.uploadButton} onPress={openGallery}>
        <Text style={styles.uploadText}>
          Already taken a photo of your receipt? Click here to upload
        </Text>
      </TouchableOpacity>

      {/* Cancel Button */}
      <TouchableOpacity style={styles.cancelButton} onPress={() => Alert.alert("Cancelled", "Going back to previous screen")}>
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

export default ScannerScreen;

/* 📌 Styles */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#302C66",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  instructionText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "white",
    textAlign: "center",
    marginBottom:300,
    marginTop: -360,
  },
  receiptImage: {
    width: 300,
    height: 300,
    borderRadius: 10,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: "white",
  },
  scanButton: {
    backgroundColor: "#a60d49",
    paddingVertical: 15,
    paddingHorizontal: 50,
    borderRadius: 30,
    marginTop: 20,
    shadowColor: "#C51F63",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  scanButtonText: {
    fontSize: 20,
    fontWeight: "bold",
    color: "white",
  },
  uploadButton: {
    backgroundColor: "#E5E5EA",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginTop: 30,
    marginBottom: -320,
    alignItems: "center",
  },
  uploadText: {
    fontSize: 14,
    color: "#1C1C4E",
    textAlign: "center",
  },
  cancelButton: {
    position: "absolute",
    bottom: 20,
    paddingVertical: 10,
    paddingHorizontal: 50,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "white",
  },
});
