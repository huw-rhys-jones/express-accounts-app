const crypto = require("crypto");
const {Transform} = require("stream");

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

  return Buffer.concat([salt, iv, ciphertext, tag]);
}

function createExportEnvelopeTransform(password) {
  if (!password) {
    throw new Error("Missing password");
  }

  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(password, salt, 200_000, 32, "sha256");
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const header = Buffer.concat([salt, iv]);

  return new Transform({
    transform(chunk, encoding, callback) {
      if (this._headerWritten !== true) {
        this.push(header);
        this._headerWritten = true;
      }

      if (chunk && chunk.length) {
        this.push(cipher.update(chunk));
      }
      callback();
    },
    flush(callback) {
      const finalChunk = cipher.final();
      if (finalChunk && finalChunk.length) {
        this.push(finalChunk);
      }
      this.push(cipher.getAuthTag());
      callback();
    },
  });
}

function readExportEnvelope({ password, buffer }) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error("Envelope buffer is required");
  }

  const salt = buffer.subarray(0, 16);
  const iv = buffer.subarray(16, 28);
  const key = crypto.pbkdf2Sync(password, salt, 200_000, 32, "sha256");

  const ciphertextLength = buffer.length - 16 - 28;
  if (ciphertextLength <= 0) {
    throw new Error("Envelope is empty");
  }

  const ciphertext = buffer.subarray(28, 28 + ciphertextLength);
  const tag = buffer.subarray(buffer.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
}

module.exports = {
  createExportEnvelope,
  createExportEnvelopeTransform,
  readExportEnvelope,
};
