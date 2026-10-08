// Manual mock for firebaseConfig.js
// Placed in __mocks__/ adjacent to the source file so Jest uses it automatically
// when a test calls jest.mock('../firebaseConfig') or jest.mock('../../firebaseConfig').

export const db = {};
export const auth = {
  currentUser: { uid: 'test-user-123', email: 'test@example.com' },
};
export const firebaseConfig = {};
