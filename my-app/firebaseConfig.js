// firebaseConfig.js

import { initializeApp } from 'firebase/app';
import {
  initializeAuth,
  getReactNativePersistence
} from 'firebase/auth';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyD05bdrS9O17SDFHBnJ23k6GyXZYDR_LZ8",
  authDomain: "express-accounts-73d38.firebaseapp.com",
  projectId: "express-accounts-73d38",
  storageBucket: "express-accounts-73d38.appspot.com", // <- fixed typo from ".firebasestorage.app"
  messagingSenderId: "1061817175814",
  appId: "1:1061817175814:web:0bb0d2496034887db49887",
  measurementId: "G-JW54E87DRP"
};

const app = initializeApp(firebaseConfig);

const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage),
});

export { auth };