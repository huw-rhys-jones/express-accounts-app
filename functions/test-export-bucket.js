const assert = require("assert");
const {resolveExportStorageBucketName} = require("./index");

process.env.FIREBASE_STORAGE_BUCKET = "test-export-bucket";
assert.strictEqual(resolveExportStorageBucketName(), "test-export-bucket");
delete process.env.FIREBASE_STORAGE_BUCKET;
console.log("Storage bucket resolver OK");
