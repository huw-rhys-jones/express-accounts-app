import React, { useEffect, useRef } from "react";
import {
  Animated,
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  Alert,
  PermissionsAndroid,
  Platform,
  ActivityIndicator,
} from "react-native";
import * as ImagePicker from "react-native-image-picker";
import { Colors } from "../utils/sharedStyles";

const SHEET_HEIGHT = 240;

export default function AddReceiptSheet({ visible, onClose, navigation, targetScreen = "Receipt" }) {
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [busy, setBusy] = React.useState(false);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 4,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: SHEET_HEIGHT,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const dismiss = () => {
    if (busy) return;
    onClose();
  };

  const navigateWithImages = (assets) => {
    onClose();
    // Small delay so the sheet close animation plays first
    setTimeout(() => {
      navigation.navigate(targetScreen, { initialImages: assets });
    }, 220);
  };

  const requestCameraPermission = async () => {
    if (Platform.OS !== "android") return true;
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.CAMERA,
      {
        title: "Camera Permission",
        message: "Express Accounts needs access to your camera.",
        buttonPositive: "Allow",
        buttonNegative: "Deny",
      }
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  };

  const handleTakePhoto = async () => {
    const ok = await requestCameraPermission();
    if (!ok) {
      Alert.alert("Permission denied", "Camera access is required to take photos.");
      return;
    }

    setBusy(true);
    const assets = [];

    const shootLoop = async () => {
      const result = await ImagePicker.launchCamera({
        mediaType: "photo",
        includeBase64: true,
        quality: 0.9,
      });

      if (!result.didCancel && result.assets?.length) {
        assets.push(...result.assets);

        await new Promise((resolve) => {
          Alert.alert(
            "Photo added",
            "Would you like to add another photo of this receipt?",
            [
              { text: "Add another", onPress: () => resolve("again") },
              { text: "Done", onPress: () => resolve("done"), style: "default" },
            ],
            { cancelable: false }
          );
        }).then(async (choice) => {
          if (choice === "again") await shootLoop();
        });
      }
    };

    try {
      await shootLoop();
    } finally {
      setBusy(false);
    }

    if (assets.length > 0) {
      navigateWithImages(assets);
    }
  };

  const handlePickImage = async () => {
    setBusy(true);
    try {
      const result = await ImagePicker.launchImageLibrary({
        mediaType: "photo",
        includeBase64: true,
        selectionLimit: 0, // 0 = unlimited
        quality: 0.9,
      });

      if (!result.didCancel && result.assets?.length) {
        navigateWithImages(result.assets);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleManual = () => {
    onClose();
    setTimeout(() => navigation.navigate(targetScreen, {}), 220);
  };

  if (!visible && translateY._value === SHEET_HEIGHT) return null;

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={dismiss}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
      </TouchableWithoutFeedback>

      {/* Sheet */}
      <Animated.View
        style={[styles.sheet, { transform: [{ translateY }] }]}
        pointerEvents="box-none"
      >
        {/* Handle bar */}
        <View style={styles.handle} />

        {busy ? (
          <View style={styles.busyContainer}>
            <ActivityIndicator color={Colors.accent} size="large" />
          </View>
        ) : (
          <>
            <Option
              icon="📷"
              label="Take Photo"
              sub="Use your camera — add multiple pages"
              onPress={handleTakePhoto}
            />
            <View style={styles.divider} />
            <Option
              icon="🖼"
              label="Pick Image"
              sub="Select one or more from your gallery"
              onPress={handlePickImage}
            />
            <View style={styles.divider} />
            <Option
              icon="✏️"
              label="Enter Manually"
              sub="Type in the details yourself"
              onPress={handleManual}
            />
          </>
        )}
      </Animated.View>
    </View>
  );
}

function Option({ icon, label, sub, onPress }) {
  return (
    <TouchableOpacity style={styles.option} onPress={onPress} activeOpacity={0.65}>
      <Text style={styles.optionIcon}>{icon}</Text>
      <View style={styles.optionText}>
        <Text style={styles.optionLabel}>{label}</Text>
        <Text style={styles.optionSub}>{sub}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === "ios" ? 32 : 16,
    paddingHorizontal: 4,
    elevation: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#ddd",
    marginTop: 10,
    marginBottom: 8,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  optionIcon: {
    fontSize: 26,
    marginRight: 16,
    width: 36,
    textAlign: "center",
  },
  optionText: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1C1C4E",
  },
  optionSub: {
    fontSize: 12,
    color: "#888",
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: "#f0f0f0",
    marginLeft: 72,
  },
  busyContainer: {
    height: 120,
    justifyContent: "center",
    alignItems: "center",
  },
});
