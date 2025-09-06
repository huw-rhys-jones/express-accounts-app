import React, { useMemo, useState } from "react";
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
  Alert,
} from "react-native";
import { auth } from "../firebaseConfig";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { Ionicons } from "@expo/vector-icons";

const looksLikeEmail = (s) => /\S+@\S+\.\S+/.test(String(s || "").trim());

const SignUpScreen = ({ navigation }) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  // Live password rules
  const rules = useMemo(() => {
    const p = password || "";
    return {
      minLen: p.length >= 8,
      upper: /[A-Z]/.test(p),
      lower: /[a-z]/.test(p),
      number: /\d/.test(p),
    };
  }, [password]);

  const allRulesOk = rules.minLen && rules.upper && rules.lower && rules.number;
  const passwordsMatch = (password || "") === (confirm || "");
  const emailOk = looksLikeEmail(email);
  const nameOk = (name || "").trim().length > 0;

  const canSubmit = nameOk && emailOk && allRulesOk && passwordsMatch && !loading;

  const showRegistrationError = (code, fallback) => {
    let msg = "Could not create your account. Please try again.";
    switch (code) {
      case "auth/email-already-in-use":
        msg = "That email is already registered. Try logging in instead.";
        break;
      case "auth/invalid-email":
        msg = "That email address is not valid.";
        break;
      case "auth/weak-password":
        msg = "Password is too weak. Please meet all password requirements.";
        break;
      case "auth/network-request-failed":
        msg = "Network error. Check your connection and try again.";
        break;
      case "auth/operation-not-allowed":
        msg = "Email/password sign-up is not enabled for this project.";
        break;
      default:
        msg = fallback || msg;
    }
    Alert.alert("Sign Up Error", msg);
  };

  const register = async () => {
    try {
      const emailTrimmed = (email || "").trim().toLowerCase();
      const nameTrimmed = (name || "").trim();

      if (!nameTrimmed) return Alert.alert("Sign Up", "Please enter your name.");
      if (!looksLikeEmail(emailTrimmed))
        return Alert.alert("Sign Up", "Please enter a valid email address.");
      if (!allRulesOk)
        return Alert.alert(
          "Sign Up",
          "Please meet all password requirements before continuing."
        );
      if (!passwordsMatch)
        return Alert.alert("Sign Up", "Passwords do not match.");

      setLoading(true);

      const cred = await createUserWithEmailAndPassword(
        auth,
        emailTrimmed,
        password
      );

      // Update display name
      if (nameTrimmed) {
        await updateProfile(cred.user, { displayName: nameTrimmed });
      }

      // Navigate in with a clean stack
      navigation.reset({ index: 0, routes: [{ name: "Expenses" }] });
    } catch (e) {
      console.error("Registration error:", e);
      showRegistrationError(e?.code, e?.message);
    } finally {
      setLoading(false);
    }
  };

  const Rule = ({ ok, text }) => (
    <View style={styles.ruleRow}>
      <Ionicons
        name={ok ? "checkmark-circle" : "close-circle"}
        size={18}
        color={ok ? "#2e7d32" : "#b00020"}
        style={{ marginRight: 6 }}
      />
      <Text style={[styles.ruleText, ok ? styles.ruleOk : styles.ruleBad]}>
        {text}
      </Text>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.container}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <Image
            source={require("../assets/images/logo.png")}
            style={styles.logo}
          />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Create new{"\n"}Account</Text>
          <Text style={styles.subtitle}>
            Already Registered?{" "}
            <Text
              onPress={() => navigation.navigate("SignIn")}
              style={styles.link}
            >
              Log in here.
            </Text>
          </Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Text style={styles.label}>NAME (COMPANY OR PERSONAL)</Text>
          <TextInput
            style={styles.input}
            placeholder="Bob Builder"
            placeholderTextColor="#555"
            value={name}
            onChangeText={setName}
            editable={!loading}
          />

          <Text style={styles.label}>EMAIL</Text>
          <TextInput
            style={[
              styles.input,
              email.length > 0 && !emailOk && styles.inputError,
            ]}
            placeholder="you@example.com"
            placeholderTextColor="#555"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            editable={!loading}
          />

          <Text style={styles.label}>PASSWORD</Text>
          <View style={styles.passwordContainer}>
            <TextInput
              style={[styles.input, styles.inputWithIcon]}
              placeholder="******"
              placeholderTextColor="#555"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
              editable={!loading}
            />
            <TouchableOpacity
              style={styles.eyeIcon}
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons
                name={showPassword ? "eye-off" : "eye"}
                size={22}
                color="#555"
              />
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>CONFIRM PASSWORD</Text>
          <View style={styles.passwordContainer}>
            <TextInput
              style={[
                styles.input,
                styles.inputWithIcon,
                confirm.length > 0 && !passwordsMatch && styles.inputError,
              ]}
              placeholder="******"
              placeholderTextColor="#555"
              secureTextEntry={!showConfirm}
              value={confirm}
              onChangeText={setConfirm}
              editable={!loading}
            />
            <TouchableOpacity
              style={styles.eyeIcon}
              onPress={() => setShowConfirm((v) => !v)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons
                name={showConfirm ? "eye-off" : "eye"}
                size={22}
                color="#555"
              />
            </TouchableOpacity>
          </View>

          {/* Password requirements */}
          <View style={styles.requirements}>
            <Rule ok={rules.minLen} text="At least 8 characters" />
            <Rule ok={rules.upper} text="At least 1 uppercase letter" />
            <Rule ok={rules.lower} text="At least 1 lowercase letter" />
            <Rule ok={rules.number} text="At least 1 number" />
            <Rule
              ok={passwordsMatch && confirm.length > 0}
              text="Passwords match"
            />
          </View>

          <TouchableOpacity
            style={[
              styles.button,
              !canSubmit && { opacity: 0.6 },
            ]}
            onPress={register}
            disabled={!canSubmit}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Sign up</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#151337",
    alignItems: "center",
    paddingTop: 40,
  },

  // Floating logo card
  logoContainer: {
    backgroundColor: "#fff",
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  logo: {
    width: 240,
    height: 80,
    resizeMode: "contain",
  },

  header: {
    width: "85%",
    backgroundColor: "#E5E4F2",
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    alignItems: "center",
  },
  title: {
    fontSize: 26,
    fontWeight: "bold",
    textAlign: "center",
    color: "#1C1A4D",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#555",
    textAlign: "center",
    marginBottom: 15,
  },
  link: {
    color: "#B00040",
    fontWeight: "bold",
  },

  form: {
    width: "85%",
    backgroundColor: "#E5E4F2",
    padding: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#1C1A4D",
    marginTop: 10,
  },
  input: {
    width: "100%",
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#C4C3CC",
    marginTop: 6,
    color: "#000",
  },
  inputError: {
    borderWidth: 1,
    borderColor: "#b00020",
  },

  // Eye-in-input pattern
  passwordContainer: {
    position: "relative",
    justifyContent: "center",
  },
  inputWithIcon: {
    paddingRight: 44,
  },
  eyeIcon: {
    position: "absolute",
    right: 10,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    width: 32,
  },

  requirements: {
    marginTop: 10,
    marginBottom: 6,
  },
  ruleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 2,
  },
  ruleText: {
    fontSize: 13,
  },
  ruleOk: {
    color: "#2e7d32",
  },
  ruleBad: {
    color: "#b00020",
  },

  button: {
    backgroundColor: "#a60d49",
    paddingVertical: 12,
    borderRadius: 25,
    alignItems: "center",
    marginTop: 18,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
});

export default SignUpScreen;
