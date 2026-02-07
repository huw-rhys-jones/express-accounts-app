import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Divider
} from "react-native";
import { signOut } from "firebase/auth";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db, auth } from "../firebaseConfig";
import { formatDate } from "../utils/format_style";
import SideMenu from "../components/SideMenu";
import { StatusBar, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Constants from 'expo-constants';
import { Colors } from "../utils/sharedStyles";

// Inside your component
const appVersion = Constants.expoConfig?.version;



const ExpensesScreen = ({ navigation }) => {
  const [displayName, setDisplayName] = useState("User");
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingText, setLoadingText] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);


  // --- sorting state ---
  const [sortKey, setSortKey] = useState("date");      // "date" | "amount" | "category"
  const [sortDir, setSortDir] = useState("desc");      // "asc" | "desc"

  const [showItemTip, setShowItemTip] = useState(false);

  // Check Firebase for "seen" status
  useEffect(() => {
    const checkItemTipStatus = async () => {
      const user = auth.currentUser;
      // Condition: 1 receipt exactly + not loading
      if (user && !loading && sortedReceipts.length === 1) {
        try {
          const userRef = doc(db, "users", user.uid);
          const userSnap = await getDoc(userRef);
          
          if (!userSnap.data()?.hasSeenItemTip) {
            setShowItemTip(true);
          }
        } catch (error) {
          console.log("Error fetching item tooltip status:", error);
        }
      }
    };
    checkItemTipStatus();
  }, [loading, sortedReceipts.length]); // Re-run when list length changes

  const dismissItemTip = async () => {
    setShowItemTip(false);
    const user = auth.currentUser;
    if (user) {
      try {
        const userRef = doc(db, "users", user.uid);
        await setDoc(userRef, { hasSeenItemTip: true }, { merge: true });
      } catch (error) {
        console.log("Error updating item tooltip status:", error);
      }
    }
  };

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
    runWithLoading("Loading receipts…", fetchReceipts);

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

  // --- sorting helpers ---
  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // nice defaults per column
      setSortDir(key === "date" ? "desc" : "asc");
    }
  };

  const sortIcon = (key) => {
    if (sortKey !== key) return "↕";
    return sortDir === "asc" ? "▲" : "▼";
  };

  const sortedReceipts = useMemo(() => {
    const data = [...receipts];
    data.sort((a, b) => {
      let av, bv, cmp = 0;

      if (sortKey === "amount") {
        av = Number(a.amount) || 0;
        bv = Number(b.amount) || 0;
        cmp = av - bv;
      } else if (sortKey === "date") {
        av = new Date(a.date).getTime() || 0;
        bv = new Date(b.date).getTime() || 0;
        cmp = av - bv;
      } else if (sortKey === "category") {
        av = String(a.category || "");
        bv = String(b.category || "");
        cmp = av.localeCompare(bv, undefined, { sensitivity: "base" });
      }

      return sortDir === "asc" ? cmp : -cmp;
    });
    return data;
  }, [receipts, sortKey, sortDir]);

  const renderHeaderRow = () => (
    <View style={styles.headerRow}>
      <TouchableOpacity style={styles.headerCellDate} onPress={() => toggleSort("date")}>
        <Text style={styles.headerText}>Date</Text>
        <Text style={styles.headerArrow}>{sortIcon("date")}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.headerCellCategory} onPress={() => toggleSort("category")}>
        <Text style={styles.headerText}>Category</Text>
        <Text style={styles.headerArrow}>{sortIcon("category")}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.headerCellAmount} onPress={() => toggleSort("amount")}>
        <Text style={styles.headerTextRight}>Amount</Text>
        <Text style={styles.headerArrow}>{sortIcon("amount")}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderReceiptItem = ({ item, index }) => (
    <View>
      <TouchableOpacity
        onPress={() => navigation.navigate("ReceiptDetails", { receipt: item })}
        style={styles.receiptItem}
      >
        {/* Date Column */}
        <Text style={styles.receiptDate}>{formatDate(new Date(item.date))}</Text>
  
        {/* Category Column - preserving your line-break logic */}
        <View style={{ flex: 1, alignItems: "flex-start", marginLeft: 25 }}>
          <Text style={styles.receiptCategory}>
            {String(item.category).split(" ").join("\n")}
          </Text>
        </View>
  
        {/* Amount Column */}
        <Text style={styles.receiptAmount}>£{Number(item.amount).toFixed(2)}</Text>
      </TouchableOpacity>
  
      {/* Inject Tooltip directly below the first item.
          Condition: It's the first index AND the tip hasn't been dismissed AND it's the very first receipt.
      */}
      {index === 0 && showItemTip && sortedReceipts.length === 1 && (
        <ItemTooltip onDismiss={dismissItemTip} />
      )}
    </View>
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

  const hasReceipts = !loading && sortedReceipts.length > 0;

  return (
    <SafeAreaView style={styles.container}>

      {/* Top App Bar */}
      <View style={[styles.topBar, { paddingTop: 5 }]}>
        <TouchableOpacity style={styles.topBarButton} onPress={() => setMenuOpen(true)}>
          <Text style={styles.topBarButtonText}>≡</Text>
        </TouchableOpacity>

        <Text style={styles.topBarTitle}>Expenses</Text>

        {/* Right spacer to balance the layout (same width as the button) */}
        <View style={{ width: 44 }} />
      </View>


      <View style={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>Welcome, {displayName}!</Text>
          {loading ? null : sortedReceipts.length === 0 ? (
            <Text style={styles.subtitle}>
              You haven't added any expenses yet!
            </Text>
          ) : (
            <Text style={styles.subtitle}>Your receipts are shown below:</Text>
          )}
        </View>

        {/* Header row OUTSIDE the FlatList to avoid Android sticky bug */}
        {hasReceipts ? (
          <View style={{ marginTop: 10, marginBottom: 8 }}>
            {renderHeaderRow()}
          </View>
        ) : null}

        <FlatList
          ListEmptyComponent={!loading ? renderEmptyState : null}
          data={loading ? [] : sortedReceipts}
          keyExtractor={(item) => item.id}
          renderItem={renderReceiptItem}
          contentContainerStyle={[
              styles.listContainer,
              // Add this line: only show the dark background if NOT loading
              { backgroundColor: loading ? "transparent" : Colors.textPrimary },
              !hasReceipts ? { flexGrow: 1, justifyContent: "center" } : null,
            ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          // NOTE: header is outside; do not use stickyHeaderIndices/ListHeaderComponent
        />
      </View>

      {/* Floating Add Expenses Button */}
      <TouchableOpacity
        style={styles.floatingButton}
        onPress={() => navigation.navigate("Receipt")}
      >
        <Text style={styles.floatingButtonText}>+</Text>
      </TouchableOpacity>

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

      {/* Slide-in side menu */}
      <SideMenu open={menuOpen} onClose={() => setMenuOpen(false)}>
       <View style={{ flex: 1 }}> 

        <Text style={styles.menuTitle}>Menu</Text>
      
        <View style={styles.userInfo}>
          <Text style={styles.userEmail}>{displayName}</Text>
          <Text style={styles.userEmail}>{auth.currentUser?.email}</Text>
        </View>

        <TouchableOpacity
          onPress={async () => {
            setMenuOpen(false);
            await handleLogout();
          }}
          style={styles.signOutBtn}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>

        <View style={styles.versionContainer}>
          <Text style={styles.versionText}>Version {appVersion}</Text>
        </View>
        
       </View>
      </SideMenu>
    </SafeAreaView>

  );
};

export default ExpensesScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { flex: 1, alignItems: "center", paddingBottom: 20 },

  card: {
    backgroundColor: Colors.card,
    width: "85%",
    padding: 22,
    borderRadius: 20,
    marginTop: 40,
    alignItems: "center",
  },
  title: { fontSize: 19, fontWeight: "bold", color: Colors.textPrimary },
  subtitle: { fontSize: 17, color: Colors.textPrimary, marginTop: 14, textAlign: "center" },
  description: {
    fontSize: 16,
    color: Colors.textPrimary,
    textAlign: "center",
    marginTop: 10,
  },
  addButton: {
    backgroundColor: Colors.accent,
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

  listContainer: {
    marginTop: 10,
    borderRadius: 10,
    padding: 8,
    backgroundColor: Colors.textPrimary,
    width: "100%",
  },

  // ---- Header row (sortable columns) ----
  headerRow: {
    backgroundColor: Colors.card,
    borderRadius: 12,            // round all corners
    paddingHorizontal: 16,
    paddingVertical: 12,         // internal space
    width: "95%",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    // external margins handled by wrapper View
  },
  headerCellDate: {
    minWidth: 90,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerCellCategory: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: 25,
  },
  headerCellAmount: {
    minWidth: 90,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
  },
  headerText: { fontSize: 14, fontWeight: "700", color: Colors.textPrimary },
  headerTextRight: { fontSize: 14, fontWeight: "700", color: Colors.textPrimary, textAlign: "right" },
  headerArrow: { fontSize: 12, color: "#555" },

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
  receiptCategory: { fontSize: 16, fontWeight: "500", color: "#000" },
  receiptAmount: { fontSize: 16, fontWeight: "bold", color: Colors.accent },

  floatingButton: {
    position: "absolute",
    bottom: 100,
    right: 30,
    backgroundColor: Colors.accent,
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
    backgroundColor: "rgba(0,0,0,0.5)", // Slightly darker for better contrast
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
  topBar: {
  backgroundColor: Colors.card,
  width: "100%",
  // height is paddingTop (status bar) + this content height
  // keep the content area comfy:
  paddingHorizontal: 12,
  paddingBottom: 10,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  // subtle shadow/elevation
  elevation: 3,
  shadowColor: "#000",
  shadowOpacity: 0.1,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 2 },
},
topBarButton: {
  width: 44,
  height: 36,
  borderRadius: 18,
  backgroundColor: Colors.inputBg,
  alignItems: "center",
  justifyContent: "center",
},
topBarButtonText: {
  fontSize: 18,
  fontWeight: "700",
  color: Colors.textPrimary,
},
topBarTitle: {
  fontSize: 18,
  fontWeight: "800",
  color: Colors.textPrimary,
},
menuTitle: { 
  fontSize: 22, 
  fontWeight: "800", 
  color: Colors.textPrimary, 
    marginBottom: 10 
  },
  userInfo: {
    marginBottom: 20,
  },
  userEmail: {
    color: "#7B7B7B",
    fontSize: 14,
  },
  signOutBtn: {
    backgroundColor: Colors.accent,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginTop: 20,
  },
  signOutText: { 
    color: "white", 
    fontWeight: "700", 
    textAlign: 'center' 
  },
  versionContainer: {
    marginTop: 'auto', // Pushes to bottom of the flex container
    paddingBottom: 20,
    alignItems: 'center',
  },
  versionText: {
    color: '#B5B3C6',
    fontSize: 12,
    fontWeight: '600',
  },
  itemTipWrapper: {
    alignItems: 'center',
    marginTop: -5, // Pull it closer to the item
    marginBottom: 10,
    paddingHorizontal: 20,
    zIndex: 10,
  },
  topTriangle: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 15,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#a60d49', // Match your brand color
  },
  itemTipBox: {
    backgroundColor: '#a60d49',
    padding: 12,
    borderRadius: 8,
    width: '100%',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  itemTipText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  itemGotIt: {
    color: '#fff',
    fontWeight: 'bold',
    textAlign: 'right',
    marginTop: 8,
    textDecorationLine: 'underline',
  },

});

const ItemTooltip = ({ onDismiss }) => (
  <View style={localStyles.itemTipWrapper}>
    <View style={localStyles.topTriangle} />
    <View style={localStyles.itemTipBox}>
      <Text style={localStyles.itemTipText}>
        Here's your first expense! Tap it to see the full details and the receipt image. 📑
      </Text>
      <TouchableOpacity onPress={onDismiss}>
        <Text style={localStyles.itemGotIt}>Got it</Text>
      </TouchableOpacity>
    </View>
  </View>
);
