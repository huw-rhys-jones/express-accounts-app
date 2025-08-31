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
  Alert
} from "react-native";
import {
  signInWithEmailAndPassword,
  OAuthProvider,
  signInWithCredential,
  updateProfile,
} from "firebase/auth";
import { auth, db } from "../firebaseConfig";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import * as WebBrowser from "expo-web-browser";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { GoogleLogo } from "../utils/format_style";
import { Ionicons } from "@expo/vector-icons"; // or react-native-vector-icons

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

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

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
      navigation.reset({ index: 0, routes: [{ name: "Expenses" }] })
    );
  }

  useEffect(() => {
    (async () => {
      const available = await AppleAuthentication.isAvailableAsync();
      console.log("🍏 Apple Sign-In available:", available);
      setAppleAvailable(available);
    })();
  }, []);

  // 📧 EMAIL/PASSWORD LOGIN
const login = async () => {
  try {
    await runWithLoading("Signing you in…", async () => {
      console.log("📧 Attempting email login with:", email);

      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      console.log("✅ Email Login successful:", {
        uid: userCredential.user.uid,
        email: userCredential.user.email,
      });

      navigation.reset({ index: 0, routes: [{ name: "Expenses" }] });
    });
  } catch (error) {
    console.error("❌ Email login failed:", error);

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
      // often surfaces like a wrong password/credential
      message = "Email or password is incorrect. Please try again.";
      break;
    case "auth/user-disabled":
      message = "This account has been disabled.";
      break;
    case "auth/too-many-requests":
      message =
        "Too many failed attempts. Please wait a bit and try again.";
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
  }
};


  // 🍏 APPLE LOGIN
  const onAppleButtonPress = async () => {
    try {
      await runWithLoading("Signing in with Apple…", async () => {
        console.log("🍏 Entered Apple login function");

        console.log("Step 1️⃣ Generating nonce…");
        const rawNonce = Math.random().toString(36).substring(2, 10);
        const hashedNonce = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          rawNonce
        );
        console.log("🔑 Nonce generated:", { rawNonce, hashedNonce });

        console.log("Step 2️⃣ Calling AppleAuthentication.signInAsync…");
        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
          nonce: hashedNonce,
        });
        console.log("🍏 Apple Sign-In returned credential:", credential);

        if (!credential.identityToken) {
          throw new Error("Apple Sign-In failed: No identity token returned");
        }

        console.log("Step 3️⃣ Building Firebase OAuthProvider credential…");
        const provider = new OAuthProvider("apple.com");
        const authCredential = provider.credential({
          idToken: credential.identityToken,
          rawNonce,
        });
        console.log("🔑 Firebase authCredential created:", authCredential);

        console.log("Step 4️⃣ Signing into Firebase…");
        const result = await signInWithCredential(auth, authCredential);
        const user = result.user;
        console.log("✅ Firebase sign-in result:", {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          providerData: user.providerData,
        });

        const fullName =
          (credential.fullName?.givenName &&
            [credential.fullName?.givenName, credential.fullName?.familyName]
              .filter(Boolean)
              .join(" ")) ||
          user.displayName ||
          undefined;

        const userEmail = credential.email || user.email || undefined;

        if (!user.displayName && fullName) {
          console.log("Step 5️⃣ Updating Firebase profile with:", fullName);
          await updateProfile(user, { displayName: fullName });
        }

        console.log("Step 6️⃣ Writing Firestore user doc…", {
          uid: user.uid,
          name: fullName,
          email: userEmail,
        });
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

        console.log("🎉 Apple login flow complete → navigating to Expenses");
        navigation.reset({ index: 0, routes: [{ name: "Expenses" }] });
      });
    } catch (e) {
      if (e && e.code === "ERR_CANCELED") {
        console.warn("🚪 Apple Sign-In canceled by user");
      } else {
        console.error("❌ Apple Sign-In Error:", {
          name: e && e.name,
          message: e && e.message,
          code: e && e.code,
          stack: e && e.stack,
          json: JSON.stringify(e, null, 2),
          full: e,
        });
      }
    }
  };

  // 🌈 GOOGLE (Android) — show loader during prompt
  const onGooglePress = async () => {
    try {
      await runWithLoading("Signing in with Google…", async () => {
        if (!request) return;
        const res = await promptAsync();
        // Your hook's callback should navigate on success
        // Optionally inspect res.type / res.error
      });
    } catch (e) {
      console.error("❌ Google Sign-In Error:", e);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.logoContainer}>
        <Image source={require("../assets/images/logo.png")} style={styles.logo} />
      </View>

      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerText}>Sign in to continue</Text>
        </View>

        <View style={styles.formContainer}>
          <Text style={styles.label}>EMAIL</Text>
  <TextInput
    editable={!loading}
    style={styles.input}   // unified style
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
    style={[styles.input, styles.inputWithIcon]}  // 👈 same look + room for icon
    placeholder="******"
    placeholderTextColor="#AAA"
    secureTextEntry={!showPassword}
    value={password}
    onChangeText={setPassword}
  />
  <TouchableOpacity
    style={styles.eyeIcon}
    onPress={() => setShowPassword((prev) => !prev)}
    // Optional: improve touch area
    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
  >
    <Ionicons name={showPassword ? "eye-off" : "eye"} size={22} color="#555" />
  </TouchableOpacity>
</View>

          <TouchableOpacity
            style={[styles.loginButton, loading && { opacity: 0.7 }]}
            onPress={login}
            disabled={loading}
          >
            <Text style={styles.loginButtonText}>Log in</Text>
          </TouchableOpacity>

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
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={8}
              style={styles.appleButton}
              onPress={onAppleButtonPress}
            />
          )}
        </View>
      </View>

      {/* 🔒 Full-screen loading overlay */}
      <Modal visible={loading} transparent animationType="fade">
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" />
            <Text style={styles.loadingText}>{loadingText || "Please wait…"}</Text>
          </View>
        </View>
      </Modal>
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
    alignSelf: "center",
    marginTop: -10,
    marginBottom: 20,
    minWidth: 220,
    alignItems: "center",
  },
  headerText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#262261",
    textAlign: "center",
  },
  logo: { width: 260, height: 80, resizeMode: "contain" },
  logoContainer: {
    backgroundColor: "#fff",
    width: "85%",
    paddingVertical: 16,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 50,
    marginBottom: 15,
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
    width: 32, // nice tap target
  },

  loginButton: {
    backgroundColor: "#a60d49",
    paddingVertical: 12,
    borderRadius: 25,
    alignItems: "center",
    marginTop: 20,
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
  },
  appleButton: { width: "100%", height: 50, marginTop: 16 },

  // Loader
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
    minWidth: 200,
  },
  loadingText: { marginTop: 10, fontSize: 16, fontWeight: "600" },
});


export default LoginScreen;
