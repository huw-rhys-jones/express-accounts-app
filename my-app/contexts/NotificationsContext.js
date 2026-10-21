import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebaseConfig";

const NotificationsContext = createContext(null);
const MAX_STORED = 100;
const storageKey = (uid) => `notifications:${uid}`;

// Maps incoming push payloads to one of the app's notification categories.
export function resolveNotificationType(data = {}) {
  const raw = String(data.type || data.category || "").toLowerCase();
  if (raw.includes("receipt")) return "receipt";
  if (raw.includes("accountant")) return "accountant";
  if (raw.includes("year") || raw.includes("reminder") || raw.includes("system")) return "reminder";
  return "general";
}

function toItem(notification, read = false) {
  const request = notification?.request || {};
  const content = request.content || {};
  const data = content.data || {};
  return {
    id: request.identifier || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: resolveNotificationType(data),
    title: content.title || "Notification",
    body: content.body || "",
    data,
    receivedAt: notification?.date ? Number(notification.date) * (notification.date < 1e12 ? 1000 : 1) : Date.now(),
    read,
  };
}

export function NotificationsProvider({ children }) {
  const [uid, setUid] = useState(null);
  const [items, setItems] = useState([]);
  const loadedUidRef = useRef(null);

  useEffect(() => onAuthStateChanged(auth, (u) => setUid(u?.uid || null)), []);

  const addNotification = useCallback((notification) => {
    const item = toItem(notification);
    console.log("[Notifications] received:", JSON.stringify({ id: item.id, type: item.type, title: item.title, body: item.body, data: item.data }));
    setItems((prev) => (prev.some((n) => n.id === item.id) ? prev : [item, ...prev].slice(0, MAX_STORED)));
  }, []);

  // Load stored items for the signed-in user, then pick up anything delivered while the app was closed.
  useEffect(() => {
    loadedUidRef.current = null;
    setItems([]);
    if (!uid) return undefined;
    let cancelled = false;
    (async () => {
      let stored = [];
      try {
        stored = JSON.parse((await AsyncStorage.getItem(storageKey(uid))) || "[]");
      } catch (error) {
        console.error("[Notifications] could not load stored notifications", error);
      }
      let presented = [];
      try {
        presented = await Notifications.getPresentedNotificationsAsync();
      } catch (error) {
        console.error("[Notifications] could not read presented notifications", error);
      }
      if (cancelled) return;
      const known = new Set(stored.map((n) => n.id));
      const fresh = presented.map((n) => toItem(n)).filter((n) => !known.has(n.id));
      fresh.forEach((n) => console.log("[Notifications] picked up delivered:", n.id, n.title));
      loadedUidRef.current = uid;
      setItems([...fresh, ...stored].sort((a, b) => b.receivedAt - a.receivedAt).slice(0, MAX_STORED));
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  useEffect(() => {
    if (!uid || loadedUidRef.current !== uid) return;
    AsyncStorage.setItem(storageKey(uid), JSON.stringify(items)).catch((error) =>
      console.error("[Notifications] could not persist notifications", error),
    );
  }, [items, uid]);

  useEffect(() => {
    if (!uid) return undefined;
    const received = Notifications.addNotificationReceivedListener(addNotification);
    const responded = Notifications.addNotificationResponseReceivedListener((response) => {
      const id = response?.notification?.request?.identifier;
      console.log("[Notifications] opened:", id);
      addNotification(response.notification);
      if (id) setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    });
    return () => {
      received.remove();
      responded.remove();
    };
  }, [uid, addNotification]);

  const markAsRead = useCallback((id) => {
    setItems((prev) => prev.map((n) => (n.id === id && !n.read ? { ...n, read: true } : n)));
  }, []);

  const markAllAsRead = useCallback(() => {
    setItems((prev) => (prev.some((n) => !n.read) ? prev.map((n) => ({ ...n, read: true })) : prev));
  }, []);

  const unreadCount = useMemo(() => items.filter((n) => !n.read).length, [items]);

  const value = useMemo(
    () => ({ notifications: items, unreadCount, markAsRead, markAllAsRead }),
    [items, unreadCount, markAsRead, markAllAsRead],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider");
  return ctx;
}
