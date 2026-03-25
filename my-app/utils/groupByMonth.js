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

export function groupCashflowByMonth(receipts = [], incomeItems = []) {
  const now = new Date();
  const currentYear = now.getFullYear();

  const fyStartYear = now.getMonth() >= 3 ? currentYear : currentYear - 1;
  const fyStart = new Date(fyStartYear, 3, 1);
  const fyEnd = new Date(fyStartYear + 1, 2, 31);

  const months = Array.from({ length: 12 }, (_, index) => {
    const monthIndex = (index + 3) % 12;
    const label = new Date(2000, monthIndex).toLocaleString("default", {
      month: "short",
    });
    return { key: monthIndex, label, expenseTotal: 0, incomeTotal: 0 };
  });

  receipts.forEach((receipt) => {
    const date = new Date(receipt.date);
    if (date >= fyStart && date <= fyEnd) {
      const monthIndex = (date.getMonth() - 3 + 12) % 12;
      months[monthIndex].expenseTotal += Number(receipt.amount) || 0;
    }
  });

  incomeItems.forEach((incomeItem) => {
    const date = new Date(incomeItem.date);
    if (date >= fyStart && date <= fyEnd) {
      const monthIndex = (date.getMonth() - 3 + 12) % 12;
      months[monthIndex].incomeTotal += Number(incomeItem.amount) || 0;
    }
  });

  return months;
}
