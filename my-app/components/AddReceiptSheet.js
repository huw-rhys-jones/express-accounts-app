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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../utils/sharedStyles";
import {
  getAddSheetTooltipSeen,
  setAddSheetTooltipSeen,
} from "../utils/appSettings";

const SHEET_HEIGHT = 320;

export default function AddReceiptSheet({
  visible,
  onClose,
  navigation,
  targetScreen = "Receipt",
  // Optional: short label used in the tooltip headline, e.g. "receipt" or "invoice"
  itemLabel = "receipt",
  vehicles = [],
}) {
  const insets = useSafeAreaInsets();
  const [renderSheet, setRenderSheet] = React.useState(visible);
  const [sheetHeight, setSheetHeight] = React.useState(SHEET_HEIGHT);
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [busy, setBusy] = React.useState(false);

  // First-time tooltip
  const [tooltipVisible, setTooltipVisible] = React.useState(false);
  const tooltipOpacity = useRef(new Animated.Value(0)).current;

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

      // Check if we should show the first-time tooltip
      getAddSheetTooltipSeen().then((seen) => {
        if (!seen) {
          setTooltipVisible(true);
          Animated.timing(tooltipOpacity, {
            toValue: 1,
            duration: 280,
            delay: 200,
            useNativeDriver: true,
          }).start();
        }
      });
    } else {
      setTooltipVisible(false);
      tooltipOpacity.setValue(0);
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
  }, [backdropOpacity, sheetHeight, tooltipOpacity, translateY, visible]);

  const dismissTooltip = () => {
    setAddSheetTooltipSeen();
    Animated.timing(tooltipOpacity, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => setTooltipVisible(false));
  };

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

  const handleMileage = () => {
    onClose();
    setTimeout(() => navigation.navigate("MileageRecord", {}), 220);
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

          {/* First-time tooltip */}
          {tooltipVisible ? (
            <Animated.View
              style={[
                styles.tooltip,
                { opacity: tooltipOpacity, bottom: sheetHeight + 12 },
              ]}
              pointerEvents="box-none"
            >
              <Text style={styles.tooltipHeadline}>
                Take a photo of your {itemLabel}, or upload one from your gallery
              </Text>

              {/* Illustration */}
              <View style={styles.illustrationRow}>
                <View style={styles.illustrationBox}>
                  <Text style={styles.illustrationEmoji}>📷</Text>
                  <View style={styles.illustrationReceipt}>
                    <View style={styles.receiptLine} />
                    <View style={[styles.receiptLine, { width: "60%" }]} />
                    <View style={styles.receiptLine} />
                  </View>
                  <Text style={styles.illustrationLabel}>Take Photo</Text>
                </View>
                <View style={styles.illustrationDivider} />
                <View style={styles.illustrationBox}>
                  <Text style={styles.illustrationEmoji}>🖼️</Text>
                  <View style={styles.illustrationReceipt}>
                    <View style={styles.receiptLine} />
                    <View style={[styles.receiptLine, { width: "60%" }]} />
                    <View style={styles.receiptLine} />
                  </View>
                  <Text style={styles.illustrationLabel}>From Gallery</Text>
                </View>
              </View>

              <Text style={styles.tooltipBody}>
                {targetScreen === "IncomeRecord"
                  ? "You can upload multiple income documents at once, multiple pages of the same document, or a mix of both — we'll work it out!"
                  : "You can add multiple receipts at once, multiple photos of the same receipt, or a mix of both — we'll work it out!"}
              </Text>

              <TouchableOpacity
                style={styles.tooltipButton}
                onPress={dismissTooltip}
                activeOpacity={0.8}
              >
                <Text style={styles.tooltipButtonText}>Got it!</Text>
              </TouchableOpacity>
            </Animated.View>
          ) : null}

          {/* Sheet */}
          <Animated.View
            style={[styles.sheet, { transform: [{ translateY }], paddingBottom: Math.max(insets.bottom, Platform.OS === "ios" ? 48 : 24) }]}
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
                {vehicles.length > 0 && (
                  <>
                    <Option
                      icon="🚗"
                      label="Mileage"
                      sub="Record a business mileage trip"
                      onPress={handleMileage}
                    />
                    <View style={styles.divider} />
                  </>
                )}
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
    // paddingBottom is applied inline using useSafeAreaInsets
    paddingHorizontal: 4,
    elevation: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  tooltip: {
    position: "absolute",
    left: 16,
    right: 16,
    backgroundColor: "#1C1C4E",
    borderRadius: 20,
    padding: 20,
    elevation: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  tooltipHeadline: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
    marginBottom: 16,
    lineHeight: 26,
  },
  illustrationRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "flex-start",
    marginBottom: 18,
    gap: 12,
  },
  illustrationBox: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  illustrationEmoji: {
    fontSize: 34,
    marginBottom: 10,
  },
  illustrationReceipt: {
    width: "80%",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 6,
    padding: 8,
    gap: 5,
    marginBottom: 10,
  },
  receiptLine: {
    height: 6,
    backgroundColor: "rgba(255,255,255,0.5)",
    borderRadius: 3,
    width: "100%",
  },
  illustrationDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: "rgba(255,255,255,0.15)",
    marginHorizontal: 4,
  },
  illustrationLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255,255,255,0.75)",
    textAlign: "center",
  },
  tooltipBody: {
    fontSize: 14,
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 18,
  },
  tooltipButton: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 32,
    alignSelf: "center",
  },
  tooltipButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
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
