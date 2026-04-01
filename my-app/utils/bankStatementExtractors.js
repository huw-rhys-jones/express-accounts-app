import { categories_meta } from "../constants/arrays";

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
  const original = String(raw);
  const normalized = original
    .replace(/[, ]+/g, "")
    .replace(/£|GBP/gi, "");
  let value = Number(normalized);

  // OCR often drops decimal separators for statement totals, e.g. "1,76310".
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
    .map((m) => ({ index: m.index ?? 0, iso: parseDateToken(m[0]) }))
    .filter((item) => Boolean(item.iso));

  const textualMatches = [
    ...String(text || "").matchAll(/\b(\d{1,2}(?:st|nd|rd|th)?)\s+([A-Za-z]{3,9})\s+(\d{4})\b/gi),
  ]
    .map((m) => ({
      index: m.index ?? 0,
      iso: parseTextualDate(m[1], m[2], m[3]),
    }))
    .filter((item) => Boolean(item.iso));

  const ordered = [...numericMatches, ...textualMatches].sort((a, b) => a.index - b.index);
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
      "i"
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

  return { statementStartDate, statementEndDate };
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
    const firstAmount = tail.match(
      /([-+−]?\s*(?:£\s*|GBP\s*)?\d{1,3}(?:[, ]\d{2,3})*(?:\.\d{2})?|[-+−]?\s*(?:£\s*|GBP\s*)?\d+(?:\.\d{2})?)/i
    );
    if (firstAmount?.[1]) {
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
    if (!match?.[1]) continue;
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
        /(?:£\s*|GBP\s*)?(\d{3,}(?:\.\d{2})?|\d{1,3}(?:[, ]\d{2,3})*(?:\.\d{2})?)/gi
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

  const plausible = found.filter((amount) => amount > 0 && amount < 1000000);
  if (!plausible.length) return found[0];
  if (plausible.length === 1) return plausible[0];

  const sorted = [...plausible].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function isLikelyTransactionLine(line) {
  const upper = String(line?.upper || "");
  if (!upper) return false;
  if (!collectOrderedDates(line.raw).length) return false;
  if (!/(?:£|GBP|\d)/i.test(line.raw)) return false;

  return !/\b(SORT\s*CODE|ACCOUNT\s*NUMBER|STATEMENT\s*DATE|OPENING\s*BALANCE|CLOSING\s*BALANCE|BALANCE\s*BROUGHT\s*FORWARD|BALANCE\s*CARRIED\s*FORWARD|AVAILABLE\s*BALANCE|MONEY\s*IN|MONEY\s*OUT|PAYMENTS?\s*IN|PAYMENTS?\s*OUT|TOTAL\s*IN|TOTAL\s*OUT|DEBITS?|CREDITS?|ARRANGED\s*OVERDRAFT|UNARRANGED\s*OVERDRAFT|ACCOUNT\s*SUMMARY|PAGE\s+\d+|IBAN|BIC)\b/i.test(upper);
}

function toTitleCase(value) {
  return String(value || "")
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function dedupeAdjacentWords(value) {
  const words = String(value || "").split(/\s+/).filter(Boolean);
  const deduped = [];
  for (const word of words) {
    if (deduped.length && deduped[deduped.length - 1].toLowerCase() === word.toLowerCase()) {
      continue;
    }
    deduped.push(word);
  }
  return deduped.join(" ");
}

function cleanVendorText(value) {
  const cleaned = String(value || "")
    .replace(/[*!]/g, " ")
    .replace(/\.(?:com|co\.uk|net|org)\b/gi, "")
    .replace(/(?:PAYPAL|PAYAL)/gi, " ")
    .replace(/\b(?:REF|REFERENCE|MANDATE|NO)\b.*$/i, "")
    .replace(/\b\d{4,}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,:;\-]+$/g, "");

  return dedupeAdjacentWords(cleaned);
}

function normaliseVendorName(description) {
  const directionPhrase = String(description || "").match(
    /\b(?:PAYMENT\s+TO|PAYMENT\s+FROM|DIRECT\s+DEBIT\s+PAYMENT\s+TO|TO|FROM)\s+(.+?)(?:\s+ON\b|\s+REF\b|\s+MANDATE\b|$)/i
  );

  const candidateFromPhrase = directionPhrase?.[1]
    ? directionPhrase[1]
        .replace(/(?:PAYPAL|PAYAL)/gi, " ")
        .replace(/\b(?:V\d+[A-Z0-9]+|PA\d+[A-Z0-9]+|J\d+[A-Z0-9]+)\b/gi, " ")
        .trim()
    : "";

  const cleanedCandidate = cleanVendorText(candidateFromPhrase);

  if (cleanedCandidate) {
    const upperCandidate = cleanedCandidate.toUpperCase();
    if (upperCandidate.includes("YOUR-SAVING")) return "your-saving";
    if (upperCandidate.includes("NATIONAL TRUST")) return "National Trust";
    if (upperCandidate.includes("AMAZON")) return "Amazon";
    return toTitleCase(cleanedCandidate);
  }

  const raw = cleanVendorText(String(description || "")
    .replace(/(?:PAYPAL|PAYAL)/gi, " ")
    .replace(/\b(?:CARD|PAYMENT|PURCHASE|TRANSFER|DIRECT\s+DEBIT|STANDING\s+ORDER|FASTER\s+PAYMENTS?|DEBIT|CREDIT|POS|CONTACTLESS|REF|REFERENCE|FPS|DD|SO|CR|DR|TO|FROM|ON)\b/gi, " ")
    .replace(/\b\d{2,}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim());

  const specialCases = [
    ["AMAZON", "Amazon"],
    ["PAYPAL", ""],
    ["UBER", "Uber"],
    ["SHELL", "Shell"],
    ["BP", "BP"],
    ["APPLEGREEN", "Applegreen"],
    ["GREGGS", "Greggs"],
    ["MCDONALDS", "McDonalds"],
    ["SCREWFIX", "Screwfix"],
    ["TOOLSTATION", "Toolstation"],
    ["HOWDENS", "Howdens"],
    ["WICKES", "Wickes"],
    ["TRAVIS PERKINS", "Travis Perkins"],
  ];

  const upper = raw.toUpperCase();
  for (const [needle, label] of specialCases) {
    if (upper.includes(needle)) return label || "Unknown vendor";
  }

  const words = raw.split(" ").filter((word) => word.length > 1).slice(0, 4);
  return words.length ? toTitleCase(words.join(" ")) : "Unknown vendor";
}

function inferCategoryFromText(text) {
  const haystack = String(text || "").toLowerCase();
  let bestMatch = { name: "Sundry items", score: 0 };

  for (const category of categories_meta) {
    let score = 0;
    for (const keyword of category.meta || []) {
      if (haystack.includes(String(keyword).toLowerCase())) {
        score += String(keyword).includes(" ") ? 3 : 1;
      }
    }

    if (score > bestMatch.score) {
      bestMatch = { name: category.name, score };
    }
  }

  return bestMatch.name;
}

function chooseTransactionAmount(amounts) {
  if (!amounts.length) return null;
  if (amounts.length === 1) return amounts[0];

  const withoutHugeValues = amounts.filter((amount) => amount < 1000000);
  const candidates = withoutHugeValues.length ? withoutHugeValues : amounts;
  const last = candidates[candidates.length - 1];
  const previous = candidates[candidates.length - 2];

  if (previous && last > previous * 3) {
    return previous;
  }

  return candidates.length >= 2 ? candidates[candidates.length - 2] : candidates[0];
}

function parseLeadingTransactionDate(raw, fallbackYear) {
  const source = String(raw || "").trim();
  if (!source) return null;

  const numeric = source.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/);
  if (numeric) {
    let year = numeric[3] ? Number(numeric[3]) : Number(fallbackYear);
    if (year < 100) year += 2000;
    return toIsoDate(numeric[1], numeric[2], year);
  }

  const textual = source.match(/^(\d{1,2}(?:st|nd|rd|th)?)\s+([A-Za-z]{3})[A-Za-z]*(?:\s+(\d{4}))?\b/i);
  if (textual) {
    const year = textual[3] ? Number(textual[3]) : Number(fallbackYear);
    if (!Number.isFinite(year)) return null;
    return parseTextualDate(textual[1], textual[2], year);
  }

  return null;
}

function extractTransactionAmounts(raw) {
  const normalizedRaw = String(raw || "")
    .replace(/(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})(?=\d)/g, "$1 ")
    .replace(/(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9})(?=\d)/gi, "$1 ");

  const joinedAmountAndBalance = normalizedRaw.match(
    /(\d{1,3}(?:,\d{3})*\.\d{2})(\d{1,3}(?:,\d{3})*\.\d{2})\b/
  );
  if (joinedAmountAndBalance) {
    const first = parseAmount(joinedAmountAndBalance[1]);
    const second = parseAmount(joinedAmountAndBalance[2]);
    const parsedPair = [first, second].filter((value) => Number.isFinite(value) && value > 0);
    if (parsedPair.length >= 2) {
      return parsedPair;
    }
  }

  const matches = [
    ...normalizedRaw.matchAll(
      /([-+−]?\s*(?:£\s*|GBP\s*)?(?:\d{1,3}(?:[, ]\d{2,3})+|\d+)(?:\.\d{2})?)/gi
    ),
  ];

  const amounts = [];
  for (const match of matches) {
    const token = String(match[1] || "").trim();
    if (!token) continue;

    const hasMoneySignal = /£|GBP|\.\d{2}|,\d{3}/i.test(token);
    if (!hasMoneySignal) continue;

    const parsed = parseAmount(token.replace(/−/g, "-"));
    if (!Number.isFinite(parsed) || parsed <= 0) continue;
    amounts.push(parsed);
  }

  return amounts;
}

