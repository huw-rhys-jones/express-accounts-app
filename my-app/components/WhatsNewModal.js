import React, { useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../utils/sharedStyles";

const UPDATES = [
  {
    id: "receipts",
    icon: "document-text-outline",
    badge: "🧾",
    title: "Smarter Receipt Scanning & Cropping",
    description:
      "Photos now auto-rotate and crop to the edges of your receipt, with new tools to adjust, rotate, and pinch-to-zoom with ease.",
  },
  {
    id: "notifications",
    icon: "notifications-outline",
    badge: "🔔",
    title: "In-App Notifications & Notes",
    description:
      "Stay informed with a new notification bell, and attach a personal message whenever you tap Notify Accountant.",
  },
  {
    id: "tax-position",
    icon: "calculator-outline",
    badge: "📊",
    title: "Estimated Tax Position",
    description:
      "View a clear estimate of your net profit, personal allowance deduction, and projected tax or rebate directly on the Summary tab.",
  },
  {
    id: "mileage-maps",
    icon: "map-outline",
    badge: "🚗",
    title: "Interactive Mileage Maps",
    description:
      "Track your mileage with a visual map of your route, and your saved vehicles now sync seamlessly across all your devices.",
  },
];

export default function WhatsNewModal({ visible, onDismiss }) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const handleGotIt = () => {
    if (onDismiss) {
      onDismiss(dontShowAgain);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (onDismiss) onDismiss(dontShowAgain);
      }}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerBadge}>
              <Text style={styles.badgeText}>Release 1.8.0</Text>
            </View>
            <Text style={styles.title}>What’s New in Version 1.8.0</Text>
            <Text style={styles.subtitle}>
              Here are the key updates added since version 1.5.5:
            </Text>
          </View>

          <ScrollView
            style={styles.scrollList}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={true}
          >
            {UPDATES.map((item, index) => (
              <View
                key={item.id}
                style={[
                  styles.updateItem,
                  index === UPDATES.length - 1 && styles.lastUpdateItem,
                ]}
              >
                <View style={styles.iconCircle}>
                  <Text style={styles.emojiText}>{item.badge}</Text>
                </View>
                <View style={styles.textContainer}>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  <Text style={styles.itemDescription}>{item.description}</Text>
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.checkboxRow}
              activeOpacity={0.7}
              onPress={() => setDontShowAgain((prev) => !prev)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: dontShowAgain }}
              accessibilityLabel="Don't show this again"
            >
              <Ionicons
                name={dontShowAgain ? "checkbox" : "square-outline"}
                size={22}
                color={Colors.accent}
                style={styles.checkboxIcon}
              />
              <Text style={styles.checkboxLabel}>Don’t show this again</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.button}
              activeOpacity={0.85}
              onPress={handleGotIt}
              accessibilityRole="button"
              accessibilityLabel="Got it, close updates list"
            >
              <Text style={styles.buttonText}>Got It</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    width: "100%",
    maxWidth: 420,
    maxHeight: "85%",
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  header: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    paddingBottom: 14,
    marginBottom: 10,
  },
  headerBadge: {
    backgroundColor: "#f9d6e4",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
  },
  badgeText: {
    color: Colors.accent,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: Colors.textPrimary,
    textAlign: "center",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: "center",
  },
  scrollList: {
    flexGrow: 0,
    marginVertical: 4,
  },
  scrollContent: {
    paddingVertical: 6,
  },
  updateItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
  },
  lastUpdateItem: {
    borderBottomWidth: 0,
    paddingBottom: 4,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F3F3F7",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    marginTop: 2,
  },
  emojiText: {
    fontSize: 18,
  },
  textContainer: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.textPrimary,
    marginBottom: 3,
  },
  itemDescription: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.textSecondary,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    paddingTop: 12,
    marginTop: 6,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    marginBottom: 6,
  },
  checkboxIcon: {
    marginRight: 8,
  },
  checkboxLabel: {
    fontSize: 14,
    color: Colors.textPrimary,
    fontWeight: "500",
  },
  button: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});
