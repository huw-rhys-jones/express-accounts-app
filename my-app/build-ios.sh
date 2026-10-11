#!/bin/bash
set -e  # Exit if a command fails

# Load the .env file into the current shell session (works in macOS zsh/bash).
# This is safer than `export $(grep ...)` because it handles quoted values and spaces correctly.
if [ -f ".env" ]; then
  set -a
  source .env
  set +a
else
  echo "Error: .env file not found in $(pwd)"
  exit 1
fi

# Test: print variable names and partial values to confirm
echo "Loaded environment variables:"
for var in FIREBASE_API_KEY FIREBASE_AUTH_DOMAIN FIREBASE_PROJECT_ID FIREBASE_STORAGE_BUCKET \
           FIREBASE_MESSAGING_SENDER_ID FIREBASE_APP_ID FIREBASE_MEASUREMENT_ID \
           GOOGLE_WEB_CLIENT_ID GOOGLE_ANDROID_CLIENT_ID GOOGLE_IOS_CLIENT_ID
do
  if [ -n "${!var}" ]; then
    echo "$var=${!var:0:6}..."
  else
    echo "$var=not set"
  fi
done

# Confirm with user before running
read -p "Do these look correct? Press enter to continue..."

# Run the EAS build
# eas build --platform ios --profile production