function isDatePrefixedLine(value) {
  return /^(?:\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3}[A-Za-z]*|\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?)\b/i.test(
    String(value || "").trim()
  );
}

function parseVendorFromDescription(description) {
  const text = String(description || "");

  if (/\bCREDIT\s+CARD\s+PAYMENT\b/i.test(text)) {
    return "Credit card payment";
  }

  const patterns = [
    /\bDIRECT\s+DEBIT\s+PAYMENT\s+TO\s+(.+?)(?:\s+REF\b|\s+MANDATE\b|\s+ON\b|$)/i,
    /\bCARD\s+PAYMENT\s+TO\s+(.+?)(?:\s+ON\b|\s+REF\b|$)/i,
    /\bBILL\s+PAYMENT\s+VIA\s+FASTER\s+PAYMENT\s+TO\s+(.+?)(?:\s+REFERENCE\b|\s+MANDATE\b|$)/i,
    /\bTHIRD\s+PARTY\s+PAYMENT\s+MADE\s+VIA\s+FASTER\s+PAYMENT\s+TO\s+(.+?)(?:\s+REFERENCE\b|$)/i,
    /\bFASTER\s+PAYMENTS?\s+RECEIPT\b.*?\bFROM\s+(.+?)(?:\s+REF\b|$)/i,
    /\bBANK\s+GIRO\s+CREDIT\s+REF\s+(.+?)(?:,|\s+REF\b|$)/i,
  ];

  let vendor = "";
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      vendor = match[1];
      break;
    }
  }

  if (!vendor) {
    vendor = normaliseVendorName(text);
  }

  vendor = cleanVendorText(vendor);

  if (!vendor || /^(?:un?known|unkown)\s+vendor$/i.test(vendor)) return "Unknown vendor";

  const upper = vendor.toUpperCase();
  if (upper.includes("YOUR-SAVING")) return "your-saving";
  if (upper.includes("NATIONAL TRUST")) return "National Trust";
  if (upper.includes("ATKINSREALIS")) return "Atkinsrealis";
  if (upper.includes("AMZN") || upper.includes("AMAZON")) return "Amazon";

  return toTitleCase(vendor);
}

