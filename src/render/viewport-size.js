const positive = (value, fallback) => Number.isFinite(value) && value > 0 ? value : fallback;

// Quality is measured in CSS pixels, independently of display pixel density.
// Integer target sizes may differ by a fraction of a pixel; the camera uses
// the unrounded CSS aspect, so that rounding never distorts scene geometry.
export function viewportSize(w, h, scale = 1, pixelRatio = 1, limits = {}) {
  const cssWidth = positive(w, 1), cssHeight = positive(h, 1);
  const maxDimension = positive(limits.maxDimension, 8192);
  const maxPixels = positive(limits.maxPixels, 8388608);
  const dimensionScale = Math.min(maxDimension / cssWidth, maxDimension / cssHeight);
  const renderScale = Math.min(positive(scale, 1), dimensionScale, Math.sqrt(maxPixels / (cssWidth * cssHeight)));
  const displayScale = Math.min(positive(pixelRatio, 1), dimensionScale);
  const pixels = value => Math.max(1, Math.round(value));
  const width = pixels(cssWidth * renderScale);
  // Rounding up must not exceed the storage binding's exact byte limit.
  const height = Math.min(pixels(cssHeight * renderScale), Math.max(1, Math.floor(maxPixels / width)));
  return {
    width, height,
    canvasWidth: pixels(cssWidth * displayScale), canvasHeight: pixels(cssHeight * displayScale),
    aspect: cssWidth / cssHeight,
  };
}

// A symmetric CSS-pixel budget gives portrait and landscape the same quality.
export function initialRenderScale(w, h) {
  return Math.min(1, Math.sqrt((1280 * 832) / (positive(w, 1) * positive(h, 1))));
}
