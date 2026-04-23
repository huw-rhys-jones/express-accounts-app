import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebaseConfig';

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const [receipts, setReceipts] = useState([]);
  const [incomeItems, setIncomeItems] = useState([]);
  const [bankStatements, setBankStatements] = useState([]);
  const [userProfile, setUserProfile] = useState({});
  const [initialLoading, setInitialLoading] = useState(true);

  const loadedRef = useRef({ receipts: false, income: false, bankStatements: false });

  useEffect(() => {
    let unsubReceipts = null;
    let unsubIncome = null;
    let unsubBank = null;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      // Tear down any existing listeners before re-subscribing
      unsubReceipts?.();
      unsubIncome?.();
      unsubBank?.();

      if (!user) {
        setReceipts([]);
        setIncomeItems([]);
        setBankStatements([]);
        setInitialLoading(false);
        return;
      }

      const isUnverifiedPasswordUser =
        user.providerData?.some((p) => p.providerId === 'password') && !user.emailVerified;
      if (isUnverifiedPasswordUser) {
        setInitialLoading(false);
        return;
      }

      // Reset loaded flags for new user session
      loadedRef.current = { receipts: false, income: false, bankStatements: false };
      setInitialLoading(true);

      const checkAllLoaded = () => {
        const l = loadedRef.current;
        if (l.receipts && l.income && l.bankStatements) {
          setInitialLoading(false);
        }
      };

      // Sync user profile to Firestore once
      const syncUserProfile = async () => {
        try {
          const userProfileRef = doc(db, 'users', user.uid);
          const snap = await getDoc(userProfileRef);
          const profile = snap.exists() ? snap.data() || {} : {};
          setUserProfile(profile);
          const profileUpdate = { email: user.email, updatedAt: serverTimestamp() };
          if (user.displayName) profileUpdate.name = user.displayName;
          setDoc(userProfileRef, profileUpdate, { merge: true }).catch(() => {});
        } catch (err) {
          console.warn('Error syncing user profile', err);
        }
      };
      syncUserProfile();

      unsubReceipts = onSnapshot(
        query(collection(db, 'receipts'), where('userId', '==', user.uid)),
        (snap) => {
          setReceipts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          loadedRef.current.receipts = true;
          checkAllLoaded();
        },
        (err) => {
          console.warn('Error listening to receipts', err);
          loadedRef.current.receipts = true;
          checkAllLoaded();
        }
      );

      unsubIncome = onSnapshot(
        query(collection(db, 'income'), where('userId', '==', user.uid)),
        (snap) => {
          setIncomeItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          loadedRef.current.income = true;
          checkAllLoaded();
        },
        (err) => {
          console.warn('Error listening to income', err);
          loadedRef.current.income = true;
          checkAllLoaded();
        }
      );

      unsubBank = onSnapshot(
        query(collection(db, 'bankStatements'), where('userId', '==', user.uid)),
        (snap) => {
          setBankStatements(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          loadedRef.current.bankStatements = true;
          checkAllLoaded();
        },
        (err) => {
          console.warn('Error listening to bank statements', err);
          loadedRef.current.bankStatements = true;
          checkAllLoaded();
        }
      );
    });

    return () => {
      unsubAuth();
      unsubReceipts?.();
      unsubIncome?.();
      unsubBank?.();
    };
  }, []);

  const displayName = auth.currentUser?.displayName || userProfile.name || 'User';

  return (
    <DataContext.Provider value={{ receipts, incomeItems, bankStatements, userProfile, displayName, initialLoading }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
