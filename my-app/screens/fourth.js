import React, { useState } from "react";
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  Image
} from "react-native";

const SignUpScreen = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <View style={styles.container}>

      {/* Logo Section */}
      <View style={styles.logoContainer}>
        <Image source={require("../assets/images/logo.png")} style={styles.logo} />
      </View>

      {/* Header Section */}
      <View style={styles.form}>
        <Text style={styles.title}>Create new{"\n"}Account</Text>
        <Text style={styles.subtitle}>Already Registered?</Text>
        <TouchableOpacity>
          <Text style={styles.link}>Log in here.</Text>
        </TouchableOpacity>
      {/* </View> */}

      {/* Form Section */}
      {/* <View style={styles.form}> */}
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

        {/* Sign Up Button */}
        <TouchableOpacity style={styles.button} onPress={() => alert("Sign-up pressed!")}>
          <Text style={styles.buttonText}>Sign up</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#151337",
    alignItems: "center",
    justifyContent: "space-around",
  },
  logo: {
    width: 300,  // Adjust size as needed
    height: 100, // Adjust size as needed
    resizeMode: "contain",
    marginBottom: 20,
    // borderRadius: 40, // Adjust for rounded corners
  },
  logoContainer: {
    backgroundColor: "#E5E4F2", // White background
    padding: 1, // Adds space around the logo
    paddingHorizontal: 20, // Horizontal padding for spacing
    paddingVertical: 10, // Vertical padding for spacing
    borderRadius: 20, // Adjust to match the logo's rectangular shape
    borderRadius: 60, // Makes it a rounded container (adjust as needed)
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 5, // Adds shadow on Android
  },

  header: {
    backgroundColor: "#E5E4F2",
    width: "85%",
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    alignItems: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    color: "#1C1A4D",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: "#555",
    textAlign: "center",
  },
  link: {
    color: "#B00040",
    fontWeight: "bold",
    textAlign: "center",
    marginTop: 5,
  },
  form: {
    backgroundColor: "#E5E4F2",
    width: "85%",
    padding: 20,
    borderRadius: 20,
    borderRadius: 20,
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
    marginBottom: 10,
  },
  button: {
    backgroundColor: "#B00040",
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
