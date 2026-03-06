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
        x: line.frame.left,
        h: line.frame.height || 0
      });
    });
  });

  if (allLines.length === 0) return "";

  // 1. Sort all lines by Y (top to bottom)
  allLines.sort((a, b) => a.y - b.y);

  const heights = allLines
    .map(l => l.h)
    .filter(h => Number.isFinite(h) && h > 0)
    .sort((a, b) => a - b);
  const medianHeight = heights.length
    ? heights[Math.floor(heights.length / 2)]
    : 20;

  // Adaptive threshold avoids merging unrelated rows on dense receipts
  const Y_THRESHOLD = Math.max(14, Math.min(30, Math.round(medianHeight * 0.95)));

  let reconstructedText = "";

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
const MONEY_RE = /(?:£\s?|GBP\s*)?[0-9]{1,6}\.[0-9]{2}(?!\d)/g; // only amounts with decimals

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
  const FORGIVING_MONEY = /(?:^|[^A-Z0-9])((?:GBP|[£S$€¥ECT])?\s?\d{1,6}[.,]\s?\d{2})(?!\d)/gi;

  const hasNear = (lineIndex, regex, radius = 1) => {
    for (let i = Math.max(0, lineIndex - radius); i <= Math.min(lineData.length - 1, lineIndex + radius); i++) {
      if (regex.test(lineData[i])) return true;
    }
    return false;
  };

  lines.forEach((line, lineIndex) => {
    const matches = [...line.matchAll(FORGIVING_MONEY)];
    if (!matches.length) return;

    // Prevent duplicate same-value hits from the same line inflating repetition
    const seenValueInLine = new Set();

    matches.forEach((match) => {
      const raw = match[1];
      const normalized = raw.replace(/GBP/gi, "").replace(/[£S$€¥ECT\s]/gi, "").replace(",", ".");
      const val = parseFloat(normalized);
      if (Number.isNaN(val) || val <= 0 || val > 100000) return;
      const valueKey = val.toFixed(2);
      if (seenValueInLine.has(valueKey)) return;
      seenValueInLine.add(valueKey);

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

  const totalLine = lineData.findIndex(
    l => /\bTOTAL\b|\bTOTAT\b|\bTOTA1\b|\bAMOUNT\s+DUE\b|\bBALANCE\s+DUE\b/.test(l) && !/\bSUBTOTAL\b/.test(l)
  );

  const valueLines = new Map();
  candidates.forEach(c => {
    const key = c.val.toFixed(2);
    const set = valueLines.get(key) || new Set();
    set.add(c.lineIndex);
    valueLines.set(key, set);
  });

  const uniqueValues = [...new Set(candidates.map(c => c.val))].sort((a, b) => a - b);
  const median = uniqueValues[Math.floor(uniqueValues.length / 2)] || 0;
  const largest = uniqueValues[uniqueValues.length - 1] || 0;

  candidates.forEach(candidate => {
    let score = 0;
    const line = candidate.upperLine;
    const key = candidate.val.toFixed(2);
    const uniqueLineCount = (valueLines.get(key) || new Set()).size;

    const isTotalContext = /\bTOTAL\b|\bTOTAT\b|\bTOTA1\b|\bAMOUNT\s+DUE\b|\bBALANCE\s+DUE\b|\bGRAND\s+TOTAL\b/.test(line)
      || hasNear(candidate.lineIndex, /\bAMOUNT\s+DUE\b|\bBALANCE\s+DUE\b|\bGRAND\s+TOTAL\b/, 1);
    const isSubtotalContext = /\bSUBTOTAL\b|\bDISCOUNT\b|\bREFUND\b|\bTIPS?\b/.test(line)
      || hasNear(candidate.lineIndex, /\bSUBTOTAL\b|\bDISCOUNT\b|\bREFUND\b|\bTIPS?\b/, 1);
    const isVatContext = /\bVAT\b|\bTAX\b/.test(line)
      || (hasNear(candidate.lineIndex, /\bVAT\b|\bTAX\b/, 1) && !isTotalContext);
    const isPaymentContext = (hasNear(candidate.lineIndex, /\bCASH\b|\bCHANGE\b|\bTENDER\b|\bCARD\s+PAYMENT\b|\bAUTHORI[ZS]ED\b|\bAPPROVED\b|\bMASTERCARD\b|\bVISA\b|\bAID\b|\bDEBIT\b|\bSALE\b/, 1)
      || /\bAMOUNT\s+PAID\b/.test(line))
      && !/\bAMOUNT\s+DUE\b|\bBALANCE\s+DUE\b/.test(line);
    const isItemLine = /\bKID\b|\bSTEAK\b|\bCHICKEN\b|\bCOOKIE\b|\bSALAD\b|\bWINE\b|\bRUMP\b|\bPRAWN\b|\bAVOCADO\b|\bMOZZARELLA\b|\bTOMATO\b|\bSAUCE\b|\bMEAL\b|\bBAG\s+CHARGE\b/.test(line);

    if (candidate.hasCurrency) score += 25;
    if (candidate.val < 1) score -= 40;
    else if (candidate.val < 3) score -= 15;

    // Date fragments (e.g. 12.09 from 12.09.2024) are not totals
    if (/\bDATE\b|\bTIME\b/.test(line) && /\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/.test(line) && candidate.val <= 31.99) {
      score -= 260;
    }

    if (isTotalContext) score += 260;
    if (isSubtotalContext) score -= 190;
    if (isVatContext) score -= 260;
    if (isPaymentContext) score -= 140;

    if (totalLine >= 0 && candidate.lineIndex >= totalLine) {
      const distance = candidate.lineIndex - totalLine;
      if (distance <= 3) score += 140;
      else if (distance <= 12) score += 80;
      else if (distance <= 24) score += 35;
    }

    // If the line has multiple amounts and is total-like, largest on that line is usually the payable total
    if (isTotalContext) {
      const lineAmounts = candidates.filter(c => c.lineIndex === candidate.lineIndex).map(c => c.val);
      if (lineAmounts.length >= 2) {
        const lineMax = Math.max(...lineAmounts);
        if (Math.abs(candidate.val - lineMax) < 0.001) score += 190;
        else score -= 180;
      }
    }

    if (uniqueLineCount === 2) {
      const idxs = [...(valueLines.get(key) || new Set())].sort((a, b) => a - b);
      const span = idxs[1] - idxs[0];
      if (!isVatContext && !isPaymentContext) {
        if (candidate.val < 10 && !isTotalContext) {
          if (span <= 4) score += 70;
          else if (span <= 12) score += 40;
          else score += 20;
        } else {
          if (span <= 4) score += 220;
          else if (span <= 12) score += 130;
          else score += 60;
        }
      }
    } else if (uniqueLineCount >= 3 && uniqueLineCount <= 6) {
      if (!isVatContext) score += 50;
    }

    if (candidate.val === largest && largest > 10) {
      if (largest >= (median || 1) * 2.8) score += 220;
      else if (largest >= (median || 1) * 2.0) score += 130;
      else score += 60;
    }

    // Strong boost for values tied to explicit TOTAL/SALE/DEBIT lines around the total section
    if ((/\bTOTAL\b|\bTOTAT\b|\bTOTA1\b|\bAMOUNT\s+DUE\b/.test(line) || /\bSALE\b|\bDEBIT\b/.test(line)) && candidate.val >= 10) {
      score += 170;
    }

    // Small repeated item prices should not beat large final totals near the total line
    if (candidate.val < 10 && uniqueLineCount >= 2 && isItemLine && totalLine >= 0 && candidate.lineIndex <= totalLine) {
      score -= 120;
    }

    candidate.score = score;
  });

  // Cash/change relation: TOTAL + CHANGE ~= PAID. Boost TOTAL and penalize PAID.
  const valueMap = new Map();
  candidates.forEach(c => {
    const key = c.val.toFixed(2);
    if (!valueMap.has(key)) valueMap.set(key, []);
    valueMap.get(key).push(c);
  });

  const values = [...valueMap.keys()].map(v => parseFloat(v));
  for (let i = 0; i < values.length; i++) {
    for (let j = 0; j < values.length; j++) {
      for (let k = 0; k < values.length; k++) {
        const totalVal = values[i];
        const changeVal = values[j];
        const paidVal = values[k];
        if (totalVal <= 0 || changeVal <= 0 || paidVal <= 0) continue;
        if (totalVal >= paidVal || changeVal >= paidVal) continue;
        if (Math.abs((totalVal + changeVal) - paidVal) > 0.06) continue;

        const totalCandidates = valueMap.get(totalVal.toFixed(2)) || [];
        const changeCandidates = valueMap.get(changeVal.toFixed(2)) || [];
        const paidCandidates = valueMap.get(paidVal.toFixed(2)) || [];

        const hasChangeContext = changeCandidates.some(c =>
          /\bCHANGE\b/.test(c.upperLine) || hasNear(c.lineIndex, /\bCHANGE\b/, 1)
        );
        const hasPaidContext = paidCandidates.some(c =>
          /\bCASH\b|\bTENDER\b|\bCARD\b|\bPAID\b/.test(c.upperLine) || hasNear(c.lineIndex, /\bCASH\b|\bTENDER\b|\bCARD\b|\bPAID\b/, 1)
        );
        if (!hasChangeContext && !hasPaidContext) continue;

        totalCandidates.forEach(c => { c.score += 260; });
        paidCandidates.forEach(c => { c.score -= 220; });
        changeCandidates.forEach(c => { c.score -= 110; });
      }
    }
  }

  // OCR leading-digit artifact: "254.73" on TOTAL with "54.73" on SALE/CARD line
  candidates.forEach(bigCandidate => {
    if (bigCandidate.val < 100 || !/\bTOTAL\b|\bTOTAT\b|\bTOTA1\b/.test(bigCandidate.upperLine)) return;

    const cents = Math.round((bigCandidate.val % 1) * 100);
    candidates.forEach(smallCandidate => {
      if (smallCandidate.val >= bigCandidate.val) return;
      const smallCents = Math.round((smallCandidate.val % 1) * 100);
      if (cents !== smallCents) return;

      const diff = bigCandidate.val - smallCandidate.val;
      if (diff < 90 || diff > 300) return;

      const paymentLike = /\bSALE\b|\bDEBIT\b|\bCARD\b|\bVISA\b|\bMASTERCARD\b|\bAMOUNT\b|\bTOTAL\b/.test(smallCandidate.upperLine)
        || hasNear(smallCandidate.lineIndex, /\bSALE\b|\bDEBIT\b|\bCARD\b|\bVISA\b|\bMASTERCARD\b|\bAMOUNT\b/, 1);
      if (!paymentLike) return;

      bigCandidate.score -= 260;
      smallCandidate.score += 320;
    });
  });

  // Guardrail: suspiciously small totals compared with nearby repeated amounts
  const repeatedValues = [...valueLines.entries()]
    .filter(([, set]) => set.size >= 2)
    .map(([val]) => parseFloat(val));
  const strongestRepeated = repeatedValues.length ? Math.max(...repeatedValues) : 0;
  candidates.forEach(c => {
    const inStrongTotalContext = /\bTOTAL\b|\bTOTAT\b|\bTOTA1\b|\bAMOUNT\s+DUE\b|\bBALANCE\s+DUE\b/.test(c.upperLine);
    if (!inStrongTotalContext || strongestRepeated <= 0) return;
    if (c.val < strongestRepeated * 0.45 && c.val < 8) {
      c.score -= 220;
    }
  });

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const freqA = (valueLines.get(a.val.toFixed(2)) || new Set()).size;
    const freqB = (valueLines.get(b.val.toFixed(2)) || new Set()).size;
    if (freqB !== freqA) return freqB - freqA;
    return b.lineIndex - a.lineIndex;
  });

  // DEBUG: Show top candidates
  console.log('=== AMOUNT EXTRACTION DEBUG ===');
  console.log('Top candidates (sorted by score):');
  candidates.slice(0, 8).forEach((c, i) => {
    const freq = (valueLines.get(c.val.toFixed(2)) || new Set()).size;
    const freqStr = freq > 1 ? ` (appears ${freq}x)` : '';
    const nearPayment = hasNear(c.lineIndex, /\bCASH\b|\bCHANGE\b|\bTENDER\b|\bPAID\b|\bCARD\b/, 1);
    const paymentTag = nearPayment ? ' [NEAR_PAYMENT]' : '';
    console.log(`  ${i+1}. £${c.val.toFixed(2)} | Score: ${c.score} | Line ${c.lineIndex}: "${c.upperLine}"${freqStr}${paymentTag}`);
  });
  
  // DEBUG: Show TOTAL keyword location
  if (totalLine >= 0) {
    console.log(`TOTAL keyword found at line ${totalLine}`);
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

