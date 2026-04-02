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

const UK_CARD_ISSUERS = [
  "AMERICAN EXPRESS",
  "AMEX",
  "BARCLAYCARD",
  "CAPITAL ONE",
  "MBNA",
  "VANQUIS",
  "NEWDAY",
  "TESCO BANK",
  "M&S BANK",
  "SANTANDER",
  "LLOYDS",
  "HALIFAX",
  "NATWEST",
  "HSBC",
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

function toTitleCase(value) {
  return String(value || "")
      .toLowerCase()
      .split(" ")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
}

function toDisplayIssuerName(value) {
  const issuer = String(value || "").trim();
  if (!issuer) return "";
  if (/^AMEX$/i.test(issuer)) return "Amex";
  if (/^AMERICAN EXPRESS$/i.test(issuer)) return "American Express";
  if (/^BARCLAYCARD$/i.test(issuer)) return "Barclaycard";
  return toTitleCase(issuer);
}

function extractLikelyAccountName(lines) {
  const allUpper = lines.map((line) => line.upper).join("\n");
  const matchedBank = UK_BANKS.find((bank) => allUpper.includes(bank));
  const matchedIssuer = UK_CARD_ISSUERS.find((issuer) => allUpper.includes(issuer));

  for (const line of lines) {
    const cardEndingMatch = line.raw.match(
        /\b(?:card|account)\s+(?:ending|number)\b[^\d]*(?:\*+\s*)?(\d{4})\b/i,
    );
    if (cardEndingMatch && cardEndingMatch[1]) {
      const issuerLabel = toDisplayIssuerName(matchedIssuer || matchedBank || "Credit Card");
      return `${issuerLabel} •••• ${cardEndingMatch[1]}`;
    }
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

  if (matchedIssuer) {
    return `${toDisplayIssuerName(matchedIssuer)} Credit Card`;
  }

  if (matchedBank) {
    return matchedBank;
  }

  const titleLine = lines.find((line) => /^(MR|MRS|MS|MISS|DR)\b/i.test(line.raw));
  if (titleLine) return titleLine.raw;

  return null;
}

function detectStatementType(text, lines) {
  const haystack = [String(text || ""), ...lines.map((line) => line.raw || "")].join("\n").toUpperCase();
  let creditScore = 0;
  let bankScore = 0;

  const creditSignals = [
    [/\bCREDIT\s+CARD\b/g, 4],
    [/\bCARD\s+ENDING\b/g, 3],
    [/\bPAYMENT\s+DUE(?:\s+DATE)?\b/g, 3],
    [/\bMINIMUM\s+PAYMENT\b/g, 3],
    [/\bCREDIT\s+LIMIT\b/g, 3],
    [/\bAVAILABLE\s+(?:CREDIT|TO\s+SPEND)\b/g, 3],
    [/\bSTATEMENT\s+BALANCE\b/g, 3],
    [/\bNEW\s+BALANCE\b/g, 3],
  ];

  const bankSignals = [
    [/\bSORT\s*CODE\b/g, 4],
    [/\bACCOUNT\s*NUMBER\b/g, 3],
    [/\bIBAN\b/g, 2],
    [/\bBIC\b/g, 2],
    [/\bOVERDRAFT\b/g, 2],
    [/\bMONEY\s+IN\b/g, 2],
    [/\bMONEY\s+OUT\b/g, 2],
  ];

  for (const [pattern, weight] of creditSignals) {
    if (pattern.test(haystack)) creditScore += weight;
  }

  for (const [pattern, weight] of bankSignals) {
    if (pattern.test(haystack)) bankScore += weight;
  }

  return creditScore >= 4 && creditScore >= bankScore ? "credit" : "bank";
}

function extractStatementIssueDate(lines, fallbackDate) {
  for (const line of lines) {
    if (!/\b(?:statement\s*date|date\s*issued|issue\s*date|closing\s*date|date\s*of\s*issue)\b/i.test(line.raw)) {
      continue;
    }

    const orderedDates = collectOrderedDates(line.raw);
    if (orderedDates.length) {
      return orderedDates[orderedDates.length - 1];
    }
  }

  return fallbackDate || null;
}

function extractStatementBalance(lines) {
  return extractExplicitSummaryAmount(lines, [
    /\bSTATEMENT\s+BALANCE\b/i,
    /\bNEW\s+BALANCE\b/i,
    /\bCURRENT\s+BALANCE\b/i,
    /\bCLOSING\s+BALANCE\b/i,
    /\bOUTSTANDING\s+BALANCE\b/i,
    /\bBALANCE\s+DUE\b/i,
    /\bTOTAL\s+BALANCE\b/i,
  ]);
}

function extractAmountNearLabel(raw, upper, labelRegexes) {
  for (const regex of labelRegexes) {
    const found = upper.match(regex);
    if (!found || found.index == null) continue;

    const tail = raw.slice(found.index);
    const firstAmount = tail.match(
        /([-+−]?\s*(?:£\s*|GBP\s*)?(?:\d{1,3}(?:[, ]\d{3})+|\d+)(?:\.\d{2})?)/i,
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
    const match = line.raw.match(/[:\-]?\s*([-+−]?\s*(?:£\s*|GBP\s*)?(?:\d{1,3}(?:[, ]\d{3})+|\d+)(?:\.\d{2})?)/i);
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

  const statementType = detectStatementType(text, lines);
  const detectedAccountName = extractLikelyAccountName(lines);
  const accountName = detectedAccountName || (statementType === "credit" ? "Credit Card" : null);

  const rangedDates = parsePeriodRangeFromText(text);
  const lineDates = extractStatementDatesFromLines(lines);
  const allDates = collectNumericDates(text);
  const issueDate = extractStatementIssueDate(
      lines,
      (rangedDates ? rangedDates.statementEndDate : lineDates.statementEndDate) || null,
  );
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

  if (statementType === "credit" && issueDate) {
    statementEndDate = issueDate;
  }

  let moneyInTotal = extractAmountsByLabels(lines, [
    /\bPAYMENTS?\s*IN\b/i,
    /\bMONEY\s*IN\b/i,
    /\bTOTAL\s*IN\b/i,
    /\bCREDITS?\b/i,
    /\bPAID\s*IN\b/i,
    /\bDEPOSITS?\b/i,
    /\bPAYMENTS?\s+AND\s+CREDITS?\b/i,
    /\bREFUNDS?\b/i,
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
    /\bPURCHASES?\b/i,
    /\bCARD\s+SPEND\b/i,
    /\bTOTAL\s+SPENT\b/i,
    /\bCASH\s+ADVANCES?\b/i,
  ]);

  const explicitMoneyIn = extractExplicitSummaryAmount(lines, [
    /\bTOTAL\s+MONEY\s+IN\b/i,
    /\bTOTAL\s+PAYMENTS?\s+IN\b/i,
    /\bTOTAL\s+PAYMENTS?\s+AND\s+CREDITS?\b/i,
  ]);
  if (Number.isFinite(explicitMoneyIn)) {
    moneyInTotal = explicitMoneyIn;
  }

  const explicitMoneyOut = extractExplicitSummaryAmount(lines, [
    /\bTOTAL\s+MONEY\s+OUT\b/i,
    /\bTOTAL\s+MONEY\s+OU?T\b/i,
    /\bTOTAL\s+PAYMENTS?\s+OUT\b/i,
    /\bTOTAL\s+PAYMENTS?\s+OU?T\b/i,
    /\bTOTAL\s+PURCHASES?\b/i,
    /\bTOTAL\s+CARD\s+SPEND\b/i,
  ]);
  if (Number.isFinite(explicitMoneyOut)) {
    moneyOutTotal = explicitMoneyOut;
  }

  const statementBalance = extractStatementBalance(lines);

  return {
    accountName,
    statementType,
    statementIssueDate: statementType === "credit" ? issueDate || statementEndDate : null,
    statementBalance,
    statementStartDate,
    statementEndDate,
    moneyInTotal,
    moneyOutTotal,
    transactions: [],
    vendorTotals: [],
    categoryTotals: [],
    rawText: String(text || "").trim(),
  };
}

module.exports = {
  extractBankStatementData,
};
