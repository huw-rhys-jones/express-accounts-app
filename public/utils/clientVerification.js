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

  // Parse "Name, email@domain.com;" entries into {name, email} objects.
  // Also accepts name-only entries (email will be empty string).
  function parseDelimitedClients(value) {
    return String(value || "")
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const commaIdx = item.lastIndexOf(",");
        if (commaIdx === -1) return { name: item.trim(), email: "" };
        const possibleEmail = item.slice(commaIdx + 1).trim();
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(possibleEmail);
        if (isEmail) {
          return { name: item.slice(0, commaIdx).trim(), email: possibleEmail };
        }
        return { name: item.trim(), email: "" };
      });
  }

  function parseCsvNames(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split(",")[0].replace(/^"|"$/g, "").trim())
      .filter(Boolean);
  }

  // Parse CSV into {name, email} objects. Expects name in col 0, email in col 1.
  function parseCsvClients(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const cols = line.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
        const name = cols[0] || "";
        const possibleEmail = cols[1] || "";
        const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(possibleEmail);
        return { name, email: isEmail ? possibleEmail : "" };
      })
      .filter((c) => c.name);
  }

  global.ClientVerification = {
    generateClientCode,
    normalizeClientCode,
    parseDelimitedNames,
    parseDelimitedClients,
    parseCsvNames,
    parseCsvClients,
  };
})(window);
