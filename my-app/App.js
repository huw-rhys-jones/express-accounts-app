import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import HomeScreen from './screens/first'
import SecondScreen from './screens/second'
import ReceiptScreen from './screens/third'
import SignUpScreen from './screens/fourth'
import SignInScreen from './screens/logIn'
import IncomeScreen from './screens/income'
import ExpensesScreen from './screens/expenses'
import ScanScreen from './screens/scan'
import Receipts2Screen from './screens/receipts2'
import ReceiptConfirmationScreen from './screens/receiptConfirmation'


import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

const Stack = createStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="SignIn">
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Details" component={SecondScreen} />
        <Stack.Screen name="Receipts" component={ReceiptScreen} />
        <Stack.Screen name="SignUp" component={SignUpScreen} />
        <Stack.Screen name="SignIn" component={SignInScreen} />
        <Stack.Screen name="Income" component={IncomeScreen} />
        <Stack.Screen name="Expenses" component={ExpensesScreen} />
        <Stack.Screen name="Scan" component={ScanScreen} />
        <Stack.Screen name="Receipts2" component={Receipts2Screen} />
        <Stack.Screen name="Receipt" component={Receipts2Screen} />
        <Stack.Screen name="ReceiptConfirmation" component={ReceiptConfirmationScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
