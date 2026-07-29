const crypto = require("crypto");

function createExportEnvelope({ password, payload }) {
  if (!password) {
    throw new Error("Missing password");
  }
  if (!Buffer.isBuffer(payload)) {
    throw new Error("Payload buffer is required");
  }

  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(password, salt, 200_000, 32, "sha256");
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(payload),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([salt, iv, tag, ciphertext]);
}

function readExportEnvelope({ password, buffer }) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error("Envelope buffer is required");
  }

  const salt = buffer.subarray(0, 16);
  const iv = buffer.subarray(16, 28);
  const tag = buffer.subarray(28, 44);
  const ciphertext = buffer.subarray(44);

  const key = crypto.pbkdf2Sync(password, salt, 200_000, 32, "sha256");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
}

module.exports = {
  createExportEnvelope,
  readExportEnvelope,
};
