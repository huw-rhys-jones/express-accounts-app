import React, { useEffect, useRef, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, Alert, Modal, Image, Animated } from "react-native";
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
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
import MileageAdd from "./screens/MileageAdd";
import MileageEdit from "./screens/MileageEdit";
import SummaryScreen from "./screens/SummaryScreen";
import * as WebBrowser from "expo-web-browser";
import { MD3LightTheme, PaperProvider } from 'react-native-paper';
import { useSafeAreaInsets, SafeAreaProvider } from 'react-native-safe-area-context';
import { ensureHapticsDefaultEnabled } from "./utils/haptics";
import { DataProvider } from "./contexts/DataContext";
import { registerPushTokenForUser } from "./utils/pushNotifications";

WebBrowser.maybeCompleteAuthSession();

SplashScreen.preventAutoHideAsync().catch(() => {});

const Stack = createStackNavigator();
const Tab = createMaterialTopTabNavigator();
const DEBUG_DISABLE_TAB_SWIPE = false;
const AUTO_ASSIGN_VERIFICATION_URL = "https://express-accounts-73d38.web.app/auto-assign-verification-by-email";

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

function VerifyEmailGate({ onRefreshAuth, onLogout, email, onTryAutoAssign }) {
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

      if (typeof onTryAutoAssign === "function") {
        const matched = await onTryAutoAssign();
        if (matched) {
          onRefreshAuth();
          return;
        }
      }

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
          If you can't find the email, please check your spam folder.
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
          onPress={onLogout}
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


    </View>
  );
}

