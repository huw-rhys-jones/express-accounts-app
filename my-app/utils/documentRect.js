// Pure-JS receipt/document bounds detection on a small grayscale bitmap.
// Returns an axis-aligned rect in normalised 0..1 coordinates, or null when nothing plausible is found.

const MIN_AREA_FRACTION = 0.08;
const MAX_AREA_FRACTION = 0.97;
const EDGE_MARGIN = 0.01;

export function rgbaToGray(rgba, width, height) {
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i += 1, p += 4) {
    gray[i] = (rgba[p] * 77 + rgba[p + 1] * 150 + rgba[p + 2] * 29) >> 8;
  }
  return gray;
}

function boxBlur(gray, width, height) {
  const out = new Uint8Array(gray.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          sum += gray[yy * width + xx];
          count += 1;
        }
      }
      out[y * width + x] = (sum / count) | 0;
    }
  }
  return out;
}

function otsuThreshold(gray) {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i += 1) hist[gray[i]] += 1;
  const total = gray.length;
  let sumAll = 0;
  for (let t = 0; t < 256; t += 1) sumAll += t * hist[t];
  let sumBg = 0;
  let weightBg = 0;
  let best = 0;
  let bestVar = -1;
  for (let t = 0; t < 256; t += 1) {
    weightBg += hist[t];
    if (weightBg === 0) continue;
    const weightFg = total - weightBg;
    if (weightFg === 0) break;
    sumBg += t * hist[t];
    const meanBg = sumBg / weightBg;
    const meanFg = (sumAll - sumBg) / weightFg;
    const between = weightBg * weightFg * (meanBg - meanFg) ** 2;
    if (between > bestVar) {
      bestVar = between;
      best = t;
    }
  }
  return best;
}

// Largest 4-connected component of `mask` cells equal to 1, as a bounding box plus pixel counts.
// `filledArea` counts every pixel between a row's leftmost and rightmost cell, so printed text holes don't shrink it.
function largestComponent(mask, width, height) {
  const visited = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  const rowMin = new Int32Array(height);
  const rowMax = new Int32Array(height);
  let best = null;

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    rowMin.fill(width);
    rowMax.fill(-1);
    let sp = 0;
    stack[sp++] = start;
    visited[start] = 1;
    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;

    while (sp > 0) {
      const idx = stack[--sp];
      const x = idx % width;
      const y = (idx / width) | 0;
      area += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x < rowMin[y]) rowMin[y] = x;
      if (x > rowMax[y]) rowMax[y] = x;

      if (x > 0 && mask[idx - 1] && !visited[idx - 1]) { visited[idx - 1] = 1; stack[sp++] = idx - 1; }
      if (x < width - 1 && mask[idx + 1] && !visited[idx + 1]) { visited[idx + 1] = 1; stack[sp++] = idx + 1; }
      if (y > 0 && mask[idx - width] && !visited[idx - width]) { visited[idx - width] = 1; stack[sp++] = idx - width; }
      if (y < height - 1 && mask[idx + width] && !visited[idx + width]) { visited[idx + width] = 1; stack[sp++] = idx + width; }
    }

    if (!best || area > best.area) {
      let filledArea = 0;
      for (let y = minY; y <= maxY; y += 1) {
        if (rowMax[y] >= rowMin[y]) filledArea += rowMax[y] - rowMin[y] + 1;
      }
      best = { area, filledArea, minX, minY, maxX, maxY };
    }
  }
  return best;
}

function scoreComponent(comp, width, height) {
  if (!comp) return null;
  const fraction = comp.filledArea / (width * height);
  if (fraction < MIN_AREA_FRACTION || fraction > MAX_AREA_FRACTION) return null;
  const bboxArea = (comp.maxX - comp.minX + 1) * (comp.maxY - comp.minY + 1);
  const fill = comp.filledArea / bboxArea;
  return { comp, fill, fraction };
}

export function findDocumentRect(gray, width, height) {
  if (!gray || width < 8 || height < 8) return null;

  const blurred = boxBlur(gray, width, height);
  const threshold = otsuThreshold(blurred);

  const bright = new Uint8Array(blurred.length);
  const dark = new Uint8Array(blurred.length);
  for (let i = 0; i < blurred.length; i += 1) {
    if (blurred[i] > threshold) bright[i] = 1;
    else dark[i] = 1;
  }

  // A receipt is usually the brighter region, but try the opposite polarity and keep the more rectangular blob.
  const candidates = [bright, dark]
    .map((mask) => scoreComponent(largestComponent(mask, width, height), width, height))
    .filter(Boolean)
    .sort((a, b) => b.fill - a.fill);

  if (!candidates.length) return null;
  const { comp, fill } = candidates[0];

  return {
    rect: {
      left: Math.max(0, comp.minX / width - EDGE_MARGIN),
      top: Math.max(0, comp.minY / height - EDGE_MARGIN),
      right: Math.min(1, (comp.maxX + 1) / width + EDGE_MARGIN),
      bottom: Math.min(1, (comp.maxY + 1) / height + EDGE_MARGIN),
    },
    confidence: fill,
  };
}
