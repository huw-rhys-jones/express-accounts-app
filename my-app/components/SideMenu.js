// components/SideMenu.js
import React, { useEffect, useRef } from "react";
import { Animated, Dimensions, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const WIDTH = Math.min(300, Math.round(Dimensions.get("window").width * 0.8));

// Approximate height of the custom tab bar's content above the safe-area inset.
const TAB_BAR_CONTENT_HEIGHT = 50;

export default function SideMenu({ open, onClose, children }) {
  const insets = useSafeAreaInsets();
  const x = useRef(new Animated.Value(-WIDTH)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) {
      Animated.parallel([
        Animated.timing(x, { toValue: 0, duration: 220, useNativeDriver: false }),
        Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(x, { toValue: -WIDTH, duration: 200, useNativeDriver: false }),
        Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [open, x, fade]);

  return (
    <View pointerEvents={open ? "auto" : "none"} style={StyleSheet.absoluteFill}>
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: fade }]} />
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

      {/* Drawer */}
      <Animated.View style={[styles.sheet, { width: WIDTH, bottom: insets.bottom + TAB_BAR_CONTENT_HEIGHT, transform: [{ translateX: x }] }]}>
        {/* Close button */}
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={12}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    top: 0,
    backgroundColor: "#fff",
    paddingTop: 48,
    paddingHorizontal: 18,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  closeBtn: {
    position: "absolute",
    top: 12,
    right: 14,
    padding: 6,
    zIndex: 10,
  },
  closeBtnText: {
    fontSize: 20,
    color: "#555",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
});
