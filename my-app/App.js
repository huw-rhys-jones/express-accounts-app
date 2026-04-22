import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { View, Text, TouchableOpacity, StyleSheet, Platform, Alert, Modal } from "react-native";
import { onAuthStateChanged, reload, sendEmailVerification, signOut } from "firebase/auth";
import { doc, serverTimestamp, setDoc, collection, query, where, onSnapshot, updateDoc } from "firebase/firestore";
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

function VerifyEmailGate({ onRefreshAuth, email }) {
  const [busy, setBusy] = useState(false);

  const resendVerification = async () => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      setBusy(true);
      await sendEmailVerification(user);
      // Email sent silently — the modal itself confirms the action
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
        {email ? (
          <Text style={[styles.verifyText, { fontWeight: "600", marginBottom: 4 }]}>
            Email sent to: {email}
          </Text>
        ) : null}
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

        <TouchableOpacity
          disabled={busy}
          style={[styles.verifyPrimaryButton, styles.verifyLogoutButton]}
          onPress={() => signOut(auth).catch(console.error)}
        >
          <Text style={styles.verifyPrimaryText}>Log Out</Text>
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
  const [pendingChallenge, setPendingChallenge] = useState(null);

  const handleChallengeResponse = async (challengeId, status) => {
    try {
      await updateDoc(doc(db, "twoFactorChallenges", challengeId), { status });
    } catch (error) {
      console.error("Could not respond to 2FA challenge", error);
    }
  };

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

  // Listen for pending 2FA challenges created from the web portal
  useEffect(() => {
    if (!user) {
      setPendingChallenge(null);
      return;
    }
    const now = new Date();
    const challengesQuery = query(
      collection(db, "twoFactorChallenges"),
      where("userId", "==", user.uid),
      where("status", "==", "pending")
    );
    const unsubscribe = onSnapshot(challengesQuery, (snapshot) => {
      const valid = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((c) => c.expiresAt && c.expiresAt.toDate() > new Date());
      setPendingChallenge(valid.length > 0 ? valid[0] : null);
    }, (error) => {
      console.warn("Could not listen for 2FA challenges", error);
    });
    return unsubscribe;
  }, [user]);

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
                  email={activeUser?.email}
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

      <Modal visible={!!pendingChallenge} transparent animationType="fade">
        <View style={styles.twoFactorOverlay}>
          <View style={styles.twoFactorCard}>
            <Text style={styles.twoFactorTitle}>Login Request</Text>
            <Text style={styles.twoFactorText}>
              Someone is trying to sign in to the accountant portal using your account.
            </Text>
            {pendingChallenge?.deviceInfo ? (
              <Text style={styles.twoFactorDevice} numberOfLines={3}>
                {pendingChallenge.deviceInfo}
              </Text>
            ) : null}
            <Text style={styles.twoFactorPrompt}>Was this you?</Text>
            <View style={styles.twoFactorActions}>
              <TouchableOpacity
                style={[styles.twoFactorButton, styles.twoFactorApprove]}
                onPress={() => handleChallengeResponse(pendingChallenge.id, "approved")}
              >
                <Text style={styles.twoFactorButtonText}>Approve</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.twoFactorButton, styles.twoFactorDeny]}
                onPress={() => handleChallengeResponse(pendingChallenge.id, "denied")}
              >
                <Text style={styles.twoFactorButtonText}>Deny</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  verifyLogoutButton: {
    backgroundColor: "#555",
    marginTop: 16,
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
  twoFactorOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  twoFactorCard: {
    width: "90%",
    maxWidth: 420,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
  },
  twoFactorTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1C1C4E",
    marginBottom: 10,
  },
  twoFactorText: {
    fontSize: 15,
    color: "#333",
    textAlign: "center",
    marginBottom: 12,
  },
  twoFactorDevice: {
    fontSize: 12,
    color: "#666",
    textAlign: "center",
    marginBottom: 12,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  twoFactorPrompt: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1C1C4E",
    marginBottom: 16,
  },
  twoFactorActions: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  twoFactorButton: {
    flex: 1,
    borderRadius: 24,
    paddingVertical: 13,
    alignItems: "center",
  },
  twoFactorApprove: {
    backgroundColor: "#1f7a3f",
  },
  twoFactorDeny: {
    backgroundColor: "#b42318",
  },
  twoFactorButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
});
