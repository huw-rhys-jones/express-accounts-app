import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Alert,
  Platform,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { collection, query, where, getDocs } from "firebase/firestore";
import SideMenu from "../components/SideMenu";
import SharedTabMenu from "../components/SharedTabMenu";
import { db, auth } from "../firebaseConfig";
import { PieChart, BarChart } from "react-native-chart-kit";
import { groupCashflowByMonth } from "../utils/groupByMonth";
import { Colors, SharedStyles } from "../utils/sharedStyles";
import {
  buildFinancialFilterOptions,
  filterReceiptsByDateRange,
} from "../utils/financialPeriods";
import { formatDate } from "../utils/format_style";
import { getReceiptFilterKey } from "../utils/appSettings";

const screenWidth = Dimensions.get("window").width;
const CHART_CARD_WIDTH = screenWidth * 0.9;
const CHART_CARD_PADDING = 15;
const PIE_CHART_SIZE = Math.max(
  0,
  Math.min(screenWidth * 0.7, CHART_CARD_WIDTH - CHART_CARD_PADDING * 2)
);
const PIE_CHART_PADDING_LEFT = Math.round(PIE_CHART_SIZE * 0.13);
const PIE_CHART_CENTER_X = PIE_CHART_SIZE * 0.12;
const BAR_CHART_HEIGHT = 220;
const Y_AXIS_WIDTH = 46;

