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
  Alert,
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
import { GoogleLogo } from "../utils";

WebBrowser.maybeCompleteAuthSession();

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
    [request, promptAsync] = useGoogleSignIn(() =>
      navigation.reset({
        index: 0,
        routes: [{ name: "Expenses" }],
      })
    );
  }

  useEffect(() => {
    (async () => {
      const available = await AppleAuthentication.isAvailableAsync();
      setAppleAvailable(available);
    })();
  }, []);

  const login = async () => {
    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );
      console.log("Login successful:", userCredential.user.email);
      navigation.reset({ index: 0, routes: [{ name: "Expenses" }] });
    } catch (error) {
      console.log("Login failed:", error.code, error.message);
      Alert.alert("Login failed", error.message);
    }
  };

  const onAppleButtonPress = async () => {
    try {
      // 🔐 Generate nonce
      const rawNonce = Math.random().toString(36).substring(2, 10);
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce
      );

      // 🍏 Apple Sign-In
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

      // 🔑 Firebase
      const provider = new OAuthProvider("apple.com");
      const authCredential = provider.credential({
        idToken: credential.identityToken,
        rawNonce,
      });

      const result = await signInWithCredential(auth, authCredential);
      const user = result.user;

      // 📝 User details
      const fullName =
        credential.fullName?.givenName || user.displayName || "User";
      const userEmail = credential.email || user.email;

      if (!user.displayName && fullName) {
        await updateProfile(user, { displayName: fullName });
      }

      await setDoc(
        doc(db, "users", user.uid),
        {
          name: fullName,
          email: userEmail,
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      navigation.reset({ index: 0, routes: [{ name: "Expenses" }] });
    } catch (e) {
      if (e.code === "ERR_CANCELED") {
        console.log("Apple Sign-In canceled");
      } else {
        console.error("Apple Sign-In error:", e);
        Alert.alert("Apple Sign-In error", e.message || JSON.stringify(e));
      }
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Logo */}
      <View style={styles.logoContainer}>
        <Image
          source={require("../assets/images/logo.png")}
          style={styles.logo}
        />
      </View>

      {/* Form */}
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

          {/* Google Sign-In */}
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

          {/* Apple Sign-In */}
          {Platform.OS === "ios" && appleAvailable && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={8}
              style={styles.appleButton}
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
  flex: { flex: 1, 
    backgroundColor: "#262261" },
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
    marginTop: -10,   // pulls it up closer to the logo
    marginBottom: 20,
    minWidth: 220,    // ensures it’s at least as wide as the logo
    alignItems: "center",
  },
  
  headerText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#262261",
    textAlign: "center",
  },
  logo: {
    width: 260,        // Scales logo proportionally
    height: 80,
    resizeMode: "contain",
  },
  
  logoContainer: {
    backgroundColor: "#fff",
    width: "85%",
    paddingVertical: 16,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 50,
    marginBottom: 15,
    alignSelf: "center",      // ✅ centers it horizontally

    // subtle shadow for floating look
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
  appleButton: {
    width: "100%",
    height: 50,
    marginTop: 16,
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
