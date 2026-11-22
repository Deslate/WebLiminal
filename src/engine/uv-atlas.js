// Automatic Lightmap UV2 chart packer.
// Takes world-scale rectangular surface charts (width/height in meters),
// chooses a uniform texel density that fits inside the target atlas with
// strict gutter padding, and writes texel-center-aligned UV2s onto vertices.

export function packLightmapAtlas(charts, options = {}) {
  const atlasSize = options.atlasSize ?? 1024;
  const padding = options.padding ?? 2; // texels on every side of each chart
  const maxTexelsPerMeter = options.texelsPerMeter ?? 16;
  const minChartTexels = 4;

  if (!charts.length) {
    return { atlasSize, texelsPerMeter: maxTexelsPerMeter, utilization: 0, placements: [] };
  }

  // Sort tallest-first for clean shelf packing.
  const order = charts.map((c, idx) => ({
    idx,
    wMeters: Math.max(0.05, c.width),
    hMeters: Math.max(0.05, c.height),
    priority: c.priority ?? 1.0,
  }));

  function tryPack(tpm) {
    const rects = order
      .map((c) => {
        const w = Math.max(
          minChartTexels,
          Math.min(atlasSize - padding * 2, Math.ceil(c.wMeters * tpm * c.priority)),
        );
        const h = Math.max(
          minChartTexels,
          Math.min(atlasSize - padding * 2, Math.ceil(c.hMeters * tpm * c.priority)),
        );
        return { ...c, w, h };
      })
      .sort((a, b) => b.h - a.h || b.w - a.w);

    const placements = new Array(charts.length);
    let cursorX = padding;
    let cursorY = padding;
    let shelfHeight = 0;
    let usedTexels = 0;

    for (const r of rects) {
      if (cursorX + r.w + padding > atlasSize) {
        cursorX = padding;
        cursorY += shelfHeight + padding * 2;
        shelfHeight = 0;
      }
      if (cursorY + r.h + padding > atlasSize) {
        return null;
      }
      placements[r.idx] = { x: cursorX, y: cursorY, w: r.w, h: r.h };
      cursorX += r.w + padding * 2;
      if (r.h > shelfHeight) shelfHeight = r.h;
      usedTexels += r.w * r.h;
    }

    return {
      placements,
      utilization: usedTexels / (atlasSize * atlasSize),
    };
  }

  // Try target density first; if it overflows, binary-search the highest density that fits.
  let chosenTpm = maxTexelsPerMeter;
  let packed = tryPack(chosenTpm);
  if (!packed) {
    let lo = 0.5;
    let hi = maxTexelsPerMeter;
    let best = null;
    for (let iter = 0; iter < 18; iter++) {
      const mid = (lo + hi) * 0.5;
      const attempt = tryPack(mid);
      if (attempt) {
        best = { tpm: mid, ...attempt };
        lo = mid;
      } else {
        hi = mid;
      }
    }
    if (!best) {
      throw new Error(
        `Lightmap atlas (${atlasSize}x${atlasSize}) cannot fit ${charts.length} charts.`,
      );
    }
    chosenTpm = best.tpm;
    packed = best;
  }

  // Transform local [0..1] chart UVs to texel-center-aligned atlas UV2s.
  // Mapping [0..1] -> [(x + 0.5) / N .. (x + w - 0.5) / N] prevents bilinear
  // filtering from sampling neighboring charts across island edges.
  const inv = 1 / atlasSize;
  for (let i = 0; i < charts.length; i++) {
    const p = packed.placements[i];
    const u0 = (p.x + 0.5) * inv;
    const v0 = (p.y + 0.5) * inv;
    const du = Math.max(0, p.w - 1) * inv;
    const dv = Math.max(0, p.h - 1) * inv;
    const chart = charts[i];
    for (const v of chart.vertices) {
      v.lu = u0 + Math.max(0, Math.min(1, v.localU)) * du;
      v.lv = v0 + Math.max(0, Math.min(1, v.localV)) * dv;
    }
  }

  return {
    atlasSize,
    texelsPerMeter: chosenTpm,
    utilization: packed.utilization,
    placements: packed.placements,
  };
}
