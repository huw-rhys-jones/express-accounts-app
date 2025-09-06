#!/bin/bash
set -e  # Exit if a command fails

# Load the .env file into the current shell session
export $(grep -v '^#' .env | xargs)

# Test: print variable names and partial values to confirm
echo "Loaded environment variables:"
for var in FIREBASE_API_KEY FIREBASE_AUTH_DOMAIN FIREBASE_PROJECT_ID FIREBASE_STORAGE_BUCKET \
           FIREBASE_MESSAGING_SENDER_ID FIREBASE_APP_ID FIREBASE_MEASUREMENT_ID \
           GOOGLE_WEB_CLIENT_ID GOOGLE_ANDROID_CLIENT_ID GOOGLE_IOS_CLIENT_ID
do
    echo "$var=${!var:0:6}..."
done

# Confirm with user before running
read -p "Do these look correct? Press enter to continue..."

# Run the EAS build
eas build --platform ios --profile production
