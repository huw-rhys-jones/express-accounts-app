/**
 * PhoneEnrollmentScreen.js
 *
 * Lets a signed-in user enrol their phone number as a second factor (SMS 2FA).
 *
 * Flow:
 *   1. Enter phone number (E.164 format, e.g. +447412105958)
 *   2. Firebase sends an SMS via the reCAPTCHA-verified PhoneAuthProvider
 *   3. User enters the 6-digit code
 *   4. Phone is enrolled as a MultiFactorAssertion on the account
 *
 * Can be reached from a settings / profile screen, or automatically after
 * first login if 2FA has not yet been set up.
 */

import React, { useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  ScrollView,
} from "react-native";
import { FirebaseRecaptchaVerifierModal } from "expo-firebase-recaptcha";
import {
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  multiFactor,
} from "firebase/auth";
import { auth, firebaseConfig } from "../firebaseConfig";
import { Colors } from "../utils/sharedStyles";
import { triggerHaptic } from "../utils/haptics";

export default function PhoneEnrollmentScreen({ navigation }) {
  const recaptchaVerifier = useRef(null);

  const [phoneNumber, setPhoneNumber] = useState("+44");
  const [verificationId, setVerificationId] = useState(null);
  const [code, setCode] = useState("");
  const [step, setStep] = useState("phone"); // "phone" | "code"
  const [busy, setBusy] = useState(false);

  // ── Step 1: Send SMS ────────────────────────────────────────────────────────
  const sendVerificationCode = async () => {
    const phone = phoneNumber.trim();
    if (!phone || !phone.startsWith("+") || phone.length < 8) {
      Alert.alert(
        "Invalid Number",
        "Please enter a valid phone number in international format, e.g. +447412105958"
      );
      return;
    }

    setBusy(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        Alert.alert("Not Signed In", "Please sign in again and retry.");
        navigation.navigate("SignIn");
        return;
      }

      const multiFactorUser = multiFactor(user);
      const session = await multiFactorUser.getSession();

      const phoneProvider = new PhoneAuthProvider(auth);
      const id = await phoneProvider.verifyPhoneNumber(
        { phoneNumber: phone, session },
        recaptchaVerifier.current
      );

      setVerificationId(id);
      setStep("code");
      triggerHaptic("selection").catch(() => {});
    } catch (err) {
      console.error("❌ Phone enrolment — send SMS failed:", err);
      let message = "Could not send the verification code. Please try again.";
      if (err?.code === "auth/invalid-phone-number") {
        message = "That phone number is not valid. Please use international format, e.g. +447412105958.";
      } else if (err?.code === "auth/too-many-requests") {
        message = "Too many attempts. Please wait a moment and try again.";
      } else if (err?.code === "auth/requires-recent-login") {
        message = "For security, please sign out and sign in again before setting up 2FA.";
      }
      Alert.alert("Error", message);
    } finally {
      setBusy(false);
    }
  };

  // ── Step 2: Verify code and enrol ──────────────────────────────────────────
  const enrollPhone = async () => {
    if (!verificationId) {
      Alert.alert("Not Ready", "Please send the verification code first.");
      return;
    }
    if (code.trim().length < 6) {
      Alert.alert("Invalid Code", "Please enter the 6-digit code from your SMS.");
      return;
    }

    setBusy(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        Alert.alert("Not Signed In", "Please sign in again and retry.");
        navigation.navigate("SignIn");
        return;
      }

      const credential = PhoneAuthProvider.credential(verificationId, code.trim());
      const assertion = PhoneMultiFactorGenerator.assertion(credential);

      await multiFactor(user).enroll(assertion, "Phone");

      triggerHaptic("success").catch(() => {});
      Alert.alert(
        "2FA Enabled",
        "Phone verification has been set up. You will be asked for an SMS code each time you sign in.",
        [{ text: "OK", onPress: () => navigation.goBack() }]
      );
    } catch (err) {
      console.error("❌ Phone enrolment — verify failed:", err);
      let message = "Could not verify the code. Please try again.";
      if (err?.code === "auth/invalid-verification-code") {
        message = "That code is incorrect. Please check your SMS and try again.";
      } else if (err?.code === "auth/code-expired") {
        message = "The code has expired. Please go back and request a new one.";
      }
      Alert.alert("Verification Failed", message);
      triggerHaptic("error").catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Hidden reCAPTCHA — surfaces as a modal only when required by Firebase */}
        <FirebaseRecaptchaVerifierModal
          ref={recaptchaVerifier}
          firebaseConfig={firebaseConfig}
          attemptInvisibleVerification
        />

        <View style={styles.logoContainer}>
          <Image
            source={require("../assets/images/logo.png")}
            style={styles.logo}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Set Up SMS Verification</Text>
          <Text style={styles.subtitle}>
            Add your phone number to secure your account with SMS two-factor authentication.
          </Text>

          {/* ── Step 1: enter phone number ── */}
          {step === "phone" && (
            <>
              <Text style={styles.label}>PHONE NUMBER</Text>
              <TextInput
                style={styles.input}
                placeholder="+447412105958"
                placeholderTextColor="#AAA"
                keyboardType="phone-pad"
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                autoFocus
                editable={!busy}
              />
              <Text style={styles.note}>
                Enter your number in international format, starting with your country code (e.g. +44 for UK).
              </Text>

              <TouchableOpacity
                style={[styles.primaryButton, busy && { opacity: 0.6 }]}
                onPress={sendVerificationCode}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>Send Verification Code</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {/* ── Step 2: enter SMS code ── */}
          {step === "code" && (
            <>
              <Text style={styles.hint}>
                A 6-digit code has been sent to {phoneNumber.trim()}.
              </Text>

              <Text style={styles.label}>VERIFICATION CODE</Text>
              <TextInput
                style={styles.codeInput}
                placeholder="000000"
                placeholderTextColor="#AAA"
                keyboardType="number-pad"
                maxLength={6}
                value={code}
                onChangeText={setCode}
                autoFocus
                editable={!busy}
              />

              <TouchableOpacity
                style={[styles.primaryButton, busy && { opacity: 0.6 }]}
                onPress={enrollPhone}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>Confirm &amp; Enable 2FA</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secondaryButton, busy && { opacity: 0.6 }]}
                onPress={() => {
                  setStep("phone");
                  setCode("");
                  setVerificationId(null);
                }}
                disabled={busy}
              >
                <Text style={styles.secondaryButtonText}>Change Number</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => navigation.goBack()}
            disabled={busy}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    alignItems: "center",
    paddingTop: 40,
    paddingBottom: 40,
  },
  logoContainer: {
    backgroundColor: Colors.surface,
    width: "85%",
    maxWidth: 400,
    paddingVertical: 16,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  logo: {
    width: 260,
    height: 80,
    resizeMode: "contain",
  },
  card: {
    backgroundColor: Colors.card,
    width: "85%",
    maxWidth: 400,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: Colors.textPrimary,
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 20,
  },
  hint: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 20,
  },
  label: {
    alignSelf: "flex-start",
    fontSize: 13,
    fontWeight: "700",
    color: Colors.textSecondary,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: Colors.inputBg,
    color: Colors.textSecondary,
    fontSize: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    width: "100%",
    marginBottom: 8,
  },
  codeInput: {
    backgroundColor: Colors.inputBg,
    color: Colors.textPrimary,
    fontSize: 22,
    letterSpacing: 8,
    textAlign: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    width: "100%",
    marginBottom: 16,
  },
  note: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 18,
    lineHeight: 17,
  },
  primaryButton: {
    backgroundColor: Colors.accent,
    paddingVertical: 13,
    borderRadius: 25,
    alignItems: "center",
    width: "100%",
    marginBottom: 10,
  },
  primaryButtonText: {
    color: "#FFF",
    fontWeight: "bold",
    fontSize: 16,
  },
  secondaryButton: {
    backgroundColor: Colors.surface,
    paddingVertical: 11,
    borderRadius: 25,
    alignItems: "center",
    width: "100%",
    marginBottom: 10,
  },
  secondaryButtonText: {
    color: Colors.textSecondary,
    fontWeight: "600",
    fontSize: 15,
  },
  cancelButton: {
    marginTop: 6,
    paddingVertical: 8,
  },
  cancelText: {
    color: Colors.textMuted,
    fontSize: 13,
    textDecorationLine: "underline",
  },
});
