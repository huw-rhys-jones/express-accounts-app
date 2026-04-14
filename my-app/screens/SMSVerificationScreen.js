/**
 * SMSVerificationScreen.js
 *
 * Shown during login when the user has phone 2FA enrolled.
 * Receives the Firebase MultiFactorResolver (stored in mfaState) and:
 *   1. Sends an SMS to the enrolled phone number
 *   2. Prompts the user to enter the 6-digit code
 *   3. Completes sign-in via resolver.resolveSignIn()
 */

import React, { useRef, useState, useEffect } from "react";
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
} from "react-native";
import { FirebaseRecaptchaVerifierModal } from "expo-firebase-recaptcha";
import {
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
} from "firebase/auth";
import { auth, firebaseConfig } from "../firebaseConfig";
import { getMfaResolver, clearMfaResolver } from "../utils/mfaState";
import { Colors, AuthStyles } from "../utils/sharedStyles";
import { triggerHaptic } from "../utils/haptics";

export default function SMSVerificationScreen({ navigation }) {
  const recaptchaVerifier = useRef(null);

  const [verificationId, setVerificationId] = useState(null);
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [maskedPhone, setMaskedPhone] = useState("");

  const resolver = getMfaResolver();

  useEffect(() => {
    if (!resolver) {
      Alert.alert("Error", "No authentication session found. Please sign in again.", [
        { text: "OK", onPress: () => navigation.navigate("SignIn") },
      ]);
      return;
    }

    // Extract the masked phone number from the enrolled hint
    const hint = resolver.hints?.[0];
    if (hint?.phoneNumber) {
      setMaskedPhone(hint.phoneNumber);
    }

    // Auto-send SMS once the screen mounts
    sendSms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendSms = async () => {
    if (!resolver) return;

    setSending(true);
    try {
      const phoneProvider = new PhoneAuthProvider(auth);
      const hint = resolver.hints[0];

      const id = await phoneProvider.verifyPhoneNumber(
        { multiFactorHint: hint, session: resolver.session },
        recaptchaVerifier.current
      );

      setVerificationId(id);
      triggerHaptic("selection").catch(() => {});
    } catch (err) {
      console.error("❌ SMS send failed:", err);
      Alert.alert(
        "Could Not Send Code",
        "There was a problem sending your verification code. Please try again.",
        [{ text: "Retry", onPress: sendSms }, { text: "Cancel", onPress: () => navigation.navigate("SignIn") }]
      );
    } finally {
      setSending(false);
    }
  };

  const verifyCode = async () => {
    if (!verificationId) {
      Alert.alert("Not Ready", "The SMS has not been sent yet. Please wait.");
      return;
    }
    if (code.trim().length < 6) {
      Alert.alert("Invalid Code", "Please enter the 6-digit code from your SMS.");
      return;
    }

    setVerifying(true);
    try {
      const credential = PhoneAuthProvider.credential(verificationId, code.trim());
      const assertion = PhoneMultiFactorGenerator.assertion(credential);
      await resolver.resolveSignIn(assertion);

      clearMfaResolver();
      triggerHaptic("success").catch(() => {});

      // onAuthStateChanged in App.js will route the user to MainTabs automatically
    } catch (err) {
      console.error("❌ MFA verify failed:", err);

      let message = "Verification failed. Please try again.";
      if (err?.code === "auth/invalid-verification-code") {
        message = "That code is incorrect. Please check your SMS and try again.";
      } else if (err?.code === "auth/code-expired") {
        message = "The code has expired. Please request a new one.";
      }

      Alert.alert("Verification Failed", message);
      triggerHaptic("error").catch(() => {});
    } finally {
      setVerifying(false);
    }
  };

  const isBusy = sending || verifying;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Hidden reCAPTCHA modal — only appears when Firebase needs a reCAPTCHA challenge */}
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
        <Text style={styles.title}>Two-Factor Authentication</Text>

        {sending ? (
          <View style={styles.sendingRow}>
            <ActivityIndicator size="small" color={Colors.accent} />
            <Text style={styles.hint}>Sending verification code…</Text>
          </View>
        ) : (
          <Text style={styles.hint}>
            {maskedPhone
              ? `A 6-digit code has been sent to ${maskedPhone}`
              : "A 6-digit code has been sent to your registered phone number."}
          </Text>
        )}

        <Text style={styles.label}>VERIFICATION CODE</Text>
        <TextInput
          style={styles.input}
          placeholder="000000"
          placeholderTextColor="#AAA"
          keyboardType="number-pad"
          maxLength={6}
          value={code}
          onChangeText={setCode}
          editable={!isBusy && Boolean(verificationId)}
          autoFocus={Boolean(verificationId)}
        />

        <TouchableOpacity
          style={[styles.primaryButton, isBusy && { opacity: 0.6 }]}
          onPress={verifyCode}
          disabled={isBusy}
        >
          {verifying ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.primaryButtonText}>Verify &amp; Sign In</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryButton, isBusy && { opacity: 0.6 }]}
          onPress={sendSms}
          disabled={isBusy}
        >
          <Text style={styles.secondaryButtonText}>Resend Code</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => {
            clearMfaResolver();
            navigation.navigate("SignIn");
          }}
          disabled={isBusy}
        >
          <Text style={styles.cancelText}>Cancel — Back to Sign In</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
    paddingTop: 40,
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
    marginBottom: 12,
    textAlign: "center",
  },
  hint: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 20,
  },
  sendingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 20,
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
