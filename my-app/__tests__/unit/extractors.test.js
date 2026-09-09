/**
 * Unit tests for the OCR extraction utilities in utils/extractors.js.
 *
 * extractAmount() calls console.log for debug output – we suppress that here
 * so test output stays clean. Re-enable by removing the spy if you need to
 * debug a failing extraction.
 */

import {
  extractAmount,
  extractData,
  reconstructLines,
  categoryFinder,
  extractVAT,
} from '../../utils/extractors';

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterAll(() => {
  console.log.mockRestore();
});

// ---------------------------------------------------------------------------
// extractAmount
// ---------------------------------------------------------------------------
describe('extractAmount', () => {
  it('returns null for empty / null input', () => {
    expect(extractAmount(null)).toBeNull();
    expect(extractAmount('')).toBeNull();
  });

  it('extracts a simple total from a receipt line', () => {
    const text = 'TOTAL  £12.50';
    const result = extractAmount(text);
    expect(result).not.toBeNull();
    expect(result.amount).toBeCloseTo(12.5);
  });

  it('prefers the TOTAL line over earlier amounts', () => {
    const text = [
      'Coffee       £3.00',
      'Sandwich     £4.50',
      'TOTAL        £7.50',
    ].join('\n');
    const result = extractAmount(text);
    expect(result.amount).toBeCloseTo(7.5);
  });

  it('handles amounts without currency symbol', () => {
    const text = 'AMOUNT DUE   25.99';
    const result = extractAmount(text);
    expect(result).not.toBeNull();
    expect(result.amount).toBeCloseTo(25.99);
  });

  it('handles GBP prefix', () => {
    const text = 'TOTAL GBP 99.00';
    const result = extractAmount(text);
    expect(result).not.toBeNull();
    expect(result.amount).toBeCloseTo(99.0);
  });

  it('prefers balance due amounts over smaller item prices', () => {
    const text = [
      'Receipt',
      'Item 1 £2.50',
      'Item 2 £3.20',
      'BALANCE DUE',
      '£58.56',
    ].join('\n');
    const result = extractAmount(text);
    expect(result).not.toBeNull();
    expect(result.amount).toBeCloseTo(58.56);
  });

  it('picks amount due values even without currency symbols', () => {
    const text = [
      'Invoice',
      'Amount Due',
      '25.99',
    ].join('\n');
    const result = extractAmount(text);
    expect(result).not.toBeNull();
    expect(result.amount).toBeCloseTo(25.99);
  });

  it('prefers grand totals over repeated line-item amounts', () => {
    const text = [
      'Week Ending',
      'W/E 11.01.26',
      '£3,250.00',
      'Grand Total',
      '£15,600.00',
    ].join('\n');
    const result = extractAmount(text);
    expect(result).not.toBeNull();
    expect(result.amount).toBeCloseTo(15600);
  });

  it('prefers total amount due values on the following line', () => {
    const text = [
      'Subtotal',
      '£3,900.00',
      'Tax (20%)',
      '£780.00',
      'Total Amount Due:',
      '£4,680.00',
    ].join('\n');
    const result = extractAmount(text);
    expect(result).not.toBeNull();
    expect(result.amount).toBeCloseTo(4680);
  });

  it('handles unicode pound symbols', () => {
    const text = [
      'Subtotal',
      '₤3,900.00',
      'Tax (20%)',
      '₤780.00',
      'Total Amount Due:',
      '₤4,680.00',
    ].join('\n');
    const result = extractAmount(text);
    expect(result).not.toBeNull();
    expect(result.amount).toBeCloseTo(4680);
  });

  it('returns null when no parseable amount exists', () => {
    expect(extractAmount('No numbers here at all')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractData (date selection)
// ---------------------------------------------------------------------------
describe('extractData date selection', () => {
  it('prefers the invoice date over a later due-by date', () => {
    const text = [
      'Invoice 06',
      '01 July 2023',
      'Payment due by 31 July 2023',
    ].join('\n');
    const result = extractData(text);
    expect(result.date).toBe('2023-07-01');
  });

  it('prefers the invoice date over a week-commencing date', () => {
    const text = [
      'Week Commencing',
      '01/12/2025',
      'Date of Invoice:',
      '08/12/2025',
    ].join('\n');
    const result = extractData(text);
    expect(result.date).toBe('2025-12-08');
  });

  it('prefers the date that follows a header label over transaction-row dates', () => {
    const text = [
      'Invoice Number:',
      'PINV94174',
      'Date:',
      '02/06/2026',
      '26/05/26',
    ].join('\n');
    const result = extractData(text);
    expect(result.date).toBe('2026-06-02');
  });
});

describe('extractData reference selection', () => {
  it('extracts a numeric invoice number from an invoice-number label', () => {
    const text = [
      'Invoice',
      'INVOICE NUMBER: 38577398399',
      'VAT REGISTRATION NUMBER: BAM15322',
    ].join('\n');
    const result = extractData(text);
    expect(result.reference).toBe('38577398399');
  });

  it('prefers the explicit VAT amount when a line contains both a percentage and money', () => {
    const result = extractVAT('VAT @ 20% £479.20', { amount: 2898.5 }, 0);
    expect(result.value).toBeCloseTo(479.2);
    expect(result.rate).toBe(20);
  });

  it('extracts an invoice number from the next line when the label is on its own line', () => {
    const text = [
      'Invoice Number:',
      'PINV94174',
      'Currency: GBP',
      'Date:',
      '02/06/2026',
    ].join('\n');
    const result = extractData(text);
    expect(result.reference).toBe('PINV94174');
  });

  it('avoids false positives from payment reference fields', () => {
    const text = [
      'PAY BY BANK TRANSFER',
      'Payment Reference: Customer 001',
      'Invoice No:',
      'INV-0001',
    ].join('\n');
    const result = extractData(text);
    expect(result.reference).toBe('INV-0001');
  });

  it('extracts CIS status, rate, and labelled withheld tax', () => {
    const text = [
      'Construction Industry Scheme Payment and Deduction Statement',
      'Gross paid (excl VAT) (A)',
      '6,522.99',
      'Deducted (B)',
      '1,304.59',
    ].join('\n');
    const result = extractData(text);
    expect(result.cis).toEqual({
      applies: true,
      materialsAmount: 0,
      deductionRate: 20,
      taxWithheld: 1304.59,
    });
  });

  it('does not treat a CIS tax deduction column as a CIS payment statement', () => {
    const result = extractData('Subcontractor Statement\nCIS Tax Deduction Tax Rate\n20%');
    expect(result.cis).toEqual({
      applies: false,
      materialsAmount: 0,
      deductionRate: 0,
      taxWithheld: 0,
    });
  });

  it('extracts an explicit tax deduction rate from a remittance advice', () => {
    const result = extractData('REMITTANCE ADVICE\nCredit note Tax deduction 20%\n330.61-');
    expect(result.cis).toEqual({
      applies: true,
      materialsAmount: 0,
      deductionRate: 20,
      taxWithheld: 330.61,
    });
  });
});

// ---------------------------------------------------------------------------
// categoryFinder
// ---------------------------------------------------------------------------
describe('categoryFinder', () => {
  const categories = [
    { name: 'Fuel', meta: ['petrol', 'diesel', 'fuel', 'shell', 'bp'] },
    { name: 'Meals', meta: ['restaurant', 'cafe', 'coffee', 'lunch', 'dinner'] },
    { name: 'Office', meta: ['staples', 'printer', 'stationery', 'amazon'] },
  ];

  it('matches a category from text', () => {
    const idx = categoryFinder('Bought coffee at cafe', categories);
    expect(categories[idx].name).toBe('Meals');
  });

  it('matches fuel keywords', () => {
    const idx = categoryFinder('BP Petrol Station receipt', categories);
    expect(categories[idx].name).toBe('Fuel');
  });

  it('returns -1 (or null/undefined) when no category matches', () => {
    const idx = categoryFinder('Random unrelated text', categories);
    // The function returns -1 when nothing matches
    expect(idx == null || idx === -1).toBe(true);
  });

  it('is case-insensitive', () => {
    const idx = categoryFinder('AMAZON PURCHASE', categories);
    expect(categories[idx].name).toBe('Office');
  });
});

// ---------------------------------------------------------------------------
// reconstructLines
// ---------------------------------------------------------------------------
describe('reconstructLines', () => {
  it('returns an empty string for empty blocks', () => {
    expect(reconstructLines([])).toBe('');
  });

  it('joins lines from a single block top-to-bottom', () => {
    const blocks = [
      {
        lines: [
          { text: 'Line A', frame: { top: 10, height: 20, left: 0 } },
          { text: 'Line B', frame: { top: 40, height: 20, left: 0 } },
        ],
      },
    ];
    const result = reconstructLines(blocks);
    expect(result).toContain('Line A');
    expect(result).toContain('Line B');
    // Line A should appear before Line B
    expect(result.indexOf('Line A')).toBeLessThan(result.indexOf('Line B'));
  });

  it('sorts columns left-to-right within the same row', () => {
    const blocks = [
      {
        lines: [
          { text: 'Right', frame: { top: 10, height: 20, left: 200 } },
          { text: 'Left', frame: { top: 10, height: 20, left: 5 } },
        ],
      },
    ];
    const result = reconstructLines(blocks);
    expect(result.indexOf('Left')).toBeLessThan(result.indexOf('Right'));
  });

  it('merges lines that are within the Y threshold into the same row', () => {
    const blocks = [
      {
        lines: [
          { text: 'Item', frame: { top: 10, height: 20, left: 0 } },
          { text: '£5.00', frame: { top: 12, height: 20, left: 200 } }, // same row (within threshold)
        ],
      },
    ];
    const result = reconstructLines(blocks);
    const rows = result.trim().split('\n');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain('Item');
    expect(rows[0]).toContain('£5.00');
  });
});
