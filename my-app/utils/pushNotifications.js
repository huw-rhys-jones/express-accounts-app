import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const ALERTS_CHANNEL_ID = "alerts";

function getProjectId() {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.easConfig?.projectId ||
    null
  );
}

function tokenDocId(token) {
  return String(token || "").replace(/[/.#$[\]]/g, "_");
}

export async function registerPushTokenForUser(user) {
  if (!user) return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(ALERTS_CHANNEL_ID, {
      name: "Alerts",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const currentPermissions = await Notifications.getPermissionsAsync();
  const finalPermissions = currentPermissions.granted
    ? currentPermissions
    : await Notifications.requestPermissionsAsync();

  if (!finalPermissions.granted) {
    return null;
  }

  const projectId = getProjectId();
  if (!projectId) {
    console.warn("Cannot register push token: missing EAS project ID.");
    return null;
  }

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  if (!token) return null;

  await setDoc(
    doc(db, "users", user.uid, "pushTokens", tokenDocId(token)),
    {
      token,
      platform: Platform.OS,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return token;
}

export async function sendLocalTestNotification() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(ALERTS_CHANNEL_ID, {
      name: "Alerts",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const currentPermissions = await Notifications.getPermissionsAsync();
  const finalPermissions = currentPermissions.granted
    ? currentPermissions
    : await Notifications.requestPermissionsAsync();

  if (!finalPermissions.granted) {
    return false;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      channelId: ALERTS_CHANNEL_ID,
      title: "Express Accounts test",
      body: "Local notification test from the app side menu.",
      data: { type: "local-test-notification" },
    },
    trigger: null,
  });

  return true;
}
