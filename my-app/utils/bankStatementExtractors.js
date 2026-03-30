const MONTHS = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
};

const UK_BANKS = [
  "HSBC",
  "SANTANDER",
  "BARCLAYS",
  "LLOYDS",
  "NATWEST",
  "HALIFAX",
  "TSB",
  "MONZO",
  "STARLING",
  "REVOLUT",
  "METRO BANK",
  "CO-OPERATIVE BANK",
  "COOPERATIVE BANK",
  "ROYAL BANK OF SCOTLAND",
  "RBS",
  "FIRST DIRECT",
  "VIRGIN MONEY",
];

function toIsoDate(day, month, year) {
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y)) return null;
  if (d < 1 || d > 31 || m < 1 || m > 12) return null;

  const currentYear = new Date().getFullYear();
  if (y < 1990 || y > currentYear + 1) return null;

  const dt = new Date(`${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(
    d
  ).padStart(2, "0")}`);
  if (Number.isNaN(dt.getTime())) return null;
  if (dt.getUTCDate() !== d || dt.getUTCMonth() + 1 !== m || dt.getUTCFullYear() !== y) return null;

  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseAmount(raw) {
  if (!raw) return null;
  const normalized = String(raw)
    .replace(/[, ]+/g, "")
    .replace(/£|GBP/gi, "");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function parseDateToken(token) {
  const match = String(token || "").match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if (!match) return null;

  let year = Number(match[3]);
  if (year < 100) year += 2000;

  return toIsoDate(match[1], match[2], year);
}

function parseTextualDate(dayStr, monthStr, yearStr) {
  const key = String(monthStr || "").slice(0, 3).toUpperCase();
  const month = MONTHS[key];
  if (!month) return null;
  const year = Number(yearStr);
  if (!Number.isFinite(year)) return null;
  return toIsoDate(dayStr, month, year);
}

function collectNumericDates(text) {
  const matches = [...String(text || "").matchAll(/\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b/g)];
  const dates = matches
    .map((m) => parseDateToken(m[0]))
    .filter(Boolean)
    .map((iso) => new Date(iso));
  if (!dates.length) return [];
  dates.sort((a, b) => a.getTime() - b.getTime());
  return dates;
}

function parsePeriodRangeFromText(text) {
  const normalized = String(text || "").replace(/\s+/g, " ");

  const rangeMatch = normalized.match(
    /(\d{1,2})\s+([A-Za-z]{3,9})\s*(\d{4})?\s+(?:to|-|until)\s+(\d{1,2})\s+([A-Za-z]{3,9})\s*(\d{4})?/i
  );
  if (!rangeMatch) return null;

  const startYear = rangeMatch[3] || rangeMatch[6];
  const endYear = rangeMatch[6] || rangeMatch[3];
  const start = parseTextualDate(rangeMatch[1], rangeMatch[2], startYear);
  const end = parseTextualDate(rangeMatch[4], rangeMatch[5], endYear);
  if (!start || !end) return null;

  return {
    statementStartDate: start,
    statementEndDate: end,
  };
}

function extractLikelyAccountName(lines) {
  const allUpper = lines.map((line) => line.upper).join("\n");
  for (const bank of UK_BANKS) {
    if (allUpper.includes(bank)) return bank;
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!/\bACCOUNT\s*NAME\b/i.test(line.raw)) continue;

    const inline = line.raw.match(/\bACCOUNT\s*NAME\b\s*[:\-]?\s*(.+)$/i)?.[1]?.trim();
    if (inline && !/SORT\s*CODE|ACCOUNT\s*NUMBER|SHEET\s*NUMBER/i.test(inline)) {
      return inline;
    }

    const next = lines[i + 1]?.raw?.trim();
    if (next && !/SORT\s*CODE|ACCOUNT\s*NUMBER|SHEET\s*NUMBER|IBAN|BIC/i.test(next)) {
      return next;
    }
  }

  const titleLine = lines.find((line) => /^(MR|MRS|MS|MISS|DR)\b/i.test(line.raw));
  if (titleLine) return titleLine.raw;

  return null;
}

