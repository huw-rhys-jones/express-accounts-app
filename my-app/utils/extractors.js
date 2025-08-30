import { months, expense_categories as categories, TOTAL_HINT, CURRENCY_SYMS } from '../constants/arrays';



// Money like: £1,234.56  1,234.56 GBP  (1,234.56)  -£12.00  £ 12.00
const MONEY_RE = new RegExp(
  String.raw`(?<![A-Za-z])(?:£|\$|€|GBP|USD|EUR)?\s*[-(]?\d{1,3}(?:[ ,]\d{3})*(?:\.\d{2})?\)?(?!\d)\s*(?:£|\$|€|GBP|USD|EUR)?`,
  'ig'
);

function normalizeWhitespace(s) {
  return s.replace(/\s+/g, ' ').trim();
}

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
function extractAmount(text) {
  const lines = normalizeWhitespace(text).split('\n').map(normalizeWhitespace);
  const allMatches = [...text.matchAll(MONEY_RE)];

  if (!allMatches.length) return null;

  // Build candidates with simple heuristics
  const cands = allMatches.map(m => {
    const raw = m[0];
    const val = parseAmount(raw);
    if (val == null) return null;
    // find containing line
    const line = lines.find(ln => ln.includes(raw)) || '';
    let score = 1;
    if (TOTAL_HINT.test(line)) score += 2;
    // slight preference for lines near the bottom (totals often live there)
    score += 0.001 * text.indexOf(raw);
    // de-prefer obvious “unit price” hints
    if (/\b(qty|x\s?\d+|each|unit)\b/i.test(line)) score -= 0.6;
    return { val, raw, line, score };
  }).filter(Boolean);

  if (!cands.length) return null;

  // If any total-hint candidates exist, pick the max among them; else best score overall.
  const hintCands = cands.filter(c => TOTAL_HINT.test(c.line));
  const chosen = (hintCands.length
    ? hintCands.reduce((a, c) => (c.val > a.val ? c : a))
    : cands.reduce((a, c) => (c.score > a.score ? c : a)));

  return { amount: chosen.val, display: chosen.raw };
}

// ---------- category ----------
function categoryFinder(text) {
  // categories: [{ name, meta: ['tesco','grocery', ...] }, ...]
  let best = { idx: -1, hits: 0 };

  const lower = text.toLowerCase();

  categories.forEach((cat, idx) => {
    const pats = (cat.meta || []).map(escapeForRegex);
    if (!pats.length) return;
    const re = new RegExp(`\\b(?:${pats.join('|')})\\b`, 'g');
    const matches = lower.match(re);
    const hits = matches ? matches.length : 0;
    if (hits > best.hits) best = { idx, hits };
  });

  return best.idx; // -1 if none
}

// ---------- main ----------
export function extractData(text) {
  if (!text || typeof text !== 'string') {
    return {
      money: { value: null, currency: 0 },
      date: null,
      category: -1,
    };
  }

  // Normalise \r\n just in case
  const cleaned = text.replace(/\r\n/g, '\n');

  const amountInfo = extractAmount(cleaned);
  const dateIso = extractDate(cleaned);
  const categoryIdx = categoryFinder(cleaned);

  return {
    money: {
      value: amountInfo ? amountInfo.amount : null,
      currency: 0, // keep your existing mapping if 0==GBP
      display: amountInfo ? amountInfo.display : null,
    },
    date: dateIso, // ISO string 'YYYY-MM-DD' (or null)
    category: categoryIdx,
  };
}
