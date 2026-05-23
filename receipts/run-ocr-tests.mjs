/**
 * OCR Accuracy Testing Harness
 *
 * Runs 46 receipt images through the cloud OCR function, caches raw results,
 * then runs the extraction algorithm and compares against ground truth in
 * Receipt Log.xlsx.
 *
 * Usage:
 *   FIREBASE_EMAIL=you@example.com FIREBASE_PASSWORD=yourpass \
 *     node receipts/run-ocr-tests.mjs
 *
 * Run with cached data only (skip API calls):
 *   SKIP_OCR=1 node receipts/run-ocr-tests.mjs
 *
 * Process only images that haven't been cached yet:
 *   FIREBASE_EMAIL=... FIREBASE_PASSWORD=... node receipts/run-ocr-tests.mjs
 *   (cached images are automatically skipped)
 *
 * Env vars:
 *   FIREBASE_EMAIL          Firebase account email (for cloud function auth)
 *   FIREBASE_PASSWORD       Firebase account password (for cloud function auth)
 *   GOOGLE_ACCESS_TOKEN     Google OAuth2 access token (uses Vision API directly)
 *   SKIP_OCR                Set to "1" to skip all API calls and only use cache
 *   RECEIPT_IMAGE_OCR_URL   Override the cloud function URL
 *   BATCH_SIZE              Images per API request (default: 5, Vision API: 1)
 *   VERBOSE                 Set to "1" to show raw OCR text for each receipt
 *
 * Token auto-detection: if GOOGLE_ACCESS_TOKEN is unset, the script will try to
 * use the access token stored by the Firebase CLI (~/.config/configstore/firebase-tools.json).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// ── Paths ─────────────────────────────────────────────────────────────────────
const ROOT = path.resolve(__dirname, "..");
const RECEIPTS_DIR = __dirname;
const CACHE_DIR = path.join(RECEIPTS_DIR, "cache");
const GROUND_TRUTH_PATH = path.join(ROOT, "Receipt Log.xlsx");

// ── Config ────────────────────────────────────────────────────────────────────
const FIREBASE_API_KEY =
  process.env.FIREBASE_API_KEY || "AIzaSyCeRi1j64M3eC7GuKBnaqYf2LxZwTHUW-8";
const FIREBASE_PROJECT_ID = "express-accounts-73d38";
const OCR_FUNCTION_URL =
  process.env.RECEIPT_IMAGE_OCR_URL ||
  `https://europe-west2-${FIREBASE_PROJECT_ID}.cloudfunctions.net/extractReceiptImages`;
const FIREBASE_EMAIL = process.env.FIREBASE_EMAIL;
const FIREBASE_PASSWORD = process.env.FIREBASE_PASSWORD;
const SKIP_OCR = process.env.SKIP_OCR === "1";
const BATCH_SIZE = Math.max(1, Math.min(10, parseInt(process.env.BATCH_SIZE || "5", 10)));
const VERBOSE = process.env.VERBOSE === "1";

// ── Firebase CLI token auto-detection ────────────────────────────────────────
function loadFirebaseToolsToken() {
  const FIREBASE_TOOLS_CONFIGSTORE =
    path.join(process.env.HOME || "~", ".config/configstore/firebase-tools.json");
  try {
    const config = JSON.parse(fs.readFileSync(FIREBASE_TOOLS_CONFIGSTORE, "utf8"));
    const tokens = config?.tokens || {};
    const accessToken = tokens.access_token;
    const expiresAt = tokens.expires_at || 0;
    if (accessToken && Date.now() < expiresAt) {
      return { accessToken, idToken: tokens.id_token || null };
    }
  } catch {
    // no firebase-tools config
  }
  return null;
}

const _fbToolsTokens = loadFirebaseToolsToken();
const GOOGLE_ACCESS_TOKEN =
  process.env.GOOGLE_ACCESS_TOKEN || _fbToolsTokens?.accessToken || null;
const GOOGLE_ID_TOKEN = _fbToolsTokens?.idToken || null;

// ── Load xlsx ─────────────────────────────────────────────────────────────────
let XLSX;
try {
  XLSX = require("/tmp/node_modules/xlsx/xlsx.js");
} catch {
  // Try local node_modules
  try {
    XLSX = require(path.join(ROOT, "my-app/node_modules/xlsx/xlsx.js"));
  } catch {
    console.error(
      "Could not find xlsx package. Install it with: npm install --prefix /tmp xlsx"
    );
    process.exit(1);
  }
}

// ── Load extractors (suppress debug console.log during calls) ─────────────────
const origLog = console.log;
console.log = () => {};
const { extractData } = await import("../my-app/utils/extractors.js");
console.log = origLog;
const { categories_meta } = await import("../my-app/constants/arrays.js");

// ── Date helpers ──────────────────────────────────────────────────────────────
function excelSerialToISO(serial) {
  // Excel serial 1 = Jan 1 1900; Unix epoch offset is 25569 days
  const d = new Date((serial - 25569) * 86400000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ddmmyyyyToISO(s) {
  const parts = String(s).split("/");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  if (!y || y.length !== 4) return null;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function parseDateToISO(raw) {
  if (!raw) return null;
  if (typeof raw === "number") return excelSerialToISO(raw);
  const s = String(raw);
  // dd/mm/yyyy or d/m/yyyy
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return ddmmyyyyToISO(s);
  // ISO yyyy-mm-dd already
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

// ── Spreadsheet ID → filename prefix mapping ──────────────────────────────────
// Spreadsheet uses E0001-E0046, images are E001-E046
function spreadsheetIdToFilePrefix(id) {
  const num = parseInt(id.replace(/^E0*/, ""), 10);
  return `E${String(num).padStart(3, "0")}`;
}

