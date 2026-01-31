import 'dotenv/config';
import pkg from './package.json'; // Import your package.json

export default ({ config }) => ({
  ...config,

  name: "Express Accounts",
  slug: "express-accounts",
  scheme: "com.caistec.expressaccounts",
  version: pkg.version,
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  newArchEnabled: false, // Keeping this false as per your current setup

  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff"
  },

  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.caistec.expressaccounts",
    buildNumber: "15",
    googleServicesFile: "./GoogleService-Info.plist",
    usesAppleSignIn: true,
    infoPlist: {
      NSPhotoLibraryUsageDescription:
        "Express Accounts needs access to your photo library so you can upload receipts and documents.",
      NSCameraUsageDescription:
        "Express Accounts needs access to your camera to take photos of receipts and documents.",
      NSPhotoLibraryAddUsageDescription:
        "Express Accounts needs permission to save receipts and documents back to your photo library."
    }
  },

  android: {
    package: "com.caistec.expressaccounts",
    versionCode: 15,
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#ffffff"
    },
    permissions: [
      "android.permission.CAMERA", 
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.READ_EXTERNAL_STORAGE"
    ]
  },

  plugins: [
    "expo-apple-authentication",
    "expo-router",
    [
      "expo-image-picker",
      {
        "cameraPermission": "Express Accounts needs access to your camera to scan receipts.",
        "photosPermission": "Express Accounts needs access to your photos to upload receipts."
      }
    ],
    [
      "react-native-edge-to-edge",
      {
        android: {
          parentTheme: "Default",
          enforceNavigationBarContrast: false
        }
      }
    ],
    [
      "expo-build-properties",
      {
        android: {
          compileSdkVersion: 35,
          targetSdkVersion: 35,
          minSdkVersion: 24
        },
        ios: {
          deploymentTarget: "15.5",
          useFrameworks: "static"
        }
      }
    ],
  ],

  web: {
    favicon: "./assets/favicon.png"
  },

  extra: {
    eas: { projectId: "5b149386-fb46-4d4d-8308-fde7bcff2f37" },
    FIREBASE_API_KEY: process.env.FIREBASE_API_KEY,
    FIREBASE_AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN,
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET,
    FIREBASE_MESSAGING_SENDER_ID: process.env.FIREBASE_MESSAGING_SENDER_ID,
    FIREBASE_APP_ID: process.env.FIREBASE_APP_ID,
    FIREBASE_MEASUREMENT_ID: process.env.FIREBASE_MEASUREMENT_ID,
    GOOGLE_WEB_CLIENT_ID: process.env.GOOGLE_WEB_CLIENT_ID,
    GOOGLE_ANDROID_CLIENT_ID: process.env.GOOGLE_ANDROID_CLIENT_ID,
    GOOGLE_IOS_CLIENT_ID: process.env.GOOGLE_IOS_CLIENT_ID
  }
});