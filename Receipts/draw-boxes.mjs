/**
 * Annotates receipt images with what the app actually extracts.
 *
 * For each receipt it:
 *  - Runs the same extractors the app uses (amount, date, VAT, category)
 *  - Finds the word(s) in the Vision API response that correspond to each value
 *  - Draws coloured highlight boxes around those words
 *  - Adds a summary panel showing extracted vs expected values
 *
 * Usage:
 *   node receipts/draw-boxes.mjs E030
 *   node receipts/draw-boxes.mjs E030 E021 E018   # multiple receipts
 *   node receipts/draw-boxes.mjs --all            # every cached receipt
 *
 * Output: receipts/annotated/<ID>.jpg
 *
 * Requires:
 *   - receipts/cache/<ID>.json with fullAnnotation (re-run OCR without SKIP_OCR=1)
 *   - receipts/test-results.json  (run the test harness first)
 *   - canvas package: npm install --prefix /tmp canvas
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const require    = createRequire(import.meta.url);

// -- Load canvas
let createCanvas, loadImage;
try {
  ({ createCanvas, loadImage } = require("/tmp/node_modules/canvas"));
} catch {
  try {
    ({ createCanvas, loadImage } = require("canvas"));
  } catch {
    console.error("canvas not found. Install with: npm install --prefix /tmp canvas");
    process.exit(1);
  }
}

// -- Load extractors (same code as the app)
const extractorsPath = path.resolve(__dirname, "../my-app/utils/extractors.js");
const { extractData, reconstructLines } = await import(extractorsPath);

// -- Load categories
const categoriesPath = path.resolve(__dirname, "../my-app/constants/arrays.js");
const { categories_meta } = await import(categoriesPath);
function idxToCategory(idx) {
  if (idx == null || idx < 0) return null;
  return categories_meta[idx]?.name ?? null;
}

// -- Paths
const CACHE_DIR    = path.join(__dirname, "cache");
const IMAGES_DIR   = path.resolve(__dirname, "..", "Receipts");
const OUT_DIR      = path.join(__dirname, "annotated");
const RESULTS_PATH = path.join(__dirname, "test-results.json");

// -- Colour scheme
const COL = {
  amount:   { stroke: "#22c55e", fill: "rgba(34,197,94,0.25)",   label: "#16a34a" },
  date:     { stroke: "#3b82f6", fill: "rgba(59,130,246,0.25)",  label: "#1d4ed8" },
  vat:      { stroke: "#f97316", fill: "rgba(249,115,22,0.25)",  label: "#c2410c" },
  allWords: "rgba(160,160,160,0.30)",
};

// -- Load ground-truth results once
let groundTruth = {};
if (fs.existsSync(RESULTS_PATH)) {
  const raw = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf8"));
  for (const entry of Object.values(raw)) {
    groundTruth[entry.id] = entry;
  }
}

// -- Convert Vision API fullAnnotation → ML Kit block format → reconstructLines
// This replicates the exact text-reconstruction path the app uses.
function visionApiToMLKitBlocks(fullAnnotation) {
  const blocks = [];
  for (const page of fullAnnotation.pages || []) {
    for (const block of page.blocks || []) {
      const mlBlock = { lines: [] };
      for (const para of block.paragraphs || []) {
        const text = (para.words || [])
          .map(w => (w.symbols || []).map(s => s.text).join(""))
          .join(" ");
        const verts = para.boundingBox?.vertices || [];
        const xs = verts.map(v => v.x ?? 0);
        const ys = verts.map(v => v.y ?? 0);
        mlBlock.lines.push({
          text,
          frame: {
            left:   Math.min(...xs),
            top:    Math.min(...ys),
            width:  Math.max(...xs) - Math.min(...xs),
            height: Math.max(...ys) - Math.min(...ys),
          },
        });
      }
      blocks.push(mlBlock);
    }
  }
  return blocks;
}

// -- Build flat word list from fullAnnotation
function buildWords(fullAnnotation) {
  const words = [];
  for (const page of fullAnnotation.pages || []) {
    for (const block of page.blocks || []) {
      for (const para of block.paragraphs || []) {
        for (const word of para.words || []) {
          const text = (word.symbols || []).map(s => s.text).join("");
          words.push({ text, bbox: word.boundingBox });
        }
      }
    }
  }
  return words;
}

// -- Normalise word text for numeric comparison
function normForAmount(raw) {
  let s = raw.replace(/[£$€¥]/g, "").replace(/\s/g, "");
  // Slash decimal: 12/95 → 12.95 (skip if could be date fragment)
  s = s.replace(/^(\d+)\/(\d{2})$/, (_, a, b) =>
    (parseInt(b) > 31 || parseInt(a) > 12) ? `${a}.${b}` : `${a}/${b}`
  );
  if (s.includes(".")) s = s.replace(/,/g, "");
  else s = s.replace(/,(\d{2})$/, ".$1").replace(/,/g, "");
  return s;
}

// -- Find word(s) matching a numeric amount
function findAmountWords(words, target) {
  if (target == null) return [];
  const eps = 0.005;
  for (const w of words) {
    const v = parseFloat(normForAmount(w.text));
    if (!isNaN(v) && Math.abs(v - target) < eps) return [w];
  }
  for (let i = 0; i < words.length - 1; i++) {
    const joined = normForAmount(words[i].text + words[i + 1].text);
    const v = parseFloat(joined);
    if (!isNaN(v) && Math.abs(v - target) < eps) return [words[i], words[i + 1]];
  }
  return [];
}

// -- Find word(s) matching an ISO date
function findDateWords(words, isoDate) {
  if (!isoDate) return [];
  const [yyyy, mm, dd] = isoDate.split("-");
  const yy = yyyy.slice(2);
  const d  = String(parseInt(dd));
  const m  = String(parseInt(mm));
  const pats = [
    `${dd}/${mm}/${yyyy}`, `${dd}/${mm}/${yy}`,
    `${d}/${m}/${yyyy}`,   `${d}/${m}/${yy}`,
    `${dd}-${mm}-${yyyy}`, `${dd}.${mm}.${yyyy}`,
    `${dd}-${mm}-${yy}`,   `${dd}.${mm}.${yy}`,
    `${yyyy}-${mm}-${dd}`, `${yyyy}/${mm}/${dd}`,
  ];
  for (const w of words) {
    if (pats.includes(w.text)) return [w];
  }
  for (let span = 2; span <= 3; span++) {
    for (let i = 0; i <= words.length - span; i++) {
      const slice  = words.slice(i, i + span);
      const digits = slice.map(w => w.text).join("").replace(/\D/g, "");
      for (const pat of pats) {
        if (digits === pat.replace(/\D/g, "")) return slice;
      }
    }
  }
  // Month-name formats: e.g. "March 31st, 2025" or "31 March 2025"
  const MONTHS = ["january","february","march","april","may","june",
                  "july","august","september","october","november","december"];
  const monthIdx = parseInt(mm) - 1; // 0-based
  for (let span = 2; span <= 5; span++) {
    for (let i = 0; i <= words.length - span; i++) {
      const slice = words.slice(i, i + span);
      const joined = slice.map(w => w.text).join(" ").toLowerCase();
      const monthName = MONTHS[monthIdx];
      if (!joined.includes(monthName)) continue;
      // Must also contain the day digits and year
      const stripped = joined.replace(/\D/g, "");
      if (stripped.includes(d) && (stripped.includes(yyyy) || stripped.includes(yy))) {
        return slice;
      }
    }
  }
  return [];
}

// -- Union bounding box
function unionBBox(wordList) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const w of wordList) {
    for (const v of w.bbox?.vertices || []) {
      const x = v.x ?? 0, y = v.y ?? 0;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// -- Draw filled + outlined box
function drawBox(ctx, x, y, w, h, { stroke }, lineWidth = 2) {
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.strokeRect(x, y, w, h);
}

// -- Draw label above (or below) a box
function drawLabel(ctx, text, bx, by, color) {
  const fontSize = 14;
  ctx.font = `bold ${fontSize}px sans-serif`;
  const tw  = ctx.measureText(text).width;
  const pad = 4;
  let ly = by - 6;
  if (ly - fontSize - pad < 0) ly = by + 24;
  ctx.fillStyle = "rgba(255,255,255,0.90)";
  ctx.fillRect(bx - pad, ly - fontSize - pad, tw + pad * 2, fontSize + pad * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(bx - pad, ly - fontSize - pad, tw + pad * 2, fontSize + pad * 2);
  ctx.fillStyle = color;
  ctx.fillText(text, bx, ly);
}

// -- Summary panel at the bottom
function drawSummaryPanel(ctx, imgW, panelY, extracted, truth) {
  const panelH = 68;
  ctx.fillStyle = "rgba(0,0,0,0.80)";
  ctx.fillRect(0, panelY, imgW, panelH);

  const fields = [
    {
      label: "AMOUNT",
      got:   extracted.amount != null ? `£${extracted.amount.toFixed(2)}` : "\u2014",
      want:  truth?.amount    != null ? `£${parseFloat(truth.amount).toFixed(2)}` : null,
      ok:    truth ? extracted.amount === truth.amount : null,
      col:   COL.amount,
    },
    {
      label: "DATE",
      got:   extracted.date ?? "\u2014",
      want:  truth?.date ?? null,
      ok:    truth ? extracted.date === truth.date : null,
      col:   COL.date,
    },
    {
      label: "VAT",
      got:   extracted.vat?.value != null ? `£${extracted.vat.value.toFixed(2)}` : "\u2014",
      want:  null,
      ok:    null,
      col:   COL.vat,
    },
    {
      label: "CATEGORY",
      got:   extracted.categoryName ?? "\u2014",
      want:  truth?.category ?? null,
      ok:    truth ? extracted.categoryName === truth.category : null,
      col:   { label: "#a8a8a8" },
    },
  ];

  const colW = imgW / fields.length;
  fields.forEach(({ label, got, want, ok, col }, i) => {
    const cx = i * colW + 8;
    ctx.font = "bold 12px sans-serif";
    ctx.fillStyle = col.label || "#a8a8a8";
    ctx.fillText(label, cx, panelY + 18);
    ctx.font = "13px monospace";
    ctx.fillStyle = ok === null ? "#ffffff" : ok ? "#86efac" : "#fca5a5";
    ctx.fillText(got, cx, panelY + 36);
    if (want && want !== got) {
      ctx.font = "11px sans-serif";
      ctx.fillStyle = "#fbbf24";
      ctx.fillText(`want: ${want}`, cx, panelY + 56);
    }
  });
}

// -- Draw one receipt
async function drawReceipt(id) {
  const cachePath = path.join(CACHE_DIR, `${id}.json`);
  if (!fs.existsSync(cachePath)) { console.error(`  ${id}: no cache file`); return; }
  const cached = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  if (!cached.fullAnnotation?.pages?.length) {
    console.error(`  ${id}: no fullAnnotation in cache -- re-run OCR without SKIP_OCR=1`);
    return;
  }

  let imgPath = null;
  for (const ext of [".jpg", ".jpeg", ".png", ".webp"]) {
    const c = path.join(IMAGES_DIR, `${id}${ext}`);
    if (fs.existsSync(c)) { imgPath = c; break; }
  }
  if (!imgPath) { console.error(`  ${id}: no source image`); return; }

  // Reconstruct text exactly as the app does: Vision API blocks → ML Kit format → reconstructLines
  const mlKitBlocks    = visionApiToMLKitBlocks(cached.fullAnnotation);
  const reconstructed  = reconstructLines(mlKitBlocks);
  const result         = extractData(reconstructed);
  const extracted = {
    amount:       result.money?.value ?? null,
    date:         result.date ?? null,
    vat:          result.vat ?? { value: null },
    category:     result.category,
    categoryName: idxToCategory(result.category),
  };

  const truth = groundTruth[id]?.truth ?? null;
  const words = buildWords(cached.fullAnnotation);

  const amountWords = findAmountWords(words, extracted.amount);
  const dateWords   = findDateWords(words, extracted.date);
  const vatWords    = findAmountWords(words, extracted.vat?.value ?? null);

  const img    = await loadImage(imgPath);
  const PANEL  = 68;
  const canvas = createCanvas(img.width, img.height + PANEL);
  const ctx    = canvas.getContext("2d");

  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);

  // Faint grey outline for every OCR word (shows OCR coverage)
  ctx.lineWidth = 1;
  for (const w of words) {
    const verts = w.bbox?.vertices;
    if (!verts?.length) continue;
    ctx.strokeStyle = COL.allWords;
    ctx.beginPath();
    ctx.moveTo(verts[0].x ?? 0, verts[0].y ?? 0);
    for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x ?? 0, verts[i].y ?? 0);
    ctx.closePath();
    ctx.stroke();
  }

  // Highlighted boxes for extracted values
  const highlights = [
    { wl: amountWords, scheme: COL.amount, tag: `AMOUNT ${extracted.amount != null ? "£"+extracted.amount.toFixed(2) : "\u2014"}` },
    { wl: dateWords,   scheme: COL.date,   tag: `DATE ${extracted.date ?? "\u2014"}` },
    { wl: vatWords,    scheme: COL.vat,    tag: `VAT £${(extracted.vat?.value ?? 0).toFixed(2)}` },
  ];

  for (const { wl, scheme, tag } of highlights) {
    if (!wl.length) continue;
    const b = unionBBox(wl);
    if (!isFinite(b.x)) continue;
    const pad = 4;
    drawBox(ctx, b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2, scheme, 2.5);
    drawLabel(ctx, tag, b.x - pad, b.y - pad, scheme.label);
  }

  drawSummaryPanel(ctx, img.width, img.height, extracted, truth);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `${id}.jpg`);
  fs.writeFileSync(outPath, canvas.toBuffer("image/jpeg", { quality: 0.92 }));

  const warns = [
    !amountWords.length && "(amount not located in image)",
    !dateWords.length   && "(date not located in image)",
  ].filter(Boolean).join("  ");
  console.log(`  ${id}: ${path.relative(process.cwd(), outPath)}  ${warns}`);
}

// -- CLI
const args = process.argv.slice(2);
let ids;
if (args.includes("--all")) {
  ids = fs.readdirSync(CACHE_DIR)
    .filter(f => /^E\d{3}\.json$/.test(f))
    .map(f => f.replace(".json", ""))
    .sort();
} else if (args.length) {
  ids = args.map(a => a.toUpperCase());
} else {
  console.error("Usage: node receipts/draw-boxes.mjs <ID> [ID...] | --all");
  process.exit(1);
}

console.log(`Annotating ${ids.length} receipt(s)...`);
for (const id of ids) {
  await drawReceipt(id);
}
console.log("Done.");
