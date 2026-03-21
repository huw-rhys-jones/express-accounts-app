import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Colors, SharedStyles } from "../utils/sharedStyles";

const IncomeScreen = () => {
  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="menu" size={24} color={Colors.textSecondary} />
      </View>

      {/* Welcome Section */}
      <View style={styles.card}>
        <Text style={styles.title}>Welcome, Bob!</Text>
        <Text style={styles.subtitle}>
          You haven't added any income yet!
        </Text>
        <Text style={styles.description}>
          Tap the Add button below to enter your first invoice
        </Text>
      </View>

      {/* Video Instruction Section */}
      <View style={styles.card}>
        <Text style={styles.description}>
          Click here to view a short video on how this app works
        </Text>
      </View>

      {/* Add Income Button */}
      <TouchableOpacity style={styles.addButton}>
        <Text style={styles.buttonText}>Add Income</Text>
      </TouchableOpacity>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem}>
          <Text style={[styles.navText, styles.activeNav]}>Income</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem}>
          <Text style={styles.navText}>Expenses</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem}>
          <Text style={styles.navText}>Summary</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default IncomeScreen;

/* 📌 Styles */
const styles = StyleSheet.create({
  container: SharedStyles.screen,
  header: {
    width: "100%",
    height: 60,
    backgroundColor: Colors.card,
    justifyContent: "center",
    
    paddingLeft: 20,
  },
  card: { ...SharedStyles.card, width: "85%" },
  title: { fontSize: 19, fontWeight: "bold", color: Colors.textPrimary },
  subtitle: { fontSize: 17, color: Colors.textPrimary, marginTop: 15, textAlign: "center" },
  description: { fontSize: 16, color: Colors.textPrimary, textAlign: "center", marginTop: 10 },
  addButton: {
    backgroundColor: Colors.accent,
    paddingVertical: 16,
    paddingHorizontal: 46,
    borderRadius: 35,
    marginTop: 50,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  buttonText: {
    fontSize: 25,
    fontWeight: "bold",
    color: "white",
    textAlign: "center",
  },
  bottomNav: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    height: 60,
    backgroundColor: Colors.card,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  navItem: {
    padding: 10,
  },
  navText: { fontSize: 14, color: Colors.textMuted },
  activeNav: { fontWeight: "bold", color: Colors.textPrimary },
});
