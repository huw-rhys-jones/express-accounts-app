const assert = require("assert");
const {Readable, Writable} = require("stream");
const {pipeline} = require("stream/promises");
const {
  createExportEnvelope,
  createExportEnvelopeTransform,
  readExportEnvelope,
} = require("./exportEnvelope");
const {resolveExportStorageBucketName} = require("./index");

async function run() {
  const payload = Buffer.from("test-export-payload");
  const envelope = createExportEnvelope({ password: "test-password", payload });
  const roundTrip = readExportEnvelope({ password: "test-password", buffer: envelope });

  assert.deepStrictEqual(roundTrip, payload);

  const outputChunks = [];
  const writable = new Writable({
    write(chunk, encoding, callback) {
      outputChunks.push(Buffer.from(chunk));
      callback();
    },
  });

  await pipeline(
    Readable.from([Buffer.from("streamed-export")]),
    createExportEnvelopeTransform("test-password"),
    writable,
  );

  const streamedEnvelope = Buffer.concat(outputChunks);
  const streamedRoundTrip = readExportEnvelope({ password: "test-password", buffer: streamedEnvelope });
  assert.deepStrictEqual(streamedRoundTrip, Buffer.from("streamed-export"));

  process.env.FIREBASE_STORAGE_BUCKET = "test-export-bucket";
  assert.strictEqual(resolveExportStorageBucketName(), "test-export-bucket");
  delete process.env.FIREBASE_STORAGE_BUCKET;

  console.log("Export envelope round trip OK");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
