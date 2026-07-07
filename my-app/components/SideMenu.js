// components/SideMenu.js
import React, { useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const WIDTH = Math.min(300, Math.round(Dimensions.get("window").width * 0.8));

export default function SideMenu({ open, onClose, children }) {
  const insets = useSafeAreaInsets();
  const x = useRef(new Animated.Value(-WIDTH)).current;
  const fade = useRef(new Animated.Value(0)).current;
  // Keep the modal mounted during the close animation
  const [modalVisible, setModalVisible] = useState(open);

  useEffect(() => {
    if (open) {
      setModalVisible(true);
      Animated.parallel([
        Animated.timing(x, { toValue: 0, duration: 220, useNativeDriver: false }),
        Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(x, { toValue: -WIDTH, duration: 200, useNativeDriver: false }),
        Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) setModalVisible(false);
      });
    }
  }, [open, x, fade]);

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={StyleSheet.absoluteFill}>
        {/* Heavy backdrop — tapping it dismisses the menu */}
        <Animated.View style={[styles.backdrop, { opacity: fade }]} />
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        {/* Drawer */}
        <Animated.View
          style={[
            styles.sheet,
            {
              width: WIDTH,
              paddingTop: insets.top + 16,
              paddingBottom: insets.bottom + 16,
              transform: [{ translateX: x }],
            },
          ]}
        >
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "#fff",
    paddingHorizontal: 18,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
});
