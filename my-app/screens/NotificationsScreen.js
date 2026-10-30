import React, { useState } from "react";
import { FlatList, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import SideMenu from "../components/SideMenu";
import SharedTabMenu from "../components/SharedTabMenu";
import NotificationBell from "../components/NotificationBell";
import { useNotifications } from "../contexts/NotificationsContext";

const ICONS = {
  receipt: "document-text-outline",
  accountant: "person-circle-outline",
  reminder: "calendar-outline",
  general: "notifications-outline",
};

export function formatRelativeTime(timestamp, now = Date.now()) {
  const diff = Math.max(0, now - timestamp);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(timestamp).toLocaleDateString("en-GB");
}

export default function NotificationsScreen() {
  const navigation = useNavigation();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  const onPressItem = (item) => {
    markAsRead(item.id);
    if (item.data?.action === "open-summary") {
      navigation.navigate("MainTabs", { screen: "Summary" });
    }
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      activeOpacity={0.8}
      style={[styles.card, !item.read && styles.cardUnread]}
      onPress={() => onPressItem(item)}
    >
      <View style={styles.avatar}>
        <Ionicons name={ICONS[item.type] || ICONS.general} size={26} color="#fff" />
      </View>
      <View style={styles.textCol}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
          {!item.read ? <View style={styles.dot} /> : null}
          <Text style={styles.time}>{formatRelativeTime(item.receivedAt)}</Text>
        </View>
        {item.body ? <Text style={styles.body} numberOfLines={2}>{item.body}</Text> : null}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <StatusBar backgroundColor="#181836" barStyle="light-content" />
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.menuButton} onPress={() => setMenuOpen(true)}>
          <Text style={styles.menuText}>≡</Text>
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Notifications</Text>
        <NotificationBell />
      </View>

      {unreadCount > 0 ? (
        <TouchableOpacity style={styles.markAll} onPress={markAllAsRead}>
          <Text style={styles.markAllText}>Mark all as read</Text>
        </TouchableOpacity>
      ) : null}

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No notifications yet</Text>}
      />

      <SideMenu open={menuOpen} onClose={closeMenu}>
        <SharedTabMenu
          navigation={navigation}
          closeMenu={closeMenu}
          open={menuOpen}
        />
      </SideMenu>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#181836" },
  topBar: {
    width: "100%",
    paddingHorizontal: 12,
    paddingTop: 5,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 2,
    borderBottomColor: "#E00051",
  },
  menuButton: { width: 52, height: 48, alignItems: "center", justifyContent: "center" },
  menuText: { fontSize: 32, color: "#fff" },
  topBarTitle: { fontSize: 18, fontWeight: "700", color: "#fff" },
  markAll: { alignSelf: "flex-end", paddingHorizontal: 16, paddingTop: 12 },
  markAllText: { color: "#E00051", fontWeight: "600", fontSize: 14 },
  list: { padding: 16, paddingBottom: 40 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#24244D",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  cardUnread: { backgroundColor: "#2E2E62" },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#E00051",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  textCol: { flex: 1 },
  titleRow: { flexDirection: "row", alignItems: "center" },
  title: { flexShrink: 1, color: "#fff", fontSize: 16, fontWeight: "700" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#E00051", marginLeft: 6 },
  time: { marginLeft: "auto", paddingLeft: 8, color: "rgba(255,255,255,0.6)", fontSize: 12 },
  body: { marginTop: 4, color: "rgba(255,255,255,0.7)", fontSize: 14 },
  empty: { color: "rgba(255,255,255,0.6)", textAlign: "center", marginTop: 60, fontSize: 15 },
});
