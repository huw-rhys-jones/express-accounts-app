import React, { useState } from "react";
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet 
} from "react-native";


import { auth } from '../firebaseConfig'
import { createUserWithEmailAndPassword } from 'firebase/auth';


const SignUpScreen = ({ navigation }) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const register = (
    // email, password
    ) => {
    
    // const auth = getAuth();
    createUserWithEmailAndPassword(auth, email, password)
      .then((userCredential) => {
      // Signed up 
      navigation.navigate('Expenses')
      const user = userCredential.user;
      console.log("success")
    } )
    .catch((error) => {
      const errorCode = error.code;
      const errorMessage = error.message;
      console.log(errorCode)
      console.log(errorMessage)
    });


  };
  

  return (
    <View style={styles.container}>
      {/* Header Section */}
      <View style={styles.header}>
        <Text style={styles.title}>Create new{"\n"}Account</Text>
        <Text style={styles.subtitle}>
          Already Registered? 
          <Text onPress={() => navigation.navigate('SignIn')} style={styles.link}>Log in here.</Text>
        </Text>
      </View>

      {/* Form Section */}
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

        {/* Sign Up Button */}
        <TouchableOpacity style={styles.button} onPress={() => register()}>
          <Text style={styles.buttonText}>Sign up</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#151337", // Dark purple background
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    backgroundColor: "#E5E4F2", // Light purple/grayish background
    width: "85%",
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    alignItems: "center",
    marginBottom: -10, // Overlapping effect
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    color: "#1C1A4D",
    marginBottom: 15,
  },
  subtitle: {
    fontSize: 14,
    color: "#555",
    textAlign: "center",
    marginBottom:-10,
  },
  link: {
    color: "#B00040",
    fontWeight: "bold",
  },
  form: {
    backgroundColor: "#E5E4F2", // Light purple form background
    width: "85%",
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
    backgroundColor: "#C4C3CC", // Grayish input background
    marginBottom: 1,
  },
  button: {
    backgroundColor: "#a60d49", // Red button
    paddingVertical: 12,
    borderRadius: 25,
    alignItems: "center",
    marginTop: 45,
    marginBottom: 12,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
});

export default SignUpScreen;

// #RE: Huw-  I tried to add the logo again but failed miserably! 