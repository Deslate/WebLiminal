// Pure geometry builder for the Chinese horror corridor level.
// No browser or WGSL imports so Node validation and tests can execute it directly.
// Material slots:
//   0: weathered mud-plaster walls (smooth upper mud plaster, flaking lower stucco, cool ash far wall)
//   1: damp dark stone/concrete floor (gritty texture + patchy wet sheen)
//   2: dark soot-stained ceiling & shadowed silhouette trim
//   3: aged dark Chinese timber (double door, frame, window lattice, skirting, stool)
//   4: faded weathered red paper couplets, horizontal scroll and door talismans
//   5: warm translucent-glowing candle wax
//   6: emissive candle flame & smoldering red incense ember
//   7: dark oxidized iron door hardware
//   8: charred dark ceramic pottery (offering bowl & corner jar)

export const CHINESE_HORROR_BOOKMARKS = [
  {
    name: 'Candlelit Threshold',
    address: { x: 0, z: 0 },
    spawn: { x: -0.76, y: 0.96, z: 3.65, yaw: 0.0, pitch: -0.04 },
  },
  {
    name: 'Corridor Midpoint',
    address: { x: 0, z: 0 },
    spawn: { x: 0.35, y: 1.38, z: 1.05, yaw: -0.05, pitch: -0.06 },
  },
  {
    name: 'Double Door & Couplets',
    address: { x: 0, z: 0 },
    spawn: { x: 0.42, y: 1.42, z: -0.55, yaw: 0.0, pitch: -0.02 },
  },
];

