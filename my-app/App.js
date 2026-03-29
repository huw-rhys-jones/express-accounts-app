import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { View, Text, TouchableOpacity, StyleSheet, Platform, Alert } from "react-native";
import { onAuthStateChanged, reload, sendEmailVerification } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { Ionicons } from "@expo/vector-icons";
import { auth, db } from "./firebaseConfig";
import SignUpScreen from "./screens/Register";
import SignInScreen from "./screens/LogIn";
import IncomeScreen from "./screens/Income";
import ExpensesScreen from "./screens/ReceiptList";
import BankStatementList from "./screens/BankStatementList";
import ScanScreen from "./screens/Scan";
import ReceiptAdd from "./screens/ReceiptAdd";
import ReceiptDetailsScreen from "./screens/ReceiptEdit";
import IncomeAdd from "./screens/IncomeAdd";
import IncomeEdit from "./screens/IncomeEdit";
import BankStatementAdd from "./screens/BankStatementAdd";
import BankStatementEdit from "./screens/BankStatementEdit";
import SummaryScreen from "./screens/SummaryScreen";
import * as WebBrowser from "expo-web-browser";
import { MD3LightTheme, PaperProvider } from 'react-native-paper';
import { useSafeAreaInsets, SafeAreaProvider } from 'react-native-safe-area-context';
import { ensureHapticsDefaultEnabled } from "./utils/haptics";

WebBrowser.maybeCompleteAuthSession();

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// Create a custom theme based on the Light Theme
const theme = {
  ...MD3LightTheme,
  // You can force specific colors here if needed
  colors: {
    ...MD3LightTheme.colors,
    primary: 'tomato',
    secondary: 'yellow',
  },
};

// 🔧 Global flag to disable swipe when modal is open
export let modalOpen = false;
export const setModalOpen = (isOpen) => {
  modalOpen = isOpen;
};

function isPasswordProviderUser(user) {
  return Boolean(user?.providerData?.some((provider) => provider?.providerId === "password"));
}

function VerifyEmailGate({ onRefreshAuth }) {
  const [busy, setBusy] = useState(false);

  const resendVerification = async () => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      setBusy(true);
      await sendEmailVerification(user);
      Alert.alert("Verification Email Sent", "Please check your inbox and click the verification link.");
    } catch (error) {
      console.error("Could not send verification email", error);
      Alert.alert("Could not send email", "Please try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  const checkVerification = async () => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      setBusy(true);
      await reload(user);
      if (!user.emailVerified) {
        Alert.alert("Not Verified Yet", "We still see this email as unverified. Please check your inbox and try again.");
        return;
      }

      await user.getIdToken(true);
      await setDoc(
        doc(db, "users", user.uid),
        {
          ...(user.displayName ? { name: user.displayName } : {}),
          ...(user.email ? { email: user.email } : {}),
          emailVerified: true,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      onRefreshAuth();
    } catch (error) {
      console.error("Could not refresh verification state", error);
      Alert.alert("Refresh Failed", "Could not refresh verification status.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.verifyContainer}>
      <View style={styles.verifyCard}>
        <Text style={styles.verifyTitle}>Verify Your Email</Text>
        <Text style={styles.verifyText}>
          Please verify your email address to enable the app.
        </Text>

        <TouchableOpacity
          disabled={busy}
          style={styles.verifyPrimaryButton}
          onPress={resendVerification}
        >
          <Text style={styles.verifyPrimaryText}>Resend Verification Email</Text>
        </TouchableOpacity>

        <TouchableOpacity
          disabled={busy}
          style={styles.verifyPrimaryButton}
          onPress={checkVerification}
        >
          <Text style={styles.verifyPrimaryText}>I've Verified, Unlock App</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ---------------- Custom Tab Bar ----------------
function CustomTabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[
      styles.tabBar, 
      { paddingBottom: Math.max(insets.bottom, 15) } // Automatically handles buttons/home bars
    ]}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label =
          options.tabBarLabel !== undefined
            ? options.tabBarLabel
            : options.title !== undefined
            ? options.title
            : route.name;

        const isFocused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        const iconName =
          route.name === "Expenses"
            ? "receipt-outline"
            : route.name === "Income"
            ? "cash-outline"
            : route.name === "BankStatements"
            ? "card-outline"
            : "stats-chart-outline";

        return (
          <TouchableOpacity
            key={route.key}
            accessibilityRole="button"
            onPress={onPress}
            style={styles.tabItem}
          >
            <Text style={[styles.tabText, isFocused && styles.activeTab]}>
              {label}
            </Text>
            <Ionicons
              name={iconName}
              size={18}
              color={isFocused ? "#1C1C4E" : "#7B7B7B"}
              style={styles.tabIcon}
            />
          </TouchableOpacity>
        );
      })}

      {/* Floating Add Button */}
      {/* <TouchableOpacity
        style={styles.floatingButton}
        onPress={() => navigation.navigate("Receipt")}
      >
        <Text style={styles.plusText}>+</Text>
      </TouchableOpacity> */}
    </View>
  );
}

