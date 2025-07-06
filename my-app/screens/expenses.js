import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  FlatList
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { signOut, getAuth, onAuthStateChanged } from "firebase/auth";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db, auth } from "../firebaseConfig";

const ExpensesScreen = ({ navigation }) => {
  const [displayName, setDisplayName] = useState("");
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = auth.currentUser;

    setDisplayName(user.displayName || "User");

    const fetchReceipts = async () => {
      try {
        if (!user) return;

        const q = query(
          collection(db, "receipts"),
          where("userId", "==", user.uid)
        );

        const querySnapshot = await getDocs(q);
        const userReceipts = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        setReceipts(userReceipts);
        console.log(userReceipts);
      } catch (error) {
        console.error("Error fetching receipts:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchReceipts();
  }, []);

  const handleLogout = () => {
    const auth = getAuth();
    signOut(auth)
      .then(() => {
        navigation.replace("SignIn");
      })
      .catch((error) => {
        console.error("Logout error:", error);
      });
  };

  const renderReceiptItem = ({ item }) => (
    <View style={styles.receiptItem}>
      <Text style={styles.receiptDate}>
        {new Date(item.date).toLocaleDateString()}
      </Text>
      <Text style={styles.receiptCategory}>{item.category}</Text>
      <Text style={styles.receiptAmount}>£{item.amount.toFixed(2)}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      {/* <View style={styles.header}>
        <Ionicons name="menu" size={44} color="black" onPress={handleLogout}/>
      </View> */}

      {/* Welcome Section */}
      <View style={styles.card}>
        <Text style={styles.title}>Welcome, {displayName}!</Text>

        {receipts.length === 0 ? (
          <>
            <Text style={styles.subtitle}>
              You haven't added any expenses yet!
            </Text>
            <Text style={styles.description}>
              Tap the Add button below to enter your first receipt.
            </Text>
          </>
        ) : (
          <Text style={styles.subtitle}>Your receipts are shown below:</Text>
        )}
      </View>

      {/* Video Instruction Section */}
      {receipts.length === 0 ? (<View style={styles.card}>
        <Text style={styles.description}>
          Click here to view a short video on how this app works
        </Text>
      </View>): <FlatList
    data={receipts}
    keyExtractor={(item) => item.id}
    renderItem={renderReceiptItem}
    contentContainerStyle={styles.listContainer}
  />}

      {/* Add Expenses Button */}
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => navigation.navigate("Receipt")}
      >
        <Text style={styles.buttonText}>Add Expenses</Text>
      </TouchableOpacity>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem}>
          <Text style={[styles.navText]}>Income</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem}>
          <Text style={[styles.navText, styles.activeNav]}>Expenses</Text>
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
    height: 50,
    backgroundColor: "#B5B3C6",
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    marginVertical: 45,
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
  listContainer: {
    padding: 16,
  },
  receiptItem: {
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptDate: {
    fontSize: 14,
    color: '#555',
  },
  receiptCategory: {
    fontSize: 16,
    fontWeight: '500',
  },
  receiptAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#a60d49',
  },
});
