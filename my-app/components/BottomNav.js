// components/BottomNav.js
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

export default function BottomNav({ navigation, active }) {
  return (
    <View style={styles.bottomNav}>
      <TouchableOpacity
        style={styles.navItem}
        onPress={() => navigation.navigate("Expenses")}
      >
        <Text
          style={[
            styles.navText,
            active === "Expenses" && styles.activeNav,
          ]}
        >
          Receipts
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.navItem}
        onPress={() => navigation.navigate("Summary")}
      >
        <Text
          style={[
            styles.navText,
            active === "Summary" && styles.activeNav,
          ]}
        >
          Summary
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bottomNav: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    paddingBottom: 35,
    backgroundColor: "#B5B3C6",
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  navItem: { padding: 10 },
  navText: { fontSize: 14, color: "#7B7B7B" },
  activeNav: { fontWeight: "bold", color: "#1C1C4E" },
});
