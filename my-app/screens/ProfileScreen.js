import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "react-native-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { deleteUser, signOut, updateEmail, updateProfile } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, listAll, deleteObject } from "firebase/storage";
import { SafeAreaView } from "react-native-safe-area-context";
import { Checkbox } from "react-native-paper";
import { auth, db } from "../firebaseConfig";
import { useData } from "../contexts/DataContext";
import { getVehicles } from "../utils/appSettings";
import { Colors } from "../utils/sharedStyles";
import YourVehiclesModal from "../components/YourVehiclesModal";

const ProfileRow = ({ icon, label, value, onPress, disabled = false, danger = false }) => (
  <TouchableOpacity
    style={[styles.row, disabled && styles.disabledRow]}
    onPress={onPress}
    disabled={disabled}
    activeOpacity={0.75}
  >
    <Ionicons name={icon} size={21} color={disabled ? "#999" : danger ? Colors.accent : Colors.textPrimary} />
    <View style={styles.rowText}>
      <Text style={[styles.rowLabel, danger && styles.dangerText, disabled && styles.disabledText]}>{label}</Text>
      {value ? <Text style={[styles.rowValue, disabled && styles.disabledText]} numberOfLines={1}>{value}</Text> : null}
    </View>
    {onPress && !disabled ? <Ionicons name="chevron-forward" size={20} color={Colors.textPrimary} /> : null}
  </TouchableOpacity>
);

const profileImageStorageKey = (userId) => `express-accounts-profile-image:${userId}`;

