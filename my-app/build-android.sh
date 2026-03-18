#!/bin/bash

eas build --platform android --profile production
eas build --platform ios --profile production
echo "iOS build queued. Submit explicitly with: eas submit --platform ios --id <IOS_BUILD_ID>"

npx eas build --profile development --platform android