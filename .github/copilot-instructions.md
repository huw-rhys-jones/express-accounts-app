# Express Accounts App - AI Coding Guidelines

## Architecture Overview
- **Expo React Native app** for receipt/expense tracking with Firebase backend
- **Navigation**: Stack Navigator for auth/modals, Tab Navigator for main screens (Receipts, Summary)
- **Data Model**: Firestore `receipts` collection with userId filtering; fields: date, amount, category, etc.
- **Auth**: Firebase Auth with AsyncStorage persistence, Google Sign-In integration

## Key Patterns
- **Firebase Queries**: Always filter by `userId` for user-specific data (e.g., `where("userId", "==", user.uid)`)
- **Date Handling**: Use `formatDate()` from `utils/format_style.js` for YYYY/MM/DD display
- **Loading States**: Wrap async ops in `runWithLoading("text", async () => { ... })` for UI feedback
- **Sorting**: Implement column sorting with toggle (asc/desc) in list screens like `ReceiptList.js`
- **Navigation Refresh**: Add focus listener to refresh data: `navigation.addListener("focus", fetchData)`
- **Theming**: Extend `MD3LightTheme` in `App.js` for consistent colors (primary: tomato, secondary: yellow)
- **Modal Management**: Use global `modalOpen` flag to disable tab swipe gestures when modals active

## Workflows
- **Development**: `npm start` (expo start), `npm run android/ios` for device testing
- **Building**: Use EAS - `eas build --platform android/ios --profile production` (see `build-android.sh`)
- **Firebase Config**: Keys stored in `expoConstants.extra`, initialized in `firebaseConfig.js`
- **OCR Processing**: Use `@react-native-ml-kit/text-recognition` for receipt scanning, extract data via `utils/extractors.js` regex patterns
- **Categories**: Auto-categorize using keyword matching from `constants/arrays.js` `categories_meta`

## Conventions
- **File Structure**: Screens in `screens/`, components in `components/`, utils in `utils/`
- **Imports**: Relative paths (e.g., `import { db } from "../firebaseConfig"`)
- **Styling**: Inline `StyleSheet.create` with platform-specific padding (e.g., `paddingBottom: Platform.OS === 'android' ? 60 : 0`)
- **Error Handling**: Console.error for debugging, no custom error boundaries
- **VAT Calculation**: Use category-specific rates from `categories_meta` for tax computations

## Examples
- Adding a screen: Import in `App.js`, add to Stack/Tab Navigator, update initialRouteName
- Fetching data: `const q = query(collection(db, "receipts"), where("userId", "==", user.uid)); const docs = await getDocs(q);`
- Custom component: Follow `SideMenu.js` pattern with Animated values for smooth transitions</content>
<parameter name="filePath">/Users/richendaleonard/Documents/express-accounts-app/.github/copilot-instructions.md