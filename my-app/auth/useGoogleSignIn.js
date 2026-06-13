import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import { useEffect, useRef } from "react";
import { auth } from "../firebaseConfig";
import { GoogleAuthProvider, signInWithCredential } from "firebase/auth";
import { makeRedirectUri } from "expo-auth-session";
import Constants from "expo-constants";

WebBrowser.maybeCompleteAuthSession();

export function useGoogleSignIn(onSuccess) {
  const redirectUri = makeRedirectUri({
    scheme: "com.caistec.expressaccounts", // same as in your Android manifest/app.json
  });

  const expoClientId = Constants.expoConfig.extra.GOOGLE_EXPO_CLIENT_ID;
  const androidClientId = Constants.expoConfig.extra.GOOGLE_ANDROID_CLIENT_ID;
  const webClientId = Constants.expoConfig.extra.GOOGLE_WEB_CLIENT_ID;
  const iosClientId = Constants.expoConfig.extra.GOOGLE_IOS_CLIENT_ID;

  const [request, response, promptAsync] = Google.useAuthRequest({
    iosClientId,
    androidClientId,
    webClientId,
    redirectUri,
    scopes: ["openid", "profile", "email"],
  });

  // Keep a ref to the latest onSuccess so the sign-in effect only needs to
  // depend on `response`. Without this, every re-render of the parent
  // (e.g. from App.js calling setUser) creates a new onSuccess reference,
  // causing the effect to re-fire and call signInWithCredential a second time.
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  useEffect(() => {
    if (response?.type === "success") {
      const id_token = response.authentication?.idToken;
      const access_token = response.authentication?.accessToken;

      if (!id_token) {
        console.warn("No id_token received from Google");
        return;
      }

      const credential = GoogleAuthProvider.credential(id_token, access_token);

      signInWithCredential(auth, credential)
        .then((result) => onSuccessRef.current?.(result))
        .catch((error) => console.error("Google Sign-In error", error));
    }
  }, [response]); // response only — onSuccess is accessed via ref

  return [request, promptAsync];
}