export default function SummaryScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [receipts, setReceipts] = useState([]);
  const [incomeItems, setIncomeItems] = useState([]);
  const [bankStatements, setBankStatements] = useState([]);
  const [activeFilterKey, setActiveFilterKey] = useState("current-quarter");
  const [menuOpen, setMenuOpen] = useState(false);

  const barChartScrollRef = React.useRef(null);
  
  const computeVatFromRate = (amount, rate) => {
    const a = Number(amount);
    const r = Number(rate);
    if (!Number.isFinite(a) || !Number.isFinite(r)) return 0;
    const net = a / (1 + r / 100);
    const vat = a - net;
    return vat;
  };

  const fetchSummaryData = useCallback(async () => {
    try {
      const user = auth.currentUser;
      if (!user) {
        setReceipts([]);
        setIncomeItems([]);
        setBankStatements([]);
        return;
      }

      const [receiptSnapshot, incomeSnapshot, bankSnapshot] = await Promise.all([
        getDocs(query(collection(db, "receipts"), where("userId", "==", user.uid))),
        getDocs(query(collection(db, "income"), where("userId", "==", user.uid))),
        getDocs(
          query(collection(db, "bankStatements"), where("userId", "==", user.uid))
        ),
      ]);

      const userReceipts = receiptSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      const userIncome = incomeSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      const userStatements = bankSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setReceipts(userReceipts);
      setIncomeItems(userIncome);
      setBankStatements(userStatements);
    } catch (err) {
      console.error("Error fetching summary data:", err);
    }
  }, []);

  const filterOptions = useMemo(
    () => buildFinancialFilterOptions(receipts, new Date()),
    [receipts]
  );

  const activeFilter = useMemo(
    () => filterOptions.find((option) => option.key === activeFilterKey) || filterOptions[0],
    [activeFilterKey, filterOptions]
  );

  useEffect(() => {
    if (!activeFilter && filterOptions[0]) {
      setActiveFilterKey(filterOptions[0].key);
    }
  }, [activeFilter, filterOptions]);

  useEffect(() => {
    getReceiptFilterKey()
      .then(setActiveFilterKey)
      .catch(() => setActiveFilterKey("current-quarter"));

    const unsubscribeFocus = navigation.addListener("focus", () => {
      getReceiptFilterKey()
        .then(setActiveFilterKey)
        .catch(() => setActiveFilterKey("current-quarter"));
    });

    return unsubscribeFocus;
  }, [navigation]);

  useEffect(() => {
    if (filterOptions.length === 0) {
      return;
    }

    if (!filterOptions.some((option) => option.key === activeFilterKey)) {
      setActiveFilterKey(filterOptions[0].key);
    }
  }, [activeFilterKey, filterOptions]);

  const filteredReceipts = useMemo(() => {
    if (!activeFilter) return receipts;
    return filterReceiptsByDateRange(
      receipts,
      activeFilter.startDate,
      activeFilter.endDate
    );
  }, [activeFilter, receipts]);

  const filteredIncome = useMemo(() => {
    if (!activeFilter) return incomeItems;
    return filterReceiptsByDateRange(
      incomeItems,
      activeFilter.startDate,
      activeFilter.endDate
    );
  }, [activeFilter, incomeItems]);

  const filteredBankStatements = useMemo(() => {
    if (!activeFilter) return bankStatements;
    return filterReceiptsByDateRange(
      bankStatements,
      activeFilter.startDate,
      activeFilter.endDate
    );
  }, [activeFilter, bankStatements]);

  const totals = useMemo(() => {
    let overall = 0;
    let totalVat = 0;
    let incomeTotal = 0;
    let bankMoneyIn = 0;
    let bankMoneyOut = 0;
    const byCategory = {};

    for (const receipt of filteredReceipts) {
      const amount = Number(receipt.amount) || 0;
      overall += amount;
      const category = receipt.category || "Uncategorized";
      byCategory[category] = (byCategory[category] || 0) + amount;

      if (receipt.vatAmount != null && !Number.isNaN(Number(receipt.vatAmount))) {
        totalVat += Number(receipt.vatAmount);
      } else if (receipt.vatRate != null && !Number.isNaN(Number(receipt.vatRate))) {
        totalVat += computeVatFromRate(amount, receipt.vatRate);
      }
    }

    for (const incomeItem of filteredIncome) {
      incomeTotal += Number(incomeItem.amount) || 0;
    }

    for (const statement of filteredBankStatements) {
      bankMoneyIn += Number(statement.moneyInTotal) || 0;
      bankMoneyOut += Number(statement.moneyOutTotal) || 0;
    }

    return {
      overall,
      byCategory,
      totalVat,
      incomeTotal,
      bankMoneyIn,
      bankMoneyOut,
      netPosition: incomeTotal - overall,
    };
  }, [filteredBankStatements, filteredIncome, filteredReceipts]);

  useEffect(() => {
    fetchSummaryData().finally(() => setLoading(false));

    const unsubscribeFocus = navigation.addListener("focus", () => {
      fetchSummaryData().catch((e) => console.error("Refresh on focus failed", e));
    });
    return unsubscribeFocus;
  }, [navigation, fetchSummaryData]);

  useEffect(() => {
  if (!loading && monthlyData.length > 0) {
    // Small timeout ensures the layout has calculated widths before scrolling
    setTimeout(() => {
      barChartScrollRef.current?.scrollToEnd({ animated: true });
    }, 500);
  }
  }, [loading, monthlyData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchSummaryData();
    } finally {
      setRefreshing(false);
    }
  }, [fetchSummaryData]);

  const closeMenu = () => setMenuOpen(false);

  // ===== Data for charts =====
  const pieData = Object.entries(totals.byCategory).map(([cat, val], i) => ({
    name: cat,
    amount: val,
    color: CHART_COLORS[i % CHART_COLORS.length],
    legendFontColor: "#333",
    legendFontSize: 13,
  }));

  const monthlyData = groupCashflowByMonth(filteredReceipts, filteredIncome);

  // Build nice Y axis ticks
  const monthlyTotals = monthlyData.flatMap((month) => [
    Number(month.expenseTotal) || 0,
    Number(month.incomeTotal) || 0,
  ]);
  const { yTicks } = getYAxisTicks(monthlyTotals, 5);

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.topBar, { paddingTop: 5 }]}> 
        <TouchableOpacity style={styles.topBarButton} onPress={() => setMenuOpen(true)}>
          <Text style={styles.topBarButtonText}>≡</Text>
        </TouchableOpacity>

        <Text style={styles.topBarTitle}>Summary</Text>

        <View style={{ width: 44 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#a60d49" />
          <Text style={{ marginTop: 10 }}>Loading summary…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {/* Summary totals card */}
          <View style={styles.card}>
            <Text style={styles.title}>Summary</Text>
            {activeFilter ? (
              <Text style={styles.activeFilterText}>
                Showing data for {activeFilter.label}: {formatDate(activeFilter.startDate)} to {formatDate(activeFilter.endDate)}.
              </Text>
            ) : null}
            <Text style={styles.subtitle}>
              Total Spent: £{totals.overall.toFixed(2)}
            </Text>
            <Text style={styles.subtitleVat}>
              Total VAT: £{totals.totalVat.toFixed(2)}
            </Text>
            <Text style={styles.subtitleIncome}>
              Total Income: £{totals.incomeTotal.toFixed(2)}
            </Text>
            <Text style={styles.subtitleIncome}>
              Net Position: £{totals.netPosition.toFixed(2)}
            </Text>
            <Text style={styles.subtitleBank}>
              Bank In / Out: £{totals.bankMoneyIn.toFixed(2)} / £{totals.bankMoneyOut.toFixed(2)}
            </Text>
          </View>
          {/* Pie chart card */}
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Spending by Category</Text>
            {pieData.length > 0 ? (
              <>
                <View style={styles.pieChartWrapper}>
                  <PieChart
                    data={pieData.map((d) => ({
                      name: d.name,
                      population: Number(d.amount.toFixed(2)),
                      color: d.color,
                      legendFontColor: d.legendFontColor,
                      legendFontSize: d.legendFontSize,
                    }))}
                    width={PIE_CHART_SIZE}
                    height={PIE_CHART_SIZE}
                    chartConfig={chartConfig}
                    accessor="population"
                    backgroundColor="transparent"
                    paddingLeft={PIE_CHART_PADDING_LEFT}
                    absolute
                    hasLegend={false}
                    center={[PIE_CHART_CENTER_X, 0]}
                    style={styles.pieChart}
                  />
                </View>
                <View style={styles.legendContainer}>
                  {pieData.map((d) => (
                    <View key={d.name} style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: d.color }]} />
                      <Text style={styles.legendText}>
                        {d.name}: £{Number(d.amount).toFixed(2)}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <Text style={styles.noData}>No receipts yet!</Text>
            )}
          </View>

          {/* Monthly bar chart card */}
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Monthly Income vs Spending (Current FY)</Text>
            <View style={styles.cashflowLegendRow}>
              <View style={styles.cashflowLegendItem}>
                <View style={[styles.cashflowLegendSwatch, styles.expenseSwatch]} />
                <Text style={styles.cashflowLegendText}>Expenses</Text>
              </View>
              <View style={styles.cashflowLegendItem}>
                <View style={[styles.cashflowLegendSwatch, styles.incomeSwatch]} />
                <Text style={styles.cashflowLegendText}>Income</Text>
              </View>
            </View>
            <View style={styles.chartRow}>
              {/* Fixed Y axis */}
              <View style={styles.yAxis}>
                {yTicks.slice().reverse().map((t, i) => (
                  <Text key={i} style={styles.yAxisLabel}>
                    £{t.toFixed(0)}
                  </Text>
                ))}
              </View>

              {/* Scrollable bars */}
              <ScrollView
                horizontal
                ref={barChartScrollRef} // <-- Attach ref here
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingRight: 12 }}
                nestedScrollEnabled={true}
                onContentSizeChange={() => barChartScrollRef.current?.scrollToEnd({ animated: false })}
              >
                <View style={styles.cashflowChartArea}>
                  {monthlyData.map((month) => {
                    const topTick = yTicks[yTicks.length - 1] || 1;
                    const expenseHeight = Math.max(
                      0,
                      (Number(month.expenseTotal) || 0) / topTick
                    ) * BAR_CHART_HEIGHT;
                    const incomeHeight = Math.max(
                      0,
                      (Number(month.incomeTotal) || 0) / topTick
                    ) * BAR_CHART_HEIGHT;

                    return (
                      <View key={month.label} style={styles.cashflowMonthColumn}>
                        <View style={styles.cashflowBarsRow}>
                          <View style={styles.singleBarWrap}>
                            <View
                              style={[
                                styles.cashflowBar,
                                styles.expenseBar,
                                { height: expenseHeight || 2 },
                              ]}
                            />
                          </View>
                          <View style={styles.singleBarWrap}>
                            <View
                              style={[
                                styles.cashflowBar,
                                styles.incomeBar,
                                { height: incomeHeight || 2 },
                              ]}
                            />
                          </View>
                        </View>
                        <Text style={styles.cashflowMonthLabel}>{month.label}</Text>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          </View>
        </ScrollView>
      )}

      <SideMenu open={menuOpen} onClose={closeMenu}>
        <SharedTabMenu
          navigation={navigation}
          closeMenu={closeMenu}
          displayName={auth.currentUser?.displayName || "User"}
        />
      </SideMenu>
    </SafeAreaView>
  );
}

