import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

export function normalizeVerificationCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");
}

export async function verifyClientCode({ db, userId, rawCode }) {
  const code = normalizeVerificationCode(rawCode);
  if (!code) {
    throw new Error("Please enter a code.");
  }

  const codeRef = doc(db, "VerificationCodes", code);
  const codeSnap = await getDoc(codeRef);

  if (!codeSnap.exists()) {
    throw new Error("That code was not recognised.");
  }

  const codeData = codeSnap.data() || {};
  if (codeData.usedBy && codeData.usedBy !== userId) {
    throw new Error("That code has already been used.");
  }

  const verifiedName = String(codeData.accountantSubmittedName || "").trim();
  if (!verifiedName) {
    throw new Error("That code is missing a verified client name.");
  }

  await setDoc(
    doc(db, "users", userId),
    {
      verificationStatus: "verified",
      verifiedName,
      verificationCode: code,
      hideAds: true,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  await setDoc(
    codeRef,
    {
      usedBy: userId,
      usedAt: serverTimestamp(),
      verificationStatus: "verified",
    },
    { merge: true }
  );

  return { code, verifiedName };
}
