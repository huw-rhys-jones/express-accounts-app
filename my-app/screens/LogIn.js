import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
  Modal,
  Alert,
} from "react-native";
import {
  signInWithEmailAndPassword,
  OAuthProvider,
  signInWithCredential,
  updateProfile,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth, db } from "../firebaseConfig";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import * as WebBrowser from "expo-web-browser";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { GoogleLogo } from "../utils/format_style";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";

WebBrowser.maybeCompleteAuthSession();

// 🔴 GLOBAL ERROR HANDLERS
if (typeof ErrorUtils !== "undefined" && ErrorUtils.setGlobalHandler) {
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    console.error("🔥 Global Error:", {
      message: error.message,
      stack: error.stack,
      isFatal,
    });
  });
}

if (typeof process !== "undefined" && process.on) {
  process.on("unhandledRejection", (reason, promise) => {
    console.error("🔥 Unhandled Promise Rejection:", { reason, promise });
  });
}

let useGoogleSignIn;
if (Platform.OS === "android") {
  useGoogleSignIn = require("../auth/useGoogleSignIn").useGoogleSignIn;
}

const looksLikeEmail = (s) => /\S+@\S+\.\S+/.test(String(s || "").trim());

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  // Forgot Password modal
  const [forgotVisible, setForgotVisible] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [sendingReset, setSendingReset] = useState(false);

  // Helper to show/hide the loader around any async flow
  const runWithLoading = async (text, fn) => {
    setLoadingText(text);
    setLoading(true);
    try {
      await fn();
    } finally {
      setLoading(false);
      setLoadingText(null);
    }
  };

  let request, promptAsync;
  if (Platform.OS === "android" && useGoogleSignIn) {
     [request, promptAsync] = useGoogleSignIn(() =>
        navigation.reset({
          index: 0,
          routes: [
            {
              name: "MainTabs",
              state: { index: 0, routes: [{ name: "Expenses" }] },
            },
          ],
        })
     );
  }

  useEffect(() => {
    (async () => {
      const available = await AppleAuthentication.isAvailableAsync();
      setAppleAvailable(available);
    })();
  }, []);

  const showLoginError = (code, fallbackMessage) => {
    let message = "Login failed. Please try again.";

    switch (code) {
      case "auth/missing-email":
        message = "Please enter your email.";
        break;
      case "auth/missing-password":
        message = "Please enter your password.";
        break;
      case "auth/invalid-email":
        message = "The email address is not valid.";
        break;
      case "auth/user-not-found":
        message = "No account was found with that email.";
        break;
      case "auth/wrong-password":
        message = "Incorrect password. Please try again.";
        break;
      case "auth/invalid-credential":
        message = "Email or password is incorrect. Please try again.";
        break;
      case "auth/user-disabled":
        message = "This account has been disabled.";
        break;
      case "auth/too-many-requests":
        message = "Too many failed attempts. Please wait and try again.";
        break;
      case "auth/network-request-failed":
        message = "Network error. Check your connection and try again.";
        break;
      case "auth/operation-not-allowed":
        message = "Password sign-in is not enabled for this project.";
        break;
      default:
        message = fallbackMessage || message;
    }

    Alert.alert("Login Error", message, [{ text: "OK" }]);
  };

  // 📧 EMAIL/PASSWORD LOGIN
  const login = async () => {
    try {
      // Quick client-side checks
      const emailTrimmed = (email || "").trim().toLowerCase();
      const passwordTrimmed = (password || "").trim();

      if (!emailTrimmed) {
        return Alert.alert("Login Error", "Please enter your email.");
      }
      if (!looksLikeEmail(emailTrimmed)) {
        return Alert.alert("Login Error", "The email address is not valid.");
      }
      if (!passwordTrimmed) {
        return Alert.alert("Login Error", "Please enter your password.");
      }

      await runWithLoading("Signing you in…", async () => {
        const userCredential = await signInWithEmailAndPassword(
          auth,
          emailTrimmed,
          passwordTrimmed
        );

         navigation.reset({
          index: 0,
          routes: [
            {
              name: "MainTabs",
              state: { index: 0, routes: [{ name: "Expenses" }] },
              },
            ],
          });
      });
    } catch (error) {
      console.error("❌ Email login failed:", error);
      showLoginError(error?.code, error?.message);
    }
  };

  // 🍏 APPLE LOGIN
  const onAppleButtonPress = async () => {
    try {
      await runWithLoading("Signing in with Apple…", async () => {
        const rawNonce = Math.random().toString(36).substring(2, 10);
        const hashedNonce = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          rawNonce
        );

        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
          nonce: hashedNonce,
        });

        if (!credential.identityToken) {
          throw new Error("Apple Sign-In failed: No identity token returned");
        }

        const provider = new OAuthProvider("apple.com");
        const authCredential = provider.credential({
          idToken: credential.identityToken,
          rawNonce,
        });

        const result = await signInWithCredential(auth, authCredential);
        const user = result.user;

        const fullName =
          (credential.fullName?.givenName &&
            [credential.fullName?.givenName, credential.fullName?.familyName]
              .filter(Boolean)
              .join(" ")) ||
          user.displayName ||
          undefined;

        const userEmail = credential.email || user.email || undefined;

        if (!user.displayName && fullName) {
          await updateProfile(user, { displayName: fullName });
        }

        await setDoc(
          doc(db, "users", user.uid),
          {
            ...(fullName ? { name: fullName } : {}),
            ...(userEmail ? { email: userEmail } : {}),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

         navigation.reset({
          index: 0,
          routes: [
            {
              name: "MainTabs",
              state: { index: 0, routes: [{ name: "Expenses" }] },
            },
          ],
        });
      });
    } catch (e) {
      if (e && e.code === "ERR_CANCELED") {
        console.warn("🚪 Apple Sign-In canceled by user");
      } else {
        console.error("❌ Apple Sign-In Error:", e);
      }
    }
  };

  // 🌈 GOOGLE (Android)
  const onGooglePress = async () => {
    try {
      await runWithLoading("Signing in with Google…", async () => {
        if (!request) return;
        await promptAsync();
      });
    } catch (e) {
      console.error("❌ Google Sign-In Error:", e);
    }
  };

  // 🔁 Forgot Password
  const openForgot = () => {
    setResetEmail((email || "").trim());
    setForgotVisible(true);
  };

  const sendReset = async () => {
    const target = (resetEmail || "").trim().toLowerCase();
    if (!target) {
      return Alert.alert("Reset Password", "Please enter your email.");
    }
    if (!looksLikeEmail(target)) {
      return Alert.alert("Reset Password", "That email address looks invalid.");
    }

    try {
      setSendingReset(true);
      await sendPasswordResetEmail(auth, target);
      setSendingReset(false);
      setForgotVisible(false);
      Alert.alert(
        "Reset Email Sent",
        "If an account exists for that email, you'll receive a reset link shortly."
      );
    } catch (e) {
      setSendingReset(false);
      let msg = "Could not send reset email. Please try again.";
      switch (e?.code) {
        case "auth/user-not-found":
          msg = "No account found with that email.";
          break;
        case "auth/invalid-email":
          msg = "That email address is not valid.";
          break;
        case "auth/too-many-requests":
          msg = "Too many attempts. Please wait and try again.";
          break;
        case "auth/network-request-failed":
          msg = "Network error. Check your connection and try again.";
          break;
      }
      Alert.alert("Reset Password", msg);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <KeyboardAwareScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        enableOnAndroid={true}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoContainer}>
          <Image
            source={require("../assets/images/logo.png")}
            style={styles.logo}
          />
        </View>

        <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerText}>Sign in to continue</Text>
        </View>

        <View style={styles.formContainer}>
          <Text style={styles.label}>EMAIL</Text>
          <TextInput
            editable={!loading}
            style={styles.input}
            placeholder="example@email.com"
            placeholderTextColor="#AAA"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
          />

          <Text style={styles.label}>PASSWORD</Text>
          <View style={styles.passwordContainer}>
            <TextInput
              editable={!loading}
              style={[styles.input, styles.inputWithIcon]}
              placeholder="******"
              placeholderTextColor="#AAA"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity
              style={styles.eyeIcon}
              onPress={() => setShowPassword((prev) => !prev)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons
                name={showPassword ? "eye-off" : "eye"}
                size={22}
                color="#555"
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.loginButton, loading && { opacity: 0.7 }]}
            onPress={login}
            disabled={loading}
          >
            <Text style={styles.loginButtonText}>Log in</Text>
          </TouchableOpacity>

          {/* Social buttons */}
          {Platform.OS === "android" && (
            <TouchableOpacity
              style={[styles.googleButton, loading && { opacity: 0.7 }]}
              onPress={onGooglePress}
              disabled={!request || loading}
            >
              <View style={styles.googleButtonContent}>
                <Text style={styles.googleButtonText}>Sign in with Google</Text>
                <GoogleLogo />
              </View>
            </TouchableOpacity>
          )}

          {Platform.OS === "ios" && appleAvailable && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={
                AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
              }
              buttonStyle={
                AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius = {8}
              style={styles.appleButton}
              onPress={onAppleButtonPress}
            />
          )}

          {/* Secondary actions */}
          <View style={styles.linksRow}>
            <TouchableOpacity onPress={() => navigation.navigate("SignUp")}>
              <Text style={styles.signup}>Create account</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={openForgot}>
              <Text style={styles.forgotPassword}>Forgot Password?</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* 🔒 Full-screen loading overlay */}
      <Modal visible={loading} transparent animationType="fade">
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" />
            <Text style={styles.loadingText}>
              {loadingText || "Please wait…"}
            </Text>
          </View>
        </View>
      </Modal>

      {/* 🔑 Forgot Password Modal */}
      <Modal
        visible={forgotVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setForgotVisible(false)}
      >
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <Text style={[styles.loadingText, { marginBottom: 10 }]}>
              Reset your password
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Your email address"
              placeholderTextColor="#AAA"
              autoCapitalize="none"
              keyboardType="email-address"
              value={resetEmail}
              onChangeText={setResetEmail}
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
              <TouchableOpacity
                style={[
                  styles.loginButton,
                  { flex: 1, backgroundColor: "#a60d49" },
                  sendingReset && { opacity: 0.7 },
                ]}
                onPress={sendReset}
                disabled={sendingReset}
              >
                {sendingReset ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.loginButtonText}>Send reset link</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.googleButton,
                  { flex: 1, backgroundColor: "#EEE" },
                ]}
                onPress={() => setForgotVisible(false)}
              >
                <Text style={[styles.googleButtonText, { marginRight: 0 }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      </KeyboardAwareScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#262261" },
  container: {
    flex: 1,
    backgroundColor: "#262261",
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    backgroundColor: "#FFF",
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
  headerText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#262261",
    textAlign: "center",
  },
  logo: { 
    width: 260,
    height: 80,
    resizeMode: "contain" 
  },
  logoContainer: {
    backgroundColor: "#fff",
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
  formContainer: {
    backgroundColor: "#EAEAF2",
    padding: 20,
    borderRadius: 20,
    width: "85%",
    maxWidth: 400,
  },

  label: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginTop: 10,
  },

  // ---- Unified input style for both fields ----
  input: {
    backgroundColor: "#C4C4C4",
    color: "#000",
    fontSize: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginTop: 5,
    marginBottom: 15,
  },

  // Password wrapper so we can place the eye icon inside
  passwordContainer: {
    position: "relative",
    justifyContent: "center",
  },

  // Extra right padding so text doesn't overlap the eye icon
  inputWithIcon: {
    paddingRight: 44,
  },

  // Eye icon aligned inside the input, vertically centered
  eyeIcon: {
    position: "absolute",
    right: 10,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    width: 32,
  },

  loginButton: {
    backgroundColor: "#a60d49",
    paddingVertical: 12,
    borderRadius: 25,
    alignItems: "center",
    marginTop: 4,
  },
  loginButtonText: { color: "#FFF", fontWeight: "bold", fontSize: 16 },

  googleButton: {
    backgroundColor: "#FFF",
    paddingVertical: 12,
    borderRadius: 25,
    alignItems: "center",
    marginTop: 10,
  },
  googleButtonContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  googleButtonText: {
    fontWeight: "bold",
    fontSize: 16,
    marginRight: 8,
    color: "#000",
  },
  appleButton: { width: "100%", height: 50, marginTop: 16 },

  // Links
  linksRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    width: "100%",
  },
  forgotPassword: {
    color: "#555",
    fontSize: 14,
    textDecorationLine: "underline",
  },
  signup: {
    color: "#a60d49",
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
    backgroundColor: "white",
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: "center",
    minWidth: 260,
    width: "80%",
    maxWidth: 400,
  },
  loadingText: { marginTop: 10, fontSize: 16, fontWeight: "600", color: "#000" },
});

export default LoginScreen;