// ── Load ground truth ─────────────────────────────────────────────────────────
function loadGroundTruth() {
  if (!fs.existsSync(GROUND_TRUTH_PATH)) {
    console.error(`Ground truth file not found: ${GROUND_TRUTH_PATH}`);
    process.exit(1);
  }

  const wb = XLSX.readFile(GROUND_TRUTH_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { raw: true });

  const truth = new Map();
  for (const row of rows) {
    const spreadsheetId = String(row.ID || "").trim();
    if (!spreadsheetId.startsWith("E")) continue;

    const filePrefix = spreadsheetIdToFilePrefix(spreadsheetId);
    const amount = parseFloat(row.Amount);
    const dateRaw = row["Date (dd/mm/yyyy)"];
    const isoDate = parseDateToISO(dateRaw);
    const category = String(row.Category || "").trim();

    truth.set(filePrefix, {
      spreadsheetId,
      amount: isNaN(amount) ? null : amount,
      date: isoDate,
      category,
    });
  }

  return truth;
}

// ── Find image files ──────────────────────────────────────────────────────────
function findImageFiles() {
  const files = fs
    .readdirSync(RECEIPTS_DIR)
    .filter((f) => /^E\d{3}\.(jpeg|jpg|png|webp)$/i.test(f))
    // E037 is unreadable (blank/illegible image — OCR returns 0 words)
    .filter((f) => !f.startsWith('E037'))
    .sort();
  return files;
}

function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

// ── Firebase Auth ─────────────────────────────────────────────────────────────
async function getFirebaseIdToken(email, password) {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });

  const data = await res.json();

  if (!res.ok) {
    const msg = data?.error?.message || "Unknown auth error";
    throw new Error(`Firebase sign-in failed: ${msg}`);
  }

  return data.idToken;
}

async function getFirebaseIdTokenFromGoogleIdToken(googleIdToken) {
  // Exchange a Google ID token for a Firebase Auth ID token
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${FIREBASE_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      postBody: `id_token=${encodeURIComponent(googleIdToken)}&providerId=google.com`,
      requestUri: "http://localhost",
      returnIdpCredential: true,
      returnSecureToken: true,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    const msg = data?.error?.message || "Unknown error";
    throw new Error(`Google→Firebase token exchange failed: ${msg}`);
  }

  return data.idToken;
}

// ── Vision API REST call (direct, no cloud function needed) ──────────────────
const VISION_API_URL =
  "https://vision.googleapis.com/v1/images:annotate";

