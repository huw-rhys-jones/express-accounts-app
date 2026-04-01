/* eslint-disable max-len, require-jsdoc, no-useless-escape */
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
      d,
  ).padStart(2, "0")}`);
  if (Number.isNaN(dt.getTime())) return null;
  if (dt.getUTCDate() !== d || dt.getUTCMonth() + 1 !== m || dt.getUTCFullYear() !== y) {
    return null;
  }

  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseAmount(raw) {
  if (!raw) return null;
  const original = String(raw);
  const normalized = original
      .replace(/[, ]+/g, "")
      .replace(/£|GBP/gi, "");
  let value = Number(normalized);

  if (
    Number.isFinite(value) &&
    !/[.]/.test(original) &&
    /[, ]/.test(original) &&
    /\d{2}$/.test(normalized) &&
    Number.isInteger(value) &&
    value >= 1000
  ) {
    value = value / 100;
  }

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
  const day = String(dayStr || "").replace(/(st|nd|rd|th)$/i, "");
  const key = String(monthStr || "").slice(0, 3).toUpperCase();
  const month = MONTHS[key];
  if (!month) return null;
  const year = Number(yearStr);
  if (!Number.isFinite(year)) return null;
  return toIsoDate(day, month, year);
}

function collectOrderedDates(text) {
  const numericMatches = [...String(text || "").matchAll(/\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b/g)]
      .map((m) => ({index: m.index || 0, iso: parseDateToken(m[0])}))
      .filter((item) => Boolean(item.iso));

  const textualMatches = [
    ...String(text || "").matchAll(/\b(\d{1,2}(?:st|nd|rd|th)?)\s+([A-Za-z]{3,9})\s+(\d{4})\b/gi),
  ]
      .map((m) => ({
        index: m.index || 0,
        iso: parseTextualDate(m[1], m[2], m[3]),
      }))
      .filter((item) => Boolean(item.iso));

  const ordered = [...numericMatches, ...textualMatches]
      .sort((a, b) => a.index - b.index);

  return ordered.reduce((dates, item) => {
    if (!item.iso || dates[dates.length - 1] === item.iso) return dates;
    dates.push(item.iso);
    return dates;
  }, []);
}

function collectNumericDates(text) {
  const dates = collectOrderedDates(text).map((iso) => new Date(iso));
  if (!dates.length) return [];
  dates.sort((a, b) => a.getTime() - b.getTime());
  return dates;
}

function parsePeriodRangeFromText(text) {
  const normalized = String(text || "").replace(/\s+/g, " ");
  const dateToken =
    "(?:\\d{1,2}[\\/.-]\\d{1,2}[\\/.-]\\d{2,4}|\\d{1,2}(?:st|nd|rd|th)?\\s+[A-Za-z]{3,9}\\s+\\d{4})";
  const patterns = [
    new RegExp(
        `\\b(?:from|between|covering|statement\\s*period|period|account\\s*summary\\s*for)\\b.{0,40}?${dateToken}.{0,40}?(?:to|and|until|-)\\s*${dateToken}`,
        "i",
    ),
    new RegExp(`${dateToken}\\s+(?:to|and|until|-)\\s+${dateToken}`, "i"),
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;
    const orderedDates = collectOrderedDates(match[0]);
    if (orderedDates.length >= 2) {
      return {
        statementStartDate: orderedDates[0],
        statementEndDate: orderedDates[orderedDates.length - 1],
      };
    }
  }

  return null;
}

function extractStatementDatesFromLines(lines) {
  let statementStartDate = null;
  let statementEndDate = null;

  for (const line of lines) {
    const orderedDates = collectOrderedDates(line.raw);
    if (!orderedDates.length) continue;

    if (
      orderedDates.length >= 2 &&
      /\b(?:statement|period|range|from|between|to|until|and|covering)\b/i.test(line.raw)
    ) {
      statementStartDate = statementStartDate || orderedDates[0];
      statementEndDate = statementEndDate || orderedDates[orderedDates.length - 1];
      continue;
    }

    if (!statementStartDate && /\b(?:start\s*date|opening\s*date|from)\b/i.test(line.raw)) {
      statementStartDate = orderedDates[0];
    }

    if (
      !statementEndDate &&
      /\b(?:statement\s*date|statement\s*end|end\s*date|closing\s*date|to|until)\b/i.test(line.raw)
    ) {
      statementEndDate = orderedDates[orderedDates.length - 1];
    }
  }

  return {statementStartDate, statementEndDate};
}

function extractLikelyAccountName(lines) {
  const allUpper = lines.map((line) => line.upper).join("\n");
  for (const bank of UK_BANKS) {
    if (allUpper.includes(bank)) return bank;
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!/\bACCOUNT\s*NAME\b/i.test(line.raw)) continue;

    const inlineMatch = line.raw.match(/\bACCOUNT\s*NAME\b\s*[:\-]?\s*(.+)$/i);
    const inline = inlineMatch && inlineMatch[1] ? inlineMatch[1].trim() : "";
    if (inline && !/SORT\s*CODE|ACCOUNT\s*NUMBER|SHEET\s*NUMBER/i.test(inline)) {
      return inline;
    }

    const nextLine = lines[i + 1];
    const next = nextLine && nextLine.raw ? nextLine.raw.trim() : "";
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
    const firstAmount = tail.match(
        /([-+−]?\s*(?:£\s*|GBP\s*)?\d{1,3}(?:[, ]\d{2,3})*(?:\.\d{2})?|[-+−]?\s*(?:£\s*|GBP\s*)?\d+(?:\.\d{2})?)/i,
    );
    if (firstAmount && firstAmount[1]) {
      const parsed = parseAmount(firstAmount[1].replace(/−/g, "-"));
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return null;
}

function extractExplicitSummaryAmount(lines, regexes) {
  for (const line of lines) {
    if (!regexes.some((regex) => regex.test(line.raw))) continue;
    const match = line.raw.match(/[:\-]?\s*([-+−]?\s*(?:£\s*|GBP\s*)?\d{1,3}(?:[, ]\d{2,3})*(?:\.\d{2})?)/i);
    if (!match || !match[1]) continue;
    const parsed = parseAmount(match[1].replace(/−/g, "-"));
    if (Number.isFinite(parsed)) return Math.abs(parsed);
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

    const amounts = [
      ...line.raw.matchAll(
          /(?:£\s*|GBP\s*)?(\d{3,}(?:\.\d{2})?|\d{1,3}(?:[, ]\d{2,3})*(?:\.\d{2})?)/gi,
      ),
    ];
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

function extractBankStatementData(text) {
  const lines = String(text || "")
      .split("\n")
      .map((raw) => ({raw: raw.trim(), upper: raw.trim().toUpperCase()}))
      .filter((line) => line.raw.length > 0);

  const accountName = extractLikelyAccountName(lines);

  const rangedDates = parsePeriodRangeFromText(text);
  const lineDates = extractStatementDatesFromLines(lines);
  const allDates = collectNumericDates(text);
  let statementStartDate = rangedDates ? rangedDates.statementStartDate : lineDates.statementStartDate;
  let statementEndDate = rangedDates ? rangedDates.statementEndDate : lineDates.statementEndDate;

  for (const line of lines) {
    const orderedDates = collectOrderedDates(line.raw);
    if (!orderedDates.length) continue;

    if (
      !statementStartDate &&
      /\b(?:statement\s*start|period\s*start|start\s*date|opening\s*date|from|between)\b/i.test(line.raw)
    ) {
      statementStartDate = orderedDates[0];
    }

    if (
      !statementEndDate &&
      /\b(?:statement\s*date|statement\s*end|period\s*end|end\s*date|closing\s*date|to|until)\b/i.test(line.raw)
    ) {
      statementEndDate = orderedDates[orderedDates.length - 1];
    }
  }

  if (!statementStartDate || !statementEndDate) {
    const fallbackStart = allDates.length ? allDates[0].toISOString().slice(0, 10) : null;
    const fallbackEnd = allDates.length ?
      allDates[allDates.length - 1].toISOString().slice(0, 10) :
      null;
    statementStartDate = statementStartDate || fallbackStart;
    statementEndDate = statementEndDate || fallbackEnd;
  }

  let moneyInTotal = extractAmountsByLabels(lines, [
    /\bPAYMENTS?\s*IN\b/i,
    /\bMONEY\s*IN\b/i,
    /\bTOTAL\s*IN\b/i,
    /\bCREDITS?\b/i,
    /\bPAID\s*IN\b/i,
    /\bDEPOSITS?\b/i,
  ]);

  let moneyOutTotal = extractAmountsByLabels(lines, [
    /\bPAYMENTS?\s*OUT\b/i,
    /\bPAYMENTS?\s*OU?T\b/i,
    /\bPAYMENTS?\s*[O0][UO]?T\b/i,
    /\bMONEY\s*OUT\b/i,
    /\bMONEY\s*OU?T\b/i,
    /\bMONEY\s*[O0][UO]?T\b/i,
    /\bTOTAL\s*OUT\b/i,
    /\bTOTAL\s*OU?T\b/i,
    /\bTOTAL\s*[O0][UO]?T\b/i,
    /\bDEBITS?\b/i,
    /\bWITHDRAWALS?\b/i,
    /\bSPENT\b/i,
  ]);

  const explicitMoneyIn = extractExplicitSummaryAmount(lines, [
    /\bTOTAL\s+MONEY\s+IN\b/i,
    /\bTOTAL\s+PAYMENTS?\s+IN\b/i,
  ]);
  if (Number.isFinite(explicitMoneyIn)) {
    moneyInTotal = explicitMoneyIn;
  }

  const explicitMoneyOut = extractExplicitSummaryAmount(lines, [
    /\bTOTAL\s+MONEY\s+OUT\b/i,
    /\bTOTAL\s+MONEY\s+OU?T\b/i,
    /\bTOTAL\s+PAYMENTS?\s+OUT\b/i,
    /\bTOTAL\s+PAYMENTS?\s+OU?T\b/i,
  ]);
  if (Number.isFinite(explicitMoneyOut)) {
    moneyOutTotal = explicitMoneyOut;
  }

  return {
    accountName,
    statementStartDate,
    statementEndDate,
    moneyInTotal,
    moneyOutTotal,
  };
}

module.exports = {
  extractBankStatementData,
};