function extractTransactionsFromTableText(text, { statementStartDate, statementEndDate } = {}) {
  const rawLines = String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (!rawLines.length) return [];

  const fallbackYear =
    Number(String(statementEndDate || statementStartDate || "").slice(0, 4)) ||
    new Date().getFullYear();

  const startIndex = rawLines.findIndex((line) => /\bYOUR\s+TRANSACTIONS\b/i.test(line));
  if (startIndex < 0) return [];

  const tableLines = [];
  for (let i = startIndex + 1; i < rawLines.length; i += 1) {
    const line = rawLines[i];
    if (/\bBALANCE\s+CARRIED\s+FORWARD\s+TO\s+NEXT\s+STATEMENT\b/i.test(line)) {
      tableLines.push(line);
      break;
    }
    tableLines.push(line);
  }

  const cleaned = tableLines.filter(
    (line) =>
      !/^(?:DATE\s*DESCRIPTION|DATE\b|PAGE\s+NUMBER\b|ACCOUNT\s+NAME:|ACCOUNT\s+NUMBER:|STATEMENT\s+NUMBER:|MONEY\s+IN\b|MONEY\s+OUT\b|£\s*BALANCE\b)/i.test(
        line
      )
  );

  const stitchedRows = [];
  let current = "";
  for (const line of cleaned) {
    if (isDatePrefixedLine(line)) {
      if (current) stitchedRows.push(current);
      current = line;
    } else if (current) {
      current = `${current} ${line}`.replace(/\s+/g, " ").trim();
    }
  }
  if (current) stitchedRows.push(current);

  function normalizeRowForAmounts(row) {
    return String(row || "")
      .replace(/(\d{2}[\/.-]\d{2}[\/.-]\d{4})(?=\d)/g, "$1 ")
      .replace(/(\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec))(?=[A-Za-z])/gi, "$1 ")
      .replace(/(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}\s+\d{4})(?=\d)/gi, "$1 ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function extractAmountAndBalance(normalizedRow) {
    const tailTokens = [...String(normalizedRow || "").matchAll(/(\d[\d,]*\.\d{2})/g)]
      .map((match) => match[1])
      .filter(Boolean);

    if (tailTokens.length < 2) return null;

    const balanceToken = tailTokens[tailTokens.length - 1];
    let amountToken = tailTokens[tailTokens.length - 2];

    let amountValue = parseAmount(amountToken);
    const balanceValue = parseAmount(balanceToken);

    // Repair OCR collisions like "3241792,872.093,473.12" where reference digits join amount.
    if (!Number.isFinite(amountValue) || amountValue > 1000000) {
      const rescue = String(normalizedRow).match(
        /(\d{1,4}(?:,\d{3})?\.\d{2})(?=\d{1,3}(?:,\d{3})*\.\d{2}\s*$)/
      );
      if (rescue?.[1]) {
        amountToken = rescue[1];
        amountValue = parseAmount(amountToken);
      }
    }

    if (!Number.isFinite(amountValue) || !Number.isFinite(balanceValue)) return null;

    return {
      amount: amountValue,
      balance: balanceValue,
    };
  }

  function repairAmountToken(token) {
    let value = String(token || "").trim();
    if (!value) return null;

    // OCR can glue long reference prefixes before comma/amount.
    if ((value.match(/,/g) || []).length >= 2) {
      value = value.slice(value.lastIndexOf(",") + 1);
    }

    // OCR can glue trailing year from "ON dd-mm-yyyy" into the amount, e.g. 202696.00 -> 96.00.
    if (/^(?:19|20)\d{2}\d+\.\d{2}$/.test(value)) {
      value = value.slice(4);
    }

    return parseAmount(value);
  }

  const transactions = [];
  let previousBalance = null;
  for (const row of stitchedRows) {
    if (/\bBALANCE\s+BROUGHT\s+FORWARD\b/i.test(row)) {
      const openingBalanceMatch = [...row.matchAll(/(\d[\d,]*\.\d{2})/g)].pop();
      const openingBalance = openingBalanceMatch?.[1] ? parseAmount(openingBalanceMatch[1]) : null;
      if (Number.isFinite(openingBalance) && openingBalance > 0) {
        previousBalance = openingBalance;
      }
      continue;
    }

    if (/\bBALANCE\s+CARRIED\s+FORWARD\b/i.test(row)) continue;

    const normalizedRow = normalizeRowForAmounts(row);
    const transactionDate = parseLeadingTransactionDate(normalizedRow, fallbackYear);
    if (!transactionDate) continue;

    const parsedTail = extractAmountAndBalance(normalizedRow);
    if (!parsedTail) continue;

    const rawAmountToken = [...normalizedRow.matchAll(/(\d[\d,]*\.\d{2})/g)]
      .map((match) => match[1])
      .slice(-2)[0];

    const repairedAmount = repairAmountToken(rawAmountToken);
    const currentBalance = Number(parsedTail.balance);
    if (!Number.isFinite(currentBalance) || currentBalance <= 0) continue;

    const description = normalizedRow
      .replace(/^\s*\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?\s*/i, "")
      .replace(/^\s*\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[A-Za-z]*(?:\s+\d{4})?\s*/i, "")
      .replace(/\d[\d,]*\.\d{2}/g, " ")
      .replace(/\bBALANCE\s+CARRIED\s+FORWARD.*$/i, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!description) continue;

    let direction = "out";
    if (/\b(BANK\s+GIRO\s+CREDIT|FASTER\s+PAYMENTS?\s+RECEIPT|\bFROM\b|\bCREDIT\b)\b/i.test(description)) {
      direction = "in";
    }

    let amountFromBalance = null;
    if (Number.isFinite(previousBalance)) {
      const delta = Number((currentBalance - previousBalance).toFixed(2));
      if (delta > 0) {
        amountFromBalance = delta;
        direction = "in";
      } else if (delta < 0) {
        amountFromBalance = Math.abs(delta);
        direction = "out";
      }
    }

    const amount = Number(
      (Number.isFinite(amountFromBalance) && amountFromBalance > 0
        ? amountFromBalance
        : repairedAmount || parsedTail.amount || 0).toFixed(2)
    );
    if (!Number.isFinite(amount) || amount <= 0) {
      previousBalance = currentBalance;
      continue;
    }

    const vendor = parseVendorFromDescription(description);
    const category = direction === "out"
      ? inferCategoryFromText(`${vendor} ${description}`)
      : "Income";

    transactions.push({
      id: `${transactionDate}-${vendor}-${transactions.length}`,
      date: transactionDate,
      description,
      vendor,
      paymentLabel: direction === "in" ? "from" : "to",
      amount: Number(amount.toFixed(2)),
      direction,
      category,
    });

    previousBalance = currentBalance;
  }

  return transactions;
}

