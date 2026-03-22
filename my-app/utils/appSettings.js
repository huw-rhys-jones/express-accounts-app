import AsyncStorage from "@react-native-async-storage/async-storage";

const RECEIPT_FILTER_KEY = "@settings:receiptFilterKey";

export async function getReceiptFilterKey() {
  try {
    const value = await AsyncStorage.getItem(RECEIPT_FILTER_KEY);
    return value || "current-quarter";
  } catch {
    return "current-quarter";
  }
}

export async function setReceiptFilterKey(filterKey) {
  await AsyncStorage.setItem(RECEIPT_FILTER_KEY, filterKey || "current-quarter");
}
