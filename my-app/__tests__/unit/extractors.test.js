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

  it('returns null when no parseable amount exists', () => {
    expect(extractAmount('No numbers here at all')).toBeNull();
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
