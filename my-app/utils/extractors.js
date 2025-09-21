import { months, categories_meta, TOTAL_HINT, CURRENCY_SYMS } from '../constants/arrays';



// Money like: £1,234.56  1,234.56 GBP  (1,234.56)  -£12.00  £ 12.00
// const MONEY_RE = new RegExp(
//   String.raw`(?<![A-Za-z])(?:£|\$|€|GBP|USD|EUR)?\s*[-(]?\d{1,3}(?:[ ,]\d{3})*(?:\.\d{2})?\)?(?!\d)\s*(?:£|\$|€|GBP|USD|EUR)?`,
//   'ig'
// );

// function normalizeWhitespace(s) {
//   return s.replace(/\s+/g, ' ').trim();
// }

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

function extractAmount(text) {
  const lines = normalizeWhitespace(text).split("\n").map(normalizeWhitespace);
  const allMatches = [...text.matchAll(MONEY_RE)];

  if (!allMatches.length) return null;

  const cands = allMatches
    .map((m) => {
      const raw = m[0];
      const val = parseFloat(raw.replace(/[^\d.]/g, "")); // strip £, GBP, etc.
      if (isNaN(val)) return null;

      const line = lines.find((ln) => ln.includes(raw)) || "";
      let score = 1;

      if (/total|amount|balance|paid/i.test(line)) score += 3;
      if (/change|vat|tax/i.test(line)) score -= 1;

      if (/£|gbp/i.test(raw)) score += 2;
      else score -= 0.5;

      score += 0.001 * text.indexOf(raw);

      if (val > 10000 && !/total|amount|balance|paid/i.test(line)) score -= 5;

      return { val, raw, line, score };
    })
    .filter(Boolean);

  if (!cands.length) return null;

  const totalCands = cands.filter((c) => /total|amount|balance|paid/i.test(c.line));
  const chosen = totalCands.length
    ? totalCands.reduce((a, c) => (c.val > a.val ? c : a))
    : cands.reduce((a, c) => (c.score > a.score ? c : a));

  // always return with 2 dp
  return { 
    amount: Number(chosen.val.toFixed(2)), 
    display: `£${chosen.val.toFixed(2)}` 
  };
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


// ---------- VAT extraction (robust) ----------
function extractVAT(text, amountInfo, categoryIdx) {
  if (!text) return { value: null, rate: null };

  const cleaned = text.replace(/\r\n/g, "\n");
  const lines = cleaned.split("\n").map(l => l.trim()).filter(Boolean);

  // 1) Structured table: "Vat Rate  Incl  Excl  Amount"
  const hdrIdx = lines.findIndex(l =>
    /vat\s*rate.*incl.*excl.*amount/i.test(l)
  );
  if (hdrIdx >= 0 && lines[hdrIdx + 1]) {
    // Try next 1–3 lines (some receipts put values a couple of lines below)
    for (let i = 1; i <= 3 && hdrIdx + i < lines.length; i++) {
      const row = lines[hdrIdx + i];
      // collect all money-like numbers (allow £, decimals)
      const nums = (row.match(/£?\s*\d+\.\d{2}/g) || []).map(s =>
        parseFloat(s.replace(/[£\s]/g, ""))
      );
      // Some receipts put rate as a number with 2 dp, sometimes % is absent.
      const rateMatch = row.match(/(\d{1,2}(?:\.\d{1,2})?)\s*(?:%|$)/);
      const possibleRate = rateMatch ? parseFloat(rateMatch[1]) : null;

      // Heuristic: we expect at least Incl, Excl, VAT columns.
      // Many show: [rate, incl, excl, vat] or just [incl, excl, vat].
      if (nums.length >= 3) {
        const vatVal = nums[nums.length - 1]; // last number is usually VAT Amount
        const rateVal =
          possibleRate != null && possibleRate <= 25 ? possibleRate : null;
        return { value: parseFloat(vatVal.toFixed(2)), rate: rateVal };
      }
    }
  }

  // 2) Explicit "VAT amount" lines (ignore VAT No)
  for (const l of lines) {
    if (/vat\s*no\b/i.test(l)) continue; // skip VAT No
    // "VAT amount £4.63", "VAT: £4.63", "VAT £4.63"
    const m =
      l.match(/vat(?!\s*no)[^0-9£]*(£?\s*\d+\.\d{2})/i) ||
      l.match(/(£\s*\d+\.\d{2})\s*vat\b/i);
    if (m) {
      const val = parseFloat(m[1].replace(/[£\s]/g, ""));
      if (isFinite(val)) return { value: parseFloat(val.toFixed(2)), rate: null };
    }
  }

  // 3) A rate near the word VAT → compute VAT from gross amount (if we have it)
  // e.g. "20.00% VAT", "VAT 20%"
  let rate = null;
  const rateFromText =
    cleaned.match(/(?:vat[^%\n]{0,12})?(\d{1,2}(?:\.\d{1,2})?)\s*%/i) ||
    cleaned.match(/(\d{1,2}(?:\.\d{1,2})?)\s*%\s*vat/i);
  if (rateFromText) {
    const r = parseFloat(rateFromText[1]);
    if (isFinite(r) && r <= 25) rate = r;
  }

  if (rate != null && amountInfo?.amount) {
    const gross = amountInfo.amount;
    const net = gross / (1 + rate / 100);
    const vat = gross - net;
    return { value: parseFloat(vat.toFixed(2)), rate };
  }

  // 4) Fallback to category default
  if (categoryIdx >= 0) {
    const catRate = categories_meta[categoryIdx]?.vatRate;
    if (isFinite(catRate) && amountInfo?.amount) {
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

