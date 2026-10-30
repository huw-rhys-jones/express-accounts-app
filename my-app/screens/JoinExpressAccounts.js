import React, { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import * as ImagePicker from "react-native-image-picker";
import { doc, setDoc } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db } from "../firebaseConfig";
import { Colors } from "../utils/sharedStyles";
import { useData } from "../contexts/DataContext";

const NAVY = "#1C1C4E";
const PRIMARY = Colors.accent;
const PINK_PILL = "#f9d6e4";

const BUSINESS_TYPES = ["Sole Trader", "Sub-Contractor (CIS)", "Limited Company", "Partnership", "Other"];
const WAITLIST_TYPES = ["Limited Company", "Partnership"];
const STEP_TITLES = ["Business Type", "HMRC Setup", "Contact Details"];

const UTR_REGEX = /^\d{10}$/;
const NI_REGEX = /^[A-Z]{2}\d{6}[A-D]$/;

const toYmd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const displayYmd = (s) => (s ? s.replace(/-/g, "/") : "");

export default function JoinExpressAccounts({ navigation }) {
  const insets = useSafeAreaInsets();
  const { userProfile } = useData();
  const user = auth.currentUser;
  const scrollRef = useRef(null);

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [businessType, setBusinessType] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");
  const [isRegisteredHMRC, setIsRegisteredHMRC] = useState(null);
  const [utrNumber, setUtrNumber] = useState("");
  const [niNumber, setNiNumber] = useState("");
  const [dob, setDob] = useState("");
  const [tradingStartDate, setTradingStartDate] = useState("");
  const [photoId, setPhotoId] = useState(null);
  const [proofOfAddress, setProofOfAddress] = useState(null);
  const [agreed, setAgreed] = useState(false);
  const [contactName, setContactName] = useState(
    String(userProfile?.name || userProfile?.displayName || user?.displayName || "")
  );
  const [contactEmail, setContactEmail] = useState(String(user?.email || userProfile?.email || ""));
  const [contactPhone, setContactPhone] = useState("");
  const [datePickerFor, setDatePickerFor] = useState(null);

  const isWaitlist = WAITLIST_TYPES.includes(businessType);
  const steps = useMemo(() => (isWaitlist ? [0, 2] : [0, 1, 2]), [isWaitlist]);
  const stepPos = steps.indexOf(step);

  const validateStep = (s) => {
    if (s === 0) {
      if (!businessType) return "Please choose your business type.";
      if (!isWaitlist && !businessDescription.trim()) return "Please describe your business.";
    }
    if (s === 1 && !isWaitlist) {
      if (isRegisteredHMRC === null) return "Please tell us whether you are registered as self-employed with HMRC.";
      const ni = niNumber.replace(/\s/g, "").toUpperCase();
      if (!NI_REGEX.test(ni)) return "Enter two letters, six digits, and a final letter A, B, C or D (e.g. QQ123456C).";
      if (isRegisteredHMRC) {
        if (!UTR_REGEX.test(utrNumber.replace(/\s/g, ""))) return "Your UTR must be 10 digits.";
        if (!dob) return "Please enter your date of birth.";
      } else {
        if (!tradingStartDate) return "Please enter your trading start date.";
        if (!photoId) return "Please upload a photo ID (passport or driving licence).";
        if (!proofOfAddress) return "Please upload a proof of address.";
      }
      if (!agreed) return "Please accept the Terms & Letter of Engagement to continue.";
    }
    if (s === 2) {
      if (!contactName.trim()) return "Please enter your full name.";
      if (!/^\S+@\S+\.\S+$/.test(contactEmail.trim())) return "Please enter a valid email address.";
    }
    return null;
  };

  const goTo = (next) => {
    setStep(next);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const handleContinue = () => {
    const err = validateStep(step);
    if (err) return Alert.alert("Missing information", err);
    goTo(steps[Math.min(stepPos + 1, steps.length - 1)]);
  };

  const pickImage = async (setter) => {
    try {
      const result = await ImagePicker.launchImageLibrary({ mediaType: "photo", quality: 0.8, selectionLimit: 1 });
      if (!result.didCancel && result.assets?.length) setter(result.assets[0]);
    } catch (e) {
      console.error("Image pick failed", e);
      Alert.alert("Error", "Could not select that image.");
    }
  };

  const uploadDoc = async (asset, label) => {
    const storage = getStorage();
    const storageRef = ref(storage, `joinRequests/${user.uid}/${label}-${Date.now()}.jpg`);
    const blob = await (await fetch(asset.uri)).blob();
    await uploadBytes(storageRef, blob);
    return getDownloadURL(storageRef);
  };

  const handleSubmit = async () => {
    if (!user) return Alert.alert("Not signed in", "Please sign in and try again.");
    for (const s of steps) {
      const err = validateStep(s);
      if (err) {
        goTo(s);
        return Alert.alert("Missing information", err);
      }
    }

    setSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      const joinRequest = {
        status: isWaitlist ? "waitlist" : "pending",
        businessType,
        contactName: contactName.trim(),
        contactEmail: contactEmail.trim(),
        contactPhone: contactPhone.trim(),
        submittedAt: nowIso,
      };

      if (!isWaitlist) {
        joinRequest.businessDescription = businessDescription.trim();
        joinRequest.isRegisteredHMRC = isRegisteredHMRC === true;
        joinRequest.niNumber = niNumber.replace(/\s/g, "").toUpperCase();
        joinRequest.engagementSignedAt = nowIso;
        if (isRegisteredHMRC) {
          joinRequest.utrNumber = utrNumber.replace(/\s/g, "");
          joinRequest.dob = dob;
        } else {
          joinRequest.tradingStartDate = tradingStartDate;
          joinRequest.photoIdUrl = await uploadDoc(photoId, "photo-id");
          joinRequest.proofOfAddressUrl = await uploadDoc(proofOfAddress, "proof-of-address");
        }
      }

      await setDoc(
        doc(db, "users", user.uid),
        { joinRequest, accountStatus: "join_request" },
        { merge: true }
      );

      Alert.alert(
        isWaitlist ? "You're on the list" : "Application sent",
        isWaitlist
          ? "Thanks for your interest. We'll be in touch when we can support your business type. You can keep using the free app in the meantime."
          : "Thanks! One of our accountants will review your application and contact you shortly.",
        [{ text: "OK", onPress: () => navigation.goBack() }]
      );
    } catch (e) {
      console.error("Join request failed", e);
      Alert.alert("Submission failed", "Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const renderField = (label, props) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor="#999" {...props} />
    </View>
  );

  const renderDateField = (label, value, key, maximum) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity style={styles.input} onPress={() => setDatePickerFor({ key, maximum })} activeOpacity={0.8}>
        <Text style={{ color: value ? "#222" : "#999" }}>{value ? displayYmd(value) : "YYYY/MM/DD"}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderUpload = (label, asset, setter) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity style={styles.uploadBox} onPress={() => pickImage(setter)} activeOpacity={0.8}>
        {asset ? (
          <Image source={{ uri: asset.uri }} style={styles.uploadPreview} resizeMode="cover" />
        ) : (
          <Text style={styles.uploadText}>Tap to upload</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  const renderYesNo = () => (
    <View style={styles.chipRow}>
      {[true, false].map((val) => (
        <TouchableOpacity
          key={String(val)}
          style={[styles.chip, isRegisteredHMRC === val && styles.chipSelected]}
          onPress={() => setIsRegisteredHMRC(val)}
        >
          <Text style={[styles.chipText, isRegisteredHMRC === val && styles.chipTextSelected]}>{val ? "Yes" : "No"}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderStep = () => {
    if (step === 0) {
      return (
        <>
          <Text style={styles.label}>What type of business do you run?</Text>
          <View style={styles.chipRow}>
            {BUSINESS_TYPES.map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.chip, businessType === t && styles.chipSelected]}
                onPress={() => setBusinessType(t)}
              >
                <Text style={[styles.chipText, businessType === t && styles.chipTextSelected]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {isWaitlist ? (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>
                Express Accounts currently specialises in Sole Traders and Sub-Contractors. You can still register your
                interest and we'll add you to our waitlist. In the meantime you can keep using the free app as normal.
              </Text>
            </View>
          ) : businessType ? (
            renderField("Business description", {
              value: businessDescription,
              onChangeText: setBusinessDescription,
              placeholder: "e.g. Plumbing services",
              multiline: true,
              style: [styles.input, { minHeight: 70, textAlignVertical: "top" }],
            })
          ) : null}
        </>
      );
    }

    if (step === 1) {
      return (
        <>
          <Text style={styles.label}>Are you registered as self-employed with HMRC?</Text>
          {renderYesNo()}
          {isRegisteredHMRC !== null && (
            <>
              {isRegisteredHMRC &&
                renderField("UTR number (10 digits)", {
                  value: utrNumber,
                  onChangeText: (t) => setUtrNumber(t.replace(/\D/g, "").slice(0, 10)),
                  keyboardType: "number-pad",
                  maxLength: 10,
                })}
              {renderField("National Insurance number", {
                value: niNumber,
                onChangeText: (t) => setNiNumber(t.toUpperCase()),
                autoCapitalize: "characters",
                autoCorrect: false,
                maxLength: 13,
                placeholder: "QQ123456C",
              })}
              {isRegisteredHMRC ? (
                renderDateField("Date of birth", dob, "dob", true)
              ) : (
                <>
                  {renderDateField("Trading start date", tradingStartDate, "tradingStartDate", false)}
                  {renderUpload("Photo ID (passport or driving licence)", photoId, setPhotoId)}
                  {renderUpload("Proof of address", proofOfAddress, setProofOfAddress)}
                </>
              )}
              <TouchableOpacity style={styles.agreeRow} onPress={() => setAgreed((v) => !v)} activeOpacity={0.8}>
                <View style={[styles.checkbox, agreed && styles.checkboxOn]}>
                  {agreed ? <Text style={styles.checkMark}>✓</Text> : null}
                </View>
                <Text style={styles.agreeText}>
                  I agree to the Terms and Letter of Engagement and authorise Express Accounts to act on my behalf with
                  HMRC. Ticking this box is my electronic signature.
                </Text>
              </TouchableOpacity>
            </>
          )}
        </>
      );
    }

    return (
      <>
        {renderField("Full name", { value: contactName, onChangeText: setContactName, autoCapitalize: "words" })}
        {renderField("Email address", {
          value: contactEmail,
          onChangeText: setContactEmail,
          keyboardType: "email-address",
          autoCapitalize: "none",
          autoCorrect: false,
        })}
        {renderField("Phone number (optional)", {
          value: contactPhone,
          onChangeText: setContactPhone,
          keyboardType: "phone-pad",
          textContentType: "telephoneNumber",
          placeholder: "+447123456789",
        })}
      </>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["left", "right"]}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 0) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn} activeOpacity={0.8}>
          <Text style={styles.headerBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Join Express Accounts</Text>
        <View style={styles.headerBtn} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <Text style={styles.heroLine}>
              Making Tax <Text style={styles.strike}>Digital</Text>
            </Text>
            <Text style={styles.heroAccent}>Making Tax Doable</Text>
            <Text style={styles.blurb}>
              Let us take tax off your plate. Our accountants handle your quarterly returns and HMRC compliance while you
              log income and expenses on the go.
            </Text>

            <Text style={styles.stepTitle}>
              Step {stepPos + 1} of {steps.length}: {STEP_TITLES[step]}
            </Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${((stepPos + 1) / steps.length) * 100}%` }]} />
            </View>

            {renderStep()}

            <View style={styles.navRow}>
              {stepPos > 0 ? (
                <TouchableOpacity onPress={() => goTo(steps[stepPos - 1])}>
                  <Text style={styles.navLink}>‹ Back</Text>
                </TouchableOpacity>
              ) : (
                <View />
              )}
              {stepPos < steps.length - 1 ? (
                <TouchableOpacity onPress={handleContinue}>
                  <Text style={styles.navLink}>Continue ›</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <TouchableOpacity
          style={[styles.pill, { backgroundColor: PINK_PILL }]}
          onPress={() => navigation.goBack()}
          disabled={submitting}
          activeOpacity={0.8}
        >
          <Text style={[styles.pillText, { color: PRIMARY }]}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.pill, { backgroundColor: PRIMARY, flex: 1.6 }, submitting && { opacity: 0.7 }]}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.8}
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={[styles.pillText, { color: "#fff" }]}>Submit Application</Text>}
        </TouchableOpacity>
      </View>

      <DateTimePickerModal
        isVisible={!!datePickerFor}
        mode="date"
        maximumDate={datePickerFor?.maximum ? new Date() : undefined}
        onConfirm={(d) => {
          const key = datePickerFor?.key;
          setDatePickerFor(null);
          if (key === "dob") setDob(toYmd(d));
          if (key === "tradingStartDate") setTradingStartDate(toYmd(d));
        }}
        onCancel={() => setDatePickerFor(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: NAVY },
  header: {
    backgroundColor: NAVY,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerTitle: { color: "#fff", fontSize: 17, fontWeight: "700" },
  headerBtn: { width: 40, alignItems: "center" },
  headerBtnText: { color: "#fff", fontWeight: "600", fontSize: 22 },
  scroll: { padding: 16, paddingBottom: 24 },
  card: { backgroundColor: "#fff", borderRadius: 20, padding: 20 },
  heroLine: { fontSize: 24, fontWeight: "800", color: NAVY },
  strike: { textDecorationLine: "line-through", color: "#888" },
  heroAccent: { fontSize: 24, fontWeight: "800", color: PRIMARY, marginBottom: 8 },
  blurb: { color: "#444", fontSize: 14, lineHeight: 20, marginBottom: 18 },
  stepTitle: { fontSize: 16, fontWeight: "700", color: NAVY, marginBottom: 8 },
  progressTrack: { height: 4, backgroundColor: "#e3e3ea", borderRadius: 2, marginBottom: 16 },
  progressFill: { height: 4, backgroundColor: PRIMARY, borderRadius: 2 },
  field: { marginTop: 12 },
  label: { fontSize: 14, fontWeight: "600", color: NAVY, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: "#222",
    backgroundColor: "#fafafa",
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  chip: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: "#fff",
  },
  chipSelected: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  chipText: { color: NAVY, fontSize: 14 },
  chipTextSelected: { color: "#fff", fontWeight: "700" },
  notice: { backgroundColor: "#fff4e0", borderRadius: 10, padding: 12, marginTop: 14 },
  noticeText: { color: "#6b4a00", fontSize: 13, lineHeight: 19 },
  uploadBox: {
    height: 110,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#aaa",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  uploadPreview: { width: "100%", height: "100%" },
  uploadText: { color: "#777" },
  agreeRow: { flexDirection: "row", alignItems: "flex-start", marginTop: 18 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: PRIMARY,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    marginTop: 1,
  },
  checkboxOn: { backgroundColor: PRIMARY },
  checkMark: { color: "#fff", fontSize: 14, fontWeight: "800" },
  agreeText: { flex: 1, color: "#444", fontSize: 13, lineHeight: 19 },
  navRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 22 },
  navLink: { color: PRIMARY, fontSize: 15, fontWeight: "700" },
  actionBar: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: "#fff",
    borderTopWidth: 2,
    borderTopColor: PRIMARY,
  },
  pill: { flex: 1, height: 48, borderRadius: 25, alignItems: "center", justifyContent: "center" },
  pillText: { fontSize: 16, fontWeight: "700" },
});
