import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebaseConfig';

import SignUpScreen from './screens/register';
import SignInScreen from './screens/logIn';
import IncomeScreen from './screens/income';
import ExpensesScreen from './screens/expenses';
import ScanScreen from './screens/scan';
import ReceiptDetails from './screens/receipts_details';
import ReceiptConfirmationScreen from './screens/receiptConfirmation';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();
const Stack = createStackNavigator();

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

  if (checkingAuth) return null; // Or a splash screen/spinner if you like

  return (
    <NavigationContainer>
      <Stack.Navigator

        // initialRouteName={user ? 'Expenses' : 'SignIn'}
        initialRouteName={user ? 'Expenses' : 'SignIn'}
        // initialRouteName={"Receipt"}
        screenOptions={{ headerShown: false }} // optional: hide headers globally
      >

        <Stack.Screen name="SignUp" component={SignUpScreen} />
        <Stack.Screen name="SignIn" component={SignInScreen} />
        <Stack.Screen name="Income" component={IncomeScreen} />
        <Stack.Screen name="Expenses" component={ExpensesScreen} />
        <Stack.Screen name="Scan" component={ScanScreen} />
        <Stack.Screen name="Receipt" component={ReceiptDetails} />
        <Stack.Screen name="ReceiptConfirmation" component={ReceiptConfirmationScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}