export default function ProfileScreen({ navigation }) {
  const { userProfile, displayName: contextDisplayName } = useData();
  const user = auth.currentUser;
  const [currentDisplayName, setCurrentDisplayName] = useState(user?.displayName || contextDisplayName || "User");
  const [email, setEmail] = useState(user?.email || "");
  const [profileImageUrl, setProfileImageUrl] = useState(
    userProfile?.profileImageUrl || user?.photoURL || "",
  );
  const [localProfileImageUri, setLocalProfileImageUri] = useState("");
  const [verifiedName, setVerifiedName] = useState(String(userProfile?.verifiedName || ""));
  const [verificationStatus, setVerificationStatus] = useState(String(userProfile?.verificationStatus || ""));
  const [vehicles, setVehicles] = useState(Array.isArray(userProfile?.vehicles) ? userProfile.vehicles : []);
  const [nameModalVisible, setNameModalVisible] = useState(false);
  const [emailModalVisible, setEmailModalVisible] = useState(false);
  const [vatModalVisible, setVatModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [newName, setNewName] = useState(currentDisplayName);
  const [newEmail, setNewEmail] = useState(email);
  const [confirmText, setConfirmText] = useState("");
  const [vatRegistered, setVatRegistered] = useState(userProfile?.taxProfile?.vat?.isRegistered === true);
  const [vatRegistrationNumber, setVatRegistrationNumber] = useState(String(userProfile?.taxProfile?.vat?.registrationNumber || ""));
  const [vehiclesVisible, setVehiclesVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyText, setBusyText] = useState("Please wait...");

  useEffect(() => {
    let active = true;
    const loadLatestProfile = async () => {
      const snapshot = user ? await getDoc(doc(db, "users", user.uid)).catch(() => null) : null;
      const localImage = user ? await AsyncStorage.getItem(profileImageStorageKey(user.uid)).catch(() => null) : null;
      if (!active) return;
      const latestProfile = snapshot?.exists() ? snapshot.data() || {} : userProfile || {};
      setCurrentDisplayName(user?.displayName || contextDisplayName || "User");
      setEmail(user?.email || "");
      const storedProfileImage = latestProfile.profileImageUrl || user?.photoURL || "";
      setLocalProfileImageUri((current) => current || localImage || "");
      setProfileImageUrl(localProfileImageUri || localImage || storedProfileImage);
      setVerifiedName(String(latestProfile.verifiedName || ""));
      setVerificationStatus(String(latestProfile.verificationStatus || ""));
      setVehicles(Array.isArray(latestProfile.vehicles) ? latestProfile.vehicles : []);
      setVatRegistered(latestProfile.taxProfile?.vat?.isRegistered === true);
      setVatRegistrationNumber(String(latestProfile.taxProfile?.vat?.registrationNumber || ""));
    };
    loadLatestProfile();
    return () => { active = false; };
  }, [contextDisplayName, localProfileImageUri, user, userProfile]);

  useEffect(() => {
    getVehicles().then(setVehicles).catch(() => {});
  }, []);

  const runBusy = useCallback(async (text, fn) => {
    setBusyText(text);
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }, []);

  const saveName = async () => {
    if (!user || !newName.trim()) return;
    await runBusy("Saving name...", async () => {
      await updateProfile(user, { displayName: newName.trim() });
      await setDoc(doc(db, "users", user.uid), { name: newName.trim(), updatedAt: serverTimestamp() }, { merge: true });
      setCurrentDisplayName(newName.trim());
      setNameModalVisible(false);
    });
  };

  const saveEmail = async () => {
    if (!user || !newEmail.trim()) return;
    await runBusy("Saving email...", async () => {
      await updateEmail(user, newEmail.trim());
      await setDoc(doc(db, "users", user.uid), { email: newEmail.trim(), updatedAt: serverTimestamp() }, { merge: true });
      setEmail(newEmail.trim());
      setEmailModalVisible(false);
    }).catch((error) => {
      Alert.alert("Could not update email", error?.code === "auth/requires-recent-login" ? "Please sign out and sign back in before changing your email." : "Please check the address and try again.");
    });
  };

  const saveVat = async () => {
    if (!user) return;
    await runBusy("Saving VAT settings...", async () => {
      const registrationNumber = vatRegistered ? vatRegistrationNumber.trim() : "";
      await setDoc(doc(db, "users", user.uid), {
        taxProfile: { vat: { isRegistered: vatRegistered, registrationNumber, hasAnsweredRegistrationQuestion: true, setupCompletedAt: serverTimestamp(), updatedAt: serverTimestamp() } },
        hasAnsweredVatRegistration: true,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setVatRegistrationNumber(registrationNumber);
      setVatModalVisible(false);
    });
  };

  const uploadProfileImage = async (asset) => {
    if (!user || !asset?.uri) return;
    await AsyncStorage.setItem(profileImageStorageKey(user.uid), asset.uri);
    setLocalProfileImageUri(asset.uri);
    setProfileImageUrl(asset.uri);
    await runBusy("Saving profile picture...", async () => {
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const fileRef = storageRef(getStorage(), `profilePictures/${user.uid}/profile.jpg`);
      await uploadBytes(fileRef, blob, { contentType: asset.type || "image/jpeg" });
      const url = `${await getDownloadURL(fileRef)}?v=${Date.now()}`;
      await updateProfile(user, { photoURL: url });
      await setDoc(doc(db, "users", user.uid), { profileImageUrl: url, updatedAt: serverTimestamp() }, { merge: true });
      setProfileImageUrl(url);
    });
  };

  const chooseProfileImage = () => {
    Alert.alert("Profile Picture", "Choose an image source", [
      {
        text: "Take Photo",
        onPress: () => ImagePicker.launchCamera({ mediaType: "photo", cameraType: "front", quality: 0.85 }, (result) => {
          if (!result.didCancel && !result.errorCode) uploadProfileImage(result.assets?.[0]).catch(() => Alert.alert("Upload failed", "Could not save that profile picture."));
        }),
      },
      {
        text: "Choose From Library",
        onPress: () => ImagePicker.launchImageLibrary({ mediaType: "photo", selectionLimit: 1, quality: 0.85 }, (result) => {
          if (!result.didCancel && !result.errorCode) uploadProfileImage(result.assets?.[0]).catch(() => Alert.alert("Upload failed", "Could not save that profile picture."));
        }),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const handleSignOut = async () => {
    await runBusy("Signing out...", async () => {
      await signOut(auth);
      navigation.replace("SignIn");
    });
  };

  const deleteUserStorage = async (userId) => {
    for (const folderName of ["receipts", "income", "bankStatements"]) {
      try {
        const result = await listAll(storageRef(getStorage(), `${folderName}/${userId}`));
        await Promise.all(result.items.map((item) => deleteObject(item)));
      } catch (_) {}
    }
  };

  const performDeletion = async () => {
    if (!user || confirmText !== "DELETE") return;
    setDeleteModalVisible(false);
    setConfirmText("");
    await runBusy("Permanently erasing data...", async () => {
      await deleteUserStorage(user.uid);
      const batch = writeBatch(db);
      const snapshots = await Promise.all([
        getDocs(query(collection(db, "receipts"), where("userId", "==", user.uid))),
        getDocs(query(collection(db, "income"), where("userId", "==", user.uid))),
        getDocs(query(collection(db, "bankStatements"), where("userId", "==", user.uid))),
      ]);
      snapshots.forEach((snapshot) => snapshot.forEach((item) => batch.delete(item.ref)));
      await batch.commit();
      await deleteDoc(doc(db, "users", user.uid));
      await deleteUser(user);
      navigation.replace("SignIn");
    }).catch((error) => {
      Alert.alert("Could not delete account", error?.code === "auth/requires-recent-login" ? "Please sign out and sign back in, then try again." : "Something went wrong. Please try again.");
    });
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.identityCard}>
          <TouchableOpacity style={styles.avatar} onPress={chooseProfileImage} accessibilityLabel="Change profile picture">
            {profileImageUrl ? <Image source={{ uri: profileImageUrl }} style={styles.avatarImage} onError={() => { if (localProfileImageUri && profileImageUrl !== localProfileImageUri) setProfileImageUrl(localProfileImageUri); }} /> : <Ionicons name="person" size={42} color={Colors.textPrimary} />}
            <View style={styles.cameraBadge}><Ionicons name="camera" size={15} color="#fff" /></View>
          </TouchableOpacity>
          <View style={styles.identityLine}><Text style={styles.identityName}>{currentDisplayName}</Text><TouchableOpacity onPress={() => { setNewName(currentDisplayName); setNameModalVisible(true); }}><Ionicons name="pencil" size={18} color={Colors.textPrimary} /></TouchableOpacity></View>
          <View style={styles.identityLine}><Text style={styles.identityEmail}>{email}</Text><TouchableOpacity onPress={() => { setNewEmail(email); setEmailModalVisible(true); }}><Ionicons name="pencil" size={18} color={Colors.textPrimary} /></TouchableOpacity></View>
          {verificationStatus === "verified" && verifiedName ? <Text style={styles.verified}>Verified as {verifiedName}</Text> : null}
        </View>

        <ProfileRow icon="car-outline" label="Your Vehicles" value={vehicles.length ? `${vehicles.length} registered` : "No vehicles registered"} onPress={() => setVehiclesVisible(true)} />
        <ProfileRow icon="receipt-outline" label="VAT Registration" value={vatRegistered ? "Registered" : "Not registered"} onPress={() => setVatModalVisible(true)} />
        <ProfileRow icon="id-card-outline" label="Add ID Image" disabled />
        <ProfileRow icon="location-outline" label="Add Address" disabled />
        <ProfileRow icon="log-out-outline" label="Sign Out" onPress={handleSignOut} danger />
        <ProfileRow icon="trash-outline" label="Delete Account" onPress={() => setDeleteModalVisible(true)} danger />
      </ScrollView>

      <Modal visible={nameModalVisible} transparent animationType="slide" onRequestClose={() => setNameModalVisible(false)}>
        <EditModal title="Change Your Name" value={newName} onChangeText={setNewName} onCancel={() => setNameModalVisible(false)} onSave={saveName} />
      </Modal>
      <Modal visible={emailModalVisible} transparent animationType="slide" onRequestClose={() => setEmailModalVisible(false)}>
        <EditModal title="Change Your Email" value={newEmail} onChangeText={setNewEmail} keyboardType="email-address" autoCapitalize="none" onCancel={() => setEmailModalVisible(false)} onSave={saveEmail} />
      </Modal>
      <Modal visible={vatModalVisible} transparent animationType="slide" onRequestClose={() => setVatModalVisible(false)}>
        <View style={styles.modalOverlay}><View style={styles.modalCard}><Text style={styles.modalTitle}>VAT Registration</Text><TouchableOpacity style={styles.checkboxRow} onPress={() => setVatRegistered((value) => !value)}><Checkbox status={vatRegistered ? "checked" : "unchecked"} color={Colors.accent} /><Text style={styles.modalText}>Registered for VAT</Text></TouchableOpacity>{vatRegistered ? <TextInput style={styles.input} placeholder="VAT registration number (optional)" value={vatRegistrationNumber} onChangeText={setVatRegistrationNumber} /> : null}<ModalButtons onCancel={() => setVatModalVisible(false)} onSave={saveVat} /></View></View>
      </Modal>
      <Modal visible={deleteModalVisible} transparent animationType="fade" onRequestClose={() => setDeleteModalVisible(false)}>
        <View style={styles.modalOverlay}><View style={styles.modalCard}><Text style={[styles.modalTitle, styles.dangerText]}>Delete Account?</Text><Text style={styles.modalText}>This will permanently erase all receipts and images. Type DELETE to confirm.</Text><TextInput style={styles.input} value={confirmText} onChangeText={setConfirmText} autoCapitalize="characters" placeholder="Type DELETE" /><ModalButtons onCancel={() => { setDeleteModalVisible(false); setConfirmText(""); }} onSave={performDeletion} saveLabel="Delete All" disabled={confirmText !== "DELETE"} danger /></View></View>
      </Modal>
      <YourVehiclesModal visible={vehiclesVisible} onClose={() => setVehiclesVisible(false)} vehicles={vehicles} onChanged={setVehicles} />
      {busy ? <View style={styles.busyOverlay}><ActivityIndicator size="large" color="#fff" /><Text style={styles.busyText}>{busyText}</Text></View> : null}
    </SafeAreaView>
  );
}

function EditModal({ title, value, onChangeText, onCancel, onSave, keyboardType, autoCapitalize }) {
  return <View style={styles.modalOverlay}><KeyboardAvoidingView style={styles.modalKeyboard} behavior={Platform.OS === "ios" ? "padding" : undefined}><View style={styles.modalCard}><Text style={styles.modalTitle}>{title}</Text><TextInput style={styles.input} value={value} onChangeText={onChangeText} keyboardType={keyboardType} autoCapitalize={autoCapitalize} /><ModalButtons onCancel={onCancel} onSave={onSave} /></View></KeyboardAvoidingView></View>;
}

function ModalButtons({ onCancel, onSave, saveLabel = "Save", disabled = false, danger = false }) {
  return <View style={styles.modalButtons}><TouchableOpacity style={styles.cancelButton} onPress={onCancel}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity><TouchableOpacity style={[styles.saveButton, danger && styles.dangerButton, disabled && styles.disabledButton]} onPress={onSave} disabled={disabled}><Text style={styles.saveText}>{saveLabel}</Text></TouchableOpacity></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: { height: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backButton: { width: 38, height: 38, borderWidth: 1, borderColor: Colors.border, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  headerSpacer: { width: 38 },
  headerTitle: { color: Colors.textPrimary, fontSize: 18, fontWeight: "700" },
  content: { padding: 14, paddingBottom: 32 },
  identityCard: { backgroundColor: Colors.surface, borderRadius: 14, padding: 18, alignItems: "center", marginBottom: 12 },
  avatar: { width: 66, height: 66, borderRadius: 33, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  avatarImage: { width: "100%", height: "100%", borderRadius: 33 },
  cameraBadge: { position: "absolute", right: -2, bottom: -2, width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: Colors.surface },
  identityLine: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, width: "100%", marginTop: 3 },
  identityName: { color: Colors.textPrimary, fontSize: 17, fontWeight: "700" },
  identityEmail: { color: Colors.accent, fontSize: 14 },
  verified: { color: "#1479e8", fontSize: 12, fontWeight: "700", marginTop: 6 },
  row: { minHeight: 56, flexDirection: "row", alignItems: "center", backgroundColor: Colors.surface, borderRadius: 10, paddingHorizontal: 14, marginBottom: 10, borderWidth: 1, borderColor: "#e2e2e8" },
  rowText: { flex: 1, marginLeft: 12 },
  rowLabel: { color: Colors.textPrimary, fontSize: 14, fontWeight: "700" },
  rowValue: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  disabledRow: { backgroundColor: "#d8d8e2", borderColor: "#c7c7d2" },
  disabledText: { color: "#858596" },
  dangerText: { color: Colors.accent },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 },
  modalKeyboard: { width: "100%", alignItems: "center" },
  modalCard: { width: "100%", maxWidth: 420, backgroundColor: Colors.surface, borderRadius: 16, padding: 22 },
  modalTitle: { color: Colors.textPrimary, fontSize: 19, fontWeight: "700", textAlign: "center", marginBottom: 16 },
  modalText: { color: Colors.textPrimary, textAlign: "center", marginBottom: 12 },
  checkboxRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  input: { width: "100%", borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.inputBg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, color: Colors.textPrimary },
  modalButtons: { flexDirection: "row", gap: 10, marginTop: 18 },
  cancelButton: { flex: 1, paddingVertical: 13, borderRadius: 10, backgroundColor: "#ddd", alignItems: "center" },
  saveButton: { flex: 1, paddingVertical: 13, borderRadius: 10, backgroundColor: Colors.textPrimary, alignItems: "center" },
  dangerButton: { backgroundColor: Colors.accent },
  disabledButton: { opacity: 0.45 },
  cancelText: { color: Colors.textPrimary, fontWeight: "700" },
  saveText: { color: "#fff", fontWeight: "700" },
  busyOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", zIndex: 10 },
  busyText: { color: "#fff", marginTop: 10, fontWeight: "600" },
});
