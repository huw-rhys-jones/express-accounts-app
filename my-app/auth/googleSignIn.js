import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { makeRedirectUri } from 'expo-auth-session';
import { useEffect } from 'react';
import { auth } from '../firebaseConfig';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import Constants from 'expo-constants';

WebBrowser.maybeCompleteAuthSession();

export function useGoogleSignIn() {
  const redirectUri = makeRedirectUri({
    useProxy: true, // important for Expo Go
  });

  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: Constants.expoConfig.extra.GOOGLE_WEB_CLIENT_ID,
    scopes: ['openid', 'profile', 'email'],
    redirectUri,
  });

  useEffect(() => {
    if (response?.type === 'success') {
      const { id_token } = response.params;
      const credential = GoogleAuthProvider.credential(id_token);
      signInWithCredential(auth, credential)
        .then(() => console.log('Signed in with Google'))
        .catch((error) => console.error('Google Sign-In error', error));
    }
  }, [response]);

  return [request, promptAsync];
}
