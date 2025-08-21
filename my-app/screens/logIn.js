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

// ✅ Global error catchers
if (typeof ErrorUtils !== "undefined" && ErrorUtils.setGlobalHandler) {
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    Alert.alert("Global Error", `${error.message}\n\n${error.stack}`);
  });
}

if (typeof process !== "undefined" && process.on) {
  process.on("unhandledRejection", (reason, promise) => {
    Alert.alert("Unhandled Promise Rejection", JSON.stringify(reason, null, 2));
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
      Alert.alert("Login successful", userCredential.user.email);
      navigation.reset({ index: 0, routes: [{ name: "Expenses" }] });
    } catch (error) {
      Alert.alert("Login failed", `${error.code}\n${error.message}`);
    }
  };

  const onAppleButtonPress = async () => {
    Alert.alert("Entered function", "Before try block"); // ✅ breadcrumb
    try {
      Alert.alert("Step 1", "Generating nonce…");
      const rawNonce = Math.random().toString(36).substring(2, 10);
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce
      );

      Alert.alert("Step 2", "Starting AppleAuthentication.signInAsync…");
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      Alert.alert("Step 3", "Apple sign-in completed");

      if (!credential.identityToken) {
        throw new Error("Apple Sign-In failed: No identity token returned");
      }

      Alert.alert("Step 4", "Building Firebase credential…");
      const provider = new OAuthProvider("apple.com");
      const authCredential = provider.credential({
        idToken: credential.identityToken,
        rawNonce,
      });

      Alert.alert("Step 5", "Signing into Firebase…");
      const result = await signInWithCredential(auth, authCredential);
      const user = result.user;

      Alert.alert("Step 6", "Firebase sign-in successful");

      const fullName =
        credential.fullName?.givenName || user.displayName || "User";
      const userEmail = credential.email || user.email;

      if (!user.displayName && fullName) {
        Alert.alert("Step 7", "Updating profile…");
        await updateProfile(user, { displayName: fullName });
      }

      Alert.alert("Step 8", "Saving user in Firestore…");
      await setDoc(
        doc(db, "users", user.uid),
        {
          name: fullName,
          email: userEmail,
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      Alert.alert("Step 9", "Navigation reset → Expenses");
      navigation.reset({ index: 0, routes: [{ name: "Expenses" }] });
    } catch (e) {
      if (e.code === "ERR_CANCELED") {
        Alert.alert("Apple Sign-In", "User canceled sign-in");
      } else {
        const errorDetails = `
Name: ${e?.name || "N/A"}
Message: ${e?.message || "N/A"}
Code: ${e?.code || "N/A"}
Stack: ${e?.stack || "N/A"}
JSON: ${JSON.stringify(e, null, 2)}
        `;
        Alert.alert("Apple Sign-In Error", errorDetails);
      }
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
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

          {Platform.OS === "ios" && appleAvailable && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={
                AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
              }
              buttonStyle={
                AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
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
  appleButton: { width: "100%", height: 50, marginTop: 16 },
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
