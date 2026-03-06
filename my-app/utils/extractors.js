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
  const Y_THRESHOLD = 50; // Increased to 50 pixels to group items on the same line (e.g., "Total" and "£17.28")

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
  
  // DEBUG: Show all reconstructed lines
  console.log('=== RECEIPT TEXT RECONSTRUCTION ===');
  lines.forEach((line, i) => {
    console.log(`  Line ${i}: "${line}"`);
  });
  console.log('====================================');
  
  const lineData = lines.map(l => l.toUpperCase());
  const candidates = [];

  // Require a non-alphanumeric boundary before the amount to avoid matches like "9306U261.67"
  const FORGIVING_MONEY = /(?:^|[^A-Z0-9])([£S$€¥]?\s?\d{1,6}[.,]\s?\d{2})(?!\d)/gi;

  const hasNear = (lineIndex, regex, radius = 1) => {
    for (let i = Math.max(0, lineIndex - radius); i <= Math.min(lineData.length - 1, lineIndex + radius); i++) {
      if (regex.test(lineData[i])) return true;
    }
    return false;
  };

  lines.forEach((line, lineIndex) => {
    const matches = [...line.matchAll(FORGIVING_MONEY)];
    if (!matches.length) return;

    matches.forEach((match) => {
      const raw = match[1];
      const normalized = raw.replace(/[£S$€¥\s]/gi, "").replace(",", ".");
      const val = parseFloat(normalized);
      if (Number.isNaN(val) || val <= 0 || val > 100000) return;

      const upperLine = lineData[lineIndex];
      const hasCurrency = /[£S$€¥]/i.test(raw);
      candidates.push({
        val,
        raw,
        hasCurrency,
        lineIndex,
        upperLine,
        score: 0
      });
    });
  });

  if (!candidates.length) return null;

  const receiptHasChangeContext = lineData.some(l => /\bCHANGE\b|\bCASH\b/.test(l));

  // Anchor lines ordered by confidence
  const anchors = [];
  lineData.forEach((line, index) => {
    if (/\bAMOUNT\s+DUE\b|\bBALANCE\s+DUE\b/.test(line)) {
      anchors.push({ lineIndex: index, weight: 520 });
      return;
    }
    if (/\bDEPOSIT\s+AMOUNT\b|\bGRAND\s+TOTAL\b|\bTOTAL\s+GBP\b/.test(line)) {
      anchors.push({ lineIndex: index, weight: 500 });
      return;
    }
    if (/\bTOTAL\b|\bTOTAT\b|\bTOTA1\b/.test(line) && !/\bSUBTOTAL\b/.test(line)) {
      anchors.push({ lineIndex: index, weight: 360 });
      return;
    }
    if (/\bBALANCE\b|\bPAYABLE\b/.test(line)) {
      anchors.push({ lineIndex: index, weight: 300 });
    }
  });

  const valueFrequency = new Map();
  candidates.forEach(c => {
    const key = c.val.toFixed(2);
    valueFrequency.set(key, (valueFrequency.get(key) || 0) + 1);
  });

  candidates.forEach(candidate => {
    let score = 0;

    if (candidate.hasCurrency) score += 20;
    if (candidate.val < 1) score -= 60;
    else if (candidate.val < 5) score -= 20;

    if (receiptHasChangeContext && Math.abs(candidate.val - Math.round(candidate.val)) < 0.001) {
      score -= 70;
    }

    if (hasNear(candidate.lineIndex, /\bVAT\b|\bTAX\b/, 1) && !hasNear(candidate.lineIndex, /\bTOTAL\b|\bDUE\b/, 2)) {
      score -= 300;
    }
    if (hasNear(candidate.lineIndex, /\bSUBTOTAL\b/, 2)) score -= 120;
    if (hasNear(candidate.lineIndex, /\bDISCOUNT\b|\bREFUND\b/, 1)) score -= 180;
    if (hasNear(candidate.lineIndex, /\bCHANGE\b|\bCASH\b|\bTENDER\b/, 2)) score -= 240;
    if (hasNear(candidate.lineIndex, /\bINVOICE\s+DATE\b|\bDUE\s+DATE\b/, 2)) score -= 240;

    let bestAnchorBoost = 0;
    let bestAnchorDistance = Infinity;
    anchors.forEach(anchor => {
      if (candidate.lineIndex > anchor.lineIndex) {  // Changed >= to > (must be AFTER anchor)
        const distance = candidate.lineIndex - anchor.lineIndex;
        if (distance <= 35) {
          const anchorBoost = anchor.weight - distance * 8;  // Increased from 4 to 8
          if (anchorBoost > bestAnchorBoost) {
            bestAnchorBoost = anchorBoost;
            bestAnchorDistance = distance;
          }
        }
      }
    });
    
    // Small amounts very close to TOTAL are likely item prices, not the total
    if (bestAnchorDistance !== Infinity && bestAnchorDistance <= 3 && candidate.val < 3.5) {
      bestAnchorBoost -= 200;
    }
    
    score += bestAnchorBoost;

    const freq = valueFrequency.get(candidate.val.toFixed(2)) || 1;
    if (freq >= 2) {
      // Repeated totals get strong boost, but cap it for very high repetition (likely item prices)
      const repeatBonus = freq >= 5 ? 100 : 140 + Math.min(freq - 2, 2) * 20;
      score += repeatBonus;
    }

    candidate.score = score;
  });

  // Sum heuristic: if A + B ≈ C in nearby lines, C is likely total
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    for (let j = 0; j < candidates.length; j++) {
      if (j === i) continue;
      for (let k = j + 1; k < candidates.length; k++) {
        if (k === i) continue;
        const a = candidates[j];
        const b = candidates[k];
        if (a.val >= c.val || b.val >= c.val) continue;
        const nearLines = Math.abs(a.lineIndex - c.lineIndex) <= 6 && Math.abs(b.lineIndex - c.lineIndex) <= 6;
        if (!nearLines) continue;

        if (Math.abs((a.val + b.val) - c.val) <= 0.06) {
          c.score += 140;
        }
      }
    }
  }

  // Cash/change relation: PAID ≈ TOTAL + CHANGE. Penalize PAID and boost TOTAL.
  if (receiptHasChangeContext) {
    for (let p = 0; p < candidates.length; p++) {
      for (let t = 0; t < candidates.length; t++) {
        if (t === p) continue;
        if (candidates[t].val >= candidates[p].val) continue;
        for (let ch = 0; ch < candidates.length; ch++) {
          if (ch === p || ch === t) continue;
          const changeVal = candidates[ch].val;
          if (changeVal <= 0 || changeVal >= candidates[t].val * 0.5) continue;

          if (Math.abs((candidates[t].val + changeVal) - candidates[p].val) <= 0.06) {
            candidates[p].score -= 180;
            candidates[t].score += 120;
          }
        }
      }
    }
  }

  // Boost the largest amount if it's significantly larger than the median
  const sortedVals = [...candidates].map(c => c.val).sort((a, b) => a - b);
  const median = sortedVals[Math.floor(sortedVals.length / 2)];
  const largestCandidate = candidates.reduce((max, c) => c.val > max.val ? c : max);
  
  if (largestCandidate.val > median * 3 && largestCandidate.val > 15) {
    largestCandidate.score += 80;
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const freqA = valueFrequency.get(a.val.toFixed(2)) || 1;
    const freqB = valueFrequency.get(b.val.toFixed(2)) || 1;
    if (freqB !== freqA) return freqB - freqA;
    return b.lineIndex - a.lineIndex;
  });

  // DEBUG: Show top candidates
  console.log('=== AMOUNT EXTRACTION DEBUG ===');
  console.log('Top candidates (sorted by score):');
  candidates.slice(0, 8).forEach((c, i) => {
    const freq = valueFrequency.get(c.val.toFixed(2)) || 1;
    const freqStr = freq > 1 ? ` (appears ${freq}x)` : '';
    console.log(`  ${i+1}. £${c.val.toFixed(2)} | Score: ${c.score} | Line ${c.lineIndex}: "${c.upperLine}"${freqStr}`);
  });
  
  // DEBUG: Show anchor lines
  if (anchors.length > 0) {
    console.log('Anchors found:');
    anchors.forEach(a => {
      console.log(`  Line ${a.lineIndex}: "${lineData[a.lineIndex]}" (weight=${a.weight})`);
    });
  }

  const winner = candidates[0];
  console.log(`WINNER: £${winner.val.toFixed(2)} (score=${winner.score})`);
  console.log('================================');

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

