const assert = require("node:assert/strict");
const {
  getCurrentUkMtdQuarter,
  getDefaultExportDateRange,
  toLocalYmd,
} = require("./taxQuarter.js");

function d(y, m, day) {
  return new Date(y, m - 1, day);
}

function testCurrentQuarterBoundaries() {
  assert.equal(getCurrentUkMtdQuarter(d(2026, 4, 6)).label, "Q1");
  assert.equal(toLocalYmd(getCurrentUkMtdQuarter(d(2026, 4, 6)).end), "2026-06-05");

  assert.equal(getCurrentUkMtdQuarter(d(2026, 6, 5)).label, "Q1");
  assert.equal(getCurrentUkMtdQuarter(d(2026, 6, 6)).label, "Q2");

  assert.equal(getCurrentUkMtdQuarter(d(2026, 12, 6)).label, "Q5");
  assert.equal(getCurrentUkMtdQuarter(d(2027, 2, 5)).label, "Q5");

  assert.equal(getCurrentUkMtdQuarter(d(2027, 2, 6)).label, "Q6");
  assert.equal(toLocalYmd(getCurrentUkMtdQuarter(d(2027, 2, 6)).end), "2027-04-05");
}

function testDefaultDateRangeUsesCurrentQuarterStart() {
  const range = getDefaultExportDateRange(d(2027, 3, 20));
  assert.equal(range.quarterLabel, "Q6");
  assert.equal(range.startDateYmd, "2027-02-06");
  assert.equal(range.endDateYmd, "2027-03-20");
  assert.equal(range.quarterEndDateYmd, "2027-04-05");
}

function run() {
  testCurrentQuarterBoundaries();
  testDefaultDateRangeUsesCurrentQuarterStart();
  console.log("taxQuarter tests passed");
}

run();
