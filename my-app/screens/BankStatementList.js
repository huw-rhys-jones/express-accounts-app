import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { collection, getDocs, onSnapshot, query, where } from "firebase/firestore";
import DropDownPicker from "react-native-dropdown-picker";
import { auth, db } from "../firebaseConfig";
import { Colors, SharedStyles } from "../utils/sharedStyles";
import { formatDate } from "../utils/format_style";
import {
  buildFinancialFilterOptions,
  filterReceiptsByDateRange,
} from "../utils/financialPeriods";
import { getBankFilterKey, setBankFilterKey } from "../utils/appSettings";

export default function BankStatementList({ navigation }) {
  const [statements, setStatements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeFilterKey, setActiveFilterKey] = useState("current-quarter");
  const [filterItems, setFilterItems] = useState([]);
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("desc");

  const fetchStatements = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) {
      setStatements([]);
      return;
    }
    const snapshot = await getDocs(
      query(collection(db, "bankStatements"), where("userId", "==", user.uid))
    );
    setStatements(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
  }, []);

  useEffect(() => {
    getBankFilterKey()
      .then(setActiveFilterKey)
      .catch(() => setActiveFilterKey("current-quarter"));
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setStatements([]);
      setLoading(false);
      return undefined;
    }

    const unsubscribeSnapshot = onSnapshot(
      query(collection(db, "bankStatements"), where("userId", "==", user.uid)),
      (snapshot) => {
        setStatements(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
        setLoading(false);
      },
      (error) => {
        console.error("Error listening to bank statements", error);
        setLoading(false);
      }
    );

    const unsubscribeFocus = navigation.addListener("focus", () => {
      getBankFilterKey()
        .then(setActiveFilterKey)
        .catch(() => setActiveFilterKey("current-quarter"));
    });

    return () => {
      unsubscribeSnapshot();
      unsubscribeFocus();
    };
  }, [fetchStatements, navigation]);

  const filterOptions = useMemo(
    () => buildFinancialFilterOptions(statements, new Date()),
    [statements]
  );

  useEffect(() => {
    setFilterItems(
      filterOptions.map((option) => ({ label: option.label, value: option.key }))
    );
    if (filterOptions.length > 0 && !filterOptions.some((item) => item.key === activeFilterKey)) {
      const nextKey = filterOptions[0].key;
      setActiveFilterKey(nextKey);
      setBankFilterKey(nextKey).catch(() => {});
    }
  }, [activeFilterKey, filterOptions]);

  const activeFilter = useMemo(
    () => filterOptions.find((option) => option.key === activeFilterKey) || filterOptions[0],
    [activeFilterKey, filterOptions]
  );

  const filteredStatements = useMemo(() => {
    if (!activeFilter) return statements;
    return filterReceiptsByDateRange(
      statements,
      activeFilter.startDate,
      activeFilter.endDate
    );
  }, [activeFilter, statements]);

  const sortedStatements = useMemo(() => {
    const data = [...filteredStatements];
    data.sort((left, right) => {
      let comparison = 0;
      if (sortKey === "accountName") {
        comparison = String(left.accountName || "").localeCompare(
          String(right.accountName || ""),
          undefined,
          { sensitivity: "base" }
        );
      } else if (sortKey === "netMovement") {
        comparison =
          (Number(left.netMovement) || 0) - (Number(right.netMovement) || 0);
      } else {
        comparison =
          (new Date(left.date).getTime() || 0) -
          (new Date(right.date).getTime() || 0);
      }
      return sortDir === "asc" ? comparison : -comparison;
    });
    return data;
  }, [filteredStatements, sortDir, sortKey]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchStatements();
    } finally {
      setRefreshing(false);
    }
  }, [fetchStatements]);

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

  const renderItem = ({ item }) => (
    <View style={styles.listContainer}>
      <TouchableOpacity
        style={styles.row}
        onPress={() => navigation.navigate("BankStatementDetails", { statement: item })}
      >
        <View style={styles.rowPrimary}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {item.accountName || "Bank statement"}
          </Text>
          <Text style={styles.rowMeta}>
            {item.statementStartDate
              ? `${formatDate(new Date(item.statementStartDate))} to ${formatDate(
                  new Date(item.statementEndDate || item.date)
                )}`
              : formatDate(new Date(item.date))}
          </Text>
        </View>
        <View style={styles.amountColumn}>
          <Text style={styles.moneyIn}>In £{Number(item.moneyInTotal || 0).toFixed(2)}</Text>
          <Text style={styles.moneyOut}>Out £{Number(item.moneyOutTotal || 0).toFixed(2)}</Text>
        </View>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>Bank Statements</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>Bank Statements</Text>
          <Text style={styles.subtitle}>
            {sortedStatements.length > 0
              ? "Your bank statement records are shown below."
              : "Upload statements to track money in and money out."}
          </Text>
        </View>

        {filterItems.length > 0 ? (
          <View style={styles.filterCard}>
            <Text style={styles.filterLabel}>Filter by quarter or year</Text>
            <DropDownPicker
              open={filterOpen}
              value={activeFilterKey}
              items={filterItems}
              setOpen={setFilterOpen}
              setValue={(callback) => {
                const nextValue = callback(activeFilterKey);
                setActiveFilterKey(nextValue);
                setBankFilterKey(nextValue).catch(() => {});
                return nextValue;
              }}
              setItems={setFilterItems}
              listMode="SCROLLVIEW"
              style={styles.filterDropdown}
              dropDownContainerStyle={styles.filterDropdownContainer}
              zIndex={3000}
              zIndexInverse={1000}
            />
          </View>
        ) : null}

        {sortedStatements.length > 0 ? (
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.headerAccount} onPress={() => toggleSort("accountName")}>
              <Text style={styles.headerText}>Account</Text>
              <Text style={styles.headerArrow}>{sortIcon("accountName")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerDate} onPress={() => toggleSort("date")}>
              <Text style={styles.headerText}>Date</Text>
              <Text style={styles.headerArrow}>{sortIcon("date")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerNet} onPress={() => toggleSort("netMovement")}>
              <Text style={styles.headerText}>Net</Text>
              <Text style={styles.headerArrow}>{sortIcon("netMovement")}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <FlatList
          data={loading ? [] : sortedStatements}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.emptyState}>
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={() => navigation.navigate("BankStatement")}
                >
                  <Text style={styles.addButtonText}>Add Bank Statement</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
          contentContainerStyle={
            sortedStatements.length === 0 ? styles.emptyListContent : styles.listContent
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      </View>

      <TouchableOpacity
        style={styles.floatingButton}
        onPress={() => navigation.navigate("BankStatement")}
      >
        <Text style={styles.floatingButtonText}>+</Text>
      </TouchableOpacity>

      {loading ? (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={Colors.accent} />
            <Text style={styles.loadingText}>Loading bank statements…</Text>
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
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  topBarTitle: { fontSize: 20, fontWeight: "700", color: Colors.textPrimary },
  content: { flex: 1, alignItems: "center", paddingBottom: 20 },
  card: { ...SharedStyles.card, marginTop: 24 },
  title: SharedStyles.title,
  subtitle: {
    fontSize: 16,
    color: Colors.textPrimary,
    marginTop: 12,
    textAlign: "center",
  },
  filterCard: { width: "90%", marginTop: 18, zIndex: 10 },
  filterLabel: {
    color: Colors.surface,
    marginBottom: 8,
    fontSize: 14,
    fontWeight: "600",
  },
  filterDropdown: { borderColor: Colors.border, borderRadius: 12 },
  filterDropdownContainer: { borderColor: Colors.border },
  headerRow: {
    width: "92%",
    marginTop: 16,
    marginBottom: 8,
    backgroundColor: Colors.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  headerAccount: { flex: 1, flexDirection: "row", gap: 6, alignItems: "center" },
  headerDate: { width: 96, flexDirection: "row", gap: 6, alignItems: "center" },
  headerNet: {
    width: 82,
    flexDirection: "row",
    gap: 6,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  headerText: { fontWeight: "700", color: Colors.textPrimary },
  headerArrow: { color: Colors.textMuted, fontSize: 12 },
  listContent: { paddingBottom: 140, paddingTop: 4 },
  emptyListContent: { flexGrow: 1, justifyContent: "center", width: "100%" },
  listContainer: {
    width: "92%",
    marginBottom: 8,
    borderRadius: 12,
    padding: 6,
    backgroundColor: Colors.textPrimary,
    alignSelf: "center",
  },
  row: {
    backgroundColor: Colors.surface,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 14,
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
  },
  rowPrimary: { flex: 1, paddingRight: 12 },
  rowTitle: { color: Colors.textPrimary, fontWeight: "700", fontSize: 15 },
  rowMeta: { color: Colors.textMuted, marginTop: 4, fontSize: 13 },
  amountColumn: { width: 120 },
  moneyIn: { color: "#2a7b46", textAlign: "right", fontWeight: "600" },
  moneyOut: { color: Colors.accent, textAlign: "right", marginTop: 4, fontWeight: "600" },
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