// ---------------- Tabs ----------------
function AppTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        // Disable swipe gestures when a modal is open
        swipeEnabled: !modalOpen,
      }}
    >
      <Tab.Screen
        name="Expenses"
        component={ExpensesScreen}
        options={{ tabBarLabel: "Receipts" }}
      />
      <Tab.Screen
        name="Income"
        component={IncomeScreen}
        options={{ tabBarLabel: "Income" }}
      />
      <Tab.Screen
        name="BankStatements"
        component={BankStatementList}
        options={{ tabBarLabel: "Bank" }}
      />
      <Tab.Screen
        name="Summary"
        component={SummaryScreen}
        options={{ tabBarLabel: "Summary" }}
      />
    </Tab.Navigator>
  );
}

// ---------------- Main App ----------------
export default function App() {
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authRefreshTick, setAuthRefreshTick] = useState(0);

  useEffect(() => {
    ensureHapticsDefaultEnabled().catch((error) => {
      console.warn("Could not load haptics default setting", error);
    });

    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);

      if (nextUser) {
        await setDoc(
          doc(db, "users", nextUser.uid),
          {
            ...(nextUser.displayName ? { name: nextUser.displayName } : {}),
            ...(nextUser.email ? { email: nextUser.email } : {}),
            emailVerified: Boolean(nextUser.emailVerified),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        ).catch((error) => {
          console.warn("Could not sync email verification state", error);
        });
      }

      setCheckingAuth(false);
    });

    return unsubscribe;
  }, []);

  if (checkingAuth) return null;

  const activeUser = auth.currentUser || user;
  const requiresEmailVerification =
    Boolean(activeUser) &&
    isPasswordProviderUser(activeUser) &&
    !activeUser.emailVerified;

  return (
    /* Wrap everything in PaperProvider to fix the text color issue */
    <PaperProvider theme={theme}>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName={activeUser ? "MainTabs" : "SignIn"}
          screenOptions={{ headerShown: false }}
        >
          <Stack.Screen name="SignUp" component={SignUpScreen} />
          <Stack.Screen name="SignIn" component={SignInScreen} />
          <Stack.Screen name="MainTabs">
            {() =>
              requiresEmailVerification ? (
                <VerifyEmailGate
                  onRefreshAuth={() => setAuthRefreshTick((current) => current + 1)}
                />
              ) : (
                <AppTabs key={`tabs-${authRefreshTick}`} />
              )
            }
          </Stack.Screen>
          <Stack.Screen name="Scan" component={ScanScreen} />
          <Stack.Screen name="Receipt" component={ReceiptAdd} />
          <Stack.Screen name="ReceiptDetails" component={ReceiptDetailsScreen} />
          <Stack.Screen name="IncomeRecord" component={IncomeAdd} />
          <Stack.Screen name="IncomeDetails" component={IncomeEdit} />
          <Stack.Screen name="BankStatement" component={BankStatementAdd} />
          <Stack.Screen name="BankStatementDetails" component={BankStatementEdit} />
        </Stack.Navigator>
      </NavigationContainer>
    </PaperProvider>
  );
}

// ---------------- Styles ----------------
const styles = StyleSheet.create({
  tabBar: {
    flexDirection: "row",
    // height: 70,
    backgroundColor: "#B5B3C6",
    alignItems: "center",
    justifyContent: "space-around",
    paddingBottom: Platform.OS === 'android' ? 60 : 0,
    paddingTop: 8,
  },
  tabItem: { flex: 1, alignItems: "center", paddingVertical: 2 },
  tabText: { color: "#7B7B7B", fontSize: 14 },
  activeTab: { fontWeight: "bold", color: "#1C1C4E" },
  tabIcon: { marginTop: 2 },
  verifyContainer: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  verifyCard: {
    width: "90%",
    maxWidth: 420,
    backgroundColor: "#E5E5EA",
    borderRadius: 20,
    padding: 22,
    alignItems: "center",
  },
  verifyTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1C1C4E",
    marginBottom: 10,
  },
  verifyText: {
    fontSize: 15,
    color: "#1C1C4E",
    textAlign: "center",
    marginBottom: 16,
  },
  verifyPrimaryButton: {
    width: "100%",
    backgroundColor: "#a60d49",
    borderRadius: 24,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 10,
  },
  verifyPrimaryText: {
    color: "#fff",
    fontWeight: "700",
  },
  verifySecondaryButton: {
    display: "none",
  },
  verifySecondaryText: {
    color: "#a60d49",
    fontWeight: "700",
  },
  floatingButton: {
    position: "absolute",
    bottom: 20,
    alignSelf: "center",
    backgroundColor: "#a60d49",
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
    zIndex: 10,
  },
  plusText: { color: "#fff", fontSize: 32, fontWeight: "bold" },
});
