import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
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
import SideMenu from "../components/SideMenu";
import SharedTabMenu from "../components/SharedTabMenu";
import { db, auth } from "../firebaseConfig";
import { PieChart, BarChart } from "react-native-chart-kit";
import MapView, { Polyline } from "react-native-maps";
import polyline from "@mapbox/polyline";
import { groupCashflowByMonth } from "../utils/groupByMonth";
import { Colors, SharedStyles } from "../utils/sharedStyles";
import {
  buildYearScopedFilterOptions,
  buildAllTimeScopedFilterOptions,
  filterReceiptsByDateRange,
} from "../utils/financialPeriods";
import { formatDate, formatCurrency } from "../utils/format_style";
import DropDownPicker from "react-native-dropdown-picker";
import { useData } from "../contexts/DataContext";
import { getSummaryFilterKey, setAllFilterKeys } from "../utils/appSettings";
import { calculateTaxTotals } from "../utils/taxCalculations";

const screenWidth = Dimensions.get("window").width;
const CHART_CARD_WIDTH = screenWidth * 0.9;
const CHART_CARD_PADDING = 20; // matches SharedStyles.chartCard padding
const PIE_CHART_SIZE = Math.max(
  0,
  Math.min(screenWidth * 0.7, CHART_CARD_WIDTH - CHART_CARD_PADDING * 2)
);
const PIE_CHART_PADDING_LEFT = Math.round(PIE_CHART_SIZE * 0.13);
const PIE_CHART_CENTER_X = PIE_CHART_SIZE * 0.12;
const BAR_CHART_HEIGHT = 220;
const Y_AXIS_WIDTH = 46;
const MAP_MIN_DELTA = 0.05;

function decodeMileagePath(routePolyline, startCoordinate, endCoordinate) {
  if (routePolyline) {
    try {
      const decoded = polyline
        .decode(routePolyline)
        .map(([latitude, longitude]) => ({ latitude, longitude }));
      if (decoded.length > 1) return decoded;
    } catch (error) {
      console.warn("Could not decode mileage route polyline", error);
    }
  }

  if (startCoordinate && endCoordinate) {
    return [startCoordinate, endCoordinate];
  }

  return [];
}

