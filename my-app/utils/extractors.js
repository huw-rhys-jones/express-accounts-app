import { months, categories_meta, TOTAL_HINT, CURRENCY_SYMS } from '../constants/arrays.js';

export const reconstructLines = (blocks) => {
  let allLines = [];

  // Flatten blocks into a single list of lines with coordinates
  blocks.forEach(block => {
    block.lines.forEach(line => {
      // Use the vertical center of the line to handle slight skews
      const centerY = line.frame.top + (line.frame.height / 2);
      allLines.push({
        text: line.text,
        y: centerY,
        x: line.frame.left
      });
    });
  });

  if (allLines.length === 0) return "";

  // 1. Sort all lines by Y (top to bottom)
  allLines.sort((a, b) => a.y - b.y);

  let reconstructedText = "";
  const Y_THRESHOLD = 15; // Pixels allowed before considering it a "new line"

  let currentY = allLines[0].y;
  let currentGroup = [];

  allLines.forEach(line => {
    if (Math.abs(line.y - currentY) > Y_THRESHOLD) {
      // New row detected: Sort the previous row left-to-right (X)
      currentGroup.sort((a, b) => a.x - b.x);
      reconstructedText += currentGroup.map(g => g.text).join(" ") + "\n";
      
      currentGroup = [line];
      currentY = line.y;
    } else {
      currentGroup.push(line);
    }
  });

  // Handle the final group
  currentGroup.sort((a, b) => a.x - b.x);
  reconstructedText += currentGroup.map(g => g.text).join(" ") + "\n";

  return reconstructedText;
};

function parseAmount(raw) {
  if (!raw) return null;
  let t = raw.replace(/\s/g, '');
  const neg = /^\(.*\)$/.test(t) || /^-/.test(t);
  t = t.replace(/[()\-]/g, '');
  t = t.replace(CURRENCY_SYMS, '');
  t = t.replace(/,/g, '');
  const num = parseFloat(t);
  if (Number.isNaN(num)) return null;
  return neg ? -num : num;
}

function escapeForRegex(s) {
  // Safely escape merchant keywords like "C&A", "M&S", "O'Reilly"
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------- date extraction ----------
const DATE_PATTERNS = [
  // 12/03/25 or 12-03-25 (assume day-first)
  /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2})\b/g,
  // 12/03/2025
  /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})\b/g,
  // 2025-03-12 or 2025.03.12
  /\b(20\d{2})[\/.\-](\d{1,2})[\/.\-](\d{1,2})\b/g,
  // 12 Mar 2025 / 12 March 2025 / Mar 12, 2025
  new RegExp(
    String.raw`\b(\d{1,2})\s+(${months.join('|')})\.?,?\s+(20\d{2})\b`,
    'ig'
  ),
  new RegExp(
    String.raw`\b(${months.join('|')})\.?\s+(\d{1,2}),?\s+(20\d{2})\b`,
    'ig'
  ),
];

function monthNameToIndex(s) {
  const idx = months.findIndex(m => new RegExp(`^${m}$`, 'i').test(s));
  return idx >= 0 ? idx : null;
}

function toISODate(y, mIdx1based, d) {
  const m = String(mIdx1based).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  // basic sanity check
  const iso = `${y}-${m}-${dd}`;
  const dt = new Date(iso);
  return Number.isNaN(dt.getTime()) ? null : iso;
}

