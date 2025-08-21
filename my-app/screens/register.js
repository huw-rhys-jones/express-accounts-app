import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
} from "react-native";

import { auth } from "../firebaseConfig";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";

const SignUpScreen = ({ navigation }) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const register = (email, password, name) => {
    createUserWithEmailAndPassword(auth, email, password)
      .then((userCredential) => {
        const user = userCredential.user;

        updateProfile(user, { displayName: name })
          .then(() => {
            console.log("User registered and profile updated successfully");
            navigation.reset({ index: 0, routes: [{ name: "Expenses" }] });
          })
          .catch((error) => {
            console.error("Profile update error:", error);
          });
      })
      .catch((error) => {
        console.error("Registration error:", error);
      });
  };

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
          />

          <Text style={styles.label}>EMAIL</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor="#555"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />

          <Text style={styles.label}>PASSWORD</Text>
          <TextInput
            style={styles.input}
            placeholder="******"
            placeholderTextColor="#555"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <TouchableOpacity
            style={styles.button}
            onPress={() => register(email, password, name)}
          >
            <Text style={styles.buttonText}>Sign up</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#151337", // Dark purple background
    alignItems: "center",
    paddingTop: 40,
  },

  // ✅ Floating logo card (no grey background around it)
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
  },
  button: {
    backgroundColor: "#a60d49",
    paddingVertical: 12,
    borderRadius: 25,
    alignItems: "center",
    marginTop: 30,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
});

export default SignUpScreen;
