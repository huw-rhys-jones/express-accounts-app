const assert = require("assert");
const { createExportEnvelope, readExportEnvelope } = require("./exportEnvelope");

const payload = Buffer.from("test-export-payload");
const envelope = createExportEnvelope({ password: "test-password", payload });
const roundTrip = readExportEnvelope({ password: "test-password", buffer: envelope });

assert.deepStrictEqual(roundTrip, payload);
console.log("Export envelope round trip OK");
