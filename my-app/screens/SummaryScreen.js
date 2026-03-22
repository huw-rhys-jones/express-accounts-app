import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Platform,
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Dimensions,
  ScrollView,
  RefreshControl,
} from "react-native";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db, auth } from "../firebaseConfig";
import { PieChart, BarChart } from "react-native-chart-kit";
import { groupReceiptsByMonth } from "../utils/groupByMonth";
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
  const [activeFilterKey, setActiveFilterKey] = useState("current-quarter");

  const barChartScrollRef = React.useRef(null);
  
  const computeVatFromRate = (amount, rate) => {
    const a = Number(amount);
    const r = Number(rate);
    if (!Number.isFinite(a) || !Number.isFinite(r)) return 0;
    const net = a / (1 + r / 100);
    const vat = a - net;
    return vat;
  };

  const fetchReceipts = useCallback(async () => {
    try {
      const user = auth.currentUser;
      if (!user) {
        setReceipts([]);
        return;
      }

      const q = query(collection(db, "receipts"), where("userId", "==", user.uid));
      const querySnapshot = await getDocs(q);
      const userReceipts = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setReceipts(userReceipts);
    } catch (err) {
      console.error("Error fetching receipts for summary:", err);
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

  const totals = useMemo(() => {
    let overall = 0;
    let totalVat = 0;
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

    return { overall, byCategory, totalVat };
  }, [filteredReceipts]);

  useEffect(() => {
    fetchReceipts().finally(() => setLoading(false));

    const unsubscribeFocus = navigation.addListener("focus", () => {
      fetchReceipts().catch((e) => console.error("Refresh on focus failed", e));
    });
    return unsubscribeFocus;
  }, [navigation, fetchReceipts]);

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
      await fetchReceipts();
    } finally {
      setRefreshing(false);
    }
  }, [fetchReceipts]);

  // ===== Data for charts =====
  const pieData = Object.entries(totals.byCategory).map(([cat, val], i) => ({
    name: cat,
    amount: val,
    color: CHART_COLORS[i % CHART_COLORS.length],
    legendFontColor: "#333",
    legendFontSize: 13,
  }));

  const monthlyData = groupReceiptsByMonth(filteredReceipts);

  // Build nice Y axis ticks
  const monthlyTotals = monthlyData.map((m) => Number(m.total) || 0);
  const { yTicks } = getYAxisTicks(monthlyTotals, 5);

  return (
    <SafeAreaView style={styles.container}>
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
            <Text style={styles.chartTitle}>Monthly Spending (Current FY)</Text>
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
                <BarChart
                  data={{
                    labels: monthlyData.map((m) => m.label),
                    datasets: [{ data: monthlyData.map((m) => m.total) }],
                  }}
                  width={Math.max(
                    (screenWidth - 40) - Y_AXIS_WIDTH,
                    monthlyData.length * 80
                  )}
                  height={BAR_CHART_HEIGHT}
                  fromZero
                  withHorizontalLabels={false}
                  chartConfig={{
                    backgroundGradientFrom: "#fff",
                    backgroundGradientTo: "#fff",
                    decimalPlaces: 2,
                    color: (opacity = 1) => `rgba(166, 13, 73, ${opacity})`,
                    labelColor: (opacity = 1) => `rgba(0,0,0,${opacity})`,
                  }}
                  style={styles.barChart}
                />
              </ScrollView>
            </View>
          </View>
        </ScrollView>
      )}
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
  content: {
  ...SharedStyles.content,
  paddingTop: Platform.OS === 'android' ? 50 : 10, // Add explicit padding for the status bar
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
});