function extractTransactions(lines, { statementStartDate, statementEndDate } = {}) {
  const transactions = [];
  const fallbackYear =
    Number(String(statementEndDate || statementStartDate || "").slice(0, 4)) ||
    new Date().getFullYear();

  for (const line of lines) {
    if (!isLikelyTransactionLine(line)) continue;

    if (/\b(YOUR\s+TRANSACTIONS?|YOUR\s+BALANCE\s+AT\s+CLOSE|ACCOUNT\s+SUMMARY)\b/i.test(line.upper)) {
      continue;
    }

    const transactionDate = parseLeadingTransactionDate(line.raw, fallbackYear);
    const amountMatches = extractTransactionAmounts(line.raw);

    const amount = chooseTransactionAmount(amountMatches);
    if (!transactionDate || !Number.isFinite(amount) || amount <= 0) continue;

    const description = line.raw
      .replace(/^\s*\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?\s*/, "")
      .replace(/^\s*\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[A-Za-z]*(?:\s+\d{4})?\s*/i, "")
      .replace(/(?:£\s*|GBP\s*)?\d{1,3}(?:[, ]\d{2,3})*(?:\.\d{2})?/g, " ")
      .replace(/\b(?:CR|DR)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!description) continue;

    let direction = "out";
    if (/\b(CR|CREDIT|PAID\s*IN|FROM|REFUND|RECEIVED|DEPOSIT|SALARY|INTEREST)\b/i.test(line.upper)) {
      direction = "in";
    } else if (/\b(DR|DEBIT|CARD|PURCHASE|POS|PAYMENT\s+TO|DIRECT\s+DEBIT|STANDING\s+ORDER|WITHDRAWAL|ATM)\b/i.test(line.upper)) {
      direction = "out";
    }

    const vendor = normaliseVendorName(description);
    const category = direction === "out"
      ? inferCategoryFromText(`${vendor} ${description}`)
      : "Income";
    const paymentLabel = direction === "in" ? "from" : "to";

    transactions.push({
      id: `${transactionDate}-${vendor}-${transactions.length}`,
      date: transactionDate,
      description,
      vendor,
      paymentLabel,
      amount: Number(amount.toFixed(2)),
      direction,
      category,
    });
  }

  return transactions;
}

