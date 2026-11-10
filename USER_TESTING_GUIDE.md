# Express Accounts — User Stories & Manual Testing Guide

This guide provides end-to-end **User Stories** and step-by-step **Manual User Acceptance Tests (UAT)** covering the mobile app ([`my-app/`](file:///home/huw/code/express-accounts-app/my-app)) and the Accountant Web Portal ([`public/client-portal.html`](file:///home/huw/code/express-accounts-app/public/client-portal.html)), ordered from **most vital (P0)** to **secondary/administrative features (P3)**. Bank statement workflows are excluded for now as requested.

> [!TIP]
> Use the checkboxes (`- [ ]`) in each test case to track your progress during a testing session.

---

## Tier 1: Vital Core Workflows (P0 — Must Pass)

### 1. Client Onboarding & Sign-Up (Email/Password, Google & Apple — Pre-Approved vs. Non-Pre-Approved)

#### User Stories
* **US-1.1 (Accountant Pre-Approval):** *As an accountant, I want to pre-approve a client by entering their name and email on the web portal so that they appear as a pending grey card and are automatically verified when they sign up via Email/Password, Google, or Apple.*
* **US-1.2 (Pre-Approved Email/Password Sign-Up):** *As a pre-approved client, when I register in the app using my invited email address, I want to skip the email verification screen completely and land straight in the app as a Verified Client.*
* **US-1.3 (Standard / Non-Pre-Approved Email/Password Sign-Up):** *As a general member of the public signing up with email & password without pre-approval, I must verify my email address before accessing the app and start on the Standard (non-verified) tier.*
* **US-1.4 (Google Sign-In — Pre-Approved & Standard):** *As an Android user signing in with Google, I want to bypass email verification (since Google verifies my email) and automatically be upgraded to a Verified Client if my Google email was pre-approved.*
* **US-1.5 (Apple Sign-In — Pre-Approved & Standard):** *As an iOS user signing in with Apple, I want my full name and email captured on first sign-in, email verification skipped, and my account automatically marked as a Verified Client if my Apple ID email was pre-approved.*

#### Test Cases

##### Test 1A: Pre-Approve a Client on the Web Portal
- **Where:** Accountant Web Portal ([`public/client-portal.html`](file:///home/huw/code/express-accounts-app/public/client-portal.html))
- **Steps:**
  - [ ] Log in to the Accountant Web Portal.
  - [ ] Click **`✚ Pre-Approve Client`** in the top header bar.
  - [ ] Enter a test client name (e.g., `Test Preapproved User`) and a fresh email address (e.g., `preapproved.test@example.com`).
  - [ ] Click **`Pre-Approve Client`**.
  - [ ] Click the **`Grey: Pre-Approved (Pending Sign-Up)`** filter chip on the board.
  - [ ] Click the newly created grey card for `Test Preapproved User`.
- **Expected Result:**
  - A **grey card** appears on the board showing `Pre-Approved`, the email address, `Status: Pending App Sign-Up`, and today's invited date.
  - Clicking the grey card opens the *Pre-Approved Client* modal with **`✉ Email Invitation`** and **`Cancel Pre-Approval`** buttons.

##### Test 1B: App Sign-Up as a Pre-Approved User via Email/Password (Email Verification Skipped)
- **Where:** Mobile App ([`Register.js`](file:///home/huw/code/express-accounts-app/my-app/screens/Register.js), [`App.js`](file:///home/huw/code/express-accounts-app/my-app/App.js))
- **Prerequisite:** `preapproved.test@example.com` is pre-approved in Test 1A.
- **Steps:**
  - [ ] Open the mobile app and navigate to **Sign Up**.
  - [ ] Enter a name, the pre-approved email (`preapproved.test@example.com`), a valid password, accept the Privacy Policy, and tap **Create Account**.
  - [ ] Observe the screen transition immediately after registration.
  - [ ] Open the hamburger **Side Menu** in the top-left corner.
  - [ ] Refresh the Accountant Web Portal board.
- **Expected Result:**
  - The user **completely skips** the *"Verify your email"* gate screen (`VerifyEmailGate`) and lands directly on the main **Expenses** tab.
  - In the Side Menu, the user is badged as a **Verified Client** (with no "Join Express Accounts" upsell banner).
  - On the Accountant Web Portal, the grey pre-approved card has automatically converted into an active client card (`★ Verified`).

##### Test 1C: App Sign-Up as a Non-Pre-Approved User via Email/Password (Email Verification Required)
- **Where:** Mobile App ([`Register.js`](file:///home/huw/code/express-accounts-app/my-app/screens/Register.js), [`App.js`](file:///home/huw/code/express-accounts-app/my-app/App.js))
- **Steps:**
  - [ ] Sign out of the app and go to **Sign Up**.
  - [ ] Register with a fresh email address that has **not** been pre-approved (e.g., `standard.user@example.com`).
  - [ ] Observe the screen shown after account creation.
  - [ ] Click the verification link sent to `standard.user@example.com` (or tap **I've Verified My Email** after verifying).
  - [ ] Open the Side Menu once inside the app.
- **Expected Result:**
  - After tapping Create Account, the user is held at the **Verify Email Gate** screen and cannot access the tabs until their email is verified.
  - A verification email is sent to their inbox.
  - Once verified, the user enters the app as a **Standard (Non-Verified)** user and sees the **"Join Express Accounts"** option in the Side Menu.

##### Test 1D: Federated Login — Google Sign-In (Pre-Approved vs. Non-Pre-Approved)
- **Where:** Mobile App on Android ([`LogIn.js`](file:///home/huw/code/express-accounts-app/my-app/screens/LogIn.js), [`useGoogleSignIn.js`](file:///home/huw/code/express-accounts-app/my-app/auth/useGoogleSignIn.js), [`App.js`](file:///home/huw/code/express-accounts-app/my-app/App.js))
- **Steps:**
  - [ ] **Scenario 1 (Non-Pre-Approved Google Account):**
    - [ ] Ensure your test Gmail address is **not** in `preapprovedClients` (delete any existing test account for it first).
    - [ ] On the **Sign In** screen, tap **Continue with Google** and complete the Google account picker / 2FA prompt.
    - [ ] Verify you land directly on the **Expenses** tab without seeing an email verification screen or legacy code modal.
    - [ ] Open the Side Menu and confirm the account is on the **Standard (Non-Verified)** tier and displays your Google display name and email.
  - [ ] **Scenario 2 (Pre-Approved Google Account):**
    - [ ] Delete the test account (via Test 6C on the portal), then pre-approve that same Gmail address using **`✚ Pre-Approve Client`** on the Web Portal.
    - [ ] On the mobile app **Sign In** screen, tap **Continue with Google** and select that Gmail account.
    - [ ] Open the Side Menu and refresh the Accountant Web Portal.
- **Expected Result:**
  - Both scenarios skip the email verification gate (since Google is a federated provider).
  - In **Scenario 1**, the user enters as a Standard user.
  - In **Scenario 2**, the user is automatically matched to the pre-approval record (`autoAssignVerificationByEmail`), badged as a **Verified Client**, and their grey pre-approved card on the portal turns into an active `★ Verified` client card.

##### Test 1E: Federated Login — Apple Sign-In (Pre-Approved vs. Non-Pre-Approved & Privacy Relay)
- **Where:** Mobile App on iOS ([`LogIn.js`](file:///home/huw/code/express-accounts-app/my-app/screens/LogIn.js#L298-L357), [`App.js`](file:///home/huw/code/express-accounts-app/my-app/App.js))
- **Steps:**
  - [ ] **Scenario 1 (Pre-Approved Apple ID — "Share My Email"):**
    - [ ] On the Web Portal, pre-approve the client's real Apple ID email address via **`✚ Pre-Approve Client`**.
    - [ ] On an iOS device, tap **Sign in with Apple** on the **Sign In** screen.
    - [ ] Choose **Share My Email** (important: choosing *"Hide My Email"* generates a random `@privaterelay.appleid.com` address that won't match the pre-approved email) and confirm with Face ID / Touch ID / Passcode.
    - [ ] Verify you land straight on the **Expenses** tab as a **Verified Client** and the grey card on the portal converts to an active `★ Verified` card.
  - [ ] **Scenario 2 (Non-Pre-Approved Apple ID or "Hide My Email"):**
    - [ ] Sign in with an Apple ID that was not pre-approved (or using *Hide My Email*).
    - [ ] Verify you land straight on the **Expenses** tab as a **Standard (Non-Verified)** user and your name/email are saved to `users/{uid}` on the portal.
  - [ ] **Scenario 3 (Returning Apple Sign-In Name Persistence):**
    - [ ] Sign out of the app and tap **Sign in with Apple** a second time with the same Apple ID (Apple only sends `fullName` on the very first authorization).
    - [ ] Verify the user's name in the Side Menu and on the Accountant Web Portal is **preserved** and not overwritten with blank/undefined.
- **Expected Result:**
  - Apple Sign-In authenticates smoothly, skips email verification, auto-verifies pre-approved Apple emails when *Share My Email* is selected, and preserves the user's display name on subsequent logins.

##### Test 1F: Late Pre-Approval for an Existing Federated or Password User
- **Where:** Web Portal & Mobile App ([`App.js`](file:///home/huw/code/express-accounts-app/my-app/App.js#L524-L551))
- **Steps:**
  - [ ] Sign in with a non-pre-approved Google, Apple, or Email/Password account so the user is on the **Standard** tier.
  - [ ] On the Web Portal, click **`✚ Pre-Approve Client`** (or use the **`Client Info`** tab's **`Mark as Verified Client`** button).
  - [ ] Relaunch or sign back into the mobile app.
- **Expected Result:**
  - The app automatically detects the verification status and upgrades the user to a **Verified Client**.

---

### 2. Adding Receipts / Expenses (No Image, Single Image, Multiple Images, Multiple Receipts)

#### User Stories
* **US-2.1 (Manual Receipt Without Image):** *As a user, I want to log an expense without a photo when I don't have a paper receipt.*
* **US-2.2 (Single Image Receipt):** *As a user, I want to snap or upload a single photo of a receipt, have the app crop and extract the amount, date, VAT, and category, and highlight those fields on the image.*
* **US-2.3 (Multiple Images of One Receipt):** *As a user with a long or double-sided receipt, I want to attach multiple photos to a single expense record.*
* **US-2.4 (Multiple Distinct Receipts in One Batch):** *As a user with a stack of receipts, I want to select multiple photos of different receipts at once and step through reviewing and saving each one in a batch workflow.*

#### Test Cases

##### Test 2A: Add a Receipt WITHOUT an Image
- **Where:** Mobile App — **Expenses** Tab ([`AddReceiptSheet.js`](file:///home/huw/code/express-accounts-app/my-app/components/AddReceiptSheet.js), [`ReceiptAdd.js`](file:///home/huw/code/express-accounts-app/my-app/screens/ReceiptAdd.js))
- **Steps:**
  - [ ] On the **Expenses** tab, tap the **`+`** button (or **Add Receipts** button).
  - [ ] In the bottom sheet, select **Continue without image / Manual entry** (or open the form and do not attach a photo).
  - [ ] Enter an **Amount** (e.g., `24.50`), pick a **Date**, select a **Category** (e.g., `Travel`), and enter an optional **Label/Description** (e.g., `Train ticket`).
  - [ ] Tap **Save Receipt**.
- **Expected Result:**
  - Receipt saves without error and appears in the **Expenses** list under the corresponding month with `£24.50`, `Travel`, and no image thumbnail.

##### Test 2B: Add a Receipt WITH a Single Image (Camera & Gallery + Crop)
- **Where:** Mobile App — **Expenses** Tab ([`ReceiptAdd.js`](file:///home/huw/code/express-accounts-app/my-app/screens/ReceiptAdd.js), [`ReceiptCropScreen.js`](file:///home/huw/code/express-accounts-app/my-app/screens/ReceiptCropScreen.js))
- **Steps:**
  - [ ] Tap **`+`** on the **Expenses** tab and choose **Take Photo** (or **Choose from Library** and pick 1 clear receipt photo).
  - [ ] If taking a photo, when prompted *"Photo 1 added"*, tap **Done / Continue**.
  - [ ] Verify the automatic perspective crop or adjust corners on the crop screen if prompted.
  - [ ] Wait for the OCR scan indicator to finish.
  - [ ] Inspect the auto-populated **Amount**, **Date**, **VAT** (if VAT-registered), and **Category**.
  - [ ] Check the receipt image preview at the top for colored annotation boxes (**Amount** in green, **Date** in blue, **VAT** in red).
  - [ ] Tap **Save**.
- **Expected Result:**
  - Amount, Date, and Category are auto-filled from the receipt text.
  - Bounding boxes highlight the detected values on the image preview (and can be toggled on/off).
  - Saving uploads the image to Firebase Storage and lists the receipt in **Expenses**.

##### Test 2C: Add a Single Receipt WITH Multiple Images (Multi-Page Receipt)
- **Where:** Mobile App — **Expenses** Tab ([`ReceiptAdd.js`](file:///home/huw/code/express-accounts-app/my-app/screens/ReceiptAdd.js), [`ocrHelpers.js`](file:///home/huw/code/express-accounts-app/my-app/utils/ocrHelpers.js))
- **Steps:**
  - [ ] Start adding a receipt with 1 photo of the top half of a receipt (or take 2 photos of the same receipt with the same date/total).
  - [ ] Alternatively, inside the **Add Receipt** screen after adding the first image, tap the **Add More Images (`+`)** button on the image strip to attach a second photo to the current receipt.
  - [ ] Verify both image thumbnails appear in the horizontal image strip for that single receipt.
  - [ ] Tap **Save**.
- **Expected Result:**
  - Both images are saved under a **single** expense record.
  - Re-opening the receipt in [`ReceiptEdit.js`](file:///home/huw/code/express-accounts-app/my-app/screens/ReceiptEdit.js) (and viewing it on the Accountant Portal) shows `2` attached images for that 1 receipt.

##### Test 2D: Add Multiple Distinct Receipts at Once (Batch Mode)
- **Where:** Mobile App — **Expenses** Tab ([`AddReceiptSheet.js`](file:///home/huw/code/express-accounts-app/my-app/components/AddReceiptSheet.js), [`ReceiptAdd.js`](file:///home/huw/code/express-accounts-app/my-app/screens/ReceiptAdd.js))
- **Steps:**
  - [ ] Tap **`+`** on the **Expenses** tab.
  - [ ] Either choose **Take Photo** and tap **Take Another Photo** for 2–3 *different* receipts (with different totals/dates), OR choose **Choose from Library** and select 2–3 photos of different receipts.
  - [ ] Wait for batch detection (`detectReceiptGroupsFromAssets`) to complete.
  - [ ] Verify the screen enters **Multi-Receipt Mode** (showing a header/progress indicator such as `Receipt 1 of 3`).
  - [ ] Review/edit Receipt 1, advance to Receipt 2 (`Next`), optionally test skipping one, and complete the batch save.
- **Expected Result:**
  - Distinct receipts are split into separate draft cards (`1 of N`, `2 of N`, etc.).
  - After reviewing and saving the batch, the **Batch Summary Modal** confirms how many receipts were saved, and each appears as a separate item in the **Expenses** list.

---

### 3. OCR Scanning: Verified Client vs. Non-Verified User

#### User Stories
* **US-3.1 (Verified Client Cloud OCR):** *As a Verified Client, my receipt scans should use Google Cloud OCR (`extractReceiptImages`) for maximum accuracy on crumpled or complex receipts, while falling back to on-device ML Kit if I lose signal.*
* **US-3.2 (Non-Verified Local OCR):** *As a Standard (non-verified) user, my receipt scans should run locally on-device using ML Kit without invoking the paid Cloud OCR endpoint.*

#### Test Cases

##### Test 3A: Scan a Receipt as a Verified Client (Cloud OCR)
- **Where:** Mobile App ([`ocrHelpers.js`](file:///home/huw/code/express-accounts-app/my-app/utils/ocrHelpers.js#L349-L402), [`cloudReceiptOcr.js`](file:///home/huw/code/express-accounts-app/my-app/utils/cloudReceiptOcr.js))
- **Prerequisite:** Signed in as a **Verified Client** (e.g., from Test 1B) with internet access.
- **Steps:**
  - [ ] Add a receipt with a photo of a complex or detailed receipt/invoice.
  - [ ] (If Metro/console logs are visible, confirm `Receipt OCR source: cloud` is logged).
  - [ ] Verify that total amount, date, merchant/category, and VAT are extracted accurately and annotation frames are drawn.
  - [ ] *Optional Offline Fallback Check:* Turn on Airplane Mode, scan another receipt photo, and verify it falls back cleanly to on-device ML Kit without crashing.
- **Expected Result:**
  - Cloud OCR processes the image and populates the fields + local ML Kit maps the bounding boxes onto the image.
  - When offline, it seamlessly falls back to local OCR.

##### Test 3B: Scan a Receipt as a Non-Verified User (On-Device ML Kit Only)
- **Where:** Mobile App ([`ocrHelpers.js`](file:///home/huw/code/express-accounts-app/my-app/utils/ocrHelpers.js#L403-L423))
- **Prerequisite:** Signed in as a **Standard (Non-Verified)** user (e.g., from Test 1C).
- **Steps:**
  - [ ] Tap **`+`** on **Expenses** and scan/upload a receipt image.
  - [ ] (If Metro/console logs are visible, confirm `Receipt OCR source: local (ml-kit) — user not verified` is logged).
  - [ ] Verify the form populates using on-device recognition and saves normally.
- **Expected Result:**
  - Scanning works smoothly using on-device ML Kit without calling the Cloud OCR function.

---

### 4. Income Logging & Scanning

#### User Stories
* **US-4.1 (Income Entry & Invoice Scanning):** *As a user, I want to record income (both manually without an image and by scanning/uploading sales invoices) so my revenue is tracked alongside my expenses.*
* **US-4.2 (VAT & CIS on Income):** *As a VAT-registered user or CIS sub-contractor, I want VAT treatments and CIS deductions calculated accurately on my income records.*

#### Test Cases

##### Test 4A: Add Income Without an Image & With an Invoice Image
- **Where:** Mobile App — **Income** Tab ([`Income.js`](file:///home/huw/code/express-accounts-app/my-app/screens/Income.js), [`IncomeForm.js`](file:///home/huw/code/express-accounts-app/my-app/screens/IncomeForm.js))
- **Steps:**
  - [ ] Switch to the **Income** tab on the bottom navigation bar.
  - [ ] Tap **`+`** / **Add Income** and create a manual income entry without an image (e.g., Amount `500.00`, Date today, Reference `INV-001`, Label `Consulting`). Save it.
  - [ ] Tap **`+`** again and upload/take a photo of a sales invoice.
  - [ ] Verify OCR extracts the invoice amount, date, and reference, and saves with the image attachment.
  - [ ] Tap the saved income entry in the list to open [`IncomeEdit.js`](file:///home/huw/code/express-accounts-app/my-app/screens/IncomeEdit.js), edit the label, and save.
- **Expected Result:**
  - Both manual and image-attached income entries appear in the **Income** tab list, grouped by month, and edits persist to Firestore.

---

### 5. Accountant Web Portal: Reviewing Data, Client Info, Messaging & Exporting ZIP

#### User Stories
* **US-5.1 (Unified Activity Board & Client Info Tab):** *As an accountant, I want a single unified client board where clicking any client lets me inspect their Receipts, Income, Client Info (Name, Email, Verification status, VAT, Cloud Vehicles), and Messages.*
* **US-5.2 (Two-Way Client Queries & Notifications):** *As a client, I want to message my accountant from the app; as an accountant, I want to see a Red card, read the message, and send a reply that arrives as a push and in-app notification.*
* **US-5.3 (Exporting Client Data):** *As an accountant, I want to download a client's data for a chosen financial period as a ZIP containing structured CSV spreadsheets and (optionally) receipt/income images.*

#### Test Cases

##### Test 5A: Client Sends Query → Accountant Replies → Client Receives Notification
- **Where:** Mobile App Side Menu ([`SharedTabMenu.js`](file:///home/huw/code/express-accounts-app/my-app/components/SharedTabMenu.js)) ↔ Web Portal ([`public/client-portal.html`](file:///home/huw/code/express-accounts-app/public/client-portal.html)) ↔ Mobile App [`NotificationsScreen.js`](file:///home/huw/code/express-accounts-app/my-app/screens/NotificationsScreen.js)
- **Steps:**
  - [ ] **In the Mobile App:** Open the Side Menu, tap **Notify Accountant / Send Message**, type `"Hi, I have uploaded my Q1 receipts!"`, and send.
  - [ ] **On the Web Portal:** Refresh the board and locate the client's card.
  - [ ] Verify the client's card is now **Red (`Notify Accountant`)**.
  - [ ] Click the client's card and click the **`Messages`** tab (which should show a badge count).
  - [ ] Verify the message `"Hi, I have uploaded my Q1 receipts!"` appears in the thread.
  - [ ] Click **`↩ Reply`** on that message, type a reply (e.g., `"Thanks! I have reviewed them."`), and click **Send Notification**.
  - [ ] Click **`Mark As Processed`** in the modal footer.
  - [ ] **In the Mobile App:** Check the **Notification Bell** badge in the top-right corner, tap the bell to open the **Notifications** screen, verify the reply appears, and tap the **`‹` Back button** in the top-left to return.
- **Expected Result:**
  - Client's card turns **Red** when they message the accountant, and turns **Green (`Marked As Processed`)** when marked processed.
  - Accountant's reply appears in the portal `Messages` thread AND arrives on the client's phone (push notification + unread badge on the bell icon + entry in `NotificationsScreen` with working `‹` back button).

##### Test 5B: Inspect & Edit the `Client Info` Tab on the Web Portal
- **Where:** Web Portal ([`public/client-portal.html`](file:///home/huw/code/express-accounts-app/public/client-portal.html))
- **Steps:**
  - [ ] Click an active client card on the portal board.
  - [ ] Verify the modal tabs are ordered: **`Receipts / Expenses`**, **`Income`**, **`Client Info`**, **`Messages`** (and `HMRC Summary` is gone).
  - [ ] Click the **`Client Info`** tab.
  - [ ] Notice that the financial period selector and `Download ZIP` button automatically hide on this tab.
  - [ ] Edit the **Client / Business Name** or **Email Address** and click **`Save Profile Changes`**.
  - [ ] Click **`Revoke Verification`** (or **`Mark as Verified Client`**), confirm the prompt, and observe the status pill update immediately.
  - [ ] Check the **VAT Registration** section and **Registered Vehicles** table.
- **Expected Result:**
  - Name/email edits save directly to Firestore and update the board card title immediately.
  - Verification status toggles cleanly between `★ Verified Client` and `Standard / Free Tier`.
  - VAT status/number and all cloud-stored vehicles for that client are displayed accurately.

##### Test 5C: Review Receipts/Income, Edit Inline, Check Items & Download ZIP
- **Where:** Web Portal ([`public/client-portal.html`](file:///home/huw/code/express-accounts-app/public/client-portal.html), [`functions/index.js`](file:///home/huw/code/express-accounts-app/functions/index.js))
- **Steps:**
  - [ ] Open a client with receipts and income on the Web Portal.
  - [ ] Select a **Financial period** (e.g., `Current Financial Year 2026/27` or `All Time`).
  - [ ] In the **`Receipts / Expenses`** tab, click a receipt row to open the **Image & Record Inspector Modal**.
  - [ ] Verify the receipt image loads with its Amount/Date/VAT annotation boxes (toggle *"Show annotations"* on/off and test zooming in the lightbox).
  - [ ] Edit the category or amount in the inspector, click **Save**, and check the **Reviewed / Checked** checkbox (`✓`).
  - [ ] Back in the main client modal, test downloading:
    1. Uncheck *"Include receipt/income images"* and click **`Download ZIP`**.
    2. Check *"Include receipt/income images"* and *"Include only checked items"* and click **`Download ZIP`**.
- **Expected Result:**
  - Inline edits and `✓` checkmarks save to Firestore.
  - `Download ZIP` generates and downloads a `.zip` archive containing the client's CSV summaries and (when selected) the receipt/income image files.

---

## Tier 2: Important Feature Workflows (P1)

### 6. Data & Account Deletion (User-Side & Accountant-Side)

#### User Stories
* **US-6.1 (User Deleting Individual Records):** *As a user, I want to delete individual receipts, income entries, or vehicles when I make a mistake, and have their attached images removed from cloud storage.*
* **US-6.2 (User Deleting Their Own Account & All Data):** *As a user, I want to permanently delete my account and all associated data (receipts, income, bank statements, storage images, profile, and login credentials) from the app.*
* **US-6.3 (Accountant Deleting a Client Account & All Data):** *As an accountant, I want to permanently delete a client's account and all their uploaded records/images from the web portal (with a confirmation warning and `DELETE` validation prompt), or cancel a pre-approved invite before sign-up.*

#### Test Cases

##### Test 6A: User Deletes Individual Records (Receipt, Income, Vehicle)
- **Where:** Mobile App ([`ReceiptEdit.js`](file:///home/huw/code/express-accounts-app/my-app/screens/ReceiptEdit.js), [`IncomeEdit.js`](file:///home/huw/code/express-accounts-app/my-app/screens/IncomeEdit.js), [`RegisterVehicleModal.js`](file:///home/huw/code/express-accounts-app/my-app/components/RegisterVehicleModal.js))
- **Steps:**
  - [ ] Tap an existing receipt with an image in the **Expenses** list → tap **Delete** → confirm deletion.
  - [ ] Tap an existing income entry in the **Income** list → tap **Delete** → confirm deletion.
  - [ ] Open Side Menu → **Your Vehicles** → select a vehicle → tap **Remove** → confirm deletion.
  - [ ] Refresh the Accountant Web Portal and open that client's modal.
- **Expected Result:**
  - Each deleted item is immediately removed from the app list, its Firestore document (and Storage image) is deleted, and it no longer appears on the Accountant Web Portal.

##### Test 6B: User Deletes Their Own Account & All Data ("Delete All")
- **Where:** Mobile App Side Menu ([`SharedTabMenu.js`](file:///home/huw/code/express-accounts-app/my-app/components/SharedTabMenu.js#L384-L410)) or Profile Screen ([`ProfileScreen.js`](file:///home/huw/code/express-accounts-app/my-app/screens/ProfileScreen.js#L221-L239))
- **Prerequisite:** Signed in as a **disposable test user** who has uploaded at least 1 receipt (with image) and 1 income record.
- **Steps:**
  - [ ] Open the **Side Menu** (or **Profile** screen) and tap **Delete Account**.
  - [ ] Verify the **"Delete All"** button is disabled until `DELETE` is typed in uppercase.
  - [ ] Type `DELETE` into the confirmation input and tap **Delete All**.
  - [ ] Wait for the *"Permanently erasing data..."* indicator to finish.
  - [ ] Try signing back in with the deleted user's email and password on the **Sign In** screen.
  - [ ] Refresh the Accountant Web Portal and search for the deleted user.
- **Expected Result:**
  - All Storage files (`receipts/{uid}`, `income/{uid}`, `bankStatements/{uid}`), all Firestore records (`receipts`, `income`, `bankStatements`), the `users/{uid}` profile doc, and the Firebase Auth user are permanently erased.
  - The app routes back to **Sign In**, and attempting to log in again fails with user-not-found / invalid-credential.
  - The user's card completely disappears from the Accountant Web Portal.
  - *(Edge Case Check)*: If the user's login session is stale (`auth/requires-recent-login`), verify the app displays the *"Security Timeout: Please sign out and back in, then try again"* alert.

##### Test 6C: Accountant Cancels a Pre-Approved Client vs. Permanently Deletes an Active Client Account & Data
- **Where:** Accountant Web Portal ([`public/client-portal.html`](file:///home/huw/code/express-accounts-app/public/client-portal.html), [`functions/index.js`](file:///home/huw/code/express-accounts-app/functions/index.js))
- **Steps:**
  - [ ] **Pre-Approved Client:** Click a **Grey (`Pre-Approved`)** card on the board → click **`Cancel Pre-Approval`** → confirm the prompt. Verify the grey card is removed and `preapprovedClients/{email}` is deleted.
  - [ ] **Active Client Account & Data Deletion:**
    - [ ] Click a disposable test client's card on the portal board and switch to the **`Client Info`** tab.
    - [ ] Scroll down to the red **Danger Zone** section and click **`🗑 Delete Client Account & Data...`**.
    - [ ] Verify the confirmation modal (`⚠ Permanently Delete Client Account?`) appears, listing the client's name, email, exact record counts, and everything that will be erased.
    - [ ] Verify the **`Permanently Delete Account & Data`** button is disabled until `DELETE` is typed in uppercase.
    - [ ] Type `DELETE` into the confirmation input and click **`Permanently Delete Account & Data`**.
    - [ ] Try logging into the mobile app with that deleted client's credentials.
- **Expected Result:**
  - Cancelling pre-approval removes the grey card immediately; if that email signs up later, they are treated as a standard non-pre-approved user.
  - Deleting an active client's account from the portal permanently removes their Firebase Auth login, `users/{uid}` profile, `preapprovedClients` entry, all `receipts`/`income`/`bankStatements` documents, and all Firebase Storage attachments, and removes their card from the board.

---

### 7. Vehicles & Cloud Sync + Mileage Expense Tracking

#### User Stories
* **US-7.1 (Cloud Vehicle Sync):** *As a user, when I register or edit a vehicle in the app, I want my vehicles saved to my cloud profile (`users/{uid}.vehicles`) so they persist across devices and are visible to my accountant.*
* **US-7.2 (Mileage Trip Logging):** *As a Verified Client with a registered vehicle, I want to log business mileage trips (with route lookup or manual distance) and have the app calculate the HMRC mileage allowance.*

#### Test Cases

##### Test 7A: Register a Vehicle & Verify Cloud Sync on Portal
- **Where:** Mobile App Side Menu ([`RegisterVehicleModal.js`](file:///home/huw/code/express-accounts-app/my-app/components/RegisterVehicleModal.js), [`YourVehiclesModal.js`](file:///home/huw/code/express-accounts-app/my-app/components/YourVehiclesModal.js)) & Web Portal
- **Steps:**
  - [ ] In the Mobile App, open the **Side Menu** (or **Profile** screen) and tap **Register Vehicle / Your Vehicles**.
  - [ ] Add a vehicle: enter Registration (e.g., `AB12 CDE`), Make (`Ford`), Model (`Focus`), Engine Size (`1600cc`), Fuel Type (`Petrol`), and Rate per mile (`45`).
  - [ ] Save the vehicle.
  - [ ] Open the Accountant Web Portal, click this client's card, and switch to the **`Client Info`** tab.
- **Expected Result:**
  - The vehicle appears in the app's **Your Vehicles** list.
  - On the Web Portal's **`Client Info`** tab, `AB12 CDE` (`Ford Focus`, `1600cc`, `Petrol`, `45p / mi`) appears in the **Registered Vehicles** table.
  - Signing into the same account on a second device (or reinstalling the app) automatically loads `AB12 CDE` from the cloud.

##### Test 7B: Log a Mileage Trip (Verified vs. Non-Verified Gating)
- **Where:** Mobile App — **Expenses** Tab (`+` → **Record Mileage**, [`MileageAdd.js`](file:///home/huw/code/express-accounts-app/my-app/screens/MileageAdd.js))
- **Steps:**
  - [ ] *As a Non-Verified User:* Tap **`+`** on **Expenses** → tap **Record Mileage**. Verify the app shows the **Verified Feature** prompt explaining mileage tracking is for Express Accounts clients.
  - [ ] *As a Verified Client (with a registered vehicle):* Tap **`+`** on **Expenses** → tap **Record Mileage**.
  - [ ] Select your vehicle (`AB12 CDE`), enter a Start Location and End Location (or distance in miles, e.g., `20` miles), toggle **Round Trip** if applicable, and tap **Save**.
- **Expected Result:**
  - Mileage is calculated automatically (`miles × ratePerMile`, e.g., `20 miles × £0.45 = £9.00`).
  - The trip appears in the **Expenses** list under the `Mileage` category (and displays the route map on [`MileageEdit.js`](file:///home/huw/code/express-accounts-app/my-app/screens/MileageEdit.js) and [`SummaryScreen.js`](file:///home/huw/code/express-accounts-app/my-app/screens/SummaryScreen.js)).

---

### 8. "Join Express Accounts" In-App Onboarding Application

#### User Stories
* **US-8.1 (In-App Join Request):** *As a Standard (non-verified) user who already signed up, I want to apply to become an Express Accounts client via the in-app multi-step form so the accountant can review and approve me.*

#### Test Cases

##### Test 8A: Submit a "Join Express Accounts" Application & Approve on Portal
- **Where:** Mobile App ([`JoinExpressAccounts.js`](file:///home/huw/code/express-accounts-app/my-app/screens/JoinExpressAccounts.js)) & Web Portal
- **Prerequisite:** Signed in as a **Standard (Non-Verified)** user.
- **Steps:**
  - [ ] Open the Side Menu and tap **Join Express Accounts**.
  - [ ] **Step 1 (Business Type):** Select `Sole Trader` and enter a short business description. (Also note: selecting `Limited Company` or `Partnership` routes to the fast-track waitlist step).
  - [ ] **Step 2 (HMRC Setup):** Choose whether registered with HMRC, enter a valid test NI Number (e.g., `QQ123456C`), UTR (`1234567890`) + DOB (or trading start date + ID/address uploads), and accept the Terms & Letter of Engagement.
  - [ ] **Step 3 (Contact Details):** Confirm name, email, and phone number, and submit.
  - [ ] **On the Web Portal:** Refresh the board and click the **`Purple: Join Requests`** filter chip.
  - [ ] Click the purple card for the applicant, review their submitted details and documents, and click **`Approve as Verified Client`**.
- **Expected Result:**
  - Submitting the form creates a **Purple card** on the Accountant Web Portal.
  - Approving the request on the portal upgrades the user to `verificationStatus: "verified"` immediately.

---

## Tier 3: Financial Summaries, VAT & Filtering (P2)

### 9. Summary Tab, Charts & Financial Period Filtering

#### User Stories
* **US-9.1 (Financial Period Synchronization):** *As a user, when I change my Financial Year or Quarter filter, I want my Expenses, Income, and Summary charts to reflect the selected tax period accurately.*
* **US-9.2 (VAT Registration & Calculations):** *As a VAT-registered business, I want to enable VAT in my settings so VAT fields appear on my receipts/income and my Summary screen shows Net vs. VAT totals.*

#### Test Cases

##### Test 9A: Toggle VAT Registration & Verify VAT Fields
- **Where:** Mobile App Side Menu / Profile ([`SharedTabMenu.js`](file:///home/huw/code/express-accounts-app/my-app/components/SharedTabMenu.js), [`ProfileScreen.js`](file:///home/huw/code/express-accounts-app/my-app/screens/ProfileScreen.js))
- **Steps:**
  - [ ] Open the Side Menu → **VAT Settings**.
  - [ ] Toggle **VAT Registered** to **Yes**, enter a test VAT Number (e.g., `GB123456789`), and save.
  - [ ] Open **Add Receipt** (`ReceiptAdd`) and **Add Income** (`IncomeAdd`) and verify that **VAT Rate (%)** and **VAT Amount (£)** fields are visible and auto-calculate when Amount and Rate are entered.
  - [ ] Toggle **VAT Registered** to **No** and verify VAT inputs are hidden on new receipts.
- **Expected Result:**
  - VAT fields and red VAT image annotations appear when VAT-registered and hide when not VAT-registered.
  - Portal header badge and `Client Info` tab reflect `VAT Registered` + `GB123456789`.

##### Test 9B: Summary Screen Charts & Tax Year Switching
- **Where:** Mobile App — **Summary** Tab ([`SummaryScreen.js`](file:///home/huw/code/express-accounts-app/my-app/screens/SummaryScreen.js))
- **Steps:**
  - [ ] Navigate to the **Summary** tab.
  - [ ] Verify the **Totals Card** (Total Income, Total Expenses, Net Profit, and VAT summary if applicable) matches the logged receipts and income for the selected period.
  - [ ] Inspect the **Expenses by Category Pie Chart** and **Monthly Cashflow Bar Chart**.
  - [ ] Open the bottom period dropdown (or Side Menu → **Financial Year**) and switch between `Current Quarter`, `Financial Year 2026/27`, and `All Time`.
- **Expected Result:**
  - Totals and charts update dynamically without crashing or overlapping labels.
  - Changing the Financial Year scope updates the available period filters across Expenses, Income, and Summary.

---

## Tier 4: Quality-of-Life, Edge Cases & Account Controls (P3)

### 10. Duplicate Detection, Recurring Receipts & Profile Settings

#### Test Cases

##### Test 10A: Duplicate Receipt Warning
- **Where:** Mobile App ([`ReceiptAdd.js`](file:///home/huw/code/express-accounts-app/my-app/screens/ReceiptAdd.js))
- **Steps:**
  - [ ] Add and save a receipt with Amount `19.99`, Date today, and Category `Materials`.
  - [ ] Immediately add another receipt with the exact same Amount (`19.99`), Date (today), and Category (`Materials`), and tap **Save**.
- **Expected Result:**
  - The **Duplicate Receipt Modal** (`showDuplicateModal`) warns that a matching receipt already exists on that date and asks you to confirm whether to save anyway or cancel.

##### Test 10B: Recurring Expense Setup
- **Where:** Mobile App ([`ReceiptAdd.js`](file:///home/huw/code/express-accounts-app/my-app/screens/ReceiptAdd.js))
- **Steps:**
  - [ ] In **Add Receipt**, toggle **Recurring Expense** on.
  - [ ] Choose a frequency (e.g., `Monthly` or custom interval) and save the receipt.
- **Expected Result:**
  - Receipt saves with recurrence metadata attached.

##### Test 10C: Broadcast Notification ("Notify All Users") on Web Portal
- **Where:** Web Portal ([`public/client-portal.html`](file:///home/huw/code/express-accounts-app/public/client-portal.html))
- **Steps:**
  - [ ] On the Web Portal main header, click **`Notify All Users`**.
  - [ ] Enter a broadcast title and message (e.g., `"Tax Return Reminder"`, `"Self-assessment deadline is approaching."`) and send.
- **Expected Result:**
  - Push and in-app notifications are dispatched to all registered clients.

##### Test 10D: Profile Photo & Feedback Submission
- **Where:** Mobile App Side Menu & [`ProfileScreen.js`](file:///home/huw/code/express-accounts-app/my-app/screens/ProfileScreen.js)
- **Steps:**
  - [ ] Open **Profile** (or Side Menu), tap the avatar, and upload a profile photo. Verify it appears in the app and in the Web Portal's **`Client Info`** tab.
  - [ ] Open Side Menu → **Send Feedback**, submit a test message, and verify it succeeds (`submitFeedback` Cloud Function).
- **Expected Result:**
  - Profile photo syncs to Firebase Storage and displays in the portal `Client Info` tab.
