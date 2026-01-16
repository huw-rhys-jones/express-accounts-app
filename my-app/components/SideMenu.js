// components/SideMenu.js
import React, { useEffect, useRef } from "react";
import { Animated, Dimensions, Pressable, StyleSheet, View } from "react-native";

const WIDTH = Math.min(300, Math.round(Dimensions.get("window").width * 0.8));

export default function SideMenu({ open, onClose, children }) {
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
      <Animated.View style={[styles.sheet, { width: WIDTH, transform: [{ translateX: x }] }]}>
        {children}
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
    bottom: 0,
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
});