export function buildChineseHorrorScene({ apertureWidth = 0.85, apertureDepth = 1.45 } = {}) {
  const shapes = [];
  const solids = [];
  const roof = 3.0;
  const minX = -3.8;
  const maxX = 1.55;
  const minZ = -2.2;
  const maxZ = 4.35;
  const leftCourtMinX = -2.55;
  const bounds = { minX, maxX, minZ, maxZ, ceiling: roof };

  const add = (lo, hi, material = 0, extra = null, solid = false) => {
    const density = Array(9).fill(8);
    const probeStride = Array(9).fill(4);
    const shape = {
      lo,
      hi,
      material,
      kind: 0,
      radius: 0,
      spring: 0,
      density,
      probeStride,
      ...(extra || {}),
    };
    shapes.push(shape);
    if (solid) solids.push({ minX: lo[0], maxX: hi[0], minZ: lo[2], maxZ: hi[2] });
    return shape;
  };

  // 0. Floor slab spanning corridor, antechamber, and concealed left moonlight court.
  const floorSlab = add([minX - 0.4, -0.3, minZ - 0.3], [maxX + 0.8, 0.0, maxZ + 0.2], 1);
  floorSlab.density[3] = 16;

  // Concealed exterior night-sky aperture above a narrow court behind the left
  // corridor wall (hidden from the reference view by the protruding partition).
  // Cool moonlight enters through a tall side opening onto the far wall and left
  // couplet while keeping the ceiling and right couplet in deep night shadow.
  const aw = Math.max(0.3, Math.min(0.95, apertureWidth));
  const ad = Math.max(0.4, Math.min(1.8, apertureDepth));
  const ax = -1.95;
  const az = -1.25;
  const aperture = {
    minX: ax - aw / 2,
    maxX: ax + aw / 2,
    minZ: az - ad / 2,
    maxZ: az + ad / 2,
    y: roof + 0.3,
  };

  // Solid dark ceiling framing the concealed left moonlight court aperture.
  add([minX - 0.4, roof, minZ - 0.3], [aperture.minX, roof + 0.3, maxZ + 0.2], 2);
  add([aperture.maxX, roof, minZ - 0.3], [maxX + 0.8, roof + 0.3, maxZ + 0.2], 2);
  add([aperture.minX, roof, minZ - 0.3], [aperture.maxX, roof + 0.3, aperture.minZ], 2);
  add([aperture.minX, roof, aperture.maxZ], [aperture.maxX, roof + 0.3, maxZ + 0.2], 2);

  // Far end wall at z = -2.20, framing the recessed double doorway (x in [-0.24, 1.08], y in [0.0, 2.24]).
  const doorL = -0.24;
  const doorR = 1.08;
  const doorH = 2.24;
  add([minX - 0.4, 0.0, minZ - 0.3], [doorL, roof, minZ], 0);
  add([doorR, 0.0, minZ - 0.3], [maxX + 0.3, roof, minZ], 0);
  add([doorL, doorH, minZ - 0.3], [doorR, roof, minZ], 0);
  // Dark timber backing behind the recessed double door leaves.
  add([doorL - 0.1, 0.0, minZ - 0.38], [doorR + 0.1, doorH + 0.08, minZ - 0.26], 3);

  // Left corridor wall behind the protruding partition, pierced by a hidden night
  // opening (z in [-1.85, -0.60], y in [0.45, 2.50]) admitting cool moonlight onto
  // the far left couplet and door while staying hidden behind the foreground corner.
  add([-1.38, 0.0, minZ], [-1.12, roof, -1.85], 0);
  add([-1.38, 0.0, -0.60], [-1.12, roof, 0.0], 0);
  add([-1.38, 0.0, -1.85], [-1.12, 0.45, -0.60], 0);
  add([-1.38, 2.50, -1.85], [-1.12, roof, -0.60], 0);
  solids.push({ minX: -1.38, maxX: -1.12, minZ, maxZ: 0.0 });
  // Concealed outer left court enclosure (butts cleanly behind the protruding wall at z = -0.36).
  add([leftCourtMinX - 0.25, 0.0, minZ - 0.2], [leftCourtMinX, roof + 0.3, -0.36], 2);

  // Iconic protruding left partition wall extending off the left edge of the frame.
  add([minX - 0.4, 0.0, -0.36], [-0.88, roof, 0.0], 0, null, true);
  // Left antechamber outer wall and rear wall behind the viewer.
  add([minX - 0.4, 0.0, 0.0], [minX, roof, maxZ + 0.2], 2);
  add([minX - 0.4, 0.0, maxZ], [maxX + 0.3, roof, maxZ + 0.3], 0);

  // Right corridor wall at x = 1.55, pierced by a dark recessed wooden lattice window.
  const winZ0 = -1.18;
  const winZ1 = 0.38;
  const winY0 = 1.26;
  const winY1 = 2.66;
  add([maxX, 0.0, minZ], [maxX + 0.24, roof, winZ0], 0);
  add([maxX, 0.0, winZ1], [maxX + 0.24, roof, maxZ], 0);
  add([maxX, 0.0, winZ0], [maxX + 0.24, winY0, winZ1], 0);
  add([maxX, winY1, winZ0], [maxX + 0.24, roof, winZ1], 0);
  // Dark night shutter/recess backing behind the right wooden lattice window.
  add([maxX + 0.34, winY0 - 0.1, winZ0 - 0.1], [maxX + 0.55, winY1 + 0.1, winZ1 + 0.1], 2);
  // Slim dark timber skirting board along the base of the right corridor wall.
  add([maxX - 0.025, 0.0, minZ], [maxX, 0.10, maxZ], 3);

  // Traditional Chinese wooden lattice window (outer frame + vertical mullions + horizontal transoms).
  const wf = 0.055;
  add([maxX - 0.01, winY0, winZ0], [maxX + 0.22, winY0 + wf, winZ1], 3);
  add([maxX - 0.01, winY1 - wf, winZ0], [maxX + 0.22, winY1, winZ1], 3);
  add([maxX - 0.01, winY0 + wf, winZ0], [maxX + 0.22, winY1 - wf, winZ0 + wf], 3);
  add([maxX - 0.01, winY0 + wf, winZ1 - wf], [maxX + 0.22, winY1 - wf, winZ1], 3);
  for (const wz of [-0.82, -0.42, -0.02]) {
    add([maxX + 0.04, winY0 + wf, wz - 0.022], [maxX + 0.14, winY1 - wf, wz + 0.022], 3);
  }
  for (const wy of [1.72, 2.20]) {
    add([maxX + 0.05, wy - 0.02, winZ0 + wf], [maxX + 0.13, wy + 0.02, winZ1 - wf], 3);
  }

  // Heavy dark wooden doorframe and raised threshold sill.
  const jf = 0.075;
  add([doorL, 0.0, minZ - 0.22], [doorL + jf, doorH, minZ + 0.02], 3);
  add([doorR - jf, 0.0, minZ - 0.22], [doorR, doorH, minZ + 0.02], 3);
  add([doorL - 0.02, doorH - 0.09, minZ - 0.22], [doorR + 0.02, doorH + 0.02, minZ + 0.025], 3);
  add([doorL, 0.0, minZ - 0.22], [doorR, 0.10, minZ + 0.03], 3);

  // Recessed double wooden door leaves with a narrow dark center seam.
  const doorMid = (doorL + doorR) * 0.5;
  const leafZ0 = minZ - 0.22;
  const leafZ1 = minZ - 0.14;
  add([doorL + jf, 0.10, leafZ0], [doorMid - 0.008, doorH - 0.09, leafZ1], 3);
  add([doorMid + 0.008, 0.10, leafZ0], [doorR - jf, doorH - 0.09, leafZ1], 3);
  // Horizontal timber crossbars across the door face.
  add([doorL + jf, 0.94, leafZ1], [doorMid - 0.012, 1.01, leafZ1 + 0.022], 3);
  add([doorMid + 0.012, 0.94, leafZ1], [doorR - jf, 1.01, leafZ1 + 0.022], 3);
  // Subtle dark iron door lock hasp and ring pull at the center split.
  add([doorMid - 0.022, 1.32, leafZ1], [doorMid + 0.022, 1.42, leafZ1 + 0.024], 7);
  add([doorMid - 0.018, 1.18, leafZ1], [doorMid + 0.018, 1.24, leafZ1 + 0.026], 7);

  // Faded weathered red paper Spring Festival couplets (left & right), horizontal
  // scroll above lintel, and two smaller vertical red door talisman strips.
  add([-0.60, 0.44, minZ], [-0.30, 1.98, minZ + 0.008], 4); // Left couplet
  add([1.14, 0.44, minZ], [1.44, 1.98, minZ + 0.008], 4);   // Right couplet
  add([-0.08, 2.31, minZ], [0.92, 2.66, minZ + 0.008], 4);  // Horizontal scroll
  add([doorMid - 0.34, 1.12, leafZ1], [doorMid - 0.13, 1.60, leafZ1 + 0.008], 4); // Left door talisman
  add([doorMid + 0.13, 1.12, leafZ1], [doorMid + 0.34, 1.60, leafZ1 + 0.008], 4); // Right door talisman

  // Floor candle arrangement just past the protruding left corner.
  const cx = -0.44;
  const cz = 0.28;
  // Melted wax puddle base + slender cream wax candle cylinder.
  add([cx - 0.055, 0.0, cz - 0.055], [cx + 0.055, 0.009, cz + 0.055], 5, { kind: 2, radius: 0.055 });
  add([cx - 0.020, 0.009, cz - 0.020], [cx + 0.020, 0.155, cz + 0.020], 5, { kind: 2, radius: 0.020 });
  // Compact incandescent candle flame cylinder.
  add([cx - 0.011, 0.158, cz - 0.011], [cx + 0.011, 0.215, cz + 0.011], 6, { kind: 2, radius: 0.011 });

  // Stepped rounded dark charred ceramic offering vessel casting the dramatic
  // diagonal floor shadow toward the viewer's lower-left foreground.
  const bx = -0.62;
  const bz = 0.50;
  const br = 0.145;
  add([bx - br, 0.0, bz - br], [bx + br, 0.125, bz + br], 8, { kind: 2, radius: br });
  add([bx - 0.115, 0.125, bz - 0.115], [bx + 0.115, 0.168, bz + 0.115], 8, { kind: 2, radius: 0.115 });
  add([bx - 0.072, 0.168, bz - 0.072], [bx + 0.072, 0.192, bz + 0.072], 8, { kind: 2, radius: 0.072 });
  solids.push({ kind: 'circle', x: bx, z: bz, radius: br + 0.06 });

  // Smoldering red-orange vigil ember tucked right behind the dark offering bowl.
  const ex = -0.60;
  const ez = 0.24;
  add([ex - 0.024, 0.0, ez - 0.024], [ex + 0.024, 0.162, ez + 0.024], 8, { kind: 2, radius: 0.024 });
  add([ex - 0.020, 0.162, ez - 0.020], [ex + 0.020, 0.196, ez + 0.020], 6, { kind: 2, radius: 0.020 });

  // Low pitch-dark rounded foreground silhouette tucked at lower left.
  add([-3.6, 0.0, 2.05], [-1.26, 0.44, 2.55], 2, null, true);
  add([-1.50, 0.0, 2.06], [-1.02, 0.44, 2.54], 2, { kind: 2, radius: 0.24 });
  solids.push({ kind: 'circle', x: -1.26, z: 2.30, radius: 0.24 });

  // Far-right dark wooden stool and matte dark ceramic jar tucked deep into the corner shadow.
  add([1.14, 0.0, minZ + 0.04], [1.52, 0.30, minZ + 0.40], 3, null, true);
  add([1.28, 0.30, minZ + 0.16], [1.40, 0.50, minZ + 0.28], 8, { kind: 2, radius: 0.06 });

  return {
    bounds,
    shapes,
    solids,
    water: null,
    aperture,
    floor: { shape: 0, face: 3 },
    tileRelief: false,
    hasEmission: true,
    reflectionSamples: { glaze: 12, rough: 12 },
    illumination: {
      // Cool pale moonlight descending into the concealed left court and washing
      // across the far ash-grey wall, left couplet, and lower wooden door planks.
      sun: [0.46, 0.52, 0.64],
      skyScale: 3.8,
      sunDirection: [-0.46, 0.84, 0.28],
      skyHorizon: [0.22, 0.26, 0.32],
      skyZenith: [0.10, 0.13, 0.19],
      haze: [0.001, 0.0012, 0.0018],
    },
    pointLights: [
      {
        pos: [cx, 0.205, cz],
        color: [2.95, 1.38, 0.36],
        radius: 0.022,
        shadowOffset: 0.048,
        flicker: [0.055, 7.3, 0.4],
      },
      {
        pos: [ex, 0.205, ez],
        color: [0.48, 0.085, 0.018],
        radius: 0.022,
        shadowOffset: 0.042,
        flicker: [0.08, 4.1, 1.9],
      },
    ],
    air: {
      scattering: 0.004,
      anisotropy: 0.65,
      cell: 0.25,
    },
  };
}
