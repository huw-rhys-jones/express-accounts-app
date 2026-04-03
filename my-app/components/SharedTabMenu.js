import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import Constants from "expo-constants";
import DropDownPicker from "react-native-dropdown-picker";
import appPackage from "../package.json";
import { auth, db } from "../firebaseConfig";
import { buildFinancialFilterOptions } from "../utils/financialPeriods";
import { getReceiptFilterKey, setReceiptFilterKey } from "../utils/appSettings";
import { Colors } from "../utils/sharedStyles";
import { getHapticsEnabled, setHapticsEnabled, triggerHaptic } from "../utils/haptics";
import { verifyClientCode } from "../utils/verificationCodes";

const appVersion = appPackage?.version || Constants.expoConfig?.version || "unknown";
const internalBuildLabel = Constants.expoConfig?.extra?.internalBuildLabel || "";
const versionLabel = internalBuildLabel ? `${appVersion} (${internalBuildLabel})` : appVersion;

export default function SharedTabMenu({ navigation, closeMenu, displayName = "User" }) {
  const [busy, setBusy] = useState(false);
  const [busyText, setBusyText] = useState("Please wait…");
  const [feedbackModalVisible, setFeedbackModalVisible] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeFilterKey, setActiveFilterKey] = useState("current-quarter");
  const [filterItems, setFilterItems] = useState([]);
  const [referralCodeModalVisible, setReferralCodeModalVisible] = useState(false);
  const [referralCode, setReferralCode] = useState("");
  const [hapticsEnabled, setHapticsEnabledState] = useState(true);
  const [verifiedName, setVerifiedName] = useState("");
  const [verificationStatus, setVerificationStatus] = useState("");
  const [receipts, setReceipts] = useState([]);

  const runWithLoading = useCallback(async (text, fn) => {
    setBusyText(text);
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    getHapticsEnabled()
      .then(setHapticsEnabledState)
      .catch(() => setHapticsEnabledState(true));

    getReceiptFilterKey()
      .then(setActiveFilterKey)
      .catch(() => setActiveFilterKey("current-quarter"));
  }, []);

  useEffect(() => {
    const loadUserContext = async () => {
      const user = auth.currentUser;
      if (!user) return;

      try {
        const [userSnap, receiptSnap] = await Promise.all([
          getDoc(doc(db, "users", user.uid)),
          getDocs(query(collection(db, "receipts"), where("userId", "==", user.uid))),
        ]);

        const userData = userSnap.exists() ? userSnap.data() || {} : {};
        setVerifiedName(String(userData.verifiedName || ""));
        setVerificationStatus(String(userData.verificationStatus || ""));
        setReceipts(receiptSnap.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
      } catch (error) {
        console.error("Error loading shared menu data", error);
      }
    };

    loadUserContext();
  }, []);

  const filterOptions = useMemo(
    () => buildFinancialFilterOptions(receipts, new Date()),
    [receipts]
  );

  useEffect(() => {
    setFilterItems(filterOptions.map((option) => ({ label: option.label, value: option.key })));
  }, [filterOptions]);

  const handleOpenSettings = useCallback(() => {
    closeMenu();
    requestAnimationFrame(() => setSettingsModalVisible(true));
  }, [closeMenu]);

  const toggleHapticsSetting = useCallback(async () => {
    const next = !hapticsEnabled;
    setHapticsEnabledState(next);
    await setHapticsEnabled(next);
    if (next) {
      triggerHaptic("selection").catch(() => {});
    }
  }, [hapticsEnabled]);

  const handleNotifyAccountant = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;

    closeMenu();
    triggerHaptic("selection").catch(() => {});
    await runWithLoading("Sending notify request…", async () => {
      await setDoc(
        doc(db, "users", user.uid),
        {
          notifyAccountant: true,
          notifyAccountantAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          ...(user.displayName ? { name: user.displayName } : {}),
          ...(user.email ? { email: user.email } : {}),
        },
        { merge: true }
      );
    });

    triggerHaptic("success").catch(() => {});
    Alert.alert(
      "Accountant Notified",
      "Your accountant has been notified that your records are ready for processing."
    );
  }, [closeMenu, runWithLoading]);

  const handleIdPlaceholder = useCallback(() => {
    closeMenu();
    Alert.alert(
      "ID Upload Coming Soon",
      "Planned flow: capture passport or driving licence images, then compare the extracted details against the signed-in account for manual review."
    );
  }, [closeMenu]);

  const handleAddressPlaceholder = useCallback(() => {
    closeMenu();
    Alert.alert(
      "Address Capture Coming Soon",
      "This will become the place to add and confirm a billing or registered address, with proof-of-address support later."
    );
  }, [closeMenu]);

  const handleSendFeedback = async () => {
    if (!feedbackText.trim()) {
      Alert.alert("Empty Message", "Please enter your feedback before sending.");
      return;
    }

    const userEmail = auth.currentUser?.email || "Unknown User";
    await runWithLoading("Sending feedback…", async () => {
      const response = await fetch("https://express-accounts-73d38.web.app/submit-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: displayName,
          email: userEmail,
          message: feedbackText,
        }),
      });

      if (!response.ok) {
        throw new Error("Server error");
      }
    }).then(() => {
      Alert.alert("Success", "Thank you! Your feedback has been sent.");
      setFeedbackModalVisible(false);
      setFeedbackText("");
    }).catch((error) => {
      console.error("Feedback Error:", error);
      Alert.alert("Connection Error", "Could not reach the server. Please try again.");
    });
  };

  const handleSubmitReferralCode = async () => {
    if (!referralCode.trim()) {
      Alert.alert("Invalid Code", "Please enter a client code.");
      return;
    }

    const user = auth.currentUser;
    if (!user) return;

    triggerHaptic("selection").catch(() => {});
    try {
      const result = await verifyClientCode({
        db,
        userId: user.uid,
        rawCode: referralCode,
      });
      setVerifiedName(result.verifiedName);
      setVerificationStatus("verified");
      triggerHaptic("success").catch(() => {});
      Alert.alert("Verified", `Code accepted. Your account is now verified as ${result.verifiedName}.`);
      setReferralCodeModalVisible(false);
      setReferralCode("");
    } catch (error) {
      console.error("Error verifying referral code:", error);
      Alert.alert("Verification Failed", error.message || "Could not verify that code. Please try again.");
    }
  };

  const handleLogout = useCallback(async () => {
    closeMenu();
    await runWithLoading("Signing out…", async () => {
      await signOut(auth);
      navigation.replace("SignIn");
    });
  }, [closeMenu, navigation, runWithLoading]);

  const handleOpenPrivacyPolicy = useCallback(async () => {
    const url = "https://caistec.com/privacy-policy.html";
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      Alert.alert("Unable to open link", "Could not open Privacy Policy.");
      return;
    }
    await Linking.openURL(url);
  }, []);

  return (
    <>
      <View style={{ flex: 1 }}>
        <View style={styles.userInfo}>
          <Text style={styles.userEmail}>{displayName}</Text>
          <Text style={styles.userEmail}>{auth.currentUser?.email}</Text>
          {verificationStatus === "verified" && verifiedName ? (
            <>
              <Text style={styles.userEmail}>{verifiedName}</Text>
              <Text style={styles.userEmail}>(verified user)</Text>
            </>
          ) : null}
        </View>

        <TouchableOpacity onPress={handleOpenSettings} style={styles.settingsMenuBtn}>
          <Text style={styles.settingsMenuBtnText}>Settings</Text>
        </TouchableOpacity>

        <View style={{ marginTop: 20 }}>
          <TouchableOpacity onPress={handleNotifyAccountant} style={styles.notifyBtnFilled}>
            <Text style={styles.filledBtnText}>Notify Accountant</Text>
          </TouchableOpacity>
        </View>

        <View style={{ marginTop: 6 }}>
          <TouchableOpacity onPress={handleIdPlaceholder} style={styles.secondaryMenuButton}>
            <Text style={styles.secondaryMenuButtonText}>Add ID Image</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleAddressPlaceholder}
            style={[styles.secondaryMenuButton, { marginTop: 10 }]}
          >
            <Text style={styles.secondaryMenuButtonText}>Add Address</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footerContainer}>
          <TouchableOpacity
            onPress={() => {
              closeMenu();
              setReferralCode("");
              setReferralCodeModalVisible(true);
            }}
            style={[
              styles.referralBtn,
              verificationStatus === "verified" ? styles.disabledActionButton : null,
            ]}
          >
            <Text
              style={[
                styles.filledBtnText,
                verificationStatus === "verified" ? styles.disabledActionButtonText : null,
              ]}
            >
              Enter Client Code
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleLogout} style={[styles.redButton, { marginTop: 10 }]}>
            <Text style={styles.redButtonText}>Sign Out</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              closeMenu();
              setFeedbackModalVisible(true);
            }}
            style={[styles.signOutLink, { marginTop: 12, marginBottom: 0 }]}
          >
            <Text style={[styles.linkBtnText, { textDecorationLine: "none" }]}>Leave Feedback</Text>
          </TouchableOpacity>

          <View style={styles.versionContainer}>
            <Text style={styles.versionText}>Version {versionLabel}</Text>
            <Text style={styles.versionText}> · </Text>
            <TouchableOpacity onPress={handleOpenPrivacyPolicy}>
              <Text style={[styles.versionText, { textDecorationLine: "underline", color: Colors.accent }]}>Privacy Policy</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <Modal
        visible={settingsModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setSettingsModalVisible(false);
          setFilterOpen(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.loadingCard, styles.settingsModalCard]}>
            <Text style={styles.title}>Settings</Text>

            <View style={styles.settingsRow}>
              <Text style={styles.settingsLabel}>Haptic feedback</Text>
              <Switch
                value={hapticsEnabled}
                onValueChange={toggleHapticsSetting}
                trackColor={{ false: "#c8cad2", true: "#f0b5ca" }}
                thumbColor={hapticsEnabled ? Colors.accent : "#f4f3f4"}
              />
            </View>

            {filterItems.length > 0 ? (
              <View style={styles.settingsFilterSection}>
                <Text style={styles.settingsLabel}>Filter by quarter or year</Text>
                <DropDownPicker
                  open={filterOpen}
                  value={activeFilterKey}
                  items={filterItems}
                  setOpen={setFilterOpen}
                  setValue={(callback) => {
                    const nextKey = callback(activeFilterKey);
                    setActiveFilterKey(nextKey);
                    setReceiptFilterKey(nextKey).catch(() => {});
                    return nextKey;
                  }}
                  setItems={setFilterItems}
                  listMode="SCROLLVIEW"
                  style={styles.filterDropdown}
                  dropDownContainerStyle={styles.filterDropdownContainer}
                  zIndex={3000}
                  zIndexInverse={1000}
                />
              </View>
            ) : null}

            <TouchableOpacity
              onPress={() => {
                setSettingsModalVisible(false);
                setFilterOpen(false);
              }}
              style={[styles.modalButton, { width: "100%" }]}
            >
              <Text style={styles.modalButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={feedbackModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFeedbackModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.loadingCard}>
            <Text style={styles.title}>Send Feedback</Text>
            <Text style={styles.modalText}>
              Have a suggestion or found a bug? Let us know below.
            </Text>

            <TextInput
              style={[styles.input, { minHeight: 120, textAlignVertical: "top", color: Colors.textPrimary }]}
              placeholder="Type your feedback here..."
              placeholderTextColor="#999"
              multiline
              value={feedbackText}
              onChangeText={setFeedbackText}
            />

            <View style={styles.modalRow}>
              <TouchableOpacity
                onPress={() => {
                  setFeedbackModalVisible(false);
                  setFeedbackText("");
                }}
                style={[styles.modalButton, { backgroundColor: "#ccc", flex: 1 }]}
              >
                <Text style={{ color: "#000", textAlign: "center" }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={handleSendFeedback} style={[styles.modalButton, { flex: 1 }]}>
                <Text style={styles.modalButtonText}>Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={referralCodeModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setReferralCodeModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.loadingCard}>
            <Text style={styles.title}>Enter Client Code</Text>
            <Text style={styles.modalText}>
              Enter your verification code to link your account to your accountant.
            </Text>

            {verificationStatus === "verified" ? (
              <Text style={styles.verificationWarningText}>
                This account is already verified{verifiedName ? ` as ${verifiedName}` : ""}. Entering another code may overwrite that link.
              </Text>
            ) : null}

            <TextInput
              style={[styles.input, { color: Colors.textPrimary }]}
              placeholder="Client code"
              placeholderTextColor="#999"
              value={referralCode}
              onChangeText={setReferralCode}
              autoCapitalize="none"
            />

            <View style={styles.modalRow}>
              <TouchableOpacity
                onPress={() => setReferralCodeModalVisible(false)}
                style={[styles.modalButton, { backgroundColor: "#ccc", flex: 1 }]}
              >
                <Text style={{ color: "#000", textAlign: "center" }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={handleSubmitReferralCode} style={[styles.modalButton, { flex: 1 }]}>
                <Text style={styles.modalButtonText}>Submit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {busy ? (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={Colors.accent} />
            <Text style={styles.loadingText}>{busyText}</Text>
          </View>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  userInfo: {
    marginBottom: 20,
  },
  userEmail: {
    color: Colors.textPrimary,
    fontSize: 15,
    marginBottom: 6,
    fontWeight: "600",
  },
  settingsMenuBtn: {
    backgroundColor: "#9999AA",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginTop: 16,
    alignItems: "center",
  },
  settingsMenuBtnText: {
    color: "white",
    fontWeight: "700",
    textAlign: "center",
  },
  notifyBtnFilled: {
    backgroundColor: "#2e86de",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 10,
  },
  filledBtnText: {
    color: "white",
    fontWeight: "700",
    textAlign: "center",
  },
  secondaryMenuButton: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  secondaryMenuButtonText: {
    color: Colors.textPrimary,
    fontWeight: "600",
    textAlign: "center",
  },
  footerContainer: {
    marginTop: "auto",
    paddingBottom: 24,
  },
  referralBtn: {
    backgroundColor: "#27ae60",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: "center",
  },
  disabledActionButton: {
    backgroundColor: "#91c9a3",
  },
  disabledActionButtonText: {
    opacity: 0.75,
  },
  redButton: {
    backgroundColor: Colors.accent,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: "center",
  },
  redButtonText: {
    color: "white",
    fontWeight: "700",
    textAlign: "center",
  },
  signOutLink: {
    backgroundColor: "transparent",
    paddingVertical: 10,
  },
  linkBtnText: {
    color: Colors.textPrimary,
    fontWeight: "600",
    textAlign: "center",
    textDecorationLine: "underline",
  },
  versionContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  versionText: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  loadingCard: {
    backgroundColor: Colors.surface,
    paddingVertical: 20,
    paddingHorizontal: 22,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    maxWidth: 420,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    color: Colors.textPrimary,
    fontWeight: "600",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.textPrimary,
    textAlign: "center",
  },
  modalText: {
    textAlign: "center",
    marginVertical: 10,
    color: Colors.textPrimary,
  },
  input: {
    width: "100%",
    backgroundColor: Colors.inputBg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  modalRow: {
    flexDirection: "row",
    marginTop: 20,
    gap: 10,
    width: "100%",
  },
  modalButton: {
    backgroundColor: Colors.accent,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  modalButtonText: {
    color: Colors.surface,
    fontWeight: "700",
    textAlign: "center",
  },
  settingsModalCard: {
    zIndex: 2000,
  },
  settingsRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
  },
  settingsLabel: {
    color: Colors.textPrimary,
    fontWeight: "600",
  },
  settingsFilterSection: {
    width: "100%",
    marginTop: 18,
    zIndex: 3000,
  },
  filterDropdown: {
    marginTop: 8,
    borderColor: Colors.border,
  },
  filterDropdownContainer: {
    borderColor: Colors.border,
  },
  verificationWarningText: {
    color: Colors.accent,
    fontSize: 12,
    marginBottom: 10,
    textAlign: "center",
  },
});