// ---------------- Tabs ----------------
function AppTabs() {
  return (
    <Tab.Navigator
        tabBar={(props) => <CustomTabBar {...props} />}
        tabBarPosition="bottom"
        screenOptions={{
          headerShown: false,
          swipeEnabled: !DEBUG_DISABLE_TAB_SWIPE,
        }}
      >
        <Tab.Screen
          name="Expenses"
          component={ExpensesScreen}
          options={{ tabBarLabel: "Expenses" }}
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
  const [userProfile, setUserProfile] = useState(null);
  const [vatSetupVisible, setVatSetupVisible] = useState(false);
  const [vatRegistered, setVatRegistered] = useState(false);
  const [vatRegistrationNumber, setVatRegistrationNumber] = useState("");
  const [welcomeVisible, setWelcomeVisible] = useState(false);
  const [startupPresentationComplete, setStartupPresentationComplete] = useState(false);
  const welcomeOpacity = useRef(new Animated.Value(1)).current;
  const navigationRef = useRef(null);
  const autoAssignAttemptRef = useRef("");

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const tryAutoAssignVerificationForUser = async (authUser, maxAttempts = 3) => {
    if (!authUser) return false;

    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const idToken = await authUser.getIdToken(attempt > 1);
        const response = await fetch(AUTO_ASSIGN_VERIFICATION_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + idToken,
          },
          body: JSON.stringify({}),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload && payload.error ? payload.error : "Auto-assign request failed.");
        }

        if (payload && payload.matched) {
          await reload(authUser);
          await authUser.getIdToken(true);
          await setDoc(
            doc(db, "users", authUser.uid),
            {
              emailVerified: true,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
          return true;
        }

        // No match found is a valid response; no further retries needed.
        return false;
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts) {
          await wait(300 * attempt);
          continue;
        }
      }
    }

    if (lastError) {
      console.warn("Auto-assign verification fallback failed", lastError);
    }
    return false;
  };

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
            ...(nextUser.emailVerified ? { emailVerified: true } : {}),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        ).catch((error) => {
          console.warn("Could not sync email verification state", error);
        });
      } else {
        setUserProfile(null);
      }

      setCheckingAuth(false);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) return;
    registerPushTokenForUser(user).catch((error) => {
      console.warn("Could not register push notifications", error);
    });
  }, [user]);

  useEffect(() => {
    const handleNotificationResponse = (response) => {
      const action = response?.notification?.request?.content?.data?.action;
      if (action === "open-summary" && navigationRef.current?.isReady()) {
        navigationRef.current.navigate("MainTabs", { screen: "Summary" });
      }
    };

    const subscription = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) handleNotificationResponse(response);
      })
      .catch(() => {});

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (checkingAuth) return;
    const run = async () => {
      if (user) {
        setWelcomeVisible(true);
        await SplashScreen.hideAsync().catch(() => {});

        // Fade out after 1.5s
        setTimeout(() => {
          Animated.timing(welcomeOpacity, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }).start(() => {
            setWelcomeVisible(false);
            setStartupPresentationComplete(true);
          });
        }, 1500);
      } else {
        await SplashScreen.hideAsync().catch(() => {});
        setStartupPresentationComplete(true);
      }
    };
    run();
  }, [checkingAuth]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Keep a live copy of user profile flags from Firestore.
  useEffect(() => {
    const activeUser = auth.currentUser || user;
    if (!activeUser) {
      setUserProfile(null);
      return;
    }

    const unsubscribe = onSnapshot(
      doc(db, "users", activeUser.uid),
      (snap) => {
        setUserProfile(snap.exists() ? (snap.data() || {}) : {});
      },
      (error) => {
        console.warn("Could not listen for user profile", error);
      }
    );

    return unsubscribe;
  }, [user]);

  useEffect(() => {
    if (!user || userProfile === null) return;
    const vatProfile = userProfile?.taxProfile?.vat;
    const answeredVatQuestion =
      vatProfile?.hasAnsweredRegistrationQuestion === true ||
      userProfile?.hasAnsweredVatRegistration === true ||
      Boolean(vatProfile?.setupCompletedAt);
    if (answeredVatQuestion) {
      setVatSetupVisible(false);
      return;
    }
    setVatRegistered(vatProfile?.isRegistered === true);
    setVatRegistrationNumber(String(vatProfile?.registrationNumber || ""));
    setVatSetupVisible(true);
  }, [user, userProfile]);

  const saveVatSetup = async () => {
    const activeUser = auth.currentUser || user;
    if (!activeUser) return;
    try {
      await setDoc(
        doc(db, "users", activeUser.uid),
        {
          taxProfile: {
            vat: {
              isRegistered: vatRegistered,
              registrationNumber: vatRegistered ? vatRegistrationNumber.trim() : "",
              hasAnsweredRegistrationQuestion: true,
              setupCompletedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
          },
          hasAnsweredVatRegistration: true,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setVatSetupVisible(false);
    } catch (error) {
      console.error("Could not save VAT registration", error);
      Alert.alert("Could not save VAT registration", "Please try again.");
    }
  };

  // Fallback auto-verification on sign-in: if a matching verification code exists
  // for this email, link it automatically and mark email as verified.
  useEffect(() => {
    const activeUser = auth.currentUser || user;
    if (!activeUser) return;
    if (!isPasswordProviderUser(activeUser)) return;

    const profileEmailVerified = Boolean(userProfile && userProfile.emailVerified);
    const profileClientVerified = String((userProfile && userProfile.verificationStatus) || "").toLowerCase() === "verified";
    if (activeUser.emailVerified || profileEmailVerified || profileClientVerified) return;

    const attemptKey = `${activeUser.uid}:${activeUser.email || ""}`;
    if (autoAssignAttemptRef.current === attemptKey) return;
    autoAssignAttemptRef.current = attemptKey;

    let cancelled = false;

    const run = async () => {
      const matched = await tryAutoAssignVerificationForUser(activeUser, 3);
      if (!cancelled && matched) {
        setAuthRefreshTick((current) => current + 1);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [user, userProfile]);

  if (checkingAuth) return null;

  const activeUser = auth.currentUser || user;
  const firestoreEmailVerified = Boolean(userProfile && userProfile.emailVerified);
  const firestoreVerifiedClient =
    String((userProfile && userProfile.verificationStatus) || "").toLowerCase() === "verified";
  const requiresEmailVerification =
    Boolean(activeUser) &&
    isPasswordProviderUser(activeUser) &&
    !activeUser.emailVerified &&
    !firestoreEmailVerified &&
    !firestoreVerifiedClient;

  return (
    /* Wrap everything in PaperProvider to fix the text color issue */
    <PaperProvider theme={theme}>
      <DataProvider>
      <NavigationContainer ref={navigationRef}>
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
                  onTryAutoAssign={async () => {
                    const userToCheck = auth.currentUser || user;
                    return tryAutoAssignVerificationForUser(userToCheck, 3);
                  }}
                  onLogout={async () => {
                    try {
                      await signOut(auth);
                      navigationRef.current?.reset({ index: 0, routes: [{ name: "SignIn" }] });
                    } catch (error) {
                      console.error("Could not sign out", error);
                    }
                  }}
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
          <Stack.Screen name="MileageRecord" component={MileageAdd} />
          <Stack.Screen name="MileageDetails" component={MileageEdit} />
        </Stack.Navigator>
      </NavigationContainer>
      </DataProvider>

      <Modal visible={!!pendingChallenge} transparent animationType="fade">        <View style={styles.twoFactorOverlay}>
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

      <Modal visible={startupPresentationComplete && vatSetupVisible} transparent animationType="fade" onRequestClose={saveVatSetup}>
        <View style={styles.twoFactorOverlay}>
          <View style={styles.vatSetupCard}>
            <Text style={styles.vatSetupTitle}>VAT registration</Text>
            <Text style={styles.vatSetupText}>Are you registered for VAT?</Text>
            <View style={styles.vatChoiceRow}>
              <TouchableOpacity
                style={[styles.vatChoiceButton, !vatRegistered ? styles.vatChoiceSelected : styles.vatChoiceUnselected]}
                onPress={() => setVatRegistered(false)}
              >
                <Text style={[styles.vatChoiceText, !vatRegistered ? styles.vatChoiceSelectedText : styles.vatChoiceUnselectedText]}>No</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.vatChoiceButton, vatRegistered ? styles.vatChoiceSelected : styles.vatChoiceUnselected]}
                onPress={() => setVatRegistered(true)}
              >
                <Text style={[styles.vatChoiceText, vatRegistered ? styles.vatChoiceSelectedText : styles.vatChoiceUnselectedText]}>Yes</Text>
              </TouchableOpacity>
            </View>
            {vatRegistered ? (
              <View style={styles.vatNumberGroup}>
                <Text style={styles.vatNumberLabel}>VAT registration number (optional)</Text>
                <TextInput
                  value={vatRegistrationNumber}
                  onChangeText={setVatRegistrationNumber}
                  placeholder="e.g. GB123456789"
                  placeholderTextColor="#8a8a94"
                  autoCapitalize="characters"
                  style={styles.vatRegistrationInput}
                />
              </View>
            ) : null}
            <TouchableOpacity style={styles.vatContinueButton} onPress={saveVatSetup}>
              <Text style={styles.vatContinueText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {welcomeVisible && (
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.welcomeSplash, { opacity: welcomeOpacity }]}
          pointerEvents="none"
        >
          <Image
            source={require('./assets/splash-icon.png')}
            style={styles.welcomeLogo}
            resizeMode="contain"
          />
          <Text style={styles.welcomeNameText}>
            Welcome, {user?.displayName || 'back'}!
          </Text>
        </Animated.View>
      )}
    </PaperProvider>
  );
}

// ---------------- Styles ----------------
const styles = StyleSheet.create({
  // For the tab navigation panel at the bottom of the screen ------------------

  // The small space between the top of the tabs and the main space 

  tabBar: {
    flexDirection: "row",
    // height: 70,
    backgroundColor: "#ffffff",
    borderTopWidth: 2,
    borderTopColor: "#a60d49",
    alignItems: "center",
    justifyContent: "space-around",
    paddingBottom: Platform.OS === 'android' ? 60 : 0,
    paddingTop: 8,
  },
  tabItem: { flex: 1, alignItems: "center", paddingHorizontal: 2 },
  tabText: { color: "#a60d49", fontSize: 14 },
  activeTab: { fontWeight: "bold", color: "#4A148C" },
  tabIcon: { marginTop: 2 },

  // Verification workflow --------------------------
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
  vatSetupCard: {
    width: "90%",
    maxWidth: 420,
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 24,
  },
  vatSetupTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#1C1C4E",
    marginBottom: 10,
    textAlign: "center",
  },
  vatSetupText: {
    fontSize: 15,
    color: "#333",
    textAlign: "center",
    marginBottom: 16,
  },
  vatChoiceRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  vatChoiceButton: {
    flex: 1,
    borderRadius: 24,
    paddingVertical: 13,
    alignItems: "center",
    borderWidth: 1,
  },
  vatChoiceSelected: {
    backgroundColor: "#a60d49",
    borderColor: "#a60d49",
  },
  vatChoiceUnselected: {
    backgroundColor: "#fff",
    borderColor: "#c7c7cc",
  },
  vatChoiceText: {
    fontSize: 15,
    fontWeight: "700",
  },
  vatChoiceSelectedText: {
    color: "#fff",
  },
  vatChoiceUnselectedText: {
    color: "#1C1C4E",
  },
  vatNumberGroup: {
    marginTop: 18,
  },
  vatNumberLabel: {
    color: "#1C1C4E",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
  },
  vatRegistrationInput: {
    borderWidth: 1,
    borderColor: "#c7c7cc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: "#1C1C4E",
  },
  vatContinueButton: {
    backgroundColor: "#1f7a3f",
    borderRadius: 24,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 18,
  },
  vatContinueText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
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

  welcomeSplash: {
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },

  // Welcome screen logo and text
  welcomeLogo: {
    width: 280,
    height: 280,
    marginBottom: 24,
  },

  welcomeNameText: {
    fontSize: 22,
    fontWeight: '600',
    color: '#302C66',
  },


});
