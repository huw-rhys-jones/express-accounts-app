import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Platform,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import SideMenu from "../components/SideMenu";
import SharedTabMenu from "../components/SharedTabMenu";
import AddBankStatementSheet from "../components/AddBankStatementSheet";
import { auth } from "../firebaseConfig";
import { Colors } from "../utils/sharedStyles";
import { formatDate } from "../utils/format_style";
import { useData } from "../contexts/DataContext";
import DropDownPicker from "react-native-dropdown-picker";
import {
  buildFinancialFilterOptions,
  filterReceiptsByDateRange,
  getPeriodRecordCount,
  formatPeriodLabelWithCount,
} from "../utils/financialPeriods";
import {
  getBankFilterKey,
  setAllFilterKeys,
  getHiddenPeriodTooltipDismissed,
  setHiddenPeriodTooltipDismissed,
} from "../utils/appSettings";

export default function BankStatementList({ navigation }) {
  const { bankStatements, bankStatementsLoading } = useData();
  const statements = bankStatements;
  const loading = bankStatementsLoading;
  const [refreshing, setRefreshing] = useState(false);
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [menuOpen, setMenuOpen] = useState(false);
  const [addSheetVisible, setAddSheetVisible] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeFilterKey, setActiveFilterKey] = useState("current-quarter");
  const [filterItems, setFilterItems] = useState([]);
  const [showHiddenRecordsTip, setShowHiddenRecordsTip] = useState(false);
  const [hiddenPeriodTipDismissed, setHiddenPeriodTipDismissed] = useState(false);
  const [hiddenPeriodTipTemporarilyDismissed, setHiddenPeriodTipTemporarilyDismissed] = useState(false);

  const filterOptions = useMemo(
    () => buildFinancialFilterOptions(statements, new Date()),
    [statements]
  );

  const activeFilter = useMemo(
    () => filterOptions.find((o) => o.key === activeFilterKey) || filterOptions[0],
    [activeFilterKey, filterOptions]
  );

  const filterCountsByKey = useMemo(() => {
    const counts = {};
    for (const option of filterOptions) {
      counts[option.key] = getPeriodRecordCount(statements, option);
    }
    return counts;
  }, [filterOptions, statements]);

  useEffect(() => {
    setFilterItems(
      filterOptions.map((o) => {
        const count = filterCountsByKey[o.key] ?? 0;
        return {
          label: formatPeriodLabelWithCount(
            o.label,
            count,
            "Bank Statement",
            "Bank Statements"
          ),
          value: o.key,
        };
      })
    );
  }, [filterCountsByKey, filterOptions]);

  useEffect(() => {
    getHiddenPeriodTooltipDismissed()
      .then(setHiddenPeriodTipDismissed)
      .catch(() => setHiddenPeriodTipDismissed(false));
  }, []);

  useEffect(() => {
    getBankFilterKey()
      .then(setActiveFilterKey)
      .catch(() => setActiveFilterKey("current-quarter"));
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener("focus", () => {
      getBankFilterKey()
        .then(setActiveFilterKey)
        .catch(() => setActiveFilterKey("current-quarter"));
    });
    return unsub;
  }, [navigation]);

  useEffect(() => {
    const unsub = navigation.addListener("blur", () => {
      setFilterOpen(false);
    });
    return unsub;
  }, [navigation]);

  useEffect(() => {
    if (
      loading ||
      filterOpen ||
      hiddenPeriodTipDismissed ||
      hiddenPeriodTipTemporarilyDismissed ||
      filterOptions.length === 0
    ) {
      setShowHiddenRecordsTip(false);
      return;
    }

    const activeCount = filterCountsByKey[activeFilterKey] ?? 0;
    const hasRecordsInOtherPeriods = filterOptions.some(
      (option) => option.key !== activeFilterKey && (filterCountsByKey[option.key] ?? 0) > 0
    );
    setShowHiddenRecordsTip(activeCount === 0 && hasRecordsInOtherPeriods);
  }, [
    activeFilterKey,
    filterCountsByKey,
    filterOpen,
    filterOptions,
    hiddenPeriodTipDismissed,
    hiddenPeriodTipTemporarilyDismissed,
    loading,
  ]);

  const dismissHiddenRecordsTip = useCallback(async () => {
    setShowHiddenRecordsTip(false);
    setHiddenPeriodTipDismissed(true);
    await setHiddenPeriodTooltipDismissed();
  }, []);

  const handleSetFilterOpen = useCallback((nextOpen) => {
    setFilterOpen((previous) => {
      const resolvedOpen = typeof nextOpen === "function" ? nextOpen(previous) : nextOpen;
      if (resolvedOpen) {
        setShowHiddenRecordsTip(false);
        setHiddenPeriodTipTemporarilyDismissed(true);
      }
      return resolvedOpen;
    });
  }, []);

  const handleFilterSelection = useCallback(async (nextKey) => {
    setHiddenPeriodTipTemporarilyDismissed(false);
    setActiveFilterKey(nextKey);
    await setAllFilterKeys(nextKey);
  }, []);

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
    setTimeout(() => setRefreshing(false), 600);
  }, []);

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

  const openAddStatementSelector = () => setAddSheetVisible(true);

  const renderItem = ({ item }) => (
    <View style={styles.rowOuter}>
      <View style={styles.listContainer}>
        <TouchableOpacity
          style={styles.row}
          onPress={() => navigation.navigate("BankStatementDetails", { statement: item })}
        >
          <View style={styles.rowTop}>
            <Text style={styles.rowDate}>{formatDate(new Date(item.date))}</Text>
            <View style={styles.accountWrap}>
              <Text style={styles.statementKindLabel}>
                {item.statementType === "credit" ? "Credit statement" : "Bank statement"}
              </Text>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {item.accountName || (item.statementType === "credit" ? "Credit card" : "Bank statement")}
              </Text>
            </View>
            <Text style={styles.rowNet}>£{Number(item.netMovement || 0).toFixed(2)}</Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#1C1C4E' }]}>
      <StatusBar backgroundColor="#1C1C4E" barStyle="light-content" />
      <View style={[styles.topBar, { paddingTop: 5 }]}> 
        <TouchableOpacity style={styles.topBarButton} onPress={() => setMenuOpen(true)}>
          <Text style={styles.topBarButtonText}>≡</Text>
        </TouchableOpacity>

        <Text style={styles.topBarTitle}>Bank Statements</Text>

        <View style={{ width: 44 }} />
      </View>

      <View style={styles.content}>

        {sortedStatements.length > 0 ? (
          <View style={{ marginTop: 12, marginBottom: 8 }}>
            <View style={styles.headerRow}>
              <TouchableOpacity style={styles.headerDate} onPress={() => toggleSort("date")}>
                <Text style={styles.headerText}>Date</Text>
                <Text style={styles.headerArrow}>{sortIcon("date")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerAccount} onPress={() => toggleSort("accountName")}>
                <Text style={styles.headerText}>Account</Text>
                <Text style={styles.headerArrow}>{sortIcon("accountName")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerNet} onPress={() => toggleSort("netMovement")}>
                <Text style={styles.headerText}>Net</Text>
                <Text style={styles.headerArrow}>{sortIcon("netMovement")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <FlatList
          style={styles.list}
          data={loading ? [] : sortedStatements}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.emptyState}>
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={openAddStatementSelector}
                >
                  <Text style={styles.addButtonText}>Add Statement</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
          contentContainerStyle={[
            { paddingVertical: 10 },
            sortedStatements.length === 0 ? styles.emptyListContent : styles.listContent,
          ]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      </View>

      {filterOpen ? (
        <Pressable
          style={styles.filterDismissOverlay}
          onPress={() => setFilterOpen(false)}
        />
      ) : null}

      {/* Period filter bar — sits just above the bottom tab bar */}
      {!loading && !filterOpen && showHiddenRecordsTip ? (
        <View style={styles.hiddenPeriodTipWrapper} pointerEvents="box-none">
          <View style={styles.hiddenPeriodTipBox}>
            <Text style={styles.hiddenPeriodTipText}>
              You may have records in other periods which are currently not displaying.
            </Text>
            <TouchableOpacity onPress={dismissHiddenRecordsTip}>
              <Text style={styles.hiddenPeriodTipOk}>OK</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.hiddenPeriodTipTriangleDown} />
        </View>
      ) : null}

      {!loading && filterOptions.length > 0 ? (
        <View style={styles.filterBar}>
          <DropDownPicker
            open={filterOpen}
            value={activeFilterKey}
            items={filterItems}
            setOpen={handleSetFilterOpen}
            setValue={(callback) => {
              const nextKey = callback(activeFilterKey);
              handleFilterSelection(nextKey).catch(() => {});
              return nextKey;
            }}
            setItems={setFilterItems}
            listMode="SCROLLVIEW"
            dropDownDirection="TOP"
            style={styles.filterDropdown}
            dropDownContainerStyle={styles.filterDropdownContainer}
            zIndex={3000}
            zIndexInverse={1000}
          />
        </View>
      ) : null}

      <TouchableOpacity
        style={styles.floatingButton}
        onPress={openAddStatementSelector}
      >
        <Text style={styles.floatingButtonText}>+</Text>
      </TouchableOpacity>

      <AddBankStatementSheet
        visible={addSheetVisible}
        onClose={() => setAddSheetVisible(false)}
        navigation={navigation}
      />

      <SideMenu open={menuOpen} onClose={closeMenu}>
        <SharedTabMenu
          navigation={navigation}
          closeMenu={closeMenu}
          displayName={auth.currentUser?.displayName || "User"}
          open={menuOpen}
        />
      </SideMenu>

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
    backgroundColor: '#1C1C4E',
    width: "100%",
    paddingHorizontal: 12,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: Colors.accent,
  },
  topBarButton: {
    width: 52,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  topBarButtonText: {
    fontSize: 32,
    color: "#fff",
  },
  topBarTitle: { fontSize: 18, fontWeight: "700", color: "#fff" },
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
  filterBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#1C1C4E",
    paddingHorizontal: 12,
    paddingVertical: 6,
    zIndex: 1000,
  },
  filterDismissOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 900,
  },
  filterDropdown: {
    borderColor: Colors.border,
    borderRadius: 10,
    backgroundColor: Colors.card,
  },
  filterDropdownContainer: {
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  hiddenPeriodTipWrapper: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 60,
    alignItems: "center",
    zIndex: 1400,
  },
  hiddenPeriodTipBox: {
    backgroundColor: "#F0D1FF",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: "100%",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  hiddenPeriodTipText: {
    color: "#4A148C",
    fontSize: 14,
    lineHeight: 20,
  },
  hiddenPeriodTipOk: {
    marginTop: 8,
    color: "#4A148C",
    fontWeight: "700",
    textAlign: "right",
    textDecorationLine: "underline",
  },
  hiddenPeriodTipTriangleDown: {
    width: 0,
    height: 0,
    backgroundColor: "transparent",
    borderStyle: "solid",
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 15,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#F0D1FF",
  },
  headerDate: { width: 90, flexDirection: "row", gap: 6, alignItems: "center" },
  headerAccount: { flex: 1, flexDirection: "row", gap: 6, alignItems: "center" },
  headerNet: {
    width: 106,
    flexDirection: "row",
    gap: 6,
    justifyContent: "flex-end",
    alignItems: "center",
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
    paddingHorizontal: 14,
    paddingVertical: 11,
    minHeight: 68,
    width: "100%",
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  rowDate: { width: 90, color: Colors.textMuted, fontSize: 14, marginTop: 16 },
  accountWrap: {
    flex: 1,
    paddingRight: 14,
    alignItems: "flex-start",
  },
  statementKindLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
    marginBottom: 2,
    textTransform: "uppercase",
  },
  rowTitle: { color: "#000", fontWeight: "500", fontSize: 14 },
  rowNet: {
    minWidth: 110,
    textAlign: "right",
    color: Colors.accent,
    fontWeight: "700",
    fontSize: 15,
    marginTop: 16,
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
    bottom: 70,
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
  loadingText: { marginTop: 10, color: Colors.textPrimary, fontSize: 16, fontWeight: "600" },
});
