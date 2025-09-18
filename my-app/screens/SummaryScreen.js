import React, { useState, useEffect, useCallback } from "react";
import {
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

const screenWidth = Dimensions.get("window").width;
const BAR_CHART_HEIGHT = 220;
const Y_AXIS_WIDTH = 46;

export default function SummaryScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [receipts, setReceipts] = useState([]);
  const [totals, setTotals] = useState({ overall: 0, byCategory: {} });

  const fetchReceipts = useCallback(async () => {
    try {
      const user = auth.currentUser;
      if (!user) {
        setReceipts([]);
        setTotals({ overall: 0, byCategory: {} });
        return;
      }

      const q = query(collection(db, "receipts"), where("userId", "==", user.uid));
      const querySnapshot = await getDocs(q);
      const userReceipts = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setReceipts(userReceipts);

      // Calculate totals
      let overall = 0;
      const byCategory = {};
      for (const r of userReceipts) {
        overall += r.amount;
        byCategory[r.category] = (byCategory[r.category] || 0) + r.amount;
      }
      setTotals({ overall, byCategory });
    } catch (err) {
      console.error("Error fetching receipts for summary:", err);
    }
  }, []);

  useEffect(() => {
    fetchReceipts().finally(() => setLoading(false));

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

  // ===== Data for charts =====
  const pieData = Object.entries(totals.byCategory).map(([cat, val], i) => ({
    name: cat,
    amount: val,
    color: CHART_COLORS[i % CHART_COLORS.length],
    legendFontColor: "#333",
    legendFontSize: 13,
  }));

  const monthlyData = groupReceiptsByMonth(receipts);

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
            <Text style={styles.subtitle}>
              Total Spent: £{totals.overall.toFixed(2)}
            </Text>
          </View>

          {/* Pie chart card */}
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Spending by Category</Text>
            {pieData.length > 0 ? (
              <PieChart
                data={pieData.map((d) => ({
                  name: d.name,
                  population: Number(d.amount.toFixed(2)),
                  color: d.color,
                  legendFontColor: d.legendFontColor,
                  legendFontSize: d.legendFontSize,
                }))}
                width={screenWidth - 40}
                height={250}
                chartConfig={chartConfig}
                accessor="population"
                backgroundColor="transparent"
                paddingLeft="10"
                absolute
              />
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
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingRight: 12 }}
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
  "#a60d49", "#302C66", "#1C1C4E", "#FF8C00", "#008080", "#4682B4", "#556B2F",
];

const chartConfig = {
  backgroundGradientFrom: "#fff",
  backgroundGradientTo: "#fff",
  color: (opacity = 1) => `rgba(49, 46, 116, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(0,0,0,${opacity})`,
};

// ===== Styles =====
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#302C66" },
  content: { alignItems: "center", paddingBottom: 40 },
  card: {
    backgroundColor: "#E5E5EA",
    width: "85%",
    padding: 22,
    borderRadius: 20,
    marginTop: 40,
    alignItems: "center",
  },
  title: { fontSize: 20, fontWeight: "bold", color: "#1C1C4E" },
  subtitle: { fontSize: 17, color: "#a60d49", marginTop: 14 },
  chartCard: {
    marginTop: 30,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    width: "90%",
    overflow: "hidden",
  },
  chartTitle: { fontSize: 16, fontWeight: "bold", marginBottom: 12 },
  noData: { fontSize: 15, color: "#666", marginTop: 10, textAlign: "center" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
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
