import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { signInWithEmailAndPassword, OAuthProvider, signInWithCredential, updateProfile } from "firebase/auth";
import { auth, db } from "../firebaseConfig";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import * as WebBrowser from "expo-web-browser";
import { FontAwesome5 } from "@expo/vector-icons";
import { GoogleLogo } from "../utils";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { Alert } from "react-native";

WebBrowser.maybeCompleteAuthSession();

// Conditionally require Google sign-in only on Android
let useGoogleSignIn;
if (Platform.OS === "android") {
  useGoogleSignIn = require("../auth/useGoogleSignIn").useGoogleSignIn;
}

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [appleAvailable, setAppleAvailable] = useState(false);

  let request, promptAsync;
  if (Platform.OS === "android" && useGoogleSignIn) {
    [request, promptAsync] = useGoogleSignIn(() => {
      navigation.reset({
        index: 0,
        routes: [{ name: "Expenses" }],
      });
    });
  }

  useEffect(() => {
    // Check if Apple Sign In is supported
    (async () => {
      const available = await AppleAuthentication.isAvailableAsync();
      setAppleAvailable(available);
    })();
  }, []);

  const login = () => {
    signInWithEmailAndPassword(auth, email, password)
      .then((userCredential) => {
        navigation.reset({
          index: 0,
          routes: [{ name: "Expenses" }],
        });
        console.log("Login successful:", userCredential.user.email);
      })
      .catch((error) => {
        console.log("Login failed:", error.code, error.message);
      });
  };

  const onAppleButtonPress = async () => {
    try {
      // 🔐 Generate a random nonce
      const rawNonce = Math.random().toString(36).substring(2, 10);
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce
      );

      // 🍏 Start Apple Sign-In
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      console.log("Apple credential:", credential);

      if (!credential.identityToken) {
        throw new Error("Apple Sign-In failed - no identity token returned");
      }

      // 🔑 Sign in with Firebase
      const provider = new OAuthProvider("apple.com");
      const authCredential = provider.credential({
        idToken: credential.identityToken,
        rawNonce,
      });

      const result = await signInWithCredential(auth, authCredential);
      const user = result.user;

      // 📝 Extract name/email (only available first login)
      const fullName = credential.fullName?.givenName || user.displayName || "User";
      const email = credential.email || user.email;

      // Update Firebase Auth profile if missing
      if (!user.displayName && fullName) {
        await updateProfile(user, { displayName: fullName });
      }

      // Save to Firestore
      await setDoc(
        doc(db, "users", user.uid),
        {
          name: fullName,
          email: email,
          createdAt: serverTimestamp(),
        },
        { merge: true } // don’t overwrite existing
      );

      // ✅ Navigate to Expenses page
      navigation.reset({
        index: 0,
        routes: [{ name: "Expenses" }],
      });
    } catch (e) {
      if (e.code === "ERR_CANCELED") {
        console.log("Apple Sign-In canceled");
      } else {
        // console.error("Apple Sign-In error:", e);

+        Alert.alert("Apple Sign-In error", e.message || JSON.stringify(e))
      }
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerText}>Sign in to continue</Text>
        </View>

        <View style={styles.formContainer}>
          <Text style={styles.label}>EMAIL</Text>
          <TextInput
            style={styles.input}
            placeholder="example@email.com"
            placeholderTextColor="#AAA"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />

          <Text style={styles.label}>PASSWORD</Text>
          <TextInput
            style={styles.input}
            placeholder="******"
            placeholderTextColor="#AAA"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <TouchableOpacity style={styles.loginButton} onPress={login}>
            <Text style={styles.loginButtonText}>Log in</Text>
          </TouchableOpacity>

          {/* ANDROID: Google Sign In */}
          {Platform.OS === "android" && (
            <TouchableOpacity
              style={styles.googleButton}
              onPress={() => promptAsync()}
              disabled={!request}
            >
              <View style={styles.googleButtonContent}>
                <Text style={styles.googleButtonText}>Sign in with Google</Text>
                <GoogleLogo />
              </View>
            </TouchableOpacity>
          )}

          {/* iOS: Apple Sign In */}
          {Platform.OS === "ios" && appleAvailable && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={8}
              style={{
                width: '100%',
                height: 50,
                marginTop: 16,
              }}
              onPress={onAppleButtonPress}
            />
          )}

          <TouchableOpacity>
            <Text style={styles.forgotPassword}>Forgot Password?</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate("SignUp")}>
            <Text style={styles.signup}>Signup</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#262261",
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    backgroundColor: "#FFF",
    paddingVertical: 15,
    paddingHorizontal: 35,
    borderRadius: 35,
    marginTop: -30,
    marginBottom: 55,
  },
  headerText: { fontSize: 21, fontWeight: "bold", color: "#29275b" },
  formContainer: {
    backgroundColor: "#EAEAF2",
    padding: 20,
    borderRadius: 20,
    width: "85%",
  },
  label: {
    fontSize: 12,
    color: "#262261",
    fontWeight: "bold",
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#C4C4C4",
    padding: 12,
    borderRadius: 10,
    fontSize: 16,
    marginBottom: 15,
    color: "#000",
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
  signup: {
    color: "#262261",
    textAlign: "center",
    marginTop: 5,
    fontWeight: "bold",
  },
  forgotPassword: {
    color: "#262261",
    textAlign: "center",
    marginTop: 15,
  },
});

export default LoginScreen;
