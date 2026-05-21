import React, { useEffect, useRef } from "react";
import {
  Animated,
  View,
  Text,
  Image,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Modal,
  StyleSheet,
  Alert,
  PermissionsAndroid,
  Platform,
  ActivityIndicator,
} from "react-native";
import * as ImagePicker from "react-native-image-picker";
import { Colors } from "../utils/sharedStyles";

const SHEET_HEIGHT = 320;

export default function AddReceiptSheet({
  visible,
  onClose,
  navigation,
  targetScreen = "Receipt",
}) {
  const [renderSheet, setRenderSheet] = React.useState(visible);
  const [sheetHeight, setSheetHeight] = React.useState(SHEET_HEIGHT);
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [busy, setBusy] = React.useState(false);

  // Custom "photo added" modal state
  const [photoModalVisible, setPhotoModalVisible] = React.useState(false);
  const [photoModalCount, setPhotoModalCount] = React.useState(0);
  const [photoModalLastUri, setPhotoModalLastUri] = React.useState(null);
  const photoModalResolveRef = useRef(null);

  useEffect(() => {
    if (visible) {
      setRenderSheet(true);
      translateY.setValue(sheetHeight);
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
          toValue: sheetHeight,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setRenderSheet(false);
        }
      });
    }
  }, [backdropOpacity, sheetHeight, translateY, visible]);

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
      },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  };

  const handleTakePhoto = async () => {
    const ok = await requestCameraPermission();
    if (!ok) {
      Alert.alert(
        "Permission denied",
        "Camera access is required to take photos.",
      );
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
          photoModalResolveRef.current = resolve;
          setPhotoModalCount(assets.length);
          setPhotoModalLastUri(result.assets[result.assets.length - 1].uri);
          setPhotoModalVisible(true);
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

  return (
    <>
      {/* Main sheet — rendered in a Modal so it floats above nav bars */}
      <Modal
        visible={renderSheet}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={dismiss}
      >
        <View style={styles.fullScreenContainer} pointerEvents="box-none">
          {/* Backdrop */}
          <TouchableWithoutFeedback onPress={dismiss}>
            <Animated.View
              style={[styles.backdrop, { opacity: backdropOpacity }]}
            />
          </TouchableWithoutFeedback>

          {/* Sheet */}
          <Animated.View
            style={[styles.sheet, { transform: [{ translateY }] }]}
            pointerEvents="box-none"
            onLayout={(event) => {
              const nextHeight = event.nativeEvent.layout.height;
              if (nextHeight > 0 && nextHeight !== sheetHeight) {
                setSheetHeight(nextHeight);
                if (!visible) {
                  translateY.setValue(nextHeight);
                }
              }
            }}
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
                  sub="Use your camera — add one or more receipt photos"
                  onPress={handleTakePhoto}
                />
                <View style={styles.divider} />
                <Option
                  icon="🖼"
                  label="Pick Image"
                  sub="Select one or more receipt photos from your gallery"
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
      </Modal>

      {/* Photo-added modal — sibling, not nested, to avoid Android modal-stacking issues */}
      <Modal
        visible={photoModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setPhotoModalVisible(false);
          photoModalResolveRef.current?.("done");
        }}
      >
        <View style={styles.photoModalOverlay}>
          <View style={styles.photoModalCard}>
            {photoModalLastUri ? (
              <Image
                source={{ uri: photoModalLastUri }}
                style={styles.photoModalThumb}
                resizeMode="cover"
              />
            ) : null}
            <Text style={styles.photoModalCount}>
              {photoModalCount} photo{photoModalCount === 1 ? "" : "s"} added
            </Text>
            <Text style={styles.photoModalQuestion}>
              Would you like to add another receipt photo? It can be from the
              same or another receipt.
            </Text>
            <View style={styles.photoModalButtons}>
              <TouchableOpacity
                style={[styles.photoModalBtn, styles.photoModalBtnSecondary]}
                onPress={() => {
                  setPhotoModalVisible(false);
                  photoModalResolveRef.current?.("done");
                }}
              >
                <Text style={styles.photoModalBtnTextSecondary}>Done</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.photoModalBtn, styles.photoModalBtnPrimary]}
                onPress={() => {
                  setPhotoModalVisible(false);
                  photoModalResolveRef.current?.("again");
                }}
              >
                <Text style={styles.photoModalBtnTextPrimary}>Add another</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function Option({ icon, label, sub, onPress, disabled = false }) {
  return (
    <TouchableOpacity
      style={[styles.option, disabled ? styles.optionDisabled : null]}
      onPress={onPress}
      activeOpacity={0.65}
      disabled={disabled}
    >
      <Text
        style={[styles.optionIcon, disabled ? styles.optionTextDisabled : null]}
      >
        {icon}
      </Text>
      <View style={styles.optionText}>
        <Text
          style={[
            styles.optionLabel,
            disabled ? styles.optionTextDisabled : null,
          ]}
        >
          {label}
        </Text>
        <Text style={styles.optionSub}>{sub}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fullScreenContainer: {
    flex: 1,
  },
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
    paddingBottom: Platform.OS === "ios" ? 48 : 32,
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
  optionDisabled: {
    opacity: 0.45,
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
  optionTextDisabled: {
    color: "#777",
  },
  busyContainer: {
    height: 120,
    justifyContent: "center",
    alignItems: "center",
  },
  photoModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  photoModalCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    width: "100%",
    alignItems: "center",
  },
  photoModalThumb: {
    width: 120,
    height: 90,
    borderRadius: 8,
    marginBottom: 14,
  },
  photoModalCount: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1C1C4E",
    marginBottom: 6,
  },
  photoModalQuestion: {
    fontSize: 14,
    color: "#555",
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 20,
  },
  photoModalButtons: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  photoModalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  photoModalBtnPrimary: {
    backgroundColor: Colors.accent,
  },
  photoModalBtnSecondary: {
    backgroundColor: "#f0f0f0",
  },
  photoModalBtnTextPrimary: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  photoModalBtnTextSecondary: {
    color: "#333",
    fontWeight: "600",
    fontSize: 14,
  },
});
