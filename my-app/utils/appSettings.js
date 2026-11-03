import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";

const RECEIPT_FILTER_KEY = "@settings:receiptFilterKey";
const INCOME_FILTER_KEY = "@settings:incomeFilterKey";
const BANK_FILTER_KEY = "@settings:bankFilterKey";
const SUMMARY_FILTER_KEY = "@settings:summaryFilterKey";
const FINANCIAL_YEAR_SCOPE_KEY = "@settings:financialYearScope";

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

export async function getFinancialYearScope() {
  try {
    const value = await AsyncStorage.getItem(FINANCIAL_YEAR_SCOPE_KEY);
    return value === "all-time" ? "all-time" : (value ? Number(value) : null);
  } catch {
    return null;
  }
}

export async function setFinancialYearScope(startYear) {
  await AsyncStorage.setItem(FINANCIAL_YEAR_SCOPE_KEY, String(startYear ?? "all-time"));
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

export async function getSummaryFilterKey() {
  return getFilterKey(SUMMARY_FILTER_KEY);
}

export async function setSummaryFilterKey(filterKey) {
  await setFilterKey(SUMMARY_FILTER_KEY, filterKey);
}

const ADD_SHEET_TOOLTIP_SEEN_KEY = "@settings:addSheetTooltipSeen";
const HIDDEN_PERIOD_TOOLTIP_DISMISSED_KEY = "@settings:hiddenPeriodTooltipDismissed";
const ANNOTATE_IMAGES_KEY = "@settings:annotateImages";

export async function getAddSheetTooltipSeen() {
  try {
    const value = await AsyncStorage.getItem(ADD_SHEET_TOOLTIP_SEEN_KEY);
    return value === "true";
  } catch {
    return false;
  }
}

export async function setAddSheetTooltipSeen() {
  try {
    await AsyncStorage.setItem(ADD_SHEET_TOOLTIP_SEEN_KEY, "true");
  } catch {
    // ignore
  }
}

export async function getHiddenPeriodTooltipDismissed() {
  try {
    const value = await AsyncStorage.getItem(HIDDEN_PERIOD_TOOLTIP_DISMISSED_KEY);
    return value === "true";
  } catch {
    return false;
  }
}

export async function setHiddenPeriodTooltipDismissed() {
  try {
    await AsyncStorage.setItem(HIDDEN_PERIOD_TOOLTIP_DISMISSED_KEY, "true");
  } catch {
    // ignore
  }
}

export async function getAnnotateImages() {
  try {
    const value = await AsyncStorage.getItem(ANNOTATE_IMAGES_KEY);
    return value == null ? true : value === "true";
  } catch {
    return true;
  }
}

export async function setAnnotateImages(enabled) {
  try {
    await AsyncStorage.setItem(ANNOTATE_IMAGES_KEY, enabled ? "true" : "false");
  } catch {
    // ignore
  }
}

const MILEAGE_OPTION_SEEN_KEY = "@settings:mileageOptionSeen";

export async function getMileageOptionSeen() {
  try {
    const value = await AsyncStorage.getItem(MILEAGE_OPTION_SEEN_KEY);
    return value === "true";
  } catch {
    return false;
  }
}

export async function setMileageOptionSeen() {
  try {
    await AsyncStorage.setItem(MILEAGE_OPTION_SEEN_KEY, "true");
  } catch {
    // ignore
  }
}

// ── Vehicles ──────────────────────────────────────────────────────────────────
// Vehicles belong to the USER, not the device: the source of truth is the
// `vehicles` array on the Firestore document users/{uid}. AsyncStorage is kept
// only as an offline cache (and as the origin of the one-off migration of
// vehicles that were previously held on the device alone).
const VEHICLES_CLOUD_TIMEOUT_MS = 6000;
const VEHICLES_MEMORY_TTL_MS = 30000;

const vehiclesCacheKey = (uid) => (uid ? `@settings:vehicles:${uid}` : "@settings:vehicles");
const vehiclesPendingKey = (uid) => `@settings:vehiclesPendingSync:${uid}`;
const vehiclesMigratedKey = (uid) => `@settings:vehiclesCloudMigrated:${uid}`;

let vehiclesMemory = { uid: null, vehicles: null, fetchedAt: 0 };
let vehiclesInFlight = { uid: null, promise: null };

function lastUsedVehicleKey() {
  const uid = auth.currentUser?.uid;
  return uid ? `@settings:lastUsedVehicleId:${uid}` : "@settings:lastUsedVehicleId";
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("Timed out")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Firestore rejects `undefined` values, so strip them before writing.
function cleanVehicles(vehicles) {
  return JSON.parse(JSON.stringify(Array.isArray(vehicles) ? vehicles : []));
}

async function readCachedVehicles(uid) {
  try {
    const raw = await AsyncStorage.getItem(vehiclesCacheKey(uid));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeCachedVehicles(uid, vehicles) {
  try {
    await AsyncStorage.setItem(vehiclesCacheKey(uid), JSON.stringify(vehicles));
  } catch {
    // cache only – ignore
  }
}

async function pushVehiclesToCloud(uid, vehicles) {
  await withTimeout(
    setDoc(
      doc(db, "users", uid),
      { vehicles: cleanVehicles(vehicles), updatedAt: serverTimestamp() },
      { merge: true }
    ),
    VEHICLES_CLOUD_TIMEOUT_MS
  );
  await AsyncStorage.removeItem(vehiclesPendingKey(uid)).catch(() => {});
}

const vehicleIdentity = (vehicle) =>
  String(vehicle?.registrationNumber || vehicle?.id || "").trim().toUpperCase();

// Union by registration number (cloud entries win), used once per device when
// vehicles that only existed on this device need to join the account's list.
function mergeVehicles(cloudVehicles, deviceVehicles) {
  const merged = [...cloudVehicles];
  const known = new Set(cloudVehicles.map(vehicleIdentity));
  deviceVehicles.forEach((vehicle) => {
    const identity = vehicleIdentity(vehicle);
    if (identity && !known.has(identity)) {
      known.add(identity);
      merged.push(vehicle);
    }
  });
  return merged;
}

async function loadVehiclesForUser(uid) {
  const cached = await readCachedVehicles(uid);

  try {
    // A previous save that never reached the cloud (e.g. offline) wins.
    const pending = await AsyncStorage.getItem(vehiclesPendingKey(uid));
    if (pending === "1") {
      await pushVehiclesToCloud(uid, cached);
      await AsyncStorage.setItem(vehiclesMigratedKey(uid), "1").catch(() => {});
      return cached;
    }

    const snap = await withTimeout(getDoc(doc(db, "users", uid)), VEHICLES_CLOUD_TIMEOUT_MS);
    const cloud = snap.exists() ? snap.data()?.vehicles : undefined;
    const migrated = (await AsyncStorage.getItem(vehiclesMigratedKey(uid)).catch(() => null)) === "1";

    if (Array.isArray(cloud)) {
      let result = cloud;
      if (!migrated && cached.length) {
        // First sync on this device: keep any vehicles that only lived here.
        result = mergeVehicles(cloud, cached);
        if (result.length !== cloud.length) {
          await pushVehiclesToCloud(uid, result);
        }
      }
      await AsyncStorage.setItem(vehiclesMigratedKey(uid), "1").catch(() => {});
      await writeCachedVehicles(uid, result);
      return result;
    }

    // Nothing in the cloud yet: upload the vehicles this device already had.
    if (cached.length) {
      await pushVehiclesToCloud(uid, cached);
    }
    await AsyncStorage.setItem(vehiclesMigratedKey(uid), "1").catch(() => {});
    return cached;
  } catch (error) {
    // Offline / timeout / permission problem: fall back to the local cache.
    console.warn("[vehicles] cloud sync unavailable, using cached list", error?.message || error);
    return cached;
  }
}

export async function getVehicles() {
  const uid = auth.currentUser?.uid;
  if (!uid) return readCachedVehicles(null);

  if (
    vehiclesMemory.uid === uid &&
    vehiclesMemory.vehicles &&
    Date.now() - vehiclesMemory.fetchedAt < VEHICLES_MEMORY_TTL_MS
  ) {
    return vehiclesMemory.vehicles;
  }

  if (vehiclesInFlight.uid === uid && vehiclesInFlight.promise) {
    return vehiclesInFlight.promise;
  }

  const promise = loadVehiclesForUser(uid)
    .then((vehicles) => {
      vehiclesMemory = { uid, vehicles, fetchedAt: Date.now() };
      return vehicles;
    })
    .finally(() => {
      if (vehiclesInFlight.promise === promise) {
        vehiclesInFlight = { uid: null, promise: null };
      }
    });
  vehiclesInFlight = { uid, promise };
  return promise;
}

export async function setVehicles(vehicles) {
  const uid = auth.currentUser?.uid;
  const next = cleanVehicles(vehicles);

  if (!uid) {
    await writeCachedVehicles(null, next);
    return;
  }

  vehiclesMemory = { uid, vehicles: next, fetchedAt: Date.now() };
  await writeCachedVehicles(uid, next);

  try {
    await pushVehiclesToCloud(uid, next);
    await AsyncStorage.setItem(vehiclesMigratedKey(uid), "1").catch(() => {});
  } catch (error) {
    // Keep the change locally and retry on the next getVehicles().
    console.warn("[vehicles] could not save to cloud, will retry", error?.message || error);
    await AsyncStorage.setItem(vehiclesPendingKey(uid), "1").catch(() => {});
  }
}

export async function getLastUsedVehicleId() {
  try {
    return await AsyncStorage.getItem(lastUsedVehicleKey());
  } catch {
    return null;
  }
}

export async function setLastUsedVehicleId(id) {
  try {
    await AsyncStorage.setItem(lastUsedVehicleKey(), id);
  } catch {
    // ignore
  }
}

/**
 * Write the same filter key to all screens at once.
 * Use this when changing the period from Settings or Summary so every
 * screen picks up the new value on its next focus event.
 */
export async function setAllFilterKeys(filterKey) {
  await Promise.all([
    setFilterKey(RECEIPT_FILTER_KEY, filterKey),
    setFilterKey(INCOME_FILTER_KEY, filterKey),
    setFilterKey(BANK_FILTER_KEY, filterKey),
    setFilterKey(SUMMARY_FILTER_KEY, filterKey),
  ]);
}

