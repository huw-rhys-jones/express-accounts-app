const mockGetDoc = jest.fn();
const mockSetDoc = jest.fn();

jest.mock("../../firebaseConfig");
jest.mock("firebase/firestore", () => ({
  doc: (_db, collection, id) => ({ path: `${collection}/${id}` }),
  getDoc: (...args) => mockGetDoc(...args),
  setDoc: (...args) => mockSetDoc(...args),
  serverTimestamp: () => "SERVER_TS",
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { auth } from "../../firebaseConfig";
import { getVehicles, setVehicles } from "../../utils/appSettings";

const UID = "test-user-123";
const car = (reg, extra = {}) => ({
  id: reg,
  registrationNumber: reg,
  make: "Ford",
  model: "Focus",
  engineSize: "under_1400",
  fuelType: "PETROL",
  ratePerMile: 55,
  ...extra,
});

const cloudDoc = (vehicles) => ({
  exists: () => true,
  data: () => (vehicles === undefined ? {} : { vehicles }),
});

const regs = (list) => list.map((v) => v.registrationNumber);

// getVehicles() keeps a short-lived in-memory copy. Moving the clock forward
// expires it, which is what happens when the app is next opened.
let clock = 1_000_000;
const simulateAppRestart = () => {
  clock += 10 * 60 * 1000;
};

beforeEach(async () => {
  mockGetDoc.mockReset();
  mockSetDoc.mockReset();
  mockSetDoc.mockResolvedValue(undefined);
  await AsyncStorage.clear();
  auth.currentUser = { uid: UID, email: "test@example.com" };
  simulateAppRestart();
  jest.spyOn(Date, "now").mockImplementation(() => clock);
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("vehicle storage (cloud-backed)", () => {
  test("returns the vehicles stored on the user's cloud profile", async () => {
    mockGetDoc.mockResolvedValue(cloudDoc([car("AB12CDE")]));

    expect(await getVehicles()).toEqual([car("AB12CDE")]);
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  test("a new device sees the account's vehicles (not device-specific)", async () => {
    // Nothing in AsyncStorage – simulates a fresh install / new phone.
    mockGetDoc.mockResolvedValue(cloudDoc([car("AB12CDE"), car("ZZ99ZZZ")]));

    expect(regs(await getVehicles())).toEqual(["AB12CDE", "ZZ99ZZZ"]);
  });

  test("setVehicles writes the full vehicle details to users/{uid}", async () => {
    const list = [car("AB12CDE", { fuelType: "DIESEL", ratePerMile: 45 })];

    await setVehicles(list);

    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const [ref, payload, options] = mockSetDoc.mock.calls[0];
    expect(ref.path).toBe(`users/${UID}`);
    expect(payload.vehicles).toEqual(list);
    expect(options).toEqual({ merge: true });
  });

  test("setVehicles strips undefined values (Firestore rejects them)", async () => {
    await setVehicles([car("AB12CDE", { model: undefined })]);

    const payload = mockSetDoc.mock.calls[0][1];
    expect(Object.prototype.hasOwnProperty.call(payload.vehicles[0], "model")).toBe(false);
  });

  test("reads straight after a save return the saved list without waiting on the cloud", async () => {
    await setVehicles([car("SAVED01")]);

    expect(regs(await getVehicles())).toEqual(["SAVED01"]);
    expect(mockGetDoc).not.toHaveBeenCalled();
  });

  test("removing the last vehicle writes an empty array and stays empty", async () => {
    await setVehicles([car("OLD111")]);
    await setVehicles([]);

    expect(mockSetDoc.mock.calls[1][1].vehicles).toEqual([]);

    simulateAppRestart();
    mockGetDoc.mockResolvedValue(cloudDoc([]));
    expect(await getVehicles()).toEqual([]);
  });

  test("migrates vehicles that only existed on the device up to the cloud", async () => {
    await AsyncStorage.setItem(`@settings:vehicles:${UID}`, JSON.stringify([car("LOCAL01")]));
    mockGetDoc.mockResolvedValue(cloudDoc(undefined)); // no vehicles field yet

    expect(await getVehicles()).toEqual([car("LOCAL01")]);
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    expect(mockSetDoc.mock.calls[0][1].vehicles).toEqual([car("LOCAL01")]);
  });

  test("first sync on a second device merges its local vehicles into the account", async () => {
    await AsyncStorage.setItem(`@settings:vehicles:${UID}`, JSON.stringify([car("LOCAL01")]));
    mockGetDoc.mockResolvedValue(cloudDoc([car("CLOUD01")]));

    expect(regs(await getVehicles())).toEqual(["CLOUD01", "LOCAL01"]);
    expect(regs(mockSetDoc.mock.calls[0][1].vehicles)).toEqual(["CLOUD01", "LOCAL01"]);
  });

  test("after migration, a vehicle deleted elsewhere is not resurrected from the cache", async () => {
    await AsyncStorage.setItem(`@settings:vehicles:${UID}`, JSON.stringify([car("GONE001")]));
    await AsyncStorage.setItem(`@settings:vehiclesCloudMigrated:${UID}`, "1");
    mockGetDoc.mockResolvedValue(cloudDoc([car("KEEP001")]));

    expect(regs(await getVehicles())).toEqual(["KEEP001"]);
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  test("cloud list refreshes the offline cache", async () => {
    mockGetDoc.mockResolvedValue(cloudDoc([car("CLOUD01")]));
    await getVehicles();

    const cached = JSON.parse(await AsyncStorage.getItem(`@settings:vehicles:${UID}`));
    expect(regs(cached)).toEqual(["CLOUD01"]);
  });

  test("falls back to the cached list when the cloud is unreachable", async () => {
    await AsyncStorage.setItem(`@settings:vehicles:${UID}`, JSON.stringify([car("CACHED1")]));
    mockGetDoc.mockRejectedValue(new Error("offline"));

    expect(await getVehicles()).toEqual([car("CACHED1")]);
  });

  test("a save made offline is retried to the cloud on the next read", async () => {
    mockSetDoc.mockRejectedValueOnce(new Error("offline"));

    await setVehicles([car("OFFLINE1")]);
    expect(await AsyncStorage.getItem(`@settings:vehiclesPendingSync:${UID}`)).toBe("1");

    simulateAppRestart();
    mockGetDoc.mockResolvedValue(cloudDoc([car("STALE001")]));

    // The unsynced local change wins over the stale cloud copy…
    expect(await getVehicles()).toEqual([car("OFFLINE1")]);
    // …and is pushed up.
    expect(mockSetDoc).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ vehicles: [car("OFFLINE1")] }),
      { merge: true }
    );
    expect(await AsyncStorage.getItem(`@settings:vehiclesPendingSync:${UID}`)).toBeNull();
  });

  test("a different account on the same device gets its own vehicles", async () => {
    mockGetDoc.mockResolvedValueOnce(cloudDoc([car("USERA01")]));
    expect(regs(await getVehicles())).toEqual(["USERA01"]);

    auth.currentUser = { uid: "another-user", email: "b@example.com" };
    mockGetDoc.mockResolvedValueOnce(cloudDoc([car("USERB01")]));
    expect(regs(await getVehicles())).toEqual(["USERB01"]);
  });

  test("signed-out calls never touch Firestore", async () => {
    auth.currentUser = null;

    await setVehicles([car("NOAUTH1")]);
    expect(await getVehicles()).toEqual([car("NOAUTH1")]);
    expect(mockGetDoc).not.toHaveBeenCalled();
    expect(mockSetDoc).not.toHaveBeenCalled();
  });
});
