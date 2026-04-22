import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { collection, getDocs, onSnapshot, query, where } from "firebase/firestore";
import SideMenu from "../components/SideMenu";
import SharedTabMenu from "../components/SharedTabMenu";
import { auth, db } from "../firebaseConfig";
import { formatDate } from "../utils/format_style";
import { Colors } from "../utils/sharedStyles";
import { useTabSwipeNavigation } from "../utils/tabSwipeNavigation";

export default function IncomeScreen({ navigation }) {
  const [incomeItems, setIncomeItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [menuOpen, setMenuOpen] = useState(false);
  const swipeResponder = useTabSwipeNavigation(navigation, "Income");

  const fetchIncome = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) {
      setIncomeItems([]);
      return;
    }

    const snapshot = await getDocs(
      query(collection(db, "income"), where("userId", "==", user.uid))
    );
    setIncomeItems(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setIncomeItems([]);
      setLoading(false);
      return undefined;
    }

    const unsubscribeSnapshot = onSnapshot(
      query(collection(db, "income"), where("userId", "==", user.uid)),
      (snapshot) => {
        setIncomeItems(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
        setLoading(false);
      },
      (error) => {
        console.error("Error listening to income", error);
        setLoading(false);
      }
    );

    return () => {
      unsubscribeSnapshot();
    };
  }, [fetchIncome, navigation]);

  const sortedIncome = useMemo(() => {
    const data = [...incomeItems];
    data.sort((left, right) => {
      let comparison = 0;
      if (sortKey === "amount") {
        comparison = (Number(left.amount) || 0) - (Number(right.amount) || 0);
      } else if (sortKey === "reference") {
        comparison = String(left.reference || "").localeCompare(
          String(right.reference || ""),
          undefined,
          { sensitivity: "base" }
        );
      } else {
        comparison =
          (new Date(left.date).getTime() || 0) -
          (new Date(right.date).getTime() || 0);
      }
      return sortDir === "asc" ? comparison : -comparison;
    });
    return data;
  }, [incomeItems, sortDir, sortKey]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchIncome();
    } finally {
      setRefreshing(false);
    }
  }, [fetchIncome]);

  const toggleSort = (nextKey) => {
    if (sortKey === nextKey) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDir(nextKey === "date" ? "desc" : "asc");
  };

  const sortIcon = (key) => {
    if (sortKey !== key) return "↕";
    return sortDir === "asc" ? "▲" : "▼";
  };

  const closeMenu = () => setMenuOpen(false);

  const renderHeader = () => (
    <View style={styles.headerRow}>
      <TouchableOpacity style={styles.headerCellDate} onPress={() => toggleSort("date")}>
        <Text style={styles.headerText}>Date</Text>
        <Text style={styles.headerArrow}>{sortIcon("date")}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.headerCellReference} onPress={() => toggleSort("reference")}>
        <Text style={styles.headerText}>Reference</Text>
        <Text style={styles.headerArrow}>{sortIcon("reference")}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.headerCellAmount} onPress={() => toggleSort("amount")}>
        <Text style={styles.headerText}>Amount</Text>
        <Text style={styles.headerArrow}>{sortIcon("amount")}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderItem = ({ item }) => (
    <View style={styles.rowOuter}>
      <View
        style={[
          styles.listContainer,
          { width: "98%", marginTop: 0, marginBottom: 5 },
        ]}
      >
        <TouchableOpacity
          style={[styles.row, { width: "100%", marginBottom: 0 }]}
          onPress={() => navigation.navigate("IncomeDetails", { income: item })}
        >
          <Text style={styles.rowDate}>{formatDate(new Date(item.date))}</Text>
          <View style={styles.referenceWrap}>
            {item.label ? (
              <Text style={styles.rowLabel} numberOfLines={1}>
                {String(item.label)}
              </Text>
            ) : null}
            <Text style={styles.rowReference} numberOfLines={1}>
              {String(item.reference || "No reference")}
            </Text>
          </View>
          <Text style={styles.rowAmount}>£{Number(item.amount || 0).toFixed(2)}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} {...swipeResponder.panHandlers}>
      <View style={[styles.topBar, { paddingTop: 5 }]}>
        <TouchableOpacity style={styles.topBarButton} onPress={() => setMenuOpen(true)}>
          <Text style={styles.topBarButtonText}>≡</Text>
        </TouchableOpacity>

        <Text style={styles.topBarTitle}>Income</Text>

        <View style={{ width: 44 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>Income Records</Text>
          <Text style={styles.subtitle}>
            {sortedIncome.length > 0
              ? "Your income statements are shown below."
              : "You haven't added any income yet."}
          </Text>
        </View>

        {sortedIncome.length > 0 ? (
          <View style={{ marginTop: 28, marginBottom: 8 }}>{renderHeader()}</View>
        ) : null}

        <FlatList
          style={styles.list}
          data={loading ? [] : sortedIncome}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.emptyState}>
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={() => navigation.navigate("IncomeRecord")}
                >
                  <Text style={styles.addButtonText}>Add Income</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
          contentContainerStyle={[
            { paddingVertical: 10 },
            sortedIncome.length === 0 ? styles.emptyListContent : styles.listContent,
          ]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      </View>

      <TouchableOpacity
        style={styles.floatingButton}
        onPress={() => navigation.navigate("IncomeRecord")}
      >
        <Text style={styles.floatingButtonText}>+</Text>
      </TouchableOpacity>

      <SideMenu open={menuOpen} onClose={closeMenu}>
        <SharedTabMenu
          navigation={navigation}
          closeMenu={closeMenu}
          displayName={auth.currentUser?.displayName || "User"}
        />
      </SideMenu>

      {loading ? (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={Colors.accent} />
            <Text style={styles.loadingText}>Loading income…</Text>
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBar: {
    backgroundColor: Colors.card,
    width: "100%",
    paddingHorizontal: 12,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  topBarTitle: { fontSize: 18, fontWeight: "800", color: Colors.textPrimary },
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
  subtitle: {
    fontSize: 17,
    color: Colors.textPrimary,
    marginTop: 14,
    textAlign: "center",
  },
  headerRow: {
    width: "95%",
    backgroundColor: Colors.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  headerCellDate: { width: 90, flexDirection: "row", gap: 6, alignItems: "center" },
  headerCellReference: { flex: 1, flexDirection: "row", gap: 6, alignItems: "center", paddingLeft: 16 },
  headerCellAmount: {
    width: 106,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  headerText: { fontWeight: "700", color: Colors.textPrimary },
  headerArrow: { color: Colors.textMuted, fontSize: 12 },
  list: { width: "100%", alignSelf: "stretch" },
  listContent: { paddingBottom: 140 },
  emptyListContent: { flexGrow: 1, justifyContent: "center", width: "100%" },
  rowOuter: {
    width: "100%",
    alignItems: "center",
  },
  listContainer: {
    width: "98%",
    borderRadius: 10,
    padding: 6,
    marginBottom: 5,
    backgroundColor: Colors.textPrimary,
  },
  row: {
    backgroundColor: "#f0f0f0",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    width: "95%",
    alignSelf: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    minHeight: 60,
  },
  rowDate: { fontSize: 14, color: "#555", minWidth: 90 },
  referenceWrap: {
    flex: 1,
    alignItems: "flex-start",
    paddingLeft: 16,
  },
  rowReference: {
    color: "#000",
    fontWeight: "500",
    fontSize: 16,
    width: "100%",
  },
  rowLabel: {
    color: Colors.textMuted,
    fontSize: 12,
    marginBottom: 2,
  },
  rowAmount: {
    fontSize: 16,
    fontWeight: "bold",
    color: Colors.accent,
    minWidth: 90,
    textAlign: "right",
  },
  userInfo: {
    marginBottom: 20,
  },
  userEmail: {
    color: Colors.textPrimary,
    fontSize: 15,
    marginBottom: 6,
    fontWeight: "600",
  },
  settingsMenuBtn: {
    backgroundColor: "#9999AA",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginTop: 16,
    alignItems: "center",
  },
  settingsMenuBtnText: {
    color: "white",
    fontWeight: "700",
    textAlign: "center",
  },
  notifyBtnFilled: {
    backgroundColor: "#2e86de",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 10,
  },
  filledBtnText: {
    color: "white",
    fontWeight: "700",
    textAlign: "center",
  },
  secondaryMenuButton: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  secondaryMenuButtonText: {
    color: Colors.textPrimary,
    fontWeight: "600",
    textAlign: "center",
  },
  footerContainer: {
    marginTop: "auto",
    paddingBottom: Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 16 : 24,
  },
  referralBtn: {
    backgroundColor: "#27ae60",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: "center",
  },
  redButton: {
    backgroundColor: Colors.accent,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: "center",
  },
  redButtonText: {
    color: "white",
    fontWeight: "700",
    textAlign: "center",
  },
  signOutLink: {
    backgroundColor: "transparent",
    paddingVertical: 10,
    marginBottom: 20,
  },
  linkBtnText: {
    color: Colors.textPrimary,
    fontWeight: "600",
    textAlign: "center",
    textDecorationLine: "underline",
  },
  emptyState: { alignItems: "center", justifyContent: "center", paddingTop: 20 },
  addButton: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 28,
  },
  addButtonText: { color: Colors.surface, fontWeight: "700", fontSize: 18 },
  floatingButton: {
    position: "absolute",
    right: 30,
    bottom: 100,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.accent,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  floatingButtonText: { color: Colors.surface, fontSize: 32, marginBottom: 2 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingCard: {
    backgroundColor: Colors.surface,
    paddingVertical: 20,
    paddingHorizontal: 26,
    borderRadius: 12,
    alignItems: "center",
  },
  loadingText: { marginTop: 10, color: Colors.textPrimary, fontSize: 16 },
});