function summariseTransactions(transactions) {
  const vendorMap = new Map();
  const categoryMap = new Map();

  for (const transaction of transactions) {
    const currentVendor = vendorMap.get(transaction.vendor) || {
      vendor: transaction.vendor,
      count: 0,
      moneyIn: 0,
      moneyOut: 0,
      category: transaction.category,
    };

    currentVendor.count += 1;
    if (transaction.direction === "in") {
      currentVendor.moneyIn += transaction.amount;
    } else {
      currentVendor.moneyOut += transaction.amount;
      categoryMap.set(
        transaction.category,
        (categoryMap.get(transaction.category) || 0) + transaction.amount
      );
    }

    vendorMap.set(transaction.vendor, currentVendor);
  }

  return {
    vendorTotals: Array.from(vendorMap.values())
      .map((entry) => ({
        ...entry,
        moneyIn: Number(entry.moneyIn.toFixed(2)),
        moneyOut: Number(entry.moneyOut.toFixed(2)),
      }))
      .sort((left, right) => (right.moneyOut + right.moneyIn) - (left.moneyOut + left.moneyIn)),
    categoryTotals: Array.from(categoryMap.entries())
      .map(([category, total]) => ({ category, total: Number(total.toFixed(2)) }))
      .sort((left, right) => right.total - left.total),
  };
}

