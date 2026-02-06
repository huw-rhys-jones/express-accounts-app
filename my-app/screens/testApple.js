import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";

const TestAppleScreen = ({ navigation }) => {
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    (async () => {
      const available = await AppleAuthentication.isAvailableAsync();
      setAppleAvailable(available);
    })();
  }, []);

  const handleAppleSignIn = async () => {
    try {
      Alert.alert("Attempting Apple Sign-In");
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      Alert.alert("✅ Success", JSON.stringify(credential, null, 2));
    } catch (e) {
      Alert.alert("❌ Error", JSON.stringify(e, null, 2));
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

      <View style={styles.container}>
        <Text style={styles.headerText}>Apple Sign-In Test</Text>

        {appleAvailable ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={
              AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
            }
            buttonStyle={
              AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
            }
            cornerRadius={8}
            style={styles.appleButton}
            onPress={handleAppleSignIn}
          />
        ) : (
          <Text style={styles.unavailableText}>
            Apple Sign-In is not available on this device.
          </Text>
        )}

        <Text
          style={styles.backLink}
          onPress={() => navigation.navigate("Login")}
        >
          ← Back to Login
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#262261" },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EAEAF2",
    marginHorizontal: 20,
    borderRadius: 20,
    padding: 20,
  },
  headerText: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 20,
    color: "#262261",
  },
  logo: {
    width: 260,
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
    alignSelf: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  appleButton: {
    width: 250,
    height: 50,
    marginTop: 16,
  },
  unavailableText: {
    color: "#a60d49",
    fontWeight: "bold",
    marginTop: 20,
  },
  backLink: {
    color: "#262261",
    marginTop: 30,
    fontWeight: "bold",
    fontSize: 16,
  },
});

export default TestAppleScreen;
