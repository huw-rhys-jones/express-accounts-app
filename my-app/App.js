import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebaseConfig";

import SignUpScreen from "./screens/Register";
import SignInScreen from "./screens/LogIn";
import IncomeScreen from "./screens/Income";
import ExpensesScreen from "./screens/ReceiptList";
import ScanScreen from "./screens/scan";
import ReceiptAdd from "./screens/ReceiptAdd";
import ReceiptDetailsScreen from "./screens/ReceiptEdit";
import SummaryScreen from "./screens/SummaryScreen";
import * as WebBrowser from "expo-web-browser";

WebBrowser.maybeCompleteAuthSession();

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// 🔧 Global flag to disable swipe when modal is open
export let modalOpen = false;
export const setModalOpen = (isOpen) => {
  modalOpen = isOpen;
};

// ---------------- Custom Tab Bar ----------------
function CustomTabBar({ state, descriptors, navigation }) {
  return (
    <View style={styles.tabBar}>
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setCheckingAuth(false);
    });

    return unsubscribe;
  }, []);

  if (checkingAuth) return null; // TODO: replace with splash screen if desired

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={user ? "MainTabs" : "SignIn"}
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="SignUp" component={SignUpScreen} />
        <Stack.Screen name="SignIn" component={SignInScreen} />
        <Stack.Screen name="Income" component={IncomeScreen} />
        <Stack.Screen name="MainTabs" component={AppTabs} />
        <Stack.Screen name="Scan" component={ScanScreen} />
        <Stack.Screen name="Receipt" component={ReceiptAdd} />
        <Stack.Screen name="ReceiptDetails" component={ReceiptDetailsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// ---------------- Styles ----------------
const styles = StyleSheet.create({
  tabBar: {
    flexDirection: "row",
    height: 70,
    backgroundColor: "#B5B3C6",
    alignItems: "center",
    justifyContent: "space-around",
  },
  tabItem: { flex: 1, alignItems: "center" },
  tabText: { color: "#7B7B7B", fontSize: 14 },
  activeTab: { fontWeight: "bold", color: "#1C1C4E" },
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
