import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useNotifications } from "../contexts/NotificationsContext";

export function formatBadgeCount(count) {
  return count > 99 ? "99+" : String(count);
}

export default function NotificationBell() {
  const navigation = useNavigation();
  const { unreadCount } = useNotifications();

  return (
    <TouchableOpacity
      style={styles.button}
      onPress={() => navigation.navigate("Notifications")}
      accessibilityRole="button"
      accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
    >
      <Ionicons name="notifications" size={22} color="#fff" />
      {unreadCount > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{formatBadgeCount(unreadCount)}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: { width: 52, height: 48, alignItems: "center", justifyContent: "center" },
  badge: {
    position: "absolute",
    top: 4,
    right: 2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: "#E00051",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
});
