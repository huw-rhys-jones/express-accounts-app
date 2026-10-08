import {
  getFinancialYearStartYear,
  getFinancialYearLabel,
  getFinancialYearPeriod,
  getFinancialQuarterPeriods,
  getCurrentFinancialQuarter,
  filterReceiptsByDateRange,
  buildFinancialFilterOptions,
  startOfDayLocal,
  toDateOrNull,
} from '../../utils/financialPeriods';

// ---------------------------------------------------------------------------
// startOfDayLocal
// ---------------------------------------------------------------------------
describe('startOfDayLocal', () => {
  it('returns midnight of the given date in local time', () => {
    const d = new Date(2025, 2, 15, 14, 30, 0); // 15 Mar 2025 14:30
    const result = startOfDayLocal(d);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(2);
    expect(result.getDate()).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// toDateOrNull
// ---------------------------------------------------------------------------
describe('toDateOrNull', () => {
  it('parses a valid ISO date string', () => {
    const d = toDateOrNull('2025-06-01');
    expect(d).not.toBeNull();
    expect(d.getFullYear()).toBe(2025);
  });

  it('returns null for an invalid date string', () => {
    expect(toDateOrNull('not-a-date')).toBeNull();
  });

  it('handles a Date object passed directly', () => {
    const input = new Date(2025, 5, 1);
    const result = toDateOrNull(input);
    expect(result).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getFinancialYearStartYear
// ---------------------------------------------------------------------------
describe('getFinancialYearStartYear', () => {
  it('returns the current year when the date is on or after 6 April', () => {
    expect(getFinancialYearStartYear(new Date(2025, 3, 6))).toBe(2025); // 6 Apr 2025
    expect(getFinancialYearStartYear(new Date(2025, 11, 31))).toBe(2025); // 31 Dec 2025
  });

  it('returns the previous year when the date is before 6 April', () => {
    expect(getFinancialYearStartYear(new Date(2025, 3, 5))).toBe(2024); // 5 Apr 2025
    expect(getFinancialYearStartYear(new Date(2025, 0, 1))).toBe(2024); // 1 Jan 2025
  });

  it('uses the current date when no argument is passed', () => {
    const result = getFinancialYearStartYear();
    expect(typeof result).toBe('number');
    expect(result).toBeGreaterThan(2020);
  });
});

// ---------------------------------------------------------------------------
// getFinancialYearLabel
// ---------------------------------------------------------------------------
describe('getFinancialYearLabel', () => {
  it('formats the label as YYYY/YY', () => {
    expect(getFinancialYearLabel(2025)).toBe('2025/26');
    expect(getFinancialYearLabel(2024)).toBe('2024/25');
    expect(getFinancialYearLabel(2099)).toBe('2099/00');
  });
});

// ---------------------------------------------------------------------------
// getFinancialYearPeriod
// ---------------------------------------------------------------------------
describe('getFinancialYearPeriod', () => {
  const fy = getFinancialYearPeriod(2025);

  it('has the correct key and label', () => {
    expect(fy.key).toBe('FY-2025');
    expect(fy.label).toBe('Financial Year 2025/26');
  });

  it('starts on 6 April of the given year', () => {
    expect(fy.startDate.getFullYear()).toBe(2025);
    expect(fy.startDate.getMonth()).toBe(3); // April (0-indexed)
    expect(fy.startDate.getDate()).toBe(6);
  });

  it('ends on 5 April of the following year', () => {
    expect(fy.endDate.getFullYear()).toBe(2026);
    expect(fy.endDate.getMonth()).toBe(3); // April (0-indexed)
    expect(fy.endDate.getDate()).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// getFinancialQuarterPeriods
// ---------------------------------------------------------------------------
describe('getFinancialQuarterPeriods', () => {
  const quarters = getFinancialQuarterPeriods(2025);

  it('returns 4 quarters', () => {
    expect(quarters).toHaveLength(4);
  });

  it('assigns correct quarter names', () => {
    expect(quarters.map(q => q.quarterName)).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
  });

  it('Q1 starts on 6 Apr and ends on 5 Jul', () => {
    const q1 = quarters[0];
    expect(q1.startDate).toEqual(new Date(2025, 3, 6));
    expect(q1.endDate).toEqual(new Date(2025, 6, 5));
  });

  it('Q4 starts on 6 Jan and ends on 5 Apr of the following year', () => {
    const q4 = quarters[3];
    expect(q4.startDate).toEqual(new Date(2026, 0, 6));
    expect(q4.endDate).toEqual(new Date(2026, 3, 5));
  });

  it('covers no gaps: each quarter starts the day after the previous ends', () => {
    for (let i = 1; i < quarters.length; i++) {
      const prevEnd = quarters[i - 1].endDate;
      const nextStart = quarters[i].startDate;
      const gapDays =
        (nextStart.getTime() - prevEnd.getTime()) / (1000 * 60 * 60 * 24);
      expect(gapDays).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
// getCurrentFinancialQuarter
// ---------------------------------------------------------------------------
describe('getCurrentFinancialQuarter', () => {
  it('returns Q1 for a date in May', () => {
    const q = getCurrentFinancialQuarter(new Date(2025, 4, 15)); // 15 May 2025
    expect(q.quarterName).toBe('Q1');
  });

  it('returns Q2 for a date in August', () => {
    const q = getCurrentFinancialQuarter(new Date(2025, 7, 1)); // 1 Aug 2025
    expect(q.quarterName).toBe('Q2');
  });

  it('returns Q3 for a date in November', () => {
    const q = getCurrentFinancialQuarter(new Date(2025, 10, 1)); // 1 Nov 2025
    expect(q.quarterName).toBe('Q3');
  });

  it('returns Q4 for a date in February', () => {
    const q = getCurrentFinancialQuarter(new Date(2026, 1, 1)); // 1 Feb 2026
    expect(q.quarterName).toBe('Q4');
  });
});

// ---------------------------------------------------------------------------
// filterReceiptsByDateRange
// ---------------------------------------------------------------------------
describe('filterReceiptsByDateRange', () => {
  const receipts = [
    { id: '1', date: '2025-04-10' }, // FY2025 Q1
    { id: '2', date: '2025-07-01' }, // FY2025 Q2
    { id: '3', date: '2024-12-25' }, // FY2024 Q3
    { id: '4', date: '2026-03-31' }, // FY2025 Q4
    { id: '5', date: 'bad-date' },   // invalid – should be excluded
  ];

  it('returns all receipts when no dates provided', () => {
    expect(filterReceiptsByDateRange(receipts)).toHaveLength(5);
  });

  it('filters to receipts within FY2025 (6 Apr 2025 – 5 Apr 2026)', () => {
    const { startDate, endDate } = getFinancialYearPeriod(2025);
    const result = filterReceiptsByDateRange(receipts, startDate, endDate);
    expect(result.map(r => r.id)).toEqual(['1', '2', '4']);
  });

  it('excludes receipts with invalid dates', () => {
    const { startDate, endDate } = getFinancialYearPeriod(2025);
    const result = filterReceiptsByDateRange(receipts, startDate, endDate);
    expect(result.find(r => r.id === '5')).toBeUndefined();
  });

  it('returns an empty array when no receipts fall in range', () => {
    const start = new Date(2020, 0, 1);
    const end = new Date(2020, 11, 31);
    expect(filterReceiptsByDateRange(receipts, start, end)).toHaveLength(0);
  });

  it('is inclusive of boundary dates', () => {
    const start = new Date(2025, 3, 10); // exactly 10 Apr 2025
    const end = new Date(2025, 3, 10);
    const result = filterReceiptsByDateRange(receipts, start, end);
    expect(result.map(r => r.id)).toEqual(['1']);
  });
});

// ---------------------------------------------------------------------------
// buildFinancialFilterOptions
// ---------------------------------------------------------------------------
describe('buildFinancialFilterOptions', () => {
  it('includes a current-quarter option as the first entry', () => {
    const options = buildFinancialFilterOptions([], new Date(2025, 4, 15));
    expect(options[0].key).toBe('current-quarter');
  });

  it('derives financial years from receipt dates', () => {
    const receipts = [
      { date: '2023-06-01' }, // FY2023
      { date: '2025-08-01' }, // FY2025
    ];
    const now = new Date(2025, 4, 15);
    const options = buildFinancialFilterOptions(receipts, now);
    const yearKeys = options.filter(o => o.key.startsWith('year-')).map(o => o.key);
    expect(yearKeys).toContain('year-2025');
    expect(yearKeys).toContain('year-2023');
  });
});
