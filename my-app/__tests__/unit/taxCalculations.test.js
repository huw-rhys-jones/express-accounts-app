import {
  calculateCis,
  calculateTaxTotals,
  shouldPromptForVatProfile,
} from "../../utils/taxCalculations";

describe("tax calculations", () => {
  it("keeps legacy VAT records in output VAT", () => {
    const totals = calculateTaxTotals([{ amount: 120, vatAmount: 20 }], [{ amount: 120, vatAmount: 20 }]);
    expect(totals.inputVat).toBe(20);
    expect(totals.outputVat).toBe(20);
  });

  it("excludes domestic reverse charge VAT from output VAT", () => {
    const totals = calculateTaxTotals([], [{ amount: 120, vatAmount: 20, vat: { treatment: "domesticReverseCharge" } }]);
    expect(totals.outputVat).toBe(0);
    expect(totals.reverseChargeVat).toBe(20);
  });

  it("deducts CIS only from labour excluding VAT and materials", () => {
    expect(calculateCis({ grossAmount: 1200, vatAmount: 200, materialsAmount: 300, deductionRate: 20 }))
      .toEqual({ labourAmount: 700, deductionAmount: 140, netPaid: 1060 });
  });

  it("prompts only when VAT setup has not completed", () => {
    expect(shouldPromptForVatProfile({})).toBe(true);
    expect(shouldPromptForVatProfile({ taxProfile: { vat: { setupCompletedAt: "2026-01-01" } } })).toBe(false);
  });
});