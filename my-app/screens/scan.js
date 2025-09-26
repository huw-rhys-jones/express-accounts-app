import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Image,
  Alert,
  PermissionsAndroid,
  Platform,
} from "react-native";
import { launchCamera, launchImageLibrary } from "react-native-image-picker";

const ScannerScreen = () => {
  const [receiptImage, setReceiptImage] = useState(null);

  // Function to request camera permissions
  const requestCameraPermission = async () => {
    if (Platform.OS === "android") {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: "Camera Permission",
            message: "App needs access to your camera to scan receipts.",
            buttonNeutral: "Ask Me Later",
            buttonNegative: "Cancel",
            buttonPositive: "OK",
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {
        console.warn(err);
        return false;
      }
    }
    return true; // iOS does not require explicit permission handling in code
  };

  // Open Camera with Permissions
  const openCamera = async () => {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) {
      Alert.alert("Permission Denied", "Camera access is required to scan receipts.");
      return;
    }

    launchCamera(
      { mediaType: "photo", cameraType: "back", quality: 1, saveToPhotos: true },
      (response) => {
        if (response.didCancel) {
          Alert.alert("Cancelled", "You did not take a photo.");
        } else if (response.errorMessage) {
          Alert.alert("Error", response.errorMessage);
        } else if (response.assets && response.assets.length > 0) {
          setReceiptImage(response.assets[0].uri);
        }
      }
    );
  };

  // Open Gallery
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
      <Text style={styles.instructionText}>
        Place your receipt on a flat surface, center in the view and press scan
      </Text>

      {receiptImage && (
        <Image source={{ uri: receiptImage }} style={styles.receiptImage} />
      )}

      <TouchableOpacity style={styles.scanButton} onPress={openCamera}>
        <Text style={styles.scanButtonText}>Scan</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.uploadButton} onPress={openGallery}>
        <Text style={styles.uploadText}>
          Already taken a photo of your receipt? Click here to upload
        </Text>
      </TouchableOpacity>

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
    marginBottom: 300,
    marginTop: -300,
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
    paddingVertical: 12,
    paddingHorizontal: 50,
    borderRadius: 35,
    marginTop: 50,
    shadowColor: "#C51F63",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  scanButtonText: {
    fontSize: 25,
    fontWeight: "bold",
    color: "white",
  },
  uploadButton: {
    backgroundColor: "#E5E5EA",
    paddingVertical: 16,
    paddingHorizontal: 22,
    borderRadius: 33,
    marginTop: 26,
    marginBottom: -265,
    alignItems: "center",
  },
  uploadText: {
    fontSize: 14,
    color: "#1C1C4E",
    textAlign: "center",
  },
  cancelButton: {
    position: "absolute",
    bottom: 14,
    paddingVertical: 10,
    paddingHorizontal: 50,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "white",
  },
});