function extractAmountNearLabel(raw, upper, labelRegexes) {
  for (const regex of labelRegexes) {
    const found = upper.match(regex);
    if (!found || found.index == null) continue;

    const tail = raw.slice(found.index);
    const firstAmount = tail.match(/(?:£\s*|GBP\s*)?(\d{1,3}(?:[, ]\d{3})*(?:\.\d{2})|\d+(?:\.\d{2}))/i);
    if (firstAmount?.[1]) {
      const parsed = parseAmount(firstAmount[1]);
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return null;
}

function extractAmountsByLabels(lines, labelRegexes) {
  const found = [];
  for (const line of lines) {
    if (!labelRegexes.some((regex) => regex.test(line.upper))) continue;
    if (/\b(?:\d{1,2}\s+[A-Z]{3}|[A-Z]{3}\s+\d{1,2})\b/.test(line.upper)) continue;

    const near = extractAmountNearLabel(line.raw, line.upper, labelRegexes);
    if (Number.isFinite(near)) {
      found.push(near);
      continue;
    }

    const amounts = [...line.raw.matchAll(/(?:£\s*|GBP\s*)?(\d{1,3}(?:[, ]\d{3})*(?:\.\d{2})|\d+(?:\.\d{2}))/gi)];
    if (!amounts.length) continue;

    for (const amountMatch of amounts) {
      const amount = parseAmount(amountMatch[1]);
      if (Number.isFinite(amount)) {
        found.push(amount);
      }
    }
  }

  if (!found.length) return null;
  return Math.max(...found);
}

export function extractBankStatementData(text) {
  const lines = String(text || "")
    .split("\n")
    .map((raw) => ({ raw: raw.trim(), upper: raw.trim().toUpperCase() }))
    .filter((line) => line.raw.length > 0);

  const accountName = extractLikelyAccountName(lines);

  const rangedDates = parsePeriodRangeFromText(text);
  const allDates = collectNumericDates(text);
  let statementStartDate = rangedDates?.statementStartDate || null;
  let statementEndDate = rangedDates?.statementEndDate || null;

  if (!statementStartDate || !statementEndDate) {
    const fallbackStart = allDates.length ? allDates[0].toISOString().slice(0, 10) : null;
    const fallbackEnd = allDates.length
      ? allDates[allDates.length - 1].toISOString().slice(0, 10)
      : null;
    statementStartDate = statementStartDate || fallbackStart;
    statementEndDate = statementEndDate || fallbackEnd;
  }

  for (const line of lines) {
    const startMatch = line.raw.match(/\b(?:statement\s*start|period\s*start|from)\b[^\d]*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i);
    if (startMatch) {
      const iso = parseDateToken(startMatch[1]);
      if (iso) statementStartDate = iso;
    }

    const endMatch = line.raw.match(/\b(?:statement\s*end|period\s*end|to|until)\b[^\d]*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i);
    if (endMatch) {
      const iso = parseDateToken(endMatch[1]);
      if (iso) statementEndDate = iso;
    }
  }

  const moneyInTotal = extractAmountsByLabels(lines, [
    /\bPAYMENTS?\s*IN\b/i,
    /\bMONEY\s*IN\b/i,
    /\bTOTAL\s*IN\b/i,
    /\bCREDITS?\b/i,
    /\bPAID\s*IN\b/i,
    /\bDEPOSITS?\b/i,
  ]);

  const moneyOutTotal = extractAmountsByLabels(lines, [
    /\bPAYMENTS?\s*OUT\b/i,
    /\bPAYMENTS?\s*OU?T\b/i,
    /\bMONEY\s*OUT\b/i,
    /\bMONEY\s*OU?T\b/i,
    /\bTOTAL\s*OUT\b/i,
    /\bTOTAL\s*OU?T\b/i,
    /\bDEBITS?\b/i,
    /\bWITHDRAWALS?\b/i,
    /\bSPENT\b/i,
  ]);

  return {
    accountName,
    statementStartDate,
    statementEndDate,
    moneyInTotal,
    moneyOutTotal,
  };
}
