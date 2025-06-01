import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { signOut } from 'firebase/auth';
import { auth } from '../firebaseConfig';

const ExpensesScreen = ({ navigation }) => {

  const handleLogout = () => {
    signOut(auth)
      .then(() => {
        // Navigate to SignIn screen after logout
        navigation.replace('SignIn');
      })
      .catch((error) => {
        console.error('Logout error:', error);
      });
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="menu" size={44} color="black" onPress={handleLogout}/>
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

      {/* Add Expenses Button */}
      <TouchableOpacity style={styles.addButton}>
        <Text style={styles.buttonText}>Add Expenses</Text>
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

export default ExpensesScreen;

/* 📌 Styles */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#302C66",
    alignItems: "center",
    paddingTop: 0,
  },
  header: {
    width: "100%",
    height: 60,
    backgroundColor: "#B5B3C6",
    justifyContent: "center",
    paddingLeft: 20,
  },
  card: {
    backgroundColor: "#E5E5EA",
    width: "85%",
    padding: 22,
    borderRadius: 20,
    marginTop: 40,
    alignItems: "center",
  },
  title: {
    fontSize: 19,
    fontWeight: "bold",
    color: "#1C1C4E",
  },
  subtitle: {
    fontSize: 17,
    color: "#1C1C4E",
    marginTop: 14,
    textAlign: "center",
  },
  description: {
    fontSize: 16,
    color: "#1C1C4E",
    textAlign: "center",
    marginTop: 10,
  },
  addButton: {
    backgroundColor: "#a60d49",
    paddingVertical: 17,
    paddingHorizontal: 43,
    borderRadius: 35,
    marginTop: 50,
    shadowColor: "#a60d49",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  buttonText: {
    fontSize: 25,
    fontWeight: "bold",
    color: "white",
  },
  bottomNav: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    height: 60,
    backgroundColor: "#B5B3C6",
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  navItem: {
    padding: 10,
  },
  navText: {
    fontSize: 14,
    color: "#7B7B7B",
  },
  activeNav: {
    fontWeight: "bold",
    color: "#1C1C4E",
  },
});
