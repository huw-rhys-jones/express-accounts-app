import React, { useMemo, useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  Alert,
  Keyboard,
  TouchableWithoutFeedback,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { auth } from "../firebaseConfig";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { Colors, AuthStyles } from "../utils/sharedStyles";

const looksLikeEmail = (s) => /\S+@\S+\.\S+/.test(String(s || "").trim());

const SignUpScreen = ({ navigation }) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  // refs for keyboard navigation
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmRef = useRef(null);

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
      navigation.reset({
        index: 0,
        routes: [
          {
            name: "MainTabs", // The parent navigator
            state: { 
              routes: [{ name: "Expenses" }] // The child screen
            },
          },
        ],
      });
    } catch (e) {
      console.error("Registration error:", e);
      showRegistrationError(e?.code, e?.message);
    } finally {
      setLoading(false);
    }
  };

  const Rule = ({ ok, text }) => (
    <View style={AuthStyles.ruleRow}>
      <Ionicons
        name={ok ? "checkmark-circle" : "close-circle"}
        size={18}
        color={ok ? "#2e7d32" : "#b00020"}
        style={{ marginRight: 6 }}
      />
      <Text style={[AuthStyles.ruleText, ok ? AuthStyles.ruleOk : AuthStyles.ruleBad]}>
        {text}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={AuthStyles.flex} edges={['bottom', 'left', 'right']}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAwareScrollView
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }} // 👈 padding for Android nav bar
          enableOnAndroid={true}
          extraScrollHeight={20}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >        
          <View style={AuthStyles.logoContainer}>
                <Image
                  source={require("../assets/images/logo.png")}
                  style={AuthStyles.logo}
                />
          </View>

          <View style={AuthStyles.container}>
            {/* Logo */}
    

            {/* Header */}
            <View style={AuthStyles.header}>
              <Text style={AuthStyles.headerText}>Create new account</Text>
              <Text style={AuthStyles.subtitle}>
                Already registered?{" "}
                <Text
                  onPress={() => navigation.navigate("SignIn")}
                  style={AuthStyles.link}
                >
                  Log in here
                </Text>
              </Text>
            </View>

            {/* Form */}
            <View style={AuthStyles.form}>
              <Text style={AuthStyles.label}>NAME (COMPANY OR PERSONAL)</Text>

              <View style={AuthStyles.passwordContainer}>
                <TextInput
                  style={AuthStyles.input}
                  placeholder="Bob Builder"
                  placeholderTextColor="#555"
                  value={name}
                  onChangeText={setName}
                  editable={!loading}
                  returnKeyType="next"
                  onSubmitEditing={() => emailRef.current.focus()}
                />
              </View>

              <Text style={AuthStyles.label}>EMAIL</Text>
              
              <View style={AuthStyles.passwordContainer}>
                <TextInput
                  ref={emailRef}
                  style={[
                    AuthStyles.input,
                    email.length > 0 && !emailOk && AuthStyles.inputError,
                  ]}
                  placeholder="you@example.com"
                  placeholderTextColor="#555"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={email}
                  onChangeText={setEmail}
                  editable={!loading}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current.focus()}
                />
              </View>


              <Text style={AuthStyles.label}>PASSWORD</Text>
              <View style={AuthStyles.passwordContainer}>
                <TextInput
                  ref={passwordRef}
                  style={[AuthStyles.input, AuthStyles.inputWithIcon]}
                  placeholder="******"
                  placeholderTextColor="#555"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  editable={!loading}
                  returnKeyType="next"
                  onSubmitEditing={() => confirmRef.current.focus()}
                />
                <TouchableOpacity
                  style={AuthStyles.eyeIcon}
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

              <Text style={AuthStyles.label}>CONFIRM PASSWORD</Text>
              <View style={AuthStyles.passwordContainer}>
                <TextInput
                  ref={confirmRef}
                  style={[
                    AuthStyles.input,
                    AuthStyles.inputWithIcon,
                    confirm.length > 0 && !passwordsMatch && AuthStyles.inputError,
                  ]}
                  placeholder="******"
                  placeholderTextColor="#555"
                  secureTextEntry={!showConfirm}
                  value={confirm}
                  onChangeText={setConfirm}
                  editable={!loading}
                  returnKeyType="done"
                  onSubmitEditing={register} // 👈 Done submits form
                />
                <TouchableOpacity
                  style={AuthStyles.eyeIcon}
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
              <View style={AuthStyles.requirements}>
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
                style={[AuthStyles.button, !canSubmit && { opacity: 0.6 }]}
                onPress={register}
                disabled={!canSubmit}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={AuthStyles.buttonText}>Sign up</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAwareScrollView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
    paddingTop: 40,
  },

  // Floating logo card
  logoContainer: {
    backgroundColor: Colors.surface,
    width: "85%",
    maxWidth: 400,
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
    backgroundColor: Colors.surface,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 20,
    width: "85%",
    maxWidth: 400,
    alignSelf: "center",
    marginBottom: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerText: {
    fontSize: 18,
    fontWeight: "bold",
    color: Colors.textPrimary,
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: "center",
  },
  link: {
    color: Colors.accent,
    fontWeight: "bold",
  },

  form: {
    width: "85%",
    maxWidth: 400,
    backgroundColor: Colors.card,
    padding: 20,
    borderRadius: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: "bold",
    color: Colors.textPrimary,
    marginTop: 10,
  },
  input: {
    width: "100%",
    padding: 12,
    borderRadius: 10,
    backgroundColor: Colors.inputBg,
    // marginTop: 6, <--- REMOVE THIS
    color: Colors.textSecondary,
  },
  inputError: {
    borderWidth: 1,
    borderColor: "#b00020",
  },

  // Eye-in-input pattern
  // 2. Move the margin and relative positioning to the container
  passwordContainer: {
    position: "relative",
    justifyContent: "center",
    marginTop: 6,    // <--- ADDED HERE (matches your previous input margin)
    marginBottom: 0, // Adjust if you need spacing below the confirm box
  },
  inputWithIcon: {
    paddingRight: 44,
  },
// 3. Ensure the icon fills the height of the container to center correctly
  eyeIcon: {
    position: "absolute",
    right: 10,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    width: 32,
    zIndex: 1, 
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
    backgroundColor: Colors.accent,
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