export default function SummaryScreen({ navigation }) {
  const {
    receipts,
    incomeItems,
    bankStatements,
    receiptsLoading,
    incomeLoading,
    bankStatementsLoading,
    financialYearScope,
    setFinancialYearScope,
  } = useData();
  const loading = receiptsLoading || incomeLoading || bankStatementsLoading;
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilterKey, setActiveFilterKey] = useState("current-quarter");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterItems, setFilterItems] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [disclaimerModalVisible, setDisclaimerModalVisible] = useState(false);

  const barChartScrollRef = React.useRef(null);
  
  const computeVatFromRate = (amount, rate) => {
    const a = Number(amount);
    const r = Number(rate);
    if (!Number.isFinite(a) || !Number.isFinite(r)) return 0;
    const net = a / (1 + r / 100);
    const vat = a - net;
    return vat;
  };

  const filterOptions = useMemo(
    () => (financialYearScope === "all-time"
      ? buildAllTimeScopedFilterOptions([...receipts, ...incomeItems, ...bankStatements], new Date())
      : buildYearScopedFilterOptions(financialYearScope)),
    [financialYearScope, receipts, incomeItems, bankStatements]
  );

  const activeFilter = useMemo(
    () => filterOptions.find((option) => option.key === activeFilterKey) || filterOptions[0],
    [activeFilterKey, filterOptions]
  );

  useEffect(() => {
    getSummaryFilterKey()
      .then(setActiveFilterKey)
      .catch(() => setActiveFilterKey("current-quarter"));
  }, []);

  useEffect(() => {
    const unsubscribeFocus = navigation.addListener("focus", () => {
      getSummaryFilterKey()
        .then(setActiveFilterKey)
        .catch(() => setActiveFilterKey("current-quarter"));
    });
    return unsubscribeFocus;
  }, [navigation]);

  useEffect(() => {
    const unsubscribeBlur = navigation.addListener("blur", () => {
      setFilterOpen(false);
    });
    return unsubscribeBlur;
  }, [navigation]);

  useEffect(() => {
    if (!activeFilter && filterOptions[0]) {
      setActiveFilterKey(filterOptions[0].key);
    }
  }, [activeFilter, filterOptions]);

  useEffect(() => {
    if (filterOptions.length === 0) {
      return;
    }

    if (!filterOptions.some((option) => option.key === activeFilterKey)) {
      setActiveFilterKey(filterOptions[0].key);
    }

    setFilterItems(filterOptions.map((opt) => ({ label: opt.label, value: opt.key })));
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

  const taxTotals = useMemo(
    () => calculateTaxTotals(filteredReceipts, filteredIncome),
    [filteredReceipts, filteredIncome],
  );

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
    };
  }, [filteredBankStatements, filteredIncome, filteredReceipts]);

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
    setTimeout(() => setRefreshing(false), 600);
  }, []);

  const handleFilterSelection = useCallback(async (nextKey) => {
    setActiveFilterKey(nextKey);
    await setAllFilterKeys(nextKey);
  }, []);

  const closeMenu = () => setMenuOpen(false);

  // ===== Data for charts =====
  const pieData = Object.entries(totals.byCategory).map(([cat, val], i) => ({
    name: cat,
    amount: val,
    color: CHART_COLORS[i % CHART_COLORS.length],
    legendFontColor: "#333",
    legendFontSize: 13,
  }));

  const monthlyData = groupCashflowByMonth(filteredReceipts, filteredIncome, activeFilter?.startDate, activeFilter?.endDate);
  const showYearLabels = new Set(monthlyData.map((month) => month._year)).size > 1;

  const mileageRecords = useMemo(
    () => filteredReceipts.filter((receipt) => receipt.type === "mileage"),
    [filteredReceipts],
  );

  const monthlyMileageData = useMemo(
    () => monthlyData.map((month) => {
      const totalMiles = mileageRecords.reduce((sum, receipt) => {
        const date = new Date(receipt.date);
        if (date.getFullYear() !== month._year || date.getMonth() !== month._month) {
          return sum;
        }
        return sum + (Number(receipt.mileageDetails?.distance) || 0);
      }, 0);
      return {...month, totalMiles};
    }),
    [mileageRecords, monthlyData],
  );

  const mileageTotal = monthlyMileageData.reduce((sum, month) => sum + month.totalMiles, 0);

  const mileageRoutes = useMemo(
    () => mileageRecords
      .map((receipt) => decodeMileagePath(
        receipt.mileageDetails?.routePolyline,
        receipt.mileageDetails?.startCoordinate,
        receipt.mileageDetails?.endCoordinate,
      ))
      .filter((route) => route.length > 1),
    [mileageRecords],
  );

  const mileageRouteRegion = useMemo(() => {
    const points = mileageRoutes.flat();
    if (points.length === 0) return null;

    const latitudes = points.map((point) => point.latitude);
    const longitudes = points.map((point) => point.longitude);
    const minLatitude = Math.min(...latitudes);
    const maxLatitude = Math.max(...latitudes);
    const minLongitude = Math.min(...longitudes);
    const maxLongitude = Math.max(...longitudes);

    return {
      latitude: (minLatitude + maxLatitude) / 2,
      longitude: (minLongitude + maxLongitude) / 2,
      latitudeDelta: Math.max((maxLatitude - minLatitude) * 1.35, MAP_MIN_DELTA),
      longitudeDelta: Math.max((maxLongitude - minLongitude) * 1.35, MAP_MIN_DELTA),
    };
  }, [mileageRoutes]);

  const getFinancialYearLabelForMonth = (month) => {
    const startYear = month._month >= 3 ? month._year : month._year - 1;
    return `FY ${startYear}/${String(startYear + 1).slice(-2)}`;
  };

  // Build nice Y axis ticks
  const monthlyTotals = monthlyData.flatMap((month) => [
    Number(month.expenseTotal) || 0,
    Number(month.incomeTotal) || 0,
  ]);
  const { yTicks } = getYAxisTicks(monthlyTotals, 5);

  const showGrossIncomeRow = Number(totals.incomeTotal) > 0;
  const showExpensesRow = Number(totals.overall) > 0;
  const showCisRow = Number(taxTotals.cisWithheld) > 0;
  const netIncome = Number((totals.incomeTotal - taxTotals.cisWithheld).toFixed(2)) || 0;
  const showNetIncomeRow = showGrossIncomeRow && showCisRow;

  // UK personal allowance, frozen through the 2027/28 tax year — used only for
  // a rough estimate; the disclaimer makes clear this is not tax advice.
  const PERSONAL_ALLOWANCE = 12570;
  const BASIC_RATE = 0.2;

  const showTaxEstimateSection = showGrossIncomeRow || showExpensesRow || showCisRow;
  const netTaxableProfit = Number((totals.incomeTotal - totals.overall).toFixed(2)) || 0;
  const taxableProfit = Math.max(0, Number((netTaxableProfit - PERSONAL_ALLOWANCE).toFixed(2)));
  const estimatedTaxOwed = Number((taxableProfit * BASIC_RATE).toFixed(2));
  const cisAlreadyPaid = Number(taxTotals.cisWithheld.toFixed(2)) || 0;
  const taxBalance = Number((estimatedTaxOwed - cisAlreadyPaid).toFixed(2));
  const isTaxRebate = taxBalance <= 0;

  const summarySections = [
    {
      title: "Income",
      navTarget: "Income",
      rows: [
        showGrossIncomeRow ? { label: "Gross Income", value: totals.incomeTotal, tone: "income" } : null,
        showCisRow ? { label: "CIS Tax Withheld", value: -taxTotals.cisWithheld, tone: "expense" } : null,
        showNetIncomeRow ? { label: "Net Income Received", value: netIncome, tone: "income" } : null,
      ].filter(Boolean),
    },
    {
      title: "Expenses",
      navTarget: "Expenses",
      rows: [
        showExpensesRow ? { label: "Total Expenses", value: -totals.overall, tone: "expense" } : null,
      ].filter(Boolean),
    },
    {
      title: "Tax Position Estimate",
      rows: showTaxEstimateSection ? [
        { label: "Net Taxable Profit", value: netTaxableProfit, tone: netTaxableProfit >= 0 ? "income" : "expense" },
        { label: "Less Personal Allowance", value: -PERSONAL_ALLOWANCE, tone: "expense" },
        { label: "Taxable Profit", value: taxableProfit, tone: "neutral", divider: true, emphasis: true },
        { label: "Estimated Tax Owed (20%)", value: estimatedTaxOwed, tone: "expense", spacing: true },
        { label: "Less CIS Tax Already Paid", value: -cisAlreadyPaid, tone: "expense" },
        isTaxRebate
          ? { label: "Estimated Tax Rebate", value: Math.abs(taxBalance), tone: "income", divider: true, emphasis: true }
          : { label: "Estimated Tax Owed", value: -taxBalance, tone: "expense", divider: true, emphasis: true },
      ] : [],
    },
  ].filter((section) => section.rows.length > 0);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: '#1C1C4E' }]}
      edges={["top", "left", "right"]}
    >
      <StatusBar backgroundColor="#1C1C4E" barStyle="light-content" />
      <View style={[styles.topBar, { paddingTop: 5 }]}> 
        <TouchableOpacity style={styles.topBarButton} onPress={() => setMenuOpen(true)}>
          <Text style={styles.topBarButtonText}>≡</Text>
        </TouchableOpacity>

        <Text style={styles.topBarTitle}>Summary</Text>

        <View style={{ width: 44 }} />
      </View>

      {filterOpen ? (
        <Pressable
          style={styles.filterDismissOverlay}
          onPress={() => setFilterOpen(false)}
        />
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#a60d49" />
          <Text style={{ marginTop: 10 }}>Loading summary…</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {/* Summary totals card */}
          <View style={[styles.card, { zIndex: 10, overflow: "visible" }]}>
            {summarySections.map((section, sectionIndex) => {
              const SectionWrapper = section.navTarget ? TouchableOpacity : View;
              const wrapperProps = section.navTarget
                ? { activeOpacity: 0.7, onPress: () => navigation.navigate(section.navTarget) }
                : {};
              return (
                <SectionWrapper
                  key={section.title}
                  style={[
                    styles.summarySection,
                    sectionIndex > 0 ? styles.summarySectionDivider : null,
                  ]}
                  {...wrapperProps}
                >
                  <Text style={styles.summarySectionTitle}>{section.title}</Text>
                  {section.rows.map((row) => {
                    const isPositive = Number(row.value) >= 0;
                    const valueText = formatCurrency(Math.abs(Number(row.value) || 0));
                    const toneStyle =
                      row.tone === "income"
                        ? styles.summaryRowIncome
                        : row.tone === "expense"
                          ? styles.summaryRowExpense
                          : styles.summaryRowNeutral;

                    return (
                      <View
                        key={row.label}
                        style={[
                          styles.summaryRow,
                          row.divider ? styles.summaryRowDivider : null,
                          row.spacing ? styles.summaryRowSpacing : null,
                        ]}
                      >
                        <Text style={[styles.summaryLabel, toneStyle, row.emphasis ? styles.summaryRowEmphasis : null]}>
                          {row.label}
                        </Text>
                        <Text style={[styles.summaryValue, toneStyle, row.emphasis ? styles.summaryRowEmphasis : null]}>
                          {isPositive ? valueText : `-${valueText}`}
                        </Text>
                      </View>
                    );
                  })}
                </SectionWrapper>
              );
            })}
            <TouchableOpacity
              onPress={() => setDisclaimerModalVisible(true)}
              style={styles.disclaimerRow}
              accessibilityRole="button"
              accessibilityLabel="View disclaimer details"
            >
              <Text style={styles.disclaimerText}>
                These values are estimates based on the information you have provided. Final values must be reviewed and calculated by a qualified accountant.
              </Text>
            </TouchableOpacity>
          </View>
          {/* Monthly bar chart card */}
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Monthly Income vs Spending</Text>
            <Text style={styles.chartSubtitle}>{activeFilter?.label || "Current Financial Quarter"}</Text>
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
                    {formatCurrency(t)}
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
                  {monthlyData.map((month, index) => {
                    const topTick = yTicks[yTicks.length - 1] || 1;
                    const expenseHeight = Math.max(
                      0,
                      (Number(month.expenseTotal) || 0) / topTick
                    ) * BAR_CHART_HEIGHT;
                    const incomeHeight = Math.max(
                      0,
                      (Number(month.incomeTotal) || 0) / topTick
                    ) * BAR_CHART_HEIGHT;

                    const showFinancialYearMarker =
                      showYearLabels &&
                      month._month === 3 &&
                      index > 0;

                    return (
                      <View key={`${month._year}-${month._month}`} style={styles.cashflowMonthColumn}>
                        {showFinancialYearMarker ? (
                          <Text style={styles.financialYearMarker}>{getFinancialYearLabelForMonth(month)}</Text>
                        ) : <Text style={styles.financialYearMarkerSpacer}> </Text>}
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
                        {showYearLabels ? (
                          <Text style={styles.cashflowYearLabel}>'{String(month._year).slice(-2)}</Text>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
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
                        {d.name}: {formatCurrency(d.amount)}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <Text style={styles.noData}>No receipts yet!</Text>
            )}
          </View>

          {/* Separate panels for bank and credit card statements */}
          {[
            { type: "bank", label: "Bank Statements" },
            { type: "credit", label: "Credit Card Statements" },
          ].map(({ type, label }) => {
            const stmts = filteredBankStatements.filter((s) => s.statementType === type);
            if (stmts.length === 0) return null;

            const moneyIn = stmts.reduce((sum, s) => sum + (Number(s.moneyInTotal) || 0), 0);
            const moneyOut = stmts.reduce((sum, s) => sum + (Number(s.moneyOutTotal) || 0), 0);

            const vendorMap = {};
            for (const s of stmts) {
              for (const vt of s.vendorTotals || []) {
                if (vt.moneyOut > 0) vendorMap[vt.vendor] = (vendorMap[vt.vendor] || 0) + vt.moneyOut;
              }
            }
            const topVendors = Object.entries(vendorMap)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 8)
              .map(([vendor, total], i) => ({
                name: vendor,
                population: Number(total.toFixed(2)),
                color: CHART_COLORS[i % CHART_COLORS.length],
                legendFontColor: "#333",
                legendFontSize: 13,
              }));

            const maxCashflow = Math.max(moneyIn, moneyOut, 1);

            return (
              <View key={type} style={styles.statementSection}>
                {(moneyIn > 0 || moneyOut > 0) && (
                  <View style={styles.chartCard}>
                    <Text style={styles.chartTitle}>{label} – Cash Flow</Text>
                    {[
                      { label: "Money In", value: moneyIn, color: "#4ade80" },
                      { label: "Money Out", value: moneyOut, color: "#f87171" },
                    ].map((row) => (
                      <View key={row.label} style={{ marginVertical: 6, alignSelf: "stretch" }}>
                        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 3 }}>
                          <Text style={{ width: 90, fontSize: 13, color: Colors.textSecondary }}>{row.label}</Text>
                          <Text style={{ fontSize: 13, fontWeight: "700", color: row.color }}>{formatCurrency(row.value)}</Text>
                        </View>
                        <View style={{ height: 22, backgroundColor: "#e8e8e8", borderRadius: 4, overflow: "hidden", width: "100%" }}>
                          <View style={{ height: "100%", width: `${(row.value / maxCashflow) * 100}%`, backgroundColor: row.color, borderRadius: 4 }} />
                        </View>
                      </View>
                    ))}
                  </View>
                )}
                {topVendors.length > 0 && (
                  <View style={styles.chartCard}>
                    <Text style={styles.chartTitle}>{label} – Top Vendor Spending</Text>
                    <View style={styles.pieChartWrapper}>
                      <PieChart
                        data={topVendors}
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
                      {topVendors.map((d) => (
                        <View key={d.name} style={styles.legendItem}>
                          <View style={[styles.legendDot, { backgroundColor: d.color }]} />
                          <Text style={styles.legendText}>{d.name}: {formatCurrency(d.population)}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            );
          })}

          <View style={styles.summaryPill}>
            <View style={styles.pillHeaderRow}>
              <Text style={styles.pillTitle}>Mileage</Text>
              <Text style={styles.pillTotal}>{mileageTotal.toFixed(2)} mi</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mileageMonthScroller}>
              {monthlyMileageData.map((month) => (
                <View key={`mileage-${month._year}-${month._month}`} style={styles.mileageMonthPill}>
                  <Text style={styles.mileageMonthLabel}>{month.label}{showYearLabels ? ` '${String(month._year).slice(-2)}` : ""}</Text>
                  <Text style={styles.mileageMonthValue}>{month.totalMiles.toFixed(1)}</Text>
                </View>
              ))}
            </ScrollView>
          </View>

          <View style={styles.summaryPill}>
            <View style={styles.pillHeaderRow}>
              <Text style={styles.pillTitle}>Mileage Heat Map</Text>
              <Text style={styles.pillMeta}>{mileageRoutes.length} route{mileageRoutes.length === 1 ? "" : "s"}</Text>
            </View>
            {mileageRouteRegion ? (
              <MapView style={styles.mileageHeatMap} region={mileageRouteRegion} scrollEnabled={false} rotateEnabled={false}>
                {mileageRoutes.map((route, index) => (
                  <Polyline
                    key={`mileage-route-${index}`}
                    coordinates={route}
                    strokeColor="rgba(166, 13, 73, 0.36)"
                    strokeWidth={6}
                  />
                ))}
              </MapView>
            ) : (
              <Text style={styles.noData}>Add mileage routes with start and end locations to build the map.</Text>
            )}
          </View>
        </ScrollView>
      )}

      {!loading && filterOptions.length > 0 ? (
        <View style={styles.filterBar}>
          <DropDownPicker
            open={filterOpen}
            value={activeFilterKey}
            items={filterItems}
            setOpen={setFilterOpen}
            setValue={(callback) => {
              const nextKey = callback(activeFilterKey);
              handleFilterSelection(nextKey).catch(() => {});
              return nextKey;
            }}
            setItems={setFilterItems}
            listMode="SCROLLVIEW"
            dropDownDirection="TOP"
            maxHeight={filterItems.length * 48 + 12}
            style={styles.filterDropdown}
            dropDownContainerStyle={styles.filterDropdownContainer}
            textStyle={styles.filterDropdownText}
            zIndex={3000}
            zIndexInverse={1000}
          />
        </View>
      ) : null}

      <SideMenu open={menuOpen} onClose={closeMenu}>
        <SharedTabMenu
          navigation={navigation}
          closeMenu={closeMenu}
          displayName={auth.currentUser?.displayName || "User"}
          open={menuOpen}
          onFinancialYearScopeChange={(scope, filterKey) => {
            setFinancialYearScope(scope);
            setActiveFilterKey(filterKey);
          }}
        />
      </SideMenu>

      <Modal
        visible={disclaimerModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDisclaimerModalVisible(false)}
      >
        <Pressable
          style={styles.disclaimerModalOverlay}
          onPress={() => setDisclaimerModalVisible(false)}
        >
          <Pressable style={styles.disclaimerModalCard} onPress={() => {}}>
            <Text style={styles.disclaimerModalTitle}>Please Note</Text>
            <Text style={styles.disclaimerModalText}>
              These values are estimates based on the information you have provided. Final values must be reviewed and calculated by a qualified accountant.
            </Text>
            <TouchableOpacity
              onPress={() => setDisclaimerModalVisible(false)}
              style={styles.disclaimerModalButton}
            >
              <Text style={styles.disclaimerModalButtonText}>Got it</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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
  filterDismissOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 900,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    ...SharedStyles.content,
    flexGrow: 1,
    paddingTop: 5,
    paddingBottom: 76,
  },
  card: {
    ...SharedStyles.card,
    marginTop: 10,
    paddingTop: 11,
    backgroundColor: Colors.surface,
  },
  title: SharedStyles.title,
  subtitle: SharedStyles.subtitle,
  activeFilterText: {
    marginTop: 8,
    textAlign: "center",
    color: Colors.textPrimary,
    fontSize: 13,
    lineHeight: 18,
  },
  subtitleVat: { fontSize: 15, color: Colors.textPrimary },
  subtitleIncome: { fontSize: 15, color: "#2e7d32", marginTop: 6 },
  subtitleNet: { fontSize: 15, color: Colors.textPrimary, marginTop: 6 },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    minHeight: 28,
    marginVertical: 2,
  },
  summaryRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    marginTop: 6,
    paddingTop: 8,
  },
  summaryRowSpacing: {
    marginTop: 10,
  },
  summaryRowEmphasis: {
    fontSize: 16,
    fontWeight: "800",
  },
  summarySection: {
    width: "100%",
    paddingVertical: 6,
  },
  summarySectionDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    marginTop: 6,
    paddingTop: 12,
  },
  summarySectionTitle: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  summaryLabel: {
    flex: 1,
    fontSize: 15,
    textAlign: "left",
    paddingRight: 8,
  },
  summaryValue: {
    flex: 1,
    fontSize: 15,
    textAlign: "right",
  },
  summaryRowIncome: {
    color: "#2e7d32",
  },
  summaryRowExpense: {
    color: "#d32f2f",
  },
  summaryRowNeutral: {
    color: Colors.textPrimary,
  },
  disclaimerRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    marginTop: 12,
    paddingTop: 10,
  },
  disclaimerText: {
    color: "#777",
    fontSize: 11,
    fontStyle: "italic",
    lineHeight: 15,
    textAlign: "center",
  },
  disclaimerModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  disclaimerModalCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 400,
  },
  disclaimerModalTitle: {
    color: Colors.textPrimary,
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 10,
  },
  disclaimerModalText: {
    color: Colors.textPrimary,
    fontSize: 15,
    lineHeight: 21,
  },
  disclaimerModalButton: {
    alignSelf: "flex-end",
    backgroundColor: Colors.accent,
    borderRadius: 10,
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  disclaimerModalButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  filterDropdown: {
    backgroundColor: Colors.card,
    borderColor: Colors.border,
    borderRadius: 10,
  },
  filterDropdownContainer: {
    backgroundColor: Colors.card,
    borderColor: Colors.border,
  },
  filterDropdownText: {
    fontSize: 13,
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
  chartCard: { ...SharedStyles.chartCard, overflow: "visible" },
  statementSection: {
    width: "100%",
    alignItems: "center",
  },
  chartTitle: { fontSize: 16, fontWeight: "bold", marginBottom: 3, textAlign: "center", color: "black" },
  chartSubtitle: {
    color: "#555",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 12,
    textAlign: "center",
  },
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
  summaryPill: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    marginTop: 12,
    padding: 14,
    width: CHART_CARD_WIDTH,
  },
  pillHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  pillTitle: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: "800",
  },
  pillTotal: {
    color: Colors.accent,
    fontSize: 17,
    fontWeight: "800",
  },
  pillMeta: {
    color: "#555",
    fontSize: 12,
    fontWeight: "700",
  },
  mileageMonthScroller: {
    gap: 8,
    paddingRight: 4,
  },
  mileageMonthPill: {
    alignItems: "center",
    backgroundColor: "#f4f4f8",
    borderRadius: 12,
    minWidth: 64,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  mileageMonthLabel: {
    color: "#555",
    fontSize: 12,
    fontWeight: "700",
  },
  mileageMonthValue: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 3,
  },
  mileageHeatMap: {
    borderRadius: 12,
    height: 190,
    width: "100%",
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
    height: BAR_CHART_HEIGHT + 58,
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
  cashflowYearLabel: {
    marginTop: 1,
    fontSize: 11,
    color: Colors.textMuted,
  },
  financialYearMarker: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.accent,
    marginBottom: 4,
  },
  financialYearMarkerSpacer: {
    fontSize: 10,
    marginBottom: 4,
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