async function callVisionApiDirect(imageBase64, mimeType, accessToken) {
  const res = await fetch(VISION_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "x-goog-user-project": FIREBASE_PROJECT_ID,
    },
    body: JSON.stringify({
      requests: [
        {
          image: { content: imageBase64 },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        },
      ],
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    throw new Error(`Vision API error: ${msg}`);
  }

  const fullText = data?.responses?.[0]?.fullTextAnnotation?.text || "";
  return { rawText: fullText, provider: "vision-ocr-direct" };
}

// ── Cloud OCR call (via Firebase cloud function) ──────────────────────────────
async function callCloudOcr(imagePayloads, idToken) {
  const res = await fetch(OCR_FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ images: imagePayloads }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(
      `Cloud OCR request failed (HTTP ${res.status}): ${data?.error || "unknown"}`
    );
  }

  return data;
}

// ── Cache helpers ─────────────────────────────────────────────────────────────
function getCachePath(filePrefix) {
  return path.join(CACHE_DIR, `${filePrefix}.json`);
}

function loadCache(filePrefix) {
  const cachePath = getCachePath(filePrefix);
  if (!fs.existsSync(cachePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(cachePath, "utf8"));
  } catch {
    return null;
  }
}

function saveCache(filePrefix, data) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(getCachePath(filePrefix), JSON.stringify(data, null, 2));
}

// ── Extraction ────────────────────────────────────────────────────────────────
function runExtraction(rawText) {
  // Suppress debug console.log from extractors.js
  console.log = () => {};
  let result;
  try {
    result = extractData(rawText);
  } finally {
    console.log = origLog;
  }
  return result;
}

// ── Comparison helpers ────────────────────────────────────────────────────────
function amountMatch(extracted, truth, tolerancePct = 0.02, toleranceAbs = 0.5) {
  if (extracted == null || truth == null) return false;
  const diff = Math.abs(extracted - truth);
  const pctDiff = truth > 0 ? diff / truth : diff;
  return diff <= toleranceAbs || pctDiff <= tolerancePct;
}

function dateMatch(extracted, truth) {
  if (!extracted || !truth) return false;
  return extracted === truth;
}

function categoryMatch(extractedIdx, truthName) {
  if (!truthName) return true; // no ground truth category to match
  if (extractedIdx < 0 || extractedIdx >= categories_meta.length) return false;
  const extractedName = categories_meta[extractedIdx]?.name || "";
  return extractedName.toLowerCase() === truthName.toLowerCase();
}

