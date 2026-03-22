(function (global) {
  const PREFIX = "CAI";
  const SEGMENT_LENGTH = 4;
  const SUFFIX_LENGTH = 2;
  const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  function randomToken(length) {
    let token = "";
    for (let index = 0; index < length; index += 1) {
      const charIndex = Math.floor(Math.random() * ALPHABET.length);
      token += ALPHABET[charIndex];
    }
    return token;
  }

  function normalizeClientCode(value) {
    return String(value || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, "");
  }

  function generateClientCode() {
    return normalizeClientCode(
      `${PREFIX}-${randomToken(SEGMENT_LENGTH)}-${randomToken(SUFFIX_LENGTH)}`
    );
  }

  function parseDelimitedNames(value) {
    return String(value || "")
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function parseCsvNames(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split(",")[0].replace(/^"|"$/g, "").trim())
      .filter(Boolean);
  }

  global.ClientVerification = {
    generateClientCode,
    normalizeClientCode,
    parseDelimitedNames,
    parseCsvNames,
  };
})(window);
