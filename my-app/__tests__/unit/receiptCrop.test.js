import { findDocumentRect } from "../../utils/documentRect";
import { rotateRectCcw, rotateRectCw, rotatedSize, isFullRect } from "../../utils/receiptImageProcessing";

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
});
