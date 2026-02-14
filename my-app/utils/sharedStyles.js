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


export const AuthStyles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background, paddingTop: 10 },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
    // Floating logo card
  logoContainer: {
    backgroundColor: Colors.surface,
    width: "85%",
    maxWidth: 400,
    paddingVertical: 16,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 50,
    marginBottom: 30,
    alignSelf: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
    logo: { 
    width: 260,
    height: 80,
    resizeMode: "contain" 
  },
  header: {
    backgroundColor: Colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 20,
    width: "85%",
    maxWidth: 400,
    alignSelf: "center",
    marginTop: -10,
    marginBottom: 20,
    alignItems: "center",
  },
  formContainer: {
    backgroundColor: Colors.card,
    padding: 20,
    borderRadius: 20,
    width: "85%",
    maxWidth: 400,
  },
  headerText: {
    fontSize: 18,
    fontWeight: "bold",
    color: Colors.textPrimary,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: "center",
  },
  link: {
    color: Colors.accent,
    fontWeight: "bold",
  },

  form: {
    width: "85%",
    maxWidth: 400,
    backgroundColor: Colors.card,
    padding: 20,
    borderRadius: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: "bold",
    color: Colors.textSecondary,
    marginTop: 10,
  },
   form: {
    width: "85%",
    maxWidth: 400,
    backgroundColor: Colors.card,
    padding: 20,
    borderRadius: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: "bold",
    color: Colors.textPrimary,
    marginTop: 10,
  },
  input: {
    backgroundColor: Colors.inputBg,
    color: Colors.textSecondary,
    fontSize: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    // marginTop: 5,    <-- REMOVE THIS
    // marginBottom: 15, <-- REMOVE THIS
  },
  inputError: {
    borderWidth: 1,
    borderColor: "#b00020",
  },

  // Eye-in-input pattern
  // 2. Move the margin and relative positioning to the container
  passwordContainer: {
    position: "relative",
    justifyContent: "center",
    marginTop: 2,      // <-- ADDED HERE
    marginBottom: 5,   // <-- ADDED HERE
  },
  inputWithIcon: {
    paddingRight: 44,
  },
// 3. Ensure the icon fills the height of the container to center correctly
  eyeIcon: {
    position: "absolute",
    right: 10,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    width: 32,
    zIndex: 1, 
  },

  requirements: {
    marginTop: 10,
    marginBottom: 6,
  },
  ruleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 2,
  },
  ruleText: {
    fontSize: 13,
  },
  ruleOk: {
    color: "#2e7d32",
  },
  ruleBad: {
    color: "#b00020",
  },
  button: {
    backgroundColor: Colors.accent,
    paddingVertical: 12,
    borderRadius: 25,
    alignItems: "center",
    marginTop: 18,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
    loginButton: {
    backgroundColor: Colors.accent,
    paddingVertical: 12,
    borderRadius: 25,
    alignItems: "center",
    marginTop: 20,
  },
  loginButtonText: { color: "#FFF", fontWeight: "bold", fontSize: 16 },

  googleButton: {
    backgroundColor: Colors.surface,
    paddingVertical: 12,
    borderRadius: 25,
    alignItems: "center",
    marginTop: 20,
  },
  googleButtonContent: {
    flexDirection: "row",
    alignItems: "center"
  },
  googleButtonText: {
    fontWeight: "bold",
    fontSize: 16,
    marginRight: 8,
    color: Colors.textSecondary,
  },
  appleButton: { width: "100%", height: 50, marginTop: 16 },

  // Links
  linksRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 20,
    width: "100%",
  },
  forgotPassword: {
    color: Colors.textMuted,
    fontSize: 14,
    textDecorationLine: "underline",
  },
  signup: {
    color: Colors.accent,
    fontWeight: "bold",
    fontSize: 15,
  },

  // Loader / modal cards
  loadingOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingCard: {
    backgroundColor: Colors.surface,
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: "center",
    minWidth: 260,
    width: "80%",
    maxWidth: 400,
  },
  loadingText: { marginTop: 10, fontSize: 16, fontWeight: "600", color: "#000" },

})


