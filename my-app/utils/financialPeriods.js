export function startOfDayLocal(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function toDateOrNull(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function getCurrentYearAprilSix(now = new Date()) {
  return new Date(now.getFullYear(), 3, 6);
}

export function getFinancialYearStartYear(date = new Date()) {
  const d = startOfDayLocal(date);
  const aprilSixThisYear = new Date(d.getFullYear(), 3, 6);
  return d >= aprilSixThisYear ? d.getFullYear() : d.getFullYear() - 1;
}

export function getFinancialYearLabel(startYear) {
  const endYearShort = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}/${endYearShort}`;
}

export function getFinancialYearPeriod(startYear) {
  return {
    key: `FY-${startYear}`,
    label: `Financial Year ${getFinancialYearLabel(startYear)}`,
    startDate: new Date(startYear, 3, 6),
    endDate: new Date(startYear + 1, 3, 5),
  };
}

export function getFinancialQuarterPeriods(startYear) {
  return [
    {
      key: `FY-${startYear}-Q1`,
      quarterName: "Q1",
      label: `Q1 ${getFinancialYearLabel(startYear)} (6 Apr - 5 Jul)`,
      startDate: new Date(startYear, 3, 6),
      endDate: new Date(startYear, 6, 5),
    },
    {
      key: `FY-${startYear}-Q2`,
      quarterName: "Q2",
      label: `Q2 ${getFinancialYearLabel(startYear)} (6 Jul - 5 Oct)`,
      startDate: new Date(startYear, 6, 6),
      endDate: new Date(startYear, 9, 5),
    },
    {
      key: `FY-${startYear}-Q3`,
      quarterName: "Q3",
      label: `Q3 ${getFinancialYearLabel(startYear)} (6 Oct - 5 Jan)`,
      startDate: new Date(startYear, 9, 6),
      endDate: new Date(startYear + 1, 0, 5),
    },
    {
      key: `FY-${startYear}-Q4`,
      quarterName: "Q4",
      label: `Q4 ${getFinancialYearLabel(startYear)} (6 Jan - 5 Apr)`,
      startDate: new Date(startYear + 1, 0, 6),
      endDate: new Date(startYear + 1, 3, 5),
    },
  ];
}

export function getCurrentFinancialQuarter(now = new Date()) {
  const fyStartYear = getFinancialYearStartYear(now);
  const day = startOfDayLocal(now);
  const quarters = getFinancialQuarterPeriods(fyStartYear);
  return (
    quarters.find((q) => day >= q.startDate && day <= q.endDate) || quarters[0]
  );
}

export function buildFinancialFilterOptions(receipts = [], now = new Date()) {
  const years = new Set([getFinancialYearStartYear(now)]);

  for (const receipt of receipts) {
    const d = toDateOrNull(receipt?.date);
    if (!d) continue;
    years.add(getFinancialYearStartYear(d));
  }

  const orderedYears = Array.from(years).sort((a, b) => b - a);
  const options = [];

  const currentQuarter = getCurrentFinancialQuarter(now);
  options.push({
    key: "current-quarter",
    label: `Current Financial Quarter (${currentQuarter.quarterName})`,
    startDate: currentQuarter.startDate,
    endDate: currentQuarter.endDate,
  });

  for (const year of orderedYears) {
    const fy = getFinancialYearPeriod(year);
    options.push({
      key: `year-${year}`,
      label: fy.label,
      startDate: fy.startDate,
      endDate: fy.endDate,
    });

    const quarters = getFinancialQuarterPeriods(year);
    for (const quarter of quarters) {
      options.push({
        key: `quarter-${quarter.key}`,
        label: quarter.label,
        startDate: quarter.startDate,
        endDate: quarter.endDate,
      });
    }
  }

  return options;
}

export function filterReceiptsByDateRange(receipts = [], startDate, endDate) {
  if (!startDate || !endDate) return receipts;

  const start = startOfDayLocal(startDate).getTime();
  const end = startOfDayLocal(endDate).getTime();

  return receipts.filter((receipt) => {
    const d = toDateOrNull(receipt?.date);
    if (!d) return false;
    const t = startOfDayLocal(d).getTime();
    return t >= start && t <= end;
  });
}
