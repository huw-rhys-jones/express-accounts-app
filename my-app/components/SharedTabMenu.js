import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { deleteUser, signOut, updateProfile } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getStorage, ref as storageRef, listAll, deleteObject } from "firebase/storage";
import Constants from "expo-constants";
import appPackage from "../package.json";
import { auth, db } from "../firebaseConfig";
import { getVehicles } from "../utils/appSettings";
import { Colors } from "../utils/sharedStyles";
import { Checkbox } from "react-native-paper";
import { triggerHaptic } from "../utils/haptics";
import { verifyClientCode } from "../utils/verificationCodes";
import RegisterVehicleModal from "./RegisterVehicleModal";
import YourVehiclesModal from "./YourVehiclesModal";
import { useData } from "../contexts/DataContext";

const appVersion = appPackage?.version || Constants.expoConfig?.version || "unknown";
const internalBuildLabel = Constants.expoConfig?.extra?.internalBuildLabel || "";
const versionLabel = internalBuildLabel ? `${appVersion} (${internalBuildLabel})` : appVersion;

export default function SharedTabMenu({ navigation, closeMenu, displayName = "User", open = false, onVehiclesChanged }) {
  const { userProfile, displayName: contextDisplayName } = useData();
  const [busy, setBusy] = useState(false);
  const [busyText, setBusyText] = useState("Please wait...");

  const [currentDisplayName, setCurrentDisplayName] = useState(
    contextDisplayName || displayName || "User"
  );
  const [newName, setNewName] = useState(contextDisplayName || displayName || "User");
  const [verifiedName, setVerifiedName] = useState(String(userProfile?.verifiedName || ""));
  const [verificationStatus, setVerificationStatus] = useState(
    String(userProfile?.verificationStatus || "")
  );
  const [vehicles, setVehicles] = useState(
    Array.isArray(userProfile?.vehicles) ? userProfile.vehicles : []
  );

  const [feedbackModalVisible, setFeedbackModalVisible] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [referralCodeModalVisible, setReferralCodeModalVisible] = useState(false);
  const [referralCode, setReferralCode] = useState("");
  const [nameChangeModalVisible, setNameChangeModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [registerVehicleOpen, setRegisterVehicleOpen] = useState(false);
  const [yourVehiclesOpen, setYourVehiclesOpen] = useState(false);
  const [vatSettingsVisible, setVatSettingsVisible] = useState(false);
  const [vatRegistered, setVatRegistered] = useState(false);
  const [vatRegistrationNumber, setVatRegistrationNumber] = useState("");

  const isVerifiedAccount = verificationStatus === "verified";

  const runWithLoading = useCallback(async (text, fn) => {
    setBusyText(text);
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }, []);

  const applyVatProfile = useCallback((profile = {}) => {
    setVatRegistered(profile?.taxProfile?.vat?.isRegistered === true);
    setVatRegistrationNumber(String(profile?.taxProfile?.vat?.registrationNumber || ""));
  }, []);

  const loadMenuContext = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) {
      setCurrentDisplayName(contextDisplayName || displayName || "User");
      setVehicles(Array.isArray(userProfile?.vehicles) ? userProfile.vehicles : []);
      return;
    }

    setCurrentDisplayName(user.displayName || contextDisplayName || displayName || "User");

    if (userProfile?.verifiedName || userProfile?.verificationStatus) {
      setVerifiedName(String(userProfile?.verifiedName || ""));
      setVerificationStatus(String(userProfile?.verificationStatus || ""));
    }
    if (Array.isArray(userProfile?.vehicles)) {
      setVehicles(userProfile.vehicles);
    }

    try {
      const userProfileRef = doc(db, "users", user.uid);
      const userProfileSnap = await getDoc(userProfileRef);
      const userProfile = userProfileSnap.exists() ? userProfileSnap.data() || {} : {};
      setVerifiedName(String(userProfile.verifiedName || ""));
      setVerificationStatus(String(userProfile.verificationStatus || ""));
      applyVatProfile(userProfile);

      const profileUpdate = { email: user.email, updatedAt: serverTimestamp() };
      if (user.displayName) profileUpdate.name = user.displayName;
      setDoc(userProfileRef, profileUpdate, { merge: true }).catch(() => {});
    } catch (error) {
      console.error("Error loading shared menu profile:", error);
    }

    try {
      const vehicleRows = await getVehicles();
      setVehicles(vehicleRows);
    } catch (error) {
      console.error("Error loading vehicles:", error);
    }
  }, [applyVatProfile, contextDisplayName, displayName, userProfile]);

  useEffect(() => {
    setCurrentDisplayName(contextDisplayName || auth.currentUser?.displayName || displayName || "User");
    setNewName((previous) => previous || contextDisplayName || displayName || "User");
    setVerifiedName(String(userProfile?.verifiedName || ""));
    setVerificationStatus(String(userProfile?.verificationStatus || ""));
    setVehicles(Array.isArray(userProfile?.vehicles) ? userProfile.vehicles : []);
    applyVatProfile(userProfile);
  }, [applyVatProfile, contextDisplayName, displayName, userProfile]);

  const openVatSettings = useCallback(async () => {
    const user = auth.currentUser;
    if (user) {
      try {
        const userProfileSnap = await getDoc(doc(db, "users", user.uid));
        applyVatProfile(userProfileSnap.exists() ? userProfileSnap.data() || {} : {});
      } catch (error) {
        console.error("Error loading VAT settings:", error);
      }
    }
    setVatSettingsVisible(true);
  }, [applyVatProfile]);

  useEffect(() => {
    loadMenuContext().catch(() => {});
  }, [loadMenuContext]);

  useEffect(() => {
    if (!open) return;
    loadMenuContext().catch(() => {});
  }, [open, loadMenuContext]);

  const handleNotifyAccountant = async () => {
    const user = auth.currentUser;
    if (!user) return;

    triggerHaptic("selection").catch(() => {});

    await runWithLoading("Sending notify request...", async () => {
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

    closeMenu();
    triggerHaptic("success").catch(() => {});
    Alert.alert("Accountant Notified", "Your accountant has been notified that your receipts are ready for processing.");
  };

  const saveVatSettings = async () => {
    const user = auth.currentUser;
    if (!user) return;
    const nextVatRegistered = vatRegistered;
    const nextVatRegistrationNumber = nextVatRegistered ? vatRegistrationNumber.trim() : "";
    await runWithLoading("Saving VAT settings...", async () => {
      await setDoc(doc(db, "users", user.uid), {
        taxProfile: {
          vat: {
            isRegistered: nextVatRegistered,
            registrationNumber: nextVatRegistrationNumber,
            hasAnsweredRegistrationQuestion: true,
            setupCompletedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
        },
        hasAnsweredVatRegistration: true,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setVatRegistered(nextVatRegistered);
      setVatRegistrationNumber(nextVatRegistrationNumber);
      setVatSettingsVisible(false);
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
      Alert.alert(
        "Verified",
        `Code accepted. Your account is now verified as ${result.verifiedName}.`
      );
      setReferralCodeModalVisible(false);
      setReferralCode("");
    } catch (error) {
      console.error("Error verifying referral code:", error);
      Alert.alert("Verification Failed", error.message || "Could not verify that code. Please try again.");
    }
  };

  const handleSubmitNameChange = async () => {
    if (!newName.trim()) {
      Alert.alert("Invalid Name", "Please enter a name.");
      return;
    }

    const user = auth.currentUser;
    if (!user) return;

    triggerHaptic("selection").catch(() => {});

    try {
      await updateProfile(user, { displayName: newName.trim() });
      await setDoc(
        doc(db, "users", user.uid),
        { name: newName.trim() },
        { merge: true }
      );
      setCurrentDisplayName(newName.trim());
      triggerHaptic("success").catch(() => {});
      Alert.alert("Success", "Name updated!");
      setNameChangeModalVisible(false);
    } catch (error) {
      console.error("Error updating name:", error);
      Alert.alert("Error", "Could not update name. Please try again.");
    }
  };

  const handleSendFeedback = async () => {
    if (!feedbackText.trim()) {
      Alert.alert("Empty Message", "Please enter your feedback before sending.");
      return;
    }

    const userEmail = auth.currentUser?.email || "Unknown User";

    await runWithLoading("Sending feedback...", async () => {
      const response = await fetch("https://express-accounts-73d38.web.app/submit-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: currentDisplayName,
          email: userEmail,
          message: feedbackText,
        }),
      });

      if (!response.ok) {
        throw new Error("Server error");
      }
    })
      .then(() => {
        Alert.alert("Success", "Thank you! Your feedback has been sent.");
        setFeedbackModalVisible(false);
        setFeedbackText("");
      })
      .catch((error) => {
        console.error("Feedback Error:", error);
        Alert.alert("Connection Error", "Could not reach the server. Please try again.");
      });
  };

  const handleLogout = async () => {
    triggerHaptic("selection").catch(() => {});
    closeMenu();
    await runWithLoading("Signing out...", async () => {
      await signOut(auth);
      navigation.replace("SignIn");
    });
  };

  const handleDeleteAccount = () => {
    closeMenu();
    setDeleteModalVisible(true);
  };

  const deleteUserStorage = async (userId) => {
    const storage = getStorage();
    const folderNames = ["receipts", "income", "bankStatements"];

    for (const folderName of folderNames) {
      const userFolderRef = storageRef(storage, `${folderName}/${userId}`);

      try {
        const listResult = await listAll(userFolderRef);
        const deletePromises = listResult.items.map((item) => deleteObject(item));
        await Promise.all(deletePromises);
      } catch (error) {
        console.log("Storage cleanup error (likely no files):", folderName, error);
      }
    }
  };

  const performDeletion = async () => {
    const user = auth.currentUser;
    if (!user) return;

    setDeleteModalVisible(false);
    setConfirmText("");

    await runWithLoading("Permanently erasing data...", async () => {
      try {
        await deleteUserStorage(user.uid);

        const batch = writeBatch(db);
        const [receiptSnapshot, incomeSnapshot, bankSnapshot] = await Promise.all([
          getDocs(query(collection(db, "receipts"), where("userId", "==", user.uid))),
          getDocs(query(collection(db, "income"), where("userId", "==", user.uid))),
          getDocs(query(collection(db, "bankStatements"), where("userId", "==", user.uid))),
        ]);

        receiptSnapshot.forEach((docRef) => batch.delete(docRef.ref));
        incomeSnapshot.forEach((docRef) => batch.delete(docRef.ref));
        bankSnapshot.forEach((docRef) => batch.delete(docRef.ref));
        await batch.commit();

        await deleteDoc(doc(db, "users", user.uid));
        await deleteUser(user);

        navigation.replace("SignIn");
      } catch (error) {
        console.error("Deletion Error:", error);

        if (error.code === "auth/requires-recent-login") {
          Alert.alert(
            "Security Timeout",
            "For your security, you must have logged in recently to delete your account. Please sign out and back in, then try again."
          );
        } else {
          Alert.alert(
            "Error",
            "Something went wrong while deleting your data. Please try again."
          );
        }
      }
    });
  };

  const handleOpenPrivacyPolicy = useCallback(async () => {
    triggerHaptic("selection").catch(() => {});
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
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={styles.userEmail}>{currentDisplayName}</Text>
            <TouchableOpacity
              onPress={() => {
                setNewName(currentDisplayName);
                setNameChangeModalVisible(true);
              }}
              style={{ paddingLeft: 8 }}
            >
              <Text style={{ fontSize: 14 }}>✏️</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.userEmail}>{auth.currentUser?.email}</Text>
          {verificationStatus === "verified" && verifiedName ? (
            <Text style={styles.verifiedAsText}>Verified as {verifiedName}</Text>
          ) : null}
        </View>

        <Image
          source={require("../assets/images/logo.png")}
          style={styles.menuLogo}
          resizeMode="contain"
        />

        <View style={{ marginTop: 20 }}>
          <TouchableOpacity onPress={handleNotifyAccountant} style={styles.notifyBtnFilled}>
            <Text style={styles.filledBtnText}>Notify Accountant</Text>
          </TouchableOpacity>
        </View>

        <View style={{ marginTop: 6 }}>
          <TouchableOpacity
            onPress={() => setRegisterVehicleOpen(true)}
            style={styles.secondaryMenuButton}
          >
            <Text style={styles.secondaryMenuButtonText}>🚗  Register Vehicle</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={openVatSettings}
            style={[styles.secondaryMenuButton, { marginTop: 10 }]}
          >
            <Text style={styles.secondaryMenuButtonText}>VAT Registration</Text>
          </TouchableOpacity>

          {vehicles.length > 0 && (
            <TouchableOpacity
              onPress={() => setYourVehiclesOpen(true)}
              style={[styles.secondaryMenuButton, { marginTop: 10 }]}
            >
              <Text style={styles.secondaryMenuButtonText}>📋  Your Vehicles</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity disabled style={[styles.secondaryMenuButton, styles.disabledMenuButton, { marginTop: 10 }]}> 
            <Text style={[styles.secondaryMenuButtonText, styles.disabledMenuButtonText]}>Add ID Image</Text>
          </TouchableOpacity>

          <TouchableOpacity
            disabled
            style={[styles.secondaryMenuButton, styles.disabledMenuButton, { marginTop: 10 }]}
          >
            <Text style={[styles.secondaryMenuButtonText, styles.disabledMenuButtonText]}>Add Address</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footerContainer}>
          <TouchableOpacity
            disabled={isVerifiedAccount}
            onPress={() => {
              if (isVerifiedAccount) return;
              setReferralCode("");
              setReferralCodeModalVisible(true);
            }}
            style={[
              styles.referralBtn,
              isVerifiedAccount ? styles.disabledActionButton : null,
            ]}
          >
            <Text
              style={[
                styles.filledBtnText,
                isVerifiedAccount ? styles.disabledActionButtonText : null,
              ]}
            >
              Enter Client Code
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleLogout} style={[styles.redButton, { marginTop: 10 }]}> 
            <Text style={styles.redButtonText}>Sign Out</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleDeleteAccount}
            style={[styles.redButton, { marginTop: 10 }]}
          >
            <Text style={styles.redButtonText}>Delete Account</Text>
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

      <Modal visible={feedbackModalVisible} transparent animationType="slide" onRequestClose={() => setFeedbackModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.loadingCard}>
            <Text style={styles.title}>Send Feedback</Text>
            <Text style={{ textAlign: "center", marginVertical: 10, color: Colors.textPrimary }}>
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

            <View style={{ flexDirection: "row", marginTop: 20, gap: 10, width: "100%" }}>
              <TouchableOpacity
                onPress={() => {
                  setFeedbackModalVisible(false);
                  setFeedbackText("");
                }}
                style={[styles.signOutBtn, { backgroundColor: "#ccc", flex: 1 }]}
              >
                <Text style={{ color: "#000", textAlign: "center" }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={handleSendFeedback} style={[styles.signOutBtn, { flex: 1 }]}> 
                <Text style={styles.signOutText}>Send</Text>
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
            <Text style={{ textAlign: "center", marginVertical: 10, color: Colors.textPrimary }}>
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

            <View style={{ flexDirection: "row", marginTop: 20, gap: 10, width: "100%" }}>
              <TouchableOpacity
                onPress={() => setReferralCodeModalVisible(false)}
                style={[styles.signOutBtn, { backgroundColor: "#ccc", flex: 1 }]}
              >
                <Text style={{ color: "#000", textAlign: "center" }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={handleSubmitReferralCode} style={[styles.signOutBtn, { flex: 1 }]}> 
                <Text style={styles.signOutText}>Submit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={nameChangeModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setNameChangeModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.loadingCard}>
            <Text style={styles.title}>Change Your Name</Text>
            <Text style={{ textAlign: "center", marginVertical: 10, color: Colors.textPrimary }}>
              Enter your new name.
            </Text>

            <TextInput
              style={[styles.input, { color: Colors.textPrimary }]}
              placeholder="New name"
              placeholderTextColor="#999"
              value={newName}
              onChangeText={setNewName}
            />

            <View style={{ flexDirection: "row", marginTop: 20, gap: 10, width: "100%" }}>
              <TouchableOpacity
                onPress={() => setNameChangeModalVisible(false)}
                style={[styles.signOutBtn, { backgroundColor: "#ccc", flex: 1 }]}
              >
                <Text style={{ color: "#000", textAlign: "center" }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={handleSubmitNameChange} style={[styles.signOutBtn, { flex: 1 }]}> 
                <Text style={styles.signOutText}>Accept</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={vatSettingsVisible} transparent animationType="slide" onRequestClose={() => setVatSettingsVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.loadingCard}>
            <Text style={styles.title}>VAT Registration</Text>
            <TouchableOpacity style={styles.vatCheckboxRow} onPress={() => setVatRegistered((current) => !current)}>
              <Checkbox status={vatRegistered ? "checked" : "unchecked"} color={Colors.accent} />
              <Text style={styles.vatCheckboxText}>Registered for VAT</Text>
            </TouchableOpacity>
            {vatRegistered ? (
              <TextInput
                style={[styles.input, { color: Colors.textPrimary }]}
                placeholder="VAT registration number (optional)"
                placeholderTextColor="#999"
                value={vatRegistrationNumber}
                onChangeText={setVatRegistrationNumber}
              />
            ) : null}
            <View style={{ flexDirection: "row", marginTop: 20, gap: 10, width: "100%" }}>
              <TouchableOpacity onPress={() => setVatSettingsVisible(false)} style={[styles.signOutBtn, { backgroundColor: "#ccc", flex: 1 }]}>
                <Text style={{ color: "#000", textAlign: "center" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveVatSettings} style={[styles.signOutBtn, { flex: 1 }]}>
                <Text style={styles.signOutText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={deleteModalVisible} transparent animationType="fade" onRequestClose={() => setDeleteModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.loadingCard}>
            <Text style={[styles.title, { color: "#ff4444" }]}>Delete Account?</Text>
            <Text style={{ textAlign: "center", marginVertical: 10, color: Colors.textPrimary }}>
              This will permanently erase all receipts and images. Please type <Text style={{ fontWeight: "bold" }}>DELETE</Text> to confirm.
            </Text>

            <TextInput
              style={[styles.input, { width: "100%", textAlign: "center", color: Colors.textPrimary }]}
              placeholder="Type here"
              placeholderTextColor="#999"
              value={confirmText}
              onChangeText={setConfirmText}
              autoCapitalize="characters"
            />

            <View style={{ flexDirection: "row", marginTop: 20, gap: 10 }}>
              <TouchableOpacity
                onPress={() => {
                  setDeleteModalVisible(false);
                  setConfirmText("");
                }}
                style={[styles.signOutBtn, { backgroundColor: "#ccc", flex: 1 }]}
              >
                <Text style={{ color: "#000" }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={performDeletion}
                disabled={confirmText !== "DELETE"}
                style={[
                  styles.signOutBtn,
                  {
                    backgroundColor: confirmText === "DELETE" ? "#ff4444" : "#ffcccc",
                    flex: 1,
                  },
                ]}
              >
                <Text style={{ color: "white" }}>Delete All</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <RegisterVehicleModal
        visible={registerVehicleOpen}
        onClose={() => setRegisterVehicleOpen(false)}
        onSaved={(updated) => {
          setVehicles(updated);
          onVehiclesChanged?.(updated);
        }}
        vehicle={null}
      />

      <YourVehiclesModal
        visible={yourVehiclesOpen}
        onClose={() => setYourVehiclesOpen(false)}
        vehicles={vehicles}
        onChanged={(updated) => {
          setVehicles(updated);
          onVehiclesChanged?.(updated);
        }}
      />

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
  vatCheckboxRow: { flexDirection: "row", alignItems: "center", alignSelf: "stretch", marginVertical: 12 },
  vatCheckboxText: { color: Colors.textPrimary, fontSize: 15 },
  userEmail: {
    color: "#7B7B7B",
    fontSize: 14,
    marginBottom: 6,
  },
  verifiedAsText: {
    color: "#2e86de",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
  },
  menuLogo: {
    width: "100%",
    height: 60,
    marginTop: 8,
    marginBottom: 4,
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
  disabledMenuButton: {
    backgroundColor: "#f0f0f0",
    borderColor: "#ddd",
    opacity: 0.55,
  },
  disabledMenuButtonText: {
    color: "#aaa",
  },
  footerContainer: {
    marginTop: "auto",
    paddingBottom: 10,
  },
  referralBtn: {
    backgroundColor: "#27ae60",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: "center",
  },
  disabledActionButton: {
    backgroundColor: "#b9bcc8",
  },
  disabledActionButtonText: {
    color: "#f5f6f8",
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
    marginBottom: 20,
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
    paddingTop: 20,
    paddingBottom: 10,
  },
  versionText: {
    color: "#B5B3C6",
    fontSize: 12,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loadingCard: {
    backgroundColor: Colors.surface,
    paddingVertical: 20,
    paddingHorizontal: 26,
    borderRadius: 12,
    alignItems: "center",
    minWidth: 200,
    width: "100%",
    maxWidth: 420,
  },
  title: {
    fontSize: 19,
    fontWeight: "bold",
    color: Colors.textPrimary,
  },
  input: {
    width: "100%",
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.inputBg,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: Colors.textPrimary,
  },
  signOutBtn: {
    backgroundColor: Colors.accent,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginTop: 20,
  },
  signOutText: {
    color: "white",
    fontWeight: "700",
    textAlign: "center",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: "600",
    color: Colors.textPrimary,
  },
  verificationWarningText: {
    color: Colors.accent,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    marginBottom: 10,
  },
});