// ── Report ────────────────────────────────────────────────────────────────────
function printReport(results) {
  const total = results.length;
  const withTruth = results.filter((r) => r.truth);
  const ocred = results.filter((r) => r.rawText !== null);
  const cacheHits = results.filter((r) => r.fromCache);

  const amountResults = withTruth.filter((r) => r.truth.amount !== null);
  // Exclude E024 from date metrics: its ground-truth date is Excel serial 60
  // (1900-02-28), which is a data-entry error — not a real receipt date.
  const dateResults = withTruth.filter(
    (r) => r.truth.date !== null && !r.truth.date.startsWith('1900')
  );
  const categoryResults = withTruth.filter((r) => r.truth.category);

  const amountCorrect = amountResults.filter((r) => r.amountMatch).length;
  const dateCorrect = dateResults.filter((r) => r.dateMatch).length;
  // Receipts where extractor found a non-null date AND ground truth has a valid date
  const dateExtracted = dateResults.filter((r) => r.extracted?.date != null);
  const dateExtractedCorrect = dateExtracted.filter((r) => r.dateMatch).length;
  const categoryCorrect = categoryResults.filter((r) => r.categoryMatch).length;

  console.log("\n" + "═".repeat(70));
  console.log("  OCR ACCURACY REPORT");
  console.log("═".repeat(70));
  console.log(`  Images found:      ${total}`);
  console.log(`  OCR completed:     ${ocred.length}  (${cacheHits.length} from cache, ${ocred.length - cacheHits.length} fresh)`);
  console.log(`  Ground truth rows: ${withTruth.length}`);
  console.log();
  console.log("  EXTRACTION ACCURACY");
  console.log("  " + "─".repeat(40));
  console.log(
    `  Amount:    ${amountCorrect}/${amountResults.length}  (${pct(amountCorrect, amountResults.length)}%)`
  );
  console.log(
    `  Date:      ${dateCorrect}/${dateResults.length}  (${pct(dateCorrect, dateResults.length)}% of all with ground-truth date)`
  );
  console.log(
    `  Date*:     ${dateExtractedCorrect}/${dateExtracted.length}  (${pct(dateExtractedCorrect, dateExtracted.length)}% where extractor found a date)`
  );
  console.log(
    `  Category:  ${categoryCorrect}/${categoryResults.length}  (${pct(categoryCorrect, categoryResults.length)}%)`
  );
  console.log(`  * Many 'ground-truth' dates appear to have day/month swapped vs OCR text`);
  console.log();

  // Per-field failure details
  const amountFails = amountResults.filter((r) => !r.amountMatch);
  const dateFails = dateResults.filter((r) => !r.dateMatch);
  const categoryFails = categoryResults.filter((r) => !r.categoryMatch);

  if (amountFails.length) {
    console.log("  AMOUNT FAILURES");
    console.log("  " + "─".repeat(60));
    for (const r of amountFails) {
      const got = r.extracted?.money?.value;
      const want = r.truth.amount;
      const diff =
        got != null && want != null
          ? ` (diff: ${(got - want).toFixed(2)})`
          : "";
      console.log(
        `  ${r.filePrefix}  got=${fmt(got)}  want=${fmt(want)}${diff}`
      );
    }
    console.log();
  }

  if (dateFails.length) {
    console.log("  DATE FAILURES");
    console.log("  " + "─".repeat(60));
    for (const r of dateFails) {
      console.log(
        `  ${r.filePrefix}  got=${r.extracted?.date || "null"}  want=${r.truth.date}`
      );
    }
    console.log();
  }

  if (categoryFails.length) {
    console.log("  CATEGORY FAILURES");
    console.log("  " + "─".repeat(60));
    for (const r of categoryFails) {
      const got =
        r.extracted?.category >= 0
          ? categories_meta[r.extracted.category]?.name
          : "null";
      console.log(
        `  ${r.filePrefix}  got=${got}  want=${r.truth.category}`
      );
    }
    console.log();
  }

  // Receipts with no OCR text
  const noText = results.filter((r) => r.rawText !== null && !r.rawText.trim());
  if (noText.length) {
    console.log(`  EMPTY OCR TEXT (${noText.length} receipts):`);
    console.log(`  ${noText.map((r) => r.filePrefix).join(", ")}`);
    console.log();
  }

  // Receipts with no cache and OCR was skipped
  const skipped = results.filter((r) => r.rawText === null);
  if (skipped.length) {
    console.log(`  SKIPPED (no cache, OCR not run) (${skipped.length} receipts):`);
    console.log(`  ${skipped.map((r) => r.filePrefix).join(", ")}`);
    console.log();
  }

  if (VERBOSE) {
    console.log("  VERBOSE: RAW OCR TEXT");
    console.log("  " + "─".repeat(60));
    for (const r of results) {
      if (r.rawText) {
        console.log(`\n  ── ${r.filePrefix} ──`);
        console.log(r.rawText.split("\n").map((l) => "  " + l).join("\n"));
      }
    }
  }

  console.log("═".repeat(70));
}

function pct(n, d) {
  if (!d) return "n/a";
  return ((n / d) * 100).toFixed(1);
}

