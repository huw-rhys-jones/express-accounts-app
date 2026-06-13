import React, { useEffect, useRef } from "react";
import {
  Animated,
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Modal,
  StyleSheet,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../utils/sharedStyles";

const SHEET_HEIGHT = 220;

export default function AddBankStatementSheet({ visible, onClose, navigation }) {
  const insets = useSafeAreaInsets();
  const [renderSheet, setRenderSheet] = React.useState(visible);
  const [sheetHeight, setSheetHeight] = React.useState(SHEET_HEIGHT);
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

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
        if (finished) setRenderSheet(false);
      });
    }
  }, [backdropOpacity, sheetHeight, translateY, visible]);

  const dismiss = () => onClose();

  const navigate = (statementType) => {
    onClose();
    setTimeout(() => {
      navigation.navigate("BankStatement", { initialStatementType: statementType });
    }, 220);
  };

  return (
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
          style={[
            styles.sheet,
            {
              transform: [{ translateY }],
              paddingBottom: Math.max(
                insets.bottom,
                Platform.OS === "ios" ? 48 : 24
              ),
            },
          ]}
          pointerEvents="box-none"
          onLayout={(event) => {
            const nextHeight = event.nativeEvent.layout.height;
            if (nextHeight > 0 && nextHeight !== sheetHeight) {
              setSheetHeight(nextHeight);
              if (!visible) translateY.setValue(nextHeight);
            }
          }}
        >
          {/* Handle bar */}
          <View style={styles.handle} />

          <Option
            icon="🏦"
            label="Bank Statement"
            sub="Upload a bank account statement"
            onPress={() => navigate("bank")}
          />
          <View style={styles.divider} />
          <Option
            icon="💳"
            label="Credit Card Statement"
            sub="Upload a credit card statement"
            onPress={() => navigate("credit")}
          />
        </Animated.View>
      </View>
    </Modal>
  );
}

function Option({ icon, label, sub, onPress }) {
  return (
    <TouchableOpacity
      style={styles.option}
      onPress={onPress}
      activeOpacity={0.65}
    >
      <Text style={styles.optionIcon}>{icon}</Text>
      <View style={styles.optionText}>
        <Text style={styles.optionLabel}>{label}</Text>
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
});
