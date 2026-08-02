import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import AddReceiptSheet from "../components/AddReceiptSheet";
import { auth, db } from "../firebaseConfig";
import { formatDate } from "../utils/format_style";
import { Colors } from "../utils/sharedStyles";
import { useData } from "../contexts/DataContext";
import DropDownPicker from "react-native-dropdown-picker";
import { doc, writeBatch } from "firebase/firestore";
import {
  buildFinancialFilterOptions,
  filterReceiptsByDateRange,
  getPeriodRecordCount,
  formatPeriodLabelWithCount,
} from "../utils/financialPeriods";
import {
  getIncomeFilterKey,
  setAllFilterKeys,
  getHiddenPeriodTooltipDismissed,
  setHiddenPeriodTooltipDismissed,
} from "../utils/appSettings";

export default function IncomeScreen({ navigation }) {
  const { incomeItems, incomeLoading } = useData();
  const loading = incomeLoading;
  const [refreshing, setRefreshing] = useState(false);
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [menuOpen, setMenuOpen] = useState(false);
  const [addSheetVisible, setAddSheetVisible] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeFilterKey, setActiveFilterKey] = useState("current-quarter");
  const [filterItems, setFilterItems] = useState([]);
  const [showHiddenRecordsTip, setShowHiddenRecordsTip] = useState(false);
  const [hiddenPeriodTipDismissed, setHiddenPeriodTipDismissed] = useState(false);
  const [hiddenPeriodTipTemporarilyDismissed, setHiddenPeriodTipTemporarilyDismissed] = useState(false);

  const filterOptions = useMemo(
    () => buildFinancialFilterOptions(incomeItems, new Date()),
    [incomeItems]
  );

  const activeFilter = useMemo(
    () => filterOptions.find((o) => o.key === activeFilterKey) || filterOptions[0],
    [activeFilterKey, filterOptions]
  );

  const filterCountsByKey = useMemo(() => {
    const counts = {};
    for (const option of filterOptions) {
      counts[option.key] = getPeriodRecordCount(incomeItems, option);
    }
    return counts;
  }, [filterOptions, incomeItems]);

  useEffect(() => {
    setFilterItems(
      filterOptions.map((o) => {
        const count = filterCountsByKey[o.key] ?? 0;
        return {
          label: formatPeriodLabelWithCount(o.label, count, "Income", "Incomes"),
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
    getIncomeFilterKey()
      .then(setActiveFilterKey)
      .catch(() => setActiveFilterKey("current-quarter"));
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener("focus", () => {
      getIncomeFilterKey()
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

  const filteredIncome = useMemo(() => {
    if (!activeFilter) return incomeItems;
    return filterReceiptsByDateRange(
      incomeItems,
      activeFilter.startDate,
      activeFilter.endDate
    );
  }, [activeFilter, incomeItems]);

  const sortedIncome = useMemo(() => {
    const data = [...filteredIncome];
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
  }, [filteredIncome, sortDir, sortKey]);

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

  const clearSelectionMode = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelectedId = useCallback((id) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      if (next.size === 0) {
        setIsSelectionMode(false);
      }
      return next;
    });
  }, []);

  const beginSelectionWithId = useCallback((id) => {
    setIsSelectionMode(true);
    setSelectedIds(new Set([id]));
  }, []);

  const handleBatchDeleteIncome = useCallback(() => {
    if (selectedIds.size === 0) {
      return;
    }

    const idsToDelete = Array.from(selectedIds);
    Alert.alert(
      "Delete Receipts",
      `Are you sure you want to delete ${idsToDelete.length} items?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const batch = writeBatch(db);
            idsToDelete.forEach((id) => {
              batch.delete(doc(db, "income", id));
            });
            await batch.commit();
            clearSelectionMode();
          },
        },
      ],
    );
  }, [clearSelectionMode, selectedIds]);

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

  const renderItem = ({ item }) => {
    const isSelected = selectedIds.has(item.id);
    return (
    <View style={styles.rowOuter}>
      <View
        style={[
          styles.listContainer,
          { width: "98%", marginTop: 0, marginBottom: 5 },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.row,
            { width: "100%", marginBottom: 0 },
            isSelected && styles.selectedRow,
          ]}
          onPress={() => {
            if (isSelectionMode) {
              toggleSelectedId(item.id);
              return;
            }
            const initialIndex = sortedIncome.findIndex((entry) => entry.id === item.id);
            navigation.navigate("IncomeDetails", {
              income: item,
              incomeList: sortedIncome,
              initialIndex: initialIndex >= 0 ? initialIndex : 0,
            });
          }}
          onLongPress={() => beginSelectionWithId(item.id)}
          delayLongPress={220}
        >
          {isSelectionMode ? (
            <View style={[styles.selectionBadge, isSelected && styles.selectionBadgeActive]}>
              <Text style={styles.selectionBadgeText}>{isSelected ? "✓" : ""}</Text>
            </View>
          ) : null}
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
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#1C1C4E' }]}>
      <StatusBar backgroundColor="#1C1C4E" barStyle="light-content" />
      <View style={[styles.topBar, { paddingTop: 5 }]}>
        {isSelectionMode ? (
          <>
            <TouchableOpacity style={styles.topBarButton} onPress={clearSelectionMode}>
              <Text style={styles.topBarButtonText}>✕</Text>
            </TouchableOpacity>

            <Text style={styles.topBarTitle}>{selectedIds.size} selected</Text>

            <TouchableOpacity
              style={[styles.topBarButton, selectedIds.size === 0 && { opacity: 0.4 }]}
              disabled={selectedIds.size === 0}
              onPress={handleBatchDeleteIncome}
            >
              <Text style={styles.topBarButtonText}>🗑</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity style={styles.topBarButton} onPress={() => setMenuOpen(true)}>
              <Text style={styles.topBarButtonText}>≡</Text>
            </TouchableOpacity>

            <Text style={styles.topBarTitle}>Income</Text>

            <View style={{ width: 44 }} />
          </>
        )}
      </View>

      <View style={styles.content}>

        {sortedIncome.length > 0 && !isSelectionMode ? (
          <View style={{ marginTop: 12, marginBottom: 8 }}>{renderHeader()}</View>
        ) : null}

        <FlatList
          style={styles.list}
          data={loading ? [] : sortedIncome}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          extraData={{ isSelectionMode, selectedIds: Array.from(selectedIds).join("|") }}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.emptyState}>
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={() => setAddSheetVisible(true)}
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

      {filterOpen ? (
        <Pressable
          style={styles.filterDismissOverlay}
          onPress={() => setFilterOpen(false)}
        />
      ) : null}

      {/* Period filter bar — sits just above the bottom tab bar */}
      {!isSelectionMode && !loading && !filterOpen && showHiddenRecordsTip ? (
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

      {!isSelectionMode && !loading && filterOptions.length > 0 ? (
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

      {!isSelectionMode && !addSheetVisible && (
        <TouchableOpacity
          style={styles.floatingButton}
          onPress={() => setAddSheetVisible(true)}
        >
          <Text style={styles.floatingButtonText}>+</Text>
        </TouchableOpacity>
      )}

      <AddReceiptSheet
        visible={addSheetVisible}
        onClose={() => setAddSheetVisible(false)}
        navigation={navigation}
        targetScreen="IncomeRecord"
        itemLabel="invoice or proof of income"
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
    position: "relative",
  },
  selectedRow: {
    borderWidth: 2,
    borderColor: Colors.accent,
  },
  selectionBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#999",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  selectionBadgeActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent,
  },
  selectionBadgeText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 14,
  },
  rowDate: { fontSize: 14, color: Colors.textMuted, minWidth: 90 },
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
  loadingText: { marginTop: 10, color: Colors.textPrimary, fontSize: 16 },
});
