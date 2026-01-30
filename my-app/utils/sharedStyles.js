import { StyleSheet } from "react-native";

export const Colors = {
  background: "#302C66",
  surface: "#FFFFFF",
  card: "#E5E5EA",
  textPrimary: "#1C1C4E",
  textSecondary: "#333",
  textMuted: "#555",
  accent: "#a60d49",
  border: "#ccc",
  inputBg: "#C4C4C4",
};

export const Layout = {
  screenPaddingBottom: 40,
  cardWidth: "90%",
  formWidth: "85%",
  cardRadius: 20,
  buttonRadius: 25,
};

export const Typography = {
  titleSize: 20,
  subtitleSize: 17,
  labelSize: 16,
};

export const SharedStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  content: { alignItems: "center", paddingBottom: Layout.screenPaddingBottom },
  card: {
    backgroundColor: Colors.card,
    width: Layout.cardWidth,
    padding: 22,
    borderRadius: Layout.cardRadius,
    marginTop: 40,
    alignItems: "center",
  },
  chartCard: {
    marginTop: 30,
    backgroundColor: Colors.surface,
    borderRadius: Layout.cardRadius,
    padding: 20,
    width: Layout.cardWidth,
    alignItems: "center",
  },
  title: { fontSize: Typography.titleSize, fontWeight: "bold", color: Colors.textPrimary },
  subtitle: { fontSize: Typography.subtitleSize, color: Colors.accent, marginTop: 14 },
});