// ===== Helper for nice Y ticks =====
function getYAxisTicks(values = [], numTicks = 5) {
  const max = Math.max(0, ...values);
  if (max === 0) {
    return { yTicks: Array.from({ length: numTicks }, (_, i) => i * 1), yMax: numTicks - 1 };
  }
  const rawStep = max / (numTicks - 1);
  const pow10 = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const niceSteps = [1, 2, 2.5, 5, 10].map((s) => s * pow10);
  const step = niceSteps.find((s) => s >= rawStep) || niceSteps[niceSteps.length - 1];
  const yMax = step * (numTicks - 1);
  const yTicks = Array.from({ length: numTicks }, (_, i) => i * step);
  return { yTicks, yMax };
}

// ===== Config =====
const CHART_COLORS = [
  Colors.accent,
  Colors.background,
  Colors.textPrimary,
  "#FF8C00",
  "#008080",
  "#4682B4",
  "#556B2F",
];

const chartConfig = {
  backgroundGradientFrom: Colors.surface,
  backgroundGradientTo: Colors.surface,
  color: (opacity = 1) => `rgba(49, 46, 116, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(0,0,0,${opacity})`,
};

// ===== Styles =====
const styles = StyleSheet.create({
  container: SharedStyles.screen,
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
  content: {
  ...SharedStyles.content,
  paddingTop: 10,
  paddingBottom: 40, 
},
  card: SharedStyles.card,
  title: SharedStyles.title,
  subtitle: SharedStyles.subtitle,
  activeFilterText: {
    marginTop: 8,
    textAlign: "center",
    color: Colors.textPrimary,
    fontSize: 13,
    lineHeight: 18,
  },
  subtitleVat: { fontSize: 16, color: Colors.textPrimary, marginTop: 6 },
  subtitleIncome: { fontSize: 16, color: Colors.textPrimary, marginTop: 6 },
  subtitleBank: { fontSize: 15, color: Colors.textMuted, marginTop: 6 },
  chartCard: { ...SharedStyles.chartCard, overflow: "visible" },
  chartTitle: { fontSize: 16, fontWeight: "bold", marginBottom: 12, textAlign: "center", color: "black" },
  noData: { fontSize: 15, color: "#666", marginTop: 10, textAlign: "center" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  legendContainer: {
    marginTop: 12,
    width: "100%",
    alignItems: "center",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    maxWidth: "90%",
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  legendText: {
    fontSize: 13,
    color: "#333",
    flexShrink: 1,
  },
  pieChartWrapper: {
    width: "100%",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  pieChart: {
    alignSelf: "center",
  },
  chartRow: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  cashflowLegendRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
    marginBottom: 10,
  },
  cashflowLegendItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  cashflowLegendSwatch: {
    width: 12,
    height: 12,
    borderRadius: 3,
    marginRight: 6,
  },
  expenseSwatch: {
    backgroundColor: Colors.accent,
  },
  incomeSwatch: {
    backgroundColor: "#2a7b46",
  },
  cashflowLegendText: {
    fontSize: 13,
    color: Colors.textPrimary,
  },
  yAxis: {
    width: Y_AXIS_WIDTH,
    height: BAR_CHART_HEIGHT,
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingRight: 6,
  },
  yAxisLabel: {
    fontSize: 12,
    color: "#333",
  },
  barChart: {
    marginLeft: 4,
    borderRadius: 12,
  },
  cashflowChartArea: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: BAR_CHART_HEIGHT + 28,
    marginLeft: 8,
  },
  cashflowMonthColumn: {
    width: 68,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  cashflowBarsRow: {
    height: BAR_CHART_HEIGHT,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 8,
  },
  singleBarWrap: {
    width: 18,
    height: BAR_CHART_HEIGHT,
    justifyContent: "flex-end",
  },
  cashflowBar: {
    width: 18,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  expenseBar: {
    backgroundColor: Colors.accent,
  },
  incomeBar: {
    backgroundColor: "#2a7b46",
  },
  cashflowMonthLabel: {
    marginTop: 8,
    fontSize: 12,
    color: Colors.textPrimary,
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
  menuButton: {
    backgroundColor: "#f4d7e4",
    paddingVertical: 12,
    borderRadius: 24,
    alignItems: "center",
  },
  menuButtonText: {
    color: Colors.textPrimary,
    fontWeight: "700",
  },
  footerContainer: {
    marginTop: "auto",
    paddingBottom: Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 16 : 24,
  },
  redButton: {
    backgroundColor: "#b00020",
    paddingVertical: 12,
    borderRadius: 24,
    alignItems: "center",
  },
  redButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
});