function extractDate(text) {
  const lines = normalizeWhitespace(text).split('\n').map(normalizeWhitespace);

  const candidates = [];

  // scan each pattern across the whole text (not per-token)
  for (const pat of DATE_PATTERNS) {
    pat.lastIndex = 0; // reset
    let m;
    while ((m = pat.exec(text)) !== null) {
      let iso = null;

      if (pat === DATE_PATTERNS[0]) {
        // dd/mm/yy -> 20yy
        const d = parseInt(m[1], 10);
        const mo = parseInt(m[2], 10);
        const yy = parseInt(m[3], 10);
        const year = 2000 + yy;
        iso = toISODate(year, mo, d);
      } else if (pat === DATE_PATTERNS[1]) {
        const d = parseInt(m[1], 10);
        const mo = parseInt(m[2], 10);
        const y = parseInt(m[3], 10);
        iso = toISODate(y, mo, d);
      } else if (pat === DATE_PATTERNS[2]) {
        const y = parseInt(m[1], 10);
        const mo = parseInt(m[2], 10);
        const d = parseInt(m[3], 10);
        iso = toISODate(y, mo, d);
      } else if (pat === DATE_PATTERNS[3]) {
        const d = parseInt(m[1], 10);
        const moName = m[2];
        const y = parseInt(m[3], 10);
        const mo = (monthNameToIndex(moName) ?? 0) + 1;
        iso = toISODate(y, mo, d);
      } else {
        // Month-name first
        const moName = m[1];
        const d = parseInt(m[2], 10);
        const y = parseInt(m[3], 10);
        const mo = (monthNameToIndex(moName) ?? 0) + 1;
        iso = toISODate(y, mo, d);
      }

      if (!iso) continue;

      // score: prefer lines with date keywords; prefer not-in-future; slight bias to earlier lines
      const idx = text.lastIndexOf(m[0]);
      const line = lines.find(ln => ln.includes(m[0])) || '';
      const today = new Date();
      const dt = new Date(iso);
      let score = 1;
      if (/\b(date|txn|transaction|issued|invoice|payment)\b/i.test(line)) score += 1.2;
      if (dt > today) score -= 1.0;
      // clamp years to sane range
      const year = dt.getFullYear();
      if (year < 2000 || year > 2100) score -= 1.5;

      candidates.push({ iso, score });
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].iso;
}

// ---------- amount extraction ----------
// ---------- amount extraction ----------
// ---------- amount extraction ----------
const MONEY_RE = /(?:£\s?|GBP\s?)?\d{1,6}\.\d{2}(?!\d)/g; // only amounts with decimals

// Inside your extractors.js
export function extractAmount(reconstructedText) {
  if (!reconstructedText) return null;

  const lines = reconstructedText.split('\n');
  const candidates = [];
  
  // This regex allows for an optional space after the decimal point
  // to catch common OCR errors like "14. 49" or "S12. 90"
  const FORGIVING_MONEY = /([£S$B]?\s?\d{1,6}[.,]\s?\d{2})/gi;

  lines.forEach((line, index) => {
    const matches = [...line.matchAll(FORGIVING_MONEY)];
    const progressFactor = index / lines.length; // 0.0 at top, 1.0 at bottom

    if (matches.length > 0) {
      matches.forEach((m, matchIndex) => {
        // Clean the value: remove currency symbols/OCR noise and spaces
        const val = parseFloat(m[1].replace(/[£S$B\s]/gi, "").replace(",", "."));
        
        if (!isNaN(val) && val > 0) {
          const upperLine = line.toUpperCase();
          let score = 0;

          // 1. KEYWORD SCORES
          // Uses word boundaries (\b) to avoid matching "included" as "pay"
          // and handles fuzzy "Tota1" OCR errors.
          if (/\bTOT[AL1]|\bDUE\b|\bPAY\b/i.test(upperLine)) {
            score += 250;
          }
          
          // 2. RIGHT-SIDE PRIORITY
          // On lines with multiple numbers (Qty @ Price | Total), the right-most is the winner.
          if (matchIndex === matches.length - 1 && matches.length > 1) {
            score += 50; 
          }

          // 3. POISON FILTERS
          // Heavy penalties for VAT and sub-totals to prevent them from winning.
          if (/VAT|TAX|NET|RATE|POINTS|WORTH|SAVINGS|CHANGE|UNIT|LITRE|@/.test(upperLine)) {
              const isVatLine = /VAT|TAX|NET/.test(upperLine);
              // Nuke VAT lines (-300) so they can't beat a TOTAL line higher up
              score -= isVatLine ? 300 : (/\bTOT[AL1]/.test(upperLine) ? 50 : 150);
          }

          // 4. POSITION BONUS
          // Slight bias for numbers lower in the receipt.
          score += (progressFactor * 100); 

          candidates.push({ val, score, line: upperLine });
        }
      });
    }
  });

  if (candidates.length === 0) return null;

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  const winner = candidates[0];
  
  // Return amount and formatted display string
  return { 
    amount: winner.val, 
    display: `£${winner.val.toFixed(2)}` 
  };
}

// Emergency fallback if the truncation was too aggressive
function fallbackHeuristic(text) {
    const allMatches = [...text.matchAll(MONEY_RE)];
    const scored = allMatches.map(m => {
        const val = parseFloat(m[0].replace(/[^\d.]/g, ""));
        const context = text.substring(m.index - 30, m.index + 30).toLowerCase();
        let s = 0;
        if (/balance due/i.test(context)) s += 1000;
        if (/points|nectar/i.test(context)) s -= 2000; // Nuclear penalty
        return { val, score: s };
    });
    const winner = scored.sort((a, b) => b.score - a.score)[0];
    return { amount: winner.val, display: `£${winner.val.toFixed(2)}` };
}

function normalizeWhitespace(s) {
  return s.replace(/\s+/g, " ").trim();
}

function normalizeForMatch(s) {
  return s
    .replace(/\u2019/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}


// Unique numeric VAT rates from categories_meta (sorted)
const getAllowedVatRates = () => {
  return Array.from(
    new Set(
      (categories_meta || [])
        .map(c => c?.vatRate)
        .filter(r => Number.isFinite(r))
    )
  ).sort((a, b) => a - b);
};

// ---------- VAT extraction (snaps to categories_meta rates only) ----------
export function extractVAT(text, amountInfo, categoryIdx) {
  if (!text) return { value: null, rate: null };

  const allowedRates = getAllowedVatRates();

  // If you want only exact matches, set to 0
  const SNAP_TOLERANCE = 1; // in percentage points (e.g., 20.09 → 20)

  const snapRate = (r) => {
    if (!Number.isFinite(r) || !allowedRates.length) return null;
    let best = null, bestDiff = Infinity;
    for (const a of allowedRates) {
      const d = Math.abs(a - r);
      if (d < bestDiff) { best = a; bestDiff = d; }
    }
    return bestDiff <= SNAP_TOLERANCE ? best : null;
  };

  const cleaned = text.replace(/\r\n/g, "\n");
  const lines = cleaned.split("\n").map(l => l.trim()).filter(Boolean);

  // 1) Table header: "VAT Rate  Incl  Excl  Amount"
  const hdrIdx = lines.findIndex(l => /vat\s*rate.*incl.*excl.*amount/i.test(l));
  if (hdrIdx >= 0) {
    for (let i = 1; i <= 3 && hdrIdx + i < lines.length; i++) {
      const row = lines[hdrIdx + i];
      const nums = (row.match(/£?\s*\d+\.\d{2}/g) || []).map(s =>
        parseFloat(s.replace(/[£\s]/g, ""))
      );
      const rm = row.match(/(\d{1,2}(?:\.\d{1,2})?)\s*(?:%|$)/);
      const snapped = rm ? snapRate(parseFloat(rm[1])) : null;

      if (nums.length >= 3) {
        const vatVal = nums[nums.length - 1]; // VAT column usually last
        return {
          value: Number.isFinite(vatVal) ? parseFloat(vatVal.toFixed(2)) : null,
          rate: snapped,
        };
      }
    }
  }

  // 2) Explicit "VAT amount" lines (ignore "VAT No")
  for (const l of lines) {
    if (/vat\s*no\b/i.test(l)) continue;
    const m =
      l.match(/vat(?!\s*no)[^0-9£]*(£?\s*\d+\.\d{2})/i) ||
      l.match(/(£\s*\d+\.\d{2})\s*vat\b/i);
    if (m) {
      const val = parseFloat(m[1].replace(/[£\s]/g, ""));
      if (isFinite(val)) return { value: parseFloat(val.toFixed(2)), rate: null };
    }
  }

  // 3) A rate near "VAT" → compute using snapped rate
  const rateHit =
    cleaned.match(/(?:vat[^%\n]{0,12})?(\d{1,2}(?:\.\d{1,2})?)\s*%/i) ||
    cleaned.match(/(\d{1,2}(?:\.\d{1,2})?)\s*%\s*vat/i);
  const snappedRate = rateHit ? snapRate(parseFloat(rateHit[1])) : null;

  if (snappedRate != null && amountInfo?.amount) {
    const gross = amountInfo.amount;
    const net = gross / (1 + snappedRate / 100);
    const vat = gross - net;
    return { value: parseFloat(vat.toFixed(2)), rate: snappedRate };
  }

  // 4) Fallback to category default (already from categories_meta)
  if (categoryIdx >= 0) {
    const catRate = categories_meta[categoryIdx]?.vatRate;
    if (Number.isFinite(catRate) && amountInfo?.amount) {
      const gross = amountInfo.amount;
      const net = gross / (1 + catRate / 100);
      const vat = gross - net;
      return { value: parseFloat(vat.toFixed(2)), rate: catRate };
    }
  }

  return { value: null, rate: null };
}




export function categoryFinder(text, categories) {
  const hay = normalizeForMatch(text);

  let bestIdx = -1;
  let bestHits = 0;

    if (!Array.isArray(categories) || categories.length === 0) {
    console.warn("categoryFinder: categories array is empty/invalid:", categories);
    return -1;
  }

  categories.forEach((cat, idx) => {


    const terms = (cat.meta || []).map(t => normalizeForMatch(String(t))).filter(Boolean);

    if (!terms.length) return;

    // Use word boundaries where possible, but allow terms with non-word chars (“B&Q”, “o2”) to match literally
    const patterns = terms.map(t => {
      const escaped = escapeForRegex(t);
      // If term is purely word chars, wrap with \b; otherwise match as-is
      return /^[a-z0-9]+$/i.test(t) ? `\\b${escaped}\\b` : escaped;
    });

    const re = new RegExp(`(?:${patterns.join("|")})`, "g");
    const matches = hay.match(re);
    const hits = matches ? matches.length : 0;

    if (hits > bestHits) {
      bestHits = hits;
      bestIdx = idx;
    }
  });

  return bestIdx; // -1 if nothing hit
}


// ---------- main ----------
export function extractData(text) {
  if (!text || typeof text !== 'string') {
    return {
      money: { value: null, currency: 0 },
      date: null,
      category: -1,
      vat: { value: null, rate: null },
    };
  }

  const cleaned = text.replace(/\r\n/g, '\n');

  const amountInfo = extractAmount(cleaned);
  const dateIso = extractDate(cleaned);
  const categoryIdx = categoryFinder(cleaned, categories_meta);
  const vatInfo = extractVAT(cleaned, amountInfo, categoryIdx);

  return {
    money: {
      value: amountInfo ? amountInfo.amount : null,
      currency: 0,
      display: amountInfo ? amountInfo.display : null,
    },
    date: dateIso,
    category: categoryIdx,
    vat: vatInfo, // ✅ new field
  };
}

