import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { signOut } from "firebase/auth";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db, auth } from "../firebaseConfig";
import { formatDate } from "../utils/format_style";
import BottomNav from "../components/BottomNav";

const ExpensesScreen = ({ navigation }) => {
  const [displayName, setDisplayName] = useState("User");
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true); // start true to avoid empty flash
  const [loadingText, setLoadingText] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Shared loader wrapper (initial + logout)
  const runWithLoading = async (text, fn) => {
    setLoadingText(text);
    setLoading(true);
    try {
      await fn();
    } finally {
      setLoading(false);
      setLoadingText(null);
    }
  };

  const fetchReceipts = useCallback(async () => {
    try {
      const user = auth.currentUser;
      if (!user) {
        setReceipts([]);
        setDisplayName("User");
        return;
      }
      setDisplayName(user.displayName || "User");

      const q = query(collection(db, "receipts"), where("userId", "==", user.uid));
      const querySnapshot = await getDocs(q);
      const userReceipts = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setReceipts(userReceipts);
    } catch (err) {
      console.error("Error fetching receipts:", err);
    }
  }, []);

  useEffect(() => {
    // Initial load with overlay
    runWithLoading("Loading receipts…", fetchReceipts);

    // Refresh when returning to this screen
    const unsubscribeFocus = navigation.addListener("focus", () => {
      fetchReceipts().catch((e) => console.error("Refresh on focus failed", e));
    });
    return unsubscribeFocus;
  }, [navigation, fetchReceipts]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchReceipts();
    } finally {
      setRefreshing(false);
    }
  }, [fetchReceipts]);

  const handleLogout = async () => {
    await runWithLoading("Signing out…", async () => {
      await signOut(auth);
      navigation.replace("SignIn");
    });
  };

  const renderReceiptItem = ({ item }) => (
    <TouchableOpacity
      onPress={() => navigation.navigate("ReceiptDetails", { receipt: item })}
      style={styles.receiptItem}
    >
      <Text style={styles.receiptDate}>{formatDate(new Date(item.date))}</Text>

      <View style={{ flex: 1, alignItems: "flex-start", marginLeft: 25 }}>
        <Text style={styles.receiptCategory}>
          {String(item.category).split(" ").join("\n")}
        </Text>
      </View>

      <Text style={styles.receiptAmount}>£{Number(item.amount).toFixed(2)}</Text>
    </TouchableOpacity>
  );

  const renderEmptyState = () =>
    loading ? null : (
      <View style={styles.emptyState}>
        <View style={styles.card}>
          <Text style={styles.description}>
            Click here to view a short video on how this app works
          </Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate("Receipt")}
        >
          <Text style={styles.buttonText}>Add Expenses</Text>
        </TouchableOpacity>
      </View>
    );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>Welcome, {displayName}!</Text>
          {loading ? null : receipts.length === 0 ? (
            <Text style={styles.subtitle}>
              You haven't added any expenses yet!
            </Text>
          ) : (
            <Text style={styles.subtitle}>Your receipts are shown below:</Text>
          )}
        </View>

        <FlatList
          data={loading ? [] : receipts}
          keyExtractor={(item) => item.id}
          renderItem={renderReceiptItem}
          contentContainerStyle={[
            styles.listContainer,
            receipts.length === 0 && !loading ? { flex: 1 } : null,
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={renderEmptyState}
        />
      </View>

      {/* Floating Add Expenses Button */}
      <TouchableOpacity
        style={styles.floatingButton}
        onPress={() => navigation.navigate("Receipt")}
      >
        <Text style={styles.floatingButtonText}>+</Text>
      </TouchableOpacity>

      {/* Bottom Navigation
      <BottomNav navigation={navigation} active="Expenses" /> */}

      {/* Full-screen loading overlay */}
      {loading && (
        <View style={styles.blockingOverlay} pointerEvents="auto">
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" />
            <Text style={styles.loadingText}>
              {loadingText || "Please wait…"}
            </Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
};

export default ExpensesScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#302C66" },
  content: { flex: 1, alignItems: "center", paddingBottom: 20 },
  card: {
    backgroundColor: "#E5E5EA",
    width: "85%",
    padding: 22,
    borderRadius: 20,
    marginTop: 40,
    alignItems: "center",
  },
  title: { fontSize: 19, fontWeight: "bold", color: "#1C1C4E" },
  subtitle: { fontSize: 17, color: "#1C1C4E", marginTop: 14, textAlign: "center" },
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
    alignSelf: "center",
    marginTop: 20,
    shadowColor: "#a60d49",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  buttonText: { fontSize: 25, fontWeight: "bold", color: "white" },

  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },

  bottomNav: {
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

  listContainer: {
    marginTop: 10,
    borderRadius: 10,
    padding: 8,
    backgroundColor: "#1C1C4E",
    width: "100%",
  },
  receiptItem: {
    backgroundColor: "#f0f0f0",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    width: "95%",
    alignSelf: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 60,
  },
  receiptDate: { fontSize: 14, color: "#555" },
  receiptCategory: { fontSize: 16, fontWeight: "500" },
  receiptAmount: { fontSize: 16, fontWeight: "bold", color: "#a60d49" },

  floatingButton: {
    position: "absolute",
    bottom: 100,
    right: 30,
    backgroundColor: "#a60d49",
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
    zIndex: 10,
  },
  floatingButtonText: { fontSize: 32, color: "#fff", marginBottom: 2 },

  // Blocking overlay
  blockingOverlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999,
  },
  loadingCard: {
    backgroundColor: "white",
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: "center",
    minWidth: 200,
  },
  loadingText: { marginTop: 10, fontSize: 16, fontWeight: "600" },
});
