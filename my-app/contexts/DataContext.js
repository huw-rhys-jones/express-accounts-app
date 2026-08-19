import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { collection, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
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
  const hasLiveListenersRef = useRef(false);
  const listenerRetryTimerRef = useRef(null);
  const listenerAttemptRef = useRef(0);
  const lastCountsRef = useRef({ receipts: -1, income: -1, bankStatements: -1 });

  useEffect(() => {
    let unsubReceipts = null;
    let unsubIncome = null;
    let unsubBank = null;
    let bootstrapTimer = null;

    const clearListeners = () => {
      unsubReceipts?.();
      unsubIncome?.();
      unsubBank?.();
      unsubReceipts = null;
      unsubIncome = null;
      unsubBank = null;
      hasLiveListenersRef.current = false;
      console.log('[DataContext] Cleared realtime listeners');
    };

    const clearBootstrapTimer = () => {
      if (bootstrapTimer) {
        clearTimeout(bootstrapTimer);
        bootstrapTimer = null;
      }
    };

    const clearRetryTimer = () => {
      if (listenerRetryTimerRef.current) {
        clearTimeout(listenerRetryTimerRef.current);
        listenerRetryTimerRef.current = null;
      }
    };

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      const nextUid = user?.uid ?? null;
      console.log('[DataContext] onAuthStateChanged', {
        uid: nextUid,
        emailVerified: Boolean(user?.emailVerified),
        providerIds: (user?.providerData || []).map((p) => p.providerId),
      });

      // Google sign-in (and some other federated flows) fires onAuthStateChanged
      // multiple times for the same user as Firebase syncs profile data back.
      // Guard against tearing down and re-subscribing unnecessarily.
      if (
        nextUid &&
        nextUid === activeUidRef.current &&
        hasLiveListenersRef.current
      ) {
        console.log('[DataContext] Skipping auth event for same uid; listeners already live');
        return;
      }
      activeUidRef.current = nextUid;

      // Tear down any existing listeners before re-subscribing
      clearListeners();
      clearRetryTimer();

      if (!user) {
        activeUidRef.current = null;
        hasLiveListenersRef.current = false;
        listenerAttemptRef.current = 0;
        lastCountsRef.current = { receipts: -1, income: -1, bankStatements: -1 };
        setReceipts([]);
        setIncomeItems([]);
        setBankStatements([]);
        setReceiptsLoading(false);
        setIncomeLoading(false);
        setBankStatementsLoading(false);
        setInitialLoading(false);
        return;
      }

      let profile = {};
      try {
        const userProfileRef = doc(db, 'users', user.uid);
        const snap = await getDoc(userProfileRef);
        profile = snap.exists() ? snap.data() || {} : {};
        setUserProfile(profile);
      } catch (err) {
        console.warn('Error loading user profile before data listener gate', err);
      }

      const profileSaysVerified =
        profile.emailVerified === true ||
        String(profile.verificationStatus || '').toLowerCase() === 'verified';
      const isUnverifiedPasswordUser =
        user.providerData?.some((p) => p.providerId === 'password') &&
        !user.emailVerified &&
        !profileSaysVerified;
      if (isUnverifiedPasswordUser) {
        hasLiveListenersRef.current = false;
        listenerAttemptRef.current = 0;
        console.log('[DataContext] Password user unverified; listeners not attached yet');
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
          clearBootstrapTimer();
          setInitialLoading(false);
        }
      };

      const MAX_LISTENER_RETRIES = 2;
      const LISTENER_RETRY_DELAY_MS = 1200;

      const scheduleListenerRetry = (scope, err) => {
        const currentAttempt = listenerAttemptRef.current;
        const code = String(err?.code || "").toLowerCase();
        const shouldRetry =
          currentAttempt < MAX_LISTENER_RETRIES &&
          (code.includes("permission-denied") ||
            code.includes("unauthenticated") ||
            code.includes("failed-precondition"));

        if (!shouldRetry) {
          return false;
        }

        if (listenerRetryTimerRef.current) {
          return true;
        }

        console.warn(`Retrying ${scope} listener after auth refresh`, err);
        setInitialLoading(true);
        setReceiptsLoading(true);
        setIncomeLoading(true);
        setBankStatementsLoading(true);

        listenerRetryTimerRef.current = setTimeout(async () => {
          listenerRetryTimerRef.current = null;

          if (!auth.currentUser || auth.currentUser.uid !== activeUidRef.current) {
            return;
          }

          try {
            await auth.currentUser.getIdToken(true);
          } catch (refreshErr) {
            console.warn("Could not refresh auth token before retry", refreshErr);
          }

          const refreshedUser = auth.currentUser;
          if (!refreshedUser || refreshedUser.uid !== activeUidRef.current) {
            return;
          }

          // Reset loaded flags and re-attach all listeners.
          loadedRef.current = { receipts: false, income: false, bankStatements: false };
          attachRealtimeListeners(refreshedUser, currentAttempt + 1);
        }, LISTENER_RETRY_DELAY_MS);

        return true;
      };

      const attachRealtimeListeners = (currentUser, attempt = 0) => {
        listenerAttemptRef.current = attempt;
        clearListeners();
        clearBootstrapTimer();
        console.log('[DataContext] Attaching realtime listeners', {
          uid: currentUser.uid,
          attempt,
        });

        unsubReceipts = onSnapshot(
          query(collection(db, 'receipts'), where('userId', '==', currentUser.uid)),
          (snap) => {
            const nextRows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            setReceipts(nextRows);
            if (nextRows.length !== lastCountsRef.current.receipts) {
              console.log('[DataContext] Receipts snapshot', {
                count: nextRows.length,
                fromCache: snap.metadata.fromCache,
                hasPendingWrites: snap.metadata.hasPendingWrites,
              });
              lastCountsRef.current.receipts = nextRows.length;
            }
            setReceiptsLoading(false);
            loadedRef.current.receipts = true;
            checkAllLoaded();
          },
          (err) => {
            console.warn('Error listening to receipts', err);
            if (scheduleListenerRetry('receipts', err)) return;
            setReceiptsLoading(false);
            loadedRef.current.receipts = true;
            checkAllLoaded();
          }
        );

        unsubIncome = onSnapshot(
          query(collection(db, 'income'), where('userId', '==', currentUser.uid)),
          (snap) => {
            const nextRows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            setIncomeItems(nextRows);
            if (nextRows.length !== lastCountsRef.current.income) {
              console.log('[DataContext] Income snapshot', {
                count: nextRows.length,
                fromCache: snap.metadata.fromCache,
                hasPendingWrites: snap.metadata.hasPendingWrites,
              });
              lastCountsRef.current.income = nextRows.length;
            }
            setIncomeLoading(false);
            loadedRef.current.income = true;
            checkAllLoaded();
          },
          (err) => {
            console.warn('Error listening to income', err);
            if (scheduleListenerRetry('income', err)) return;
            setIncomeLoading(false);
            loadedRef.current.income = true;
            checkAllLoaded();
          }
        );

        unsubBank = onSnapshot(
          query(collection(db, 'bankStatements'), where('userId', '==', currentUser.uid)),
          (snap) => {
            const nextRows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            setBankStatements(nextRows);
            if (nextRows.length !== lastCountsRef.current.bankStatements) {
              console.log('[DataContext] Bank statements snapshot', {
                count: nextRows.length,
                fromCache: snap.metadata.fromCache,
                hasPendingWrites: snap.metadata.hasPendingWrites,
              });
              lastCountsRef.current.bankStatements = nextRows.length;
            }
            setBankStatementsLoading(false);
            loadedRef.current.bankStatements = true;
            checkAllLoaded();
          },
          (err) => {
            console.warn('Error listening to bank statements', err);
            if (scheduleListenerRetry('bank statements', err)) return;
            setBankStatementsLoading(false);
            loadedRef.current.bankStatements = true;
            checkAllLoaded();
          }
        );

        // Safety net: if realtime listeners don't deliver promptly on first auth session,
        // do a one-time direct fetch so newly saved records appear without app restart.
        bootstrapTimer = setTimeout(async () => {
          console.log('[DataContext] Bootstrap fallback timer fired');
          if (!auth.currentUser || auth.currentUser.uid !== currentUser.uid) {
            return;
          }

          try {
            if (!loadedRef.current.receipts) {
              const snap = await getDocs(query(collection(db, 'receipts'), where('userId', '==', currentUser.uid)));
              setReceipts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
              console.log('[DataContext] Bootstrap fetched receipts', { count: snap.size });
              setReceiptsLoading(false);
              loadedRef.current.receipts = true;
            }

            if (!loadedRef.current.income) {
              const snap = await getDocs(query(collection(db, 'income'), where('userId', '==', currentUser.uid)));
              setIncomeItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
              console.log('[DataContext] Bootstrap fetched income', { count: snap.size });
              setIncomeLoading(false);
              loadedRef.current.income = true;
            }

            if (!loadedRef.current.bankStatements) {
              const snap = await getDocs(query(collection(db, 'bankStatements'), where('userId', '==', currentUser.uid)));
              setBankStatements(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
              console.log('[DataContext] Bootstrap fetched bank statements', { count: snap.size });
              setBankStatementsLoading(false);
              loadedRef.current.bankStatements = true;
            }
          } catch (bootstrapErr) {
            console.warn('Fallback bootstrap fetch failed', bootstrapErr);
          } finally {
            checkAllLoaded();
          }
        }, 1800);

        hasLiveListenersRef.current = true;
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

      attachRealtimeListeners(user, 0);
    });

    return () => {
      unsubAuth();
      clearRetryTimer();
      clearBootstrapTimer();
      clearListeners();
    };
  }, []);

  const displayName = auth.currentUser?.displayName || userProfile.name || 'User';

  const refreshReceipts = async () => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      setReceiptsLoading(true);
      const snap = await getDocs(
        query(collection(db, 'receipts'), where('userId', '==', user.uid))
      );
      const nextRows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setReceipts(nextRows);
      lastCountsRef.current.receipts = nextRows.length;
      console.log('[DataContext] Refreshed receipts after save', {
        count: nextRows.length,
      });
    } catch (error) {
      console.warn('[DataContext] Could not refresh receipts after save', error);
    } finally {
      setReceiptsLoading(false);
    }
  };

  const refreshIncome = async () => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      setIncomeLoading(true);
      const snap = await getDocs(
        query(collection(db, 'income'), where('userId', '==', user.uid))
      );
      const nextRows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setIncomeItems(nextRows);
      console.log('[DataContext] Refreshed income after save', {
        count: nextRows.length,
      });
    } catch (error) {
      console.warn('[DataContext] Could not refresh income after save', error);
    } finally {
      setIncomeLoading(false);
    }
  };

  return (
    <DataContext.Provider value={{ receipts, incomeItems, bankStatements, userProfile, displayName, initialLoading, receiptsLoading, incomeLoading, bankStatementsLoading, refreshReceipts, refreshIncome }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