export function extractBankStatementData(text) {
  const lines = String(text || "")
    .split("\n")
    .map((raw) => ({ raw: raw.trim(), upper: raw.trim().toUpperCase() }))
    .filter((line) => line.raw.length > 0);

  const accountName = extractLikelyAccountName(lines);

  const rangedDates = parsePeriodRangeFromText(text);
  const lineDates = extractStatementDatesFromLines(lines);
  const allDates = collectNumericDates(text);
  let statementStartDate = rangedDates?.statementStartDate || lineDates.statementStartDate || null;
  let statementEndDate = rangedDates?.statementEndDate || lineDates.statementEndDate || null;

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
    const fallbackEnd = allDates.length
      ? allDates[allDates.length - 1].toISOString().slice(0, 10)
      : null;
    statementStartDate = statementStartDate || fallbackStart;
    statementEndDate = statementEndDate || fallbackEnd;
  }

  const transactionsFromTable = extractTransactionsFromTableText(text, {
    statementStartDate,
    statementEndDate,
  });
  const transactions = transactionsFromTable.length
    ? transactionsFromTable
    : extractTransactions(lines, {
      statementStartDate,
      statementEndDate,
    });
  const { vendorTotals, categoryTotals } = summariseTransactions(transactions);

  const transactionMoneyIn = transactions
    .filter((item) => item.direction === "in")
    .reduce((sum, item) => sum + item.amount, 0);
  const transactionMoneyOut = transactions
    .filter((item) => item.direction === "out")
    .reduce((sum, item) => sum + item.amount, 0);

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

  if ((!statementStartDate || !statementEndDate) && transactions.length) {
    const transactionDates = transactions
      .map((item) => new Date(item.date))
      .filter((value) => !Number.isNaN(value.getTime()))
      .sort((left, right) => left.getTime() - right.getTime());

    if (transactionDates.length) {
      statementStartDate = statementStartDate || transactionDates[0].toISOString().slice(0, 10);
      statementEndDate = statementEndDate || transactionDates[transactionDates.length - 1].toISOString().slice(0, 10);
    }
  }

  if (
    Number.isFinite(transactionMoneyIn) &&
    transactionMoneyIn > 0 &&
    (!Number.isFinite(moneyInTotal) || moneyInTotal <= 0 || moneyInTotal > transactionMoneyIn * 5)
  ) {
    moneyInTotal = Number(transactionMoneyIn.toFixed(2));
  }

  if (
    Number.isFinite(transactionMoneyOut) &&
    transactionMoneyOut > 0 &&
    (!Number.isFinite(moneyOutTotal) || moneyOutTotal <= 0 || moneyOutTotal > transactionMoneyOut * 5)
  ) {
    moneyOutTotal = Number(transactionMoneyOut.toFixed(2));
  }

  return {
    accountName,
    statementStartDate,
    statementEndDate,
    moneyInTotal,
    moneyOutTotal,
    transactions,
    vendorTotals,
    categoryTotals,
    rawText: String(text || "").trim(),
  };
}
