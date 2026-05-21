/**
 * Integration tests: receipt fetching with Firebase stubbed out.
 *
 * These tests demonstrate how to replace Firestore calls with Jest mocks so
 * you can verify the query structure and data-transformation logic without
 * hitting a real database.
 *
 * Pattern used throughout the app:
 *   const q = query(collection(db, "receipts"), where("userId", "==", user.uid));
 *   const snapshot = await getDocs(q);
 *   const receipts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
 */

// --- stub Firebase BEFORE importing anything that uses it ---
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  getDocs: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
  deleteDoc: jest.fn(),
  serverTimestamp: jest.fn(() => 'MOCK_TIMESTAMP'),
  writeBatch: jest.fn(() => ({
    delete: jest.fn(),
    commit: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../firebaseConfig');

import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../../firebaseConfig';
import {
  filterReceiptsByDateRange,
  getFinancialYearPeriod,
} from '../../utils/financialPeriods';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simulates how the app maps a Firestore snapshot to plain objects. */
async function fetchReceiptsForUser(userId) {
  const ref = collection(db, 'receipts');
  const q = query(ref, where('userId', '==', userId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ---------------------------------------------------------------------------
// Shared fixture
// ---------------------------------------------------------------------------

const MOCK_RECEIPTS = [
  { id: 'r1', date: '2025-06-15', amount: 50.0, category: 'Travel', userId: 'test-user-123' },
  { id: 'r2', date: '2025-09-01', amount: 120.0, category: 'Meals', userId: 'test-user-123' },
  { id: 'r3', date: '2024-11-20', amount: 75.0, category: 'Office', userId: 'test-user-123' },
  { id: 'r4', date: '2026-02-14', amount: 30.0, category: 'Fuel', userId: 'test-user-123' },
];

function makeSnapshot(receipts) {
  return {
    docs: receipts.map((r) => ({
      id: r.id,
      data: () => ({ ...r }),
    })),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Receipt fetching (Firebase stubbed)', () => {
  beforeEach(() => {
    collection.mockReturnValue('mock-receipts-ref');
    where.mockReturnValue('mock-where-clause');
    query.mockReturnValue('mock-query');
    getDocs.mockResolvedValue(makeSnapshot(MOCK_RECEIPTS));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('calls collection() with the correct path', async () => {
    await fetchReceiptsForUser('test-user-123');
    expect(collection).toHaveBeenCalledWith(db, 'receipts');
  });

  it('applies a userId where-clause', async () => {
    await fetchReceiptsForUser('test-user-123');
    expect(where).toHaveBeenCalledWith('userId', '==', 'test-user-123');
  });

  it('maps snapshot docs to plain objects with id field', async () => {
    const receipts = await fetchReceiptsForUser('test-user-123');
    expect(receipts).toHaveLength(4);
    expect(receipts[0]).toMatchObject({ id: 'r1', amount: 50.0 });
  });

  it('returns an empty array when the snapshot has no docs', async () => {
    getDocs.mockResolvedValueOnce({ docs: [] });
    const receipts = await fetchReceiptsForUser('test-user-123');
    expect(receipts).toHaveLength(0);
  });
});

describe('Receipt fetching + financial year filtering (combined)', () => {
  beforeEach(() => {
    collection.mockReturnValue('mock-receipts-ref');
    where.mockReturnValue('mock-where-clause');
    query.mockReturnValue('mock-query');
    getDocs.mockResolvedValue(makeSnapshot(MOCK_RECEIPTS));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('filters to FY2025 receipts (6 Apr 2025 – 5 Apr 2026)', async () => {
    const receipts = await fetchReceiptsForUser(auth.currentUser.uid);
    const { startDate, endDate } = getFinancialYearPeriod(2025);
    const filtered = filterReceiptsByDateRange(receipts, startDate, endDate);

    // r1 (Jun 2025), r2 (Sep 2025), r4 (Feb 2026) are in FY2025
    // r3 (Nov 2024) is in FY2024
    expect(filtered.map((r) => r.id)).toEqual(
      expect.arrayContaining(['r1', 'r2', 'r4'])
    );
    expect(filtered.map((r) => r.id)).not.toContain('r3');
  });

  it('sums totals correctly after filtering', async () => {
    const receipts = await fetchReceiptsForUser(auth.currentUser.uid);
    const { startDate, endDate } = getFinancialYearPeriod(2025);
    const filtered = filterReceiptsByDateRange(receipts, startDate, endDate);
    const total = filtered.reduce((sum, r) => sum + r.amount, 0);
    expect(total).toBeCloseTo(200.0); // 50 + 120 + 30
  });
});

describe('Firebase error handling', () => {
  beforeEach(() => {
    collection.mockReturnValue('mock-receipts-ref');
    where.mockReturnValue('mock-where-clause');
    query.mockReturnValue('mock-query');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('propagates Firestore errors to the caller', async () => {
    getDocs.mockRejectedValueOnce(new Error('Permission denied'));
    await expect(fetchReceiptsForUser('test-user-123')).rejects.toThrow(
      'Permission denied'
    );
  });
});
