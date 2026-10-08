(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  root.UkTaxQuarter = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function atStartOfLocalDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function toLocalYmd(date) {
    const localDate = atStartOfLocalDay(date);
    return [
      localDate.getFullYear(),
      pad2(localDate.getMonth() + 1),
      pad2(localDate.getDate()),
    ].join("-");
  }

  function fromYmd(ymd) {
    const [y, m, d] = String(ymd)
      .split("-")
      .map((part) => Number(part));
    return new Date(y, (m || 1) - 1, d || 1);
  }

  function getTaxYearStartYear(referenceDate) {
    const date = atStartOfLocalDay(referenceDate);
    const year = date.getFullYear();
    const thisTaxYearStart = new Date(year, 3, 6); // 6 April
    return date >= thisTaxYearStart ? year : year - 1;
  }

  function buildQuarterRanges(taxYearStartYear) {
    const starts = [
      new Date(taxYearStartYear, 3, 6),
      new Date(taxYearStartYear, 5, 6),
      new Date(taxYearStartYear, 7, 6),
      new Date(taxYearStartYear, 9, 6),
      new Date(taxYearStartYear, 11, 6),
      new Date(taxYearStartYear + 1, 1, 6),
    ];

    return starts.map((start, index) => {
      const nextStart =
        index < starts.length - 1
          ? starts[index + 1]
          : new Date(taxYearStartYear + 1, 3, 6);
      const end = new Date(nextStart);
      end.setDate(end.getDate() - 1);

      return {
        label: "Q" + (index + 1),
        start,
        end,
      };
    });
  }

  function getCurrentUkMtdQuarter(referenceDate) {
    const date = atStartOfLocalDay(referenceDate || new Date());
    const taxYearStartYear = getTaxYearStartYear(date);
    const ranges = buildQuarterRanges(taxYearStartYear);

    const quarter = ranges.find((range) => date >= range.start && date <= range.end);
    if (quarter) {
      return quarter;
    }

    // Defensive fallback: should never happen, but keeps callers safe.
    return ranges[ranges.length - 1];
  }

  function minDate(a, b) {
    return atStartOfLocalDay(a) <= atStartOfLocalDay(b)
      ? atStartOfLocalDay(a)
      : atStartOfLocalDay(b);
  }

  function getDefaultExportDateRange(referenceDate) {
    const today = atStartOfLocalDay(referenceDate || new Date());
    const quarter = getCurrentUkMtdQuarter(today);
    const endDate = minDate(today, quarter.end);

    return {
      quarterLabel: quarter.label,
      startDate: quarter.start,
      endDate,
      quarterEndDate: quarter.end,
      startDateYmd: toLocalYmd(quarter.start),
      endDateYmd: toLocalYmd(endDate),
      quarterEndDateYmd: toLocalYmd(quarter.end),
    };
  }

  return {
    toLocalYmd,
    fromYmd,
    getCurrentUkMtdQuarter,
    getDefaultExportDateRange,
  };
});
