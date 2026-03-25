import AsyncStorage from "@react-native-async-storage/async-storage";

const RECEIPT_FILTER_KEY = "@settings:receiptFilterKey";
const INCOME_FILTER_KEY = "@settings:incomeFilterKey";
const BANK_FILTER_KEY = "@settings:bankFilterKey";

async function getFilterKey(storageKey) {
  try {
    const value = await AsyncStorage.getItem(storageKey);
    return value || "current-quarter";
  } catch {
    return "current-quarter";
  }
}

async function setFilterKey(storageKey, filterKey) {
  await AsyncStorage.setItem(storageKey, filterKey || "current-quarter");
}

export async function getReceiptFilterKey() {
  return getFilterKey(RECEIPT_FILTER_KEY);
}

export async function setReceiptFilterKey(filterKey) {
  await setFilterKey(RECEIPT_FILTER_KEY, filterKey);
}

export async function getIncomeFilterKey() {
  return getFilterKey(INCOME_FILTER_KEY);
}

export async function setIncomeFilterKey(filterKey) {
  await setFilterKey(INCOME_FILTER_KEY, filterKey);
}

export async function getBankFilterKey() {
  return getFilterKey(BANK_FILTER_KEY);
}

export async function setBankFilterKey(filterKey) {
  await setFilterKey(BANK_FILTER_KEY, filterKey);
}