export const ReceiptStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    padding: 12,
    backgroundColor: Colors.background,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  borderContainer: {
    borderWidth: 5,
    borderColor: Colors.background,
    borderRadius: 35,
    padding: 20,
    width: "90%",
    backgroundColor: Colors.surface,
  },
  header: {
    fontSize: 22,
    fontWeight: "bold",
    color: Colors.accent,
    marginBottom: 20,
    textAlign: "center",
  },
  label: {
    fontSize: 16,
    fontWeight: "bold",
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  currency: {
    fontSize: 18,
    fontWeight: "bold",
    marginLeft: 25,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 5,
    padding: 10,
    flex: 1,
    fontSize: 16,
    height: 50,
    margin: 0,
    color: Colors.textSecondary,
    backgroundColor: Colors.surface,
  },

  // VAT layout
  vatRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  vatColLeft: {
    flex: 1, // This ensures the left side takes up the remaining space
    marginRight: 12, 
  },
  vatColRight: {
    width: 100, // smaller dropdown column
    zIndex: 2000, 
    elevation: 5,
  },
  vatCurrency: {
    fontSize: 18,
    fontWeight: "bold",
    marginLeft: 10,
    paddingRight: 5,
  },
  vatInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 5,
    height: 50,             // Increased from 44 to 50 for a better touch target
    paddingHorizontal: 12,
    fontSize: 16,
    backgroundColor: Colors.surface,
    flex: 1,
    color: Colors.textSecondary,
  },
  vatRatePicker: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    height: 50,             // MUST match vatInput height exactly
    justifyContent: 'center',
    paddingHorizontal: 8,
    // Do NOT put marginTop here
  },
  vatRateDropdown: {
    backgroundColor: Colors.surface, // Critical: adds solid background to the list
    borderColor: Colors.border,
    zIndex: 5000,              // Ensures the list itself stays on top
    shadowColor: "#000",       // Optional: adds a slight shadow for depth on iOS
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },

  dateButton: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 5,
    padding: 10,
    height: 50,
    justifyContent: "center",
    marginHorizontal: 10,
  },
  dateText: { fontSize: 16, color: Colors.textSecondary },

  dropdown: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    height: 50,
  },
  dropdownContainer: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
  },

  receiptImage: {
    width: 100,
    height: 150,
    resizeMode: "contain",
    borderRadius: 5,
    marginRight: 10,
  },
  uploadPlaceholder: {
    width: 100,
    height: 150,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.surface,
  },
  plus: { fontSize: 32, color: Colors.accent },

  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 10,
  },
  button: { flex: 1, marginHorizontal: 5 },

  // Shared modal styling
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 20,
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: "bold", marginBottom: 10, color: "#000" },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
  },

  // OCR modal extras
  modalImage: {
    width: "100%",
    height: 320,
    resizeMode: "contain",
    borderRadius: 8,
    marginBottom: 12,
  },
  scanningText: { marginTop: 8, fontStyle: "italic", color: "#555" },
  ocrRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
  ocrLabel: { fontWeight: "600", marginRight: 6, color: "#555" },
  ocrValue: { flexShrink: 1, color: "#555" },

  // Upload overlay
  uploadOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  uploadCard: {
    backgroundColor: "#fff",
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 180,
  },

  // Fullscreen close button
  fullScreenCloseButtonWrapper: {
    position: "absolute",
    bottom: 30,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  fullScreenCloseButton: {
    backgroundColor: "rgba(166, 13, 73, 0.9)",
    paddingVertical: 8,
    paddingHorizontal: 24,
    borderRadius: 20,
  },
  fullScreenCloseText: { color: "#fff", fontWeight: "bold", fontSize: 16 },

  // hint text
  fullscreenHint: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
    fontStyle: "italic",
    textAlign: "center",
    alignSelf: "center",
  },
  modalDetailText: {
  color: Colors.textPrimary,
  fontSize: 14, // Optional: keeps it consistent
  marginBottom: 4, // Optional: adds a little breathing room between lines
},
  bottomButtons: {
    marginTop: 6,    
    padding: 20,
  },
    primaryRow: {
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    flex: 1,
  },
  deleteRow: {
    marginTop: 10,
  },
  deleteBtn: {
    width: "100%",
  },
});

