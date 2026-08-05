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
  const [receiptsLoading, setReceiptsLoading] = useState(true);
  const [incomeLoading, setIncomeLoading] = useState(true);
  const [bankStatementsLoading, setBankStatementsLoading] = useState(true);

  const loadedRef = useRef({ receipts: false, income: false, bankStatements: false });
  const activeUidRef = useRef(null);

  useEffect(() => {
    let unsubReceipts = null;
    let unsubIncome = null;
    let unsubBank = null;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      const nextUid = user?.uid ?? null;

      // Google sign-in (and some other federated flows) fires onAuthStateChanged
      // multiple times for the same user as Firebase syncs profile data back.
      // Guard against tearing down and re-subscribing unnecessarily.
      if (nextUid && nextUid === activeUidRef.current) return;
      activeUidRef.current = nextUid;

      // Tear down any existing listeners before re-subscribing
      unsubReceipts?.();
      unsubIncome?.();
      unsubBank?.();

      if (!user) {
        activeUidRef.current = null;
        setReceipts([]);
        setIncomeItems([]);
        setBankStatements([]);
        setReceiptsLoading(false);
        setIncomeLoading(false);
        setBankStatementsLoading(false);
        setInitialLoading(false);
        return;
      }

      const isUnverifiedPasswordUser =
        user.providerData?.some((p) => p.providerId === 'password') && !user.emailVerified;
      if (isUnverifiedPasswordUser) {
        setReceiptsLoading(false);
        setIncomeLoading(false);
        setBankStatementsLoading(false);
        setInitialLoading(false);
        return;
      }

      // Reset loaded flags for new user session
      loadedRef.current = { receipts: false, income: false, bankStatements: false };
      setReceiptsLoading(true);
      setIncomeLoading(true);
      setBankStatementsLoading(true);
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
          setReceiptsLoading(false);
          loadedRef.current.receipts = true;
          checkAllLoaded();
        },
        (err) => {
          console.warn('Error listening to receipts', err);
          setReceiptsLoading(false);
          loadedRef.current.receipts = true;
          checkAllLoaded();
        }
      );

      unsubIncome = onSnapshot(
        query(collection(db, 'income'), where('userId', '==', user.uid)),
        (snap) => {
          setIncomeItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          setIncomeLoading(false);
          loadedRef.current.income = true;
          checkAllLoaded();
        },
        (err) => {
          console.warn('Error listening to income', err);
          setIncomeLoading(false);
          loadedRef.current.income = true;
          checkAllLoaded();
        }
      );

      unsubBank = onSnapshot(
        query(collection(db, 'bankStatements'), where('userId', '==', user.uid)),
        (snap) => {
          setBankStatements(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          setBankStatementsLoading(false);
          loadedRef.current.bankStatements = true;
          checkAllLoaded();
        },
        (err) => {
          console.warn('Error listening to bank statements', err);
          setBankStatementsLoading(false);
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
    <DataContext.Provider value={{ receipts, incomeItems, bankStatements, userProfile, displayName, initialLoading, receiptsLoading, incomeLoading, bankStatementsLoading }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
