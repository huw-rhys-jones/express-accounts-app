export const VAT_TREATMENTS = {
  STANDARD: "standard",
  DOMESTIC_REVERSE_CHARGE: "domesticReverseCharge",
  LEGACY: "legacy",
};

export function getVatAmount(entry) {
  const explicitVat = Number(entry?.vatAmount);
  if (Number.isFinite(explicitVat)) return explicitVat;

  const amount = Number(entry?.amount);
  const rate = Number(entry?.vatRate);
  if (!Number.isFinite(amount) || !Number.isFinite(rate) || rate <= 0) return 0;
  return amount - amount / (1 + rate / 100);
}

export function getVatTreatment(entry) {
  return entry?.vat?.treatment || entry?.vatTreatment || VAT_TREATMENTS.LEGACY;
}

export function isVatRegistered(profile) {
  return profile?.taxProfile?.vat?.isRegistered === true;
}

export function shouldPromptForVatProfile(profile) {
  return !profile?.taxProfile?.vat?.setupCompletedAt;
}

export function calculateCis({ grossAmount, vatAmount, materialsAmount, deductionRate }) {
  const gross = Number(grossAmount) || 0;
  const vat = Math.max(0, Number(vatAmount) || 0);
  const materials = Math.max(0, Number(materialsAmount) || 0);
  const rate = Math.max(0, Number(deductionRate) || 0);
  const labourAmount = Math.max(0, gross - vat - materials);
  const deductionAmount = Number((labourAmount * rate / 100).toFixed(2));
  return {
    labourAmount: Number(labourAmount.toFixed(2)),
    deductionAmount,
    netPaid: Number((gross - deductionAmount).toFixed(2)),
  };
}

export function calculateTaxTotals(receipts = [], incomeItems = []) {
  const inputVat = receipts.reduce((total, receipt) => total + getVatAmount(receipt), 0);
  return incomeItems.reduce(
    (totals, income) => {
      const amount = Number(income?.amount) || 0;
      const vat = getVatAmount(income);
      const cisDeduction = Number(income?.cis?.deductionAmount) || 0;
      const treatment = getVatTreatment(income);
      totals.grossIncome += amount;
      totals.netIncomeExcludingVat += amount - vat;
      totals.cisWithheld += cisDeduction;
      totals.netIncomeReceived += amount - cisDeduction;
      totals.netIncomeAfterCis += amount - vat - cisDeduction;
      if (treatment === VAT_TREATMENTS.STANDARD || treatment === VAT_TREATMENTS.LEGACY) {
        totals.outputVat += vat;
      }
      if (treatment === VAT_TREATMENTS.DOMESTIC_REVERSE_CHARGE) {
        totals.reverseChargeVat += vat;
      }
      return totals;
    },
    {
      inputVat,
      outputVat: 0,
      reverseChargeVat: 0,
      grossIncome: 0,
      netIncomeExcludingVat: 0,
      cisWithheld: 0,
      netIncomeReceived: 0,
      netIncomeAfterCis: 0,
    },
  );
}