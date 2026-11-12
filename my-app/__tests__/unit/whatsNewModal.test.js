jest.mock("../../firebaseConfig");
jest.mock("firebase/firestore", () => ({
  doc: (_db, collection, id) => ({ path: `${collection}/${id}` }),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
  serverTimestamp: () => "SERVER_TS",
}));

import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getWhatsNewDismissed, setWhatsNewDismissed } from "../../utils/appSettings";
import WhatsNewModal from "../../components/WhatsNewModal";

describe("WhatsNew setting", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("defaults to not dismissed", async () => {
    const dismissed = await getWhatsNewDismissed();
    expect(dismissed).toBe(false);
  });

  it("returns true after setWhatsNewDismissed(true)", async () => {
    await setWhatsNewDismissed(true);
    const dismissed = await getWhatsNewDismissed();
    expect(dismissed).toBe(true);
  });

  it("can be set back to false if needed", async () => {
    await setWhatsNewDismissed(true);
    expect(await getWhatsNewDismissed()).toBe(true);
    await setWhatsNewDismissed(false);
    expect(await getWhatsNewDismissed()).toBe(false);
  });
});