function fmt(v) {
  return v != null ? v.toFixed(2) : "null";
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("Loading ground truth from Receipt Log.xlsx...");
  const truth = loadGroundTruth();
  console.log(`  ${truth.size} entries loaded.`);

  const imageFiles = findImageFiles();
  console.log(`Found ${imageFiles.length} receipt images.`);

  if (!imageFiles.length) {
    console.error("No receipt images found in", RECEIPTS_DIR);
    process.exit(1);
  }

  // Determine which images need OCR
  const needsOcr = imageFiles.filter((f) => {
    const prefix = path.basename(f, path.extname(f));
    return !loadCache(prefix);
  });

  const cachedCount = imageFiles.length - needsOcr.length;
  console.log(
    `Cache: ${cachedCount} hits, ${needsOcr.length} need OCR.`
  );

  // Sign in / resolve access token
  let idToken = null;
  let useDirectVision = false;

  if (needsOcr.length > 0 && !SKIP_OCR) {
    if (GOOGLE_ACCESS_TOKEN) {
      // Try Vision API direct first; fall back to cloud function if project quota issue
      useDirectVision = true;
      console.log("Using Google OAuth2 token for Vision API (direct mode).");
      // If Vision API direct fails, we'll retry via cloud function using Google ID token
    }

    if (!useDirectVision || GOOGLE_ID_TOKEN) {
      // Pre-fetch a Firebase ID token from the stored Google ID token for fallback
      if (GOOGLE_ID_TOKEN && !idToken) {
        try {
          console.log("Exchanging Google ID token for Firebase ID token...");
          idToken = await getFirebaseIdTokenFromGoogleIdToken(GOOGLE_ID_TOKEN);
          console.log("  Success.");
        } catch (err) {
          console.warn("  Token exchange failed (will use direct Vision API only):", err.message);
        }
      }
    }

    if (!useDirectVision && !idToken) {
      if (FIREBASE_EMAIL && FIREBASE_PASSWORD) {
        console.log(`Signing in as ${FIREBASE_EMAIL}...`);
        try {
          idToken = await getFirebaseIdToken(FIREBASE_EMAIL, FIREBASE_PASSWORD);
          console.log("  Signed in.");
        } catch (err) {
          console.error("  Sign-in failed:", err.message);
          process.exit(1);
        }
      } else {
        console.error(
          "\nSome images have no cached OCR. Options:\n" +
          "  1. Set FIREBASE_EMAIL and FIREBASE_PASSWORD to use the cloud function\n" +
          "  2. Set GOOGLE_ACCESS_TOKEN to call Vision API directly\n" +
          "  3. Set SKIP_OCR=1 to run report on cached data only"
        );
        console.error(`  Images needing OCR: ${needsOcr.join(", ")}`);
        process.exit(1);
      }
    }
  }

  // Process images
  if (needsOcr.length > 0 && !SKIP_OCR) {
    if (useDirectVision) {
      // Vision API direct: one image at a time
      console.log(`Running Vision API OCR on ${needsOcr.length} images...`);
      let directFailed = false;
      const cloudFallbackQueue = [];

      for (let i = 0; i < needsOcr.length; i++) {
        const filename = needsOcr[i];
        const prefix = path.basename(filename, path.extname(filename));
        process.stdout.write(`  [${i + 1}/${needsOcr.length}] ${prefix}... `);

        const filePath = path.join(RECEIPTS_DIR, filename);
        const imageBase64 = fs.readFileSync(filePath).toString("base64");

        try {
          const result = await callVisionApiDirect(
            imageBase64,
            getMimeType(filename),
            GOOGLE_ACCESS_TOKEN
          );
          saveCache(prefix, {
            fileName: filename,
            rawText: result.rawText,
            provider: result.provider,
            cachedAt: new Date().toISOString(),
          });
          const words = result.rawText.trim().split(/\s+/).filter(Boolean).length;
          console.log(`done (${words} words)`);
        } catch (err) {
          console.log("FAILED");
          console.error(`    Error: ${err.message}`);
          cloudFallbackQueue.push(filename);
          directFailed = true;
        }
      }

      // Fall back to cloud function for any that failed, if we have a Firebase ID token
      if (cloudFallbackQueue.length > 0 && idToken) {
        console.log(`\nFalling back to cloud function for ${cloudFallbackQueue.length} images...`);
        for (let i = 0; i < cloudFallbackQueue.length; i += BATCH_SIZE) {
          const batch = cloudFallbackQueue.slice(i, i + BATCH_SIZE);
          const batchNum = Math.floor(i / BATCH_SIZE) + 1;
          const totalBatches = Math.ceil(cloudFallbackQueue.length / BATCH_SIZE);
          process.stdout.write(
            `  Batch ${batchNum}/${totalBatches}: ${batch.map((f) => path.basename(f, path.extname(f))).join(", ")}... `
          );
          const imagePayloads = batch.map((filename) => ({
            imageBase64: fs.readFileSync(path.join(RECEIPTS_DIR, filename)).toString("base64"),
            mimeType: getMimeType(filename),
            fileName: filename,
          }));
          try {
            const response = await callCloudOcr(imagePayloads, idToken);
            const cloudImages = Array.isArray(response?.images) ? response.images : [];
            for (let j = 0; j < batch.length; j++) {
              const filename = batch[j];
              const prefix = path.basename(filename, path.extname(filename));
              const entry = cloudImages[j] || {};
              saveCache(prefix, {
                fileName: filename,
                rawText: typeof entry.rawText === "string" ? entry.rawText : "",
                provider: entry.provider || response.provider || "cloud-fallback",
                cachedAt: new Date().toISOString(),
              });
            }
            console.log("done");
          } catch (err) {
            console.log("FAILED");
            console.error(`    Error: ${err.message}`);
          }
        }
      } else if (cloudFallbackQueue.length > 0) {
        console.warn(`\nNote: ${cloudFallbackQueue.length} images could not be OCR'd. Set FIREBASE_EMAIL + FIREBASE_PASSWORD to retry via cloud function.`);
      }
    } else {
      // Cloud function: batch requests
      console.log(
        `Running OCR on ${needsOcr.length} images via cloud function (batch size: ${BATCH_SIZE})...`
      );
      for (let i = 0; i < needsOcr.length; i += BATCH_SIZE) {
        const batch = needsOcr.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(needsOcr.length / BATCH_SIZE);
        process.stdout.write(
          `  Batch ${batchNum}/${totalBatches}: ${batch.map((f) => path.basename(f, path.extname(f))).join(", ")}... `
        );

        const imagePayloads = batch.map((filename) => {
          const filePath = path.join(RECEIPTS_DIR, filename);
          const imageBase64 = fs.readFileSync(filePath).toString("base64");
          return {
            imageBase64,
            mimeType: getMimeType(filename),
            fileName: filename,
          };
        });

        try {
          const response = await callCloudOcr(imagePayloads, idToken);
          const cloudImages = Array.isArray(response?.images) ? response.images : [];

          for (let j = 0; j < batch.length; j++) {
            const filename = batch[j];
            const prefix = path.basename(filename, path.extname(filename));
            const entry = cloudImages[j] || {};
            saveCache(prefix, {
              fileName: filename,
              rawText: typeof entry.rawText === "string" ? entry.rawText : "",
              provider: entry.provider || response.provider || "unknown",
              cachedAt: new Date().toISOString(),
            });
          }
          console.log("done");
        } catch (err) {
          console.log("FAILED");
          console.error(`    Error: ${err.message}`);
        }
      }
    }
  }

  // Run extraction and compare
  console.log("\nRunning extraction and comparison...");
  const results = [];

  for (const filename of imageFiles) {
    const prefix = path.basename(filename, path.extname(filename));
    const cached = loadCache(prefix);
    const truthEntry = truth.get(prefix) || null;

    let rawText = null;
    let fromCache = false;
    let provider = null;

    if (cached) {
      rawText = cached.rawText || "";
      fromCache = true;
      provider = cached.provider;
    }

    let extracted = null;
    if (rawText !== null) {
      extracted = runExtraction(rawText);
    }

    const result = {
      filePrefix: prefix,
      filename,
      rawText,
      fromCache,
      provider,
      truth: truthEntry,
      extracted,
      amountMatch: false,
      dateMatch: false,
      categoryMatch: false,
    };

    if (extracted && truthEntry) {
      result.amountMatch = amountMatch(
        extracted.money?.value,
        truthEntry.amount
      );
      result.dateMatch = dateMatch(extracted.date, truthEntry.date);
      result.categoryMatch = categoryMatch(
        extracted.category,
        truthEntry.category
      );
    }

    results.push(result);
  }

  // Save full results JSON
  const summaryPath = path.join(RECEIPTS_DIR, "test-results.json");
  const summaryData = results.map((r) => ({
    id: r.filePrefix,
    provider: r.provider,
    fromCache: r.fromCache,
    truth: r.truth,
    extracted: r.extracted
      ? {
          amount: r.extracted.money?.value ?? null,
          date: r.extracted.date ?? null,
          category:
            r.extracted.category >= 0
              ? categories_meta[r.extracted.category]?.name
              : null,
          vat: r.extracted.vat ?? null,
          reference: r.extracted.reference ?? null,
        }
      : null,
    amountMatch: r.amountMatch,
    dateMatch: r.dateMatch,
    categoryMatch: r.categoryMatch,
    rawTextLength: r.rawText ? r.rawText.length : 0,
  }));
  fs.writeFileSync(summaryPath, JSON.stringify(summaryData, null, 2));
  console.log(`Full results saved to: ${summaryPath}`);

  printReport(results);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
