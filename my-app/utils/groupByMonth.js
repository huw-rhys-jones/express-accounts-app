// utils/groupByMonth.js
export function groupReceiptsByMonth(receipts) {
  if (!receipts?.length) return [];

  const now = new Date();
  const currentYear = now.getFullYear();

  // UK financial year starts in April
  const fyStartYear = now.getMonth() >= 3 ? currentYear : currentYear - 1;
  const fyStart = new Date(fyStartYear, 3, 1); // April 1
  const fyEnd = new Date(fyStartYear + 1, 2, 31); // March 31 next year

  // Initialise buckets for Apr → Mar
  const months = Array.from({ length: 12 }, (_, i) => {
    const monthIndex = (i + 3) % 12; // start from April
    const label = new Date(2000, monthIndex).toLocaleString("default", { month: "short" });
    return { key: monthIndex, label, total: 0 };
  });

  receipts.forEach((r) => {
    const d = new Date(r.date); // parse receipt date
    if (d >= fyStart && d <= fyEnd) {
      const m = d.getMonth();
      const idx = (m - 3 + 12) % 12; // shift so Apr=0, Mar=11
      months[idx].total += Number(r.amount) || 0;
    }
  });

  return months;
}

export function groupCashflowByMonth(receipts = [], incomeItems = [], startDate = null, endDate = null) {
  const now = new Date();
  const currentYear = now.getFullYear();

  const fyStartYear = now.getMonth() >= 3 ? currentYear : currentYear - 1;
  const fyStart = startDate ? new Date(startDate) : new Date(fyStartYear, 3, 1);
  const fyEnd = endDate ? new Date(endDate) : new Date(fyStartYear + 1, 2, 31);

  // Build month buckets only for months within the range
  const months = [];
  const cursor = new Date(fyStart.getFullYear(), fyStart.getMonth(), 1);
  const rangeEnd = new Date(fyEnd.getFullYear(), fyEnd.getMonth(), 1);
  while (cursor <= rangeEnd) {
    months.push({
      key: cursor.getMonth(),
      label: cursor.toLocaleString("default", { month: "short" }),
      expenseTotal: 0,
      incomeTotal: 0,
      _year: cursor.getFullYear(),
      _month: cursor.getMonth(),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  receipts.forEach((receipt) => {
    const date = new Date(receipt.date);
    if (date >= fyStart && date <= fyEnd) {
      const bucket = months.find((m) => m._year === date.getFullYear() && m._month === date.getMonth());
      if (bucket) bucket.expenseTotal += Number(receipt.amount) || 0;
    }
  });

  incomeItems.forEach((incomeItem) => {
    const date = new Date(incomeItem.date);
    if (date >= fyStart && date <= fyEnd) {
      const bucket = months.find((m) => m._year === date.getFullYear() && m._month === date.getMonth());
      if (bucket) bucket.incomeTotal += Number(incomeItem.amount) || 0;
    }
  });

  return months;
}
