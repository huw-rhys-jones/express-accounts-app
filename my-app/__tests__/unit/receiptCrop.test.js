import { findDocumentRect } from "../../utils/documentRect";
import {
  rotateRectCcw,
  rotateRectCw,
  rotateRectByDegrees,
  rotatedSize,
  isFullRect,
  detectTextRotationFromBlocks,
  detectTextCropRect,
} from "../../utils/receiptImageProcessing";

function makeImage(width, height, background, fill) {
  const gray = new Uint8Array(width * height).fill(background);
  fill(gray, width);
  return gray;
}

function paintRect(gray, width, x0, y0, x1, y1, value) {
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) gray[y * width + x] = value;
}

describe("findDocumentRect", () => {
  it("finds a bright receipt on a dark background, ignoring printed text", () => {
    const w = 120;
    const h = 160;
    const gray = makeImage(w, h, 40, (g) => {
      paintRect(g, w, 30, 20, 90, 140, 230);
      for (let row = 30; row < 130; row += 10) paintRect(g, w, 40, row, 80, row + 3, 30);
    });

    const { rect, confidence } = findDocumentRect(gray, w, h);
    expect(confidence).toBeGreaterThan(0.9);
    expect(rect.left).toBeCloseTo(30 / w, 1);
    expect(rect.right).toBeCloseTo(90 / w, 1);
    expect(rect.top).toBeCloseTo(20 / h, 1);
    expect(rect.bottom).toBeCloseTo(140 / h, 1);
  });

  it("returns null for a flat image", () => {
    const gray = new Uint8Array(100 * 100).fill(128);
    expect(findDocumentRect(gray, 100, 100)).toBeNull();
  });

  it("returns null when the bright region is too small to be a receipt", () => {
    const w = 100;
    const gray = makeImage(w, 100, 40, (g) => paintRect(g, w, 45, 45, 50, 50, 230));
    expect(findDocumentRect(gray, w, 100)).toBeNull();
  });
});

describe("rect rotation", () => {
  const rect = { left: 0.1, top: 0.2, right: 0.5, bottom: 0.9 };

  it("four clockwise rotations return the original rect", () => {
    let r = rect;
    for (let i = 0; i < 4; i += 1) r = rotateRectCw(r);
    expect(r.left).toBeCloseTo(rect.left);
    expect(r.top).toBeCloseTo(rect.top);
    expect(r.right).toBeCloseTo(rect.right);
    expect(r.bottom).toBeCloseTo(rect.bottom);
  });

  it("counter-clockwise undoes clockwise", () => {
    const r = rotateRectCcw(rotateRectCw(rect));
    expect(r.left).toBeCloseTo(rect.left);
    expect(r.top).toBeCloseTo(rect.top);
    expect(r.right).toBeCloseTo(rect.right);
    expect(r.bottom).toBeCloseTo(rect.bottom);
  });

  it("swaps dimensions on quarter turns", () => {
    expect(rotatedSize(300, 400, 90)).toEqual({ width: 400, height: 300 });
    expect(rotatedSize(300, 400, 180)).toEqual({ width: 300, height: 400 });
  });

  it("detects a full-image rect", () => {
    expect(isFullRect({ left: 0, top: 0, right: 1, bottom: 1 })).toBe(true);
    expect(isFullRect(rect)).toBe(false);
  });

  it("rotates rect by arbitrary 90-degree multiples", () => {
    expect(rotateRectByDegrees(rect, 180)).toEqual(rotateRectCw(rotateRectCw(rect)));
    expect(rotateRectByDegrees(rect, 270)).toEqual(rotateRectCcw(rect));
  });
});

describe("detectTextRotationFromBlocks", () => {
  it("detects 180-degree upside-down text from cornerPoints", () => {
    const blocks = [
      {
        lines: [
          {
            text: "Ordered at: March 31st, 2025",
            cornerPoints: [
              { x: 300, y: 200 },
              { x: 50, y: 200 },
              { x: 50, y: 170 },
              { x: 300, y: 170 },
            ],
          },
          {
            text: "Total £12.35",
            cornerPoints: [
              { x: 250, y: 80 },
              { x: 80, y: 80 },
              { x: 80, y: 50 },
              { x: 250, y: 50 },
            ],
          },
        ],
      },
    ];
    expect(detectTextRotationFromBlocks(blocks)).toBe(180);
  });

  it("detects 180-degree upside-down receipt via layout fallback when cornerPoints are axis-aligned", () => {
    const blocks = [
      {
        lines: [
          { text: "VAT £0.00", frame: { top: 40, left: 50, width: 200, height: 20 } },
          { text: "Total £12.35", frame: { top: 70, left: 50, width: 200, height: 20 } },
          { text: "Subtotal: £12.35", frame: { top: 130, left: 50, width: 200, height: 20 } },
          { text: "1 x Sprite £2.00", frame: { top: 220, left: 50, width: 200, height: 20 } },
          { text: "Ordered at: March 31st, 2025", frame: { top: 340, left: 50, width: 200, height: 20 } },
          { text: "VAT NO: 343293014", frame: { top: 520, left: 50, width: 200, height: 20 } },
        ],
      },
    ];
    expect(detectTextRotationFromBlocks(blocks)).toBe(180);
  });

  it("returns 0 for upright receipt text", () => {
    const blocks = [
      {
        lines: [
          {
            text: "Oxford Westgate",
            cornerPoints: [
              { x: 50, y: 50 },
              { x: 250, y: 50 },
              { x: 250, y: 80 },
              { x: 50, y: 80 },
            ],
            frame: { top: 50, left: 50, width: 200, height: 30 },
          },
          {
            text: "Total £12.35",
            cornerPoints: [
              { x: 50, y: 400 },
              { x: 250, y: 400 },
              { x: 250, y: 430 },
              { x: 50, y: 430 },
            ],
            frame: { top: 400, left: 50, width: 200, height: 30 },
          },
        ],
      },
    ];
    expect(detectTextRotationFromBlocks(blocks)).toBe(0);
  });

  it("crops around the receipt text column while ignoring off-column keyboard keys", () => {
    const blocks = [
      {
        lines: [
          // Off-column laptop key noise on the left
          { text: "pg up", frame: { left: 10, top: 300, width: 40, height: 20 } },
          { text: "@", frame: { left: 15, top: 180, width: 20, height: 20 } },
          // Receipt lines in the center column (x = 290..770 of 1000)
          { text: "Lebanese House", frame: { left: 380, top: 160, width: 250, height: 28 } },
          { text: "11/09/2024 21:18:12", frame: { left: 310, top: 310, width: 280, height: 25 } },
          { text: "SALE AMOUNT £34.60", frame: { left: 300, top: 430, width: 460, height: 28 } },
          { text: "TOTAL £34.60", frame: { left: 300, top: 470, width: 460, height: 32 } },
          { text: "NO CARDHOLDER VERIFICATION", frame: { left: 320, top: 560, width: 420, height: 22 } },
        ],
      },
    ];
    const res = detectTextCropRect(blocks, 1000, 1000, 0);
    expect(res).not.toBeNull();
    expect(res.uprightRect.left).toBeGreaterThan(0.2);
    expect(res.uprightRect.left).toBeLessThan(0.3);
    expect(res.uprightRect.right).toBeGreaterThan(0.76);
    expect(res.uprightRect.right).toBeLessThan(0.86);
  });
});
