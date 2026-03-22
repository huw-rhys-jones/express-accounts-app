import { Vibration } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const HAPTICS_KEY = "@settings:hapticsEnabled";

export async function ensureHapticsDefaultEnabled() {
  try {
    const value = await AsyncStorage.getItem(HAPTICS_KEY);
    if (value == null) {
      await AsyncStorage.setItem(HAPTICS_KEY, "true");
    }
  } catch (error) {
    console.warn("Could not initialize haptics setting", error);
  }
}

export async function getHapticsEnabled() {
  try {
    const value = await AsyncStorage.getItem(HAPTICS_KEY);
    if (value == null) return true;
    return value === "true";
  } catch {
    return true;
  }
}

export async function setHapticsEnabled(enabled) {
  await AsyncStorage.setItem(HAPTICS_KEY, String(Boolean(enabled)));
}

export async function triggerHaptic(type = "selection") {
  const enabled = await getHapticsEnabled();
  if (!enabled) return;

  if (type === "success") {
    Vibration.vibrate([0, 15, 30, 15]);
    return;
  }

  Vibration.vibrate(10);
}
