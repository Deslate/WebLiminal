// Declarative architectural MapBuilder DSL for Backrooms & Liminal Spaces.
// Level authors compose rooms, arches, doorways, columns, domes, stairs, rails,
// skylights, water pools, and area lights in pure JS. compile() produces a
// unified GPU-ready triangle mesh, Lightmap UV2 atlas, flat SAH BVH, light list,
// and collision structure with zero per-level shader code.

import { MaterialTable } from "./materials.js";
import { packLightmapAtlas } from "./uv-atlas.js";
import { buildBVH } from "./bvh.js";

const TAU = Math.PI * 2;

function sub3(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function norm3(v) {
  const l = Math.hypot(v[0], v[1], v[2]);
  return l > 1e-10 ? [v[0] / l, v[1] / l, v[2] / l] : [0, 1, 0];
}

export class MapBuilder {
  constructor(options = {}) {
    this.materials = new MaterialTable();
    this.vertices = [];
    this.indices = [];
    this.triMaterials = [];
    this.charts = [];
    this.lights = [];
    this.skylights = [];
    this.solids = [];
    this.floors = [];
    this.waters = [];
    this.bookmarks = [];
    this.bounds = {
      minX: Infinity,
      maxX: -Infinity,
      minY: Infinity,
      maxY: -Infinity,
      minZ: Infinity,
      maxZ: -Infinity,
    };
    this.walkBounds = null;
    this.baseFloor = 0;
    this.atlasSize = options.atlasSize ?? 1024;
    this.texelsPerMeter = options.texelsPerMeter ?? 14;
  }

  material(spec) {
    return this.materials.resolve(spec);
  }

  bookmark(name, pose) {
    this.bookmarks.push({ name, spawn: { ...pose } });
    return this;
  }

  setWalkBounds(minX, minZ, maxX, maxZ, baseFloor = 0) {
    this.walkBounds = { minX, minZ, maxX, maxZ };
    this.baseFloor = baseFloor;
    return this;
  }

  addSolid(solid) {
    this.solids.push(solid);
    return this;
  }

  addFloorZone(zone) {
    this.floors.push(zone);
    return this;
  }

  _expandBounds(p) {
    if (p[0] < this.bounds.minX) this.bounds.minX = p[0];
    if (p[0] > this.bounds.maxX) this.bounds.maxX = p[0];
    if (p[1] < this.bounds.minY) this.bounds.minY = p[1];
    if (p[1] > this.bounds.maxY) this.bounds.maxY = p[1];
    if (p[2] < this.bounds.minZ) this.bounds.minZ = p[2];
    if (p[2] > this.bounds.maxZ) this.bounds.maxZ = p[2];
  }

  _beginChart(width, height, priority = 1.0) {
    const chart = {
      width: Math.max(0.05, width),
      height: Math.max(0.05, height),
      priority,
      vertices: [],
    };
    this.charts.push(chart);
    return chart;
  }

  _pushVertex(p, n, t, handedness, u, v, localU, localV, matId, chart) {
    this._expandBounds(p);
    const vert = {
      x: p[0], y: p[1], z: p[2],
      nx: n[0], ny: n[1], nz: n[2],
      tx: t[0], ty: t[1], tz: t[2], tw: handedness,
      u, v,
      localU, localV,
      lu: 0, lv: 0,
      matId,
    };
    const idx = this.vertices.length;
    this.vertices.push(vert);
    chart.vertices.push(vert);
    return idx;
  }

  // Emits a CCW quad (p0 -> p1 -> p2 -> p3) with metric texture UVs and its own
  // (or shared) lightmap chart. Optional custom vertex normals n0..n3.
  addQuad(p0, p1, p2, p3, matSpec, opts = {}) {
    const matId = this.material(matSpec);
    const eU = sub3(p1, p0);
    const eV = sub3(p3, p0);
    const lenU = Math.hypot(eU[0], eU[1], eU[2]);
    const lenV = Math.hypot(eV[0], eV[1], eV[2]);
    if (lenU < 1e-6 || lenV < 1e-6) return;

    const gn = norm3(cross3(eU, eV));
    const tDir = norm3(eU);
    const bitan = cross3(gn, tDir);
    const handed = dot3(bitan, eV) >= 0 ? 1 : -1;

    const u0 = opts.u0 ?? 0;
    const v0 = opts.v0 ?? 0;
    const u1 = opts.u1 ?? u0 + lenU;
    const v1 = opts.v1 ?? v0 + lenV;

    const chart = opts.chart ?? this._beginChart(lenU, lenV, opts.priority ?? 1.0);
    const lu0 = opts.lu0 ?? 0;
    const lv0 = opts.lv0 ?? 0;
    const lu1 = opts.lu1 ?? 1;
    const lv1 = opts.lv1 ?? 1;

    const uvs = opts.uvs ?? [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    const luvs = opts.luvs ?? [[lu0, lv0], [lu1, lv0], [lu1, lv1], [lu0, lv1]];

    const n0 = opts.normals ? opts.normals[0] : gn;
    const n1 = opts.normals ? opts.normals[1] : gn;
    const n2 = opts.normals ? opts.normals[2] : gn;
    const n3 = opts.normals ? opts.normals[3] : gn;

    const i0 = this._pushVertex(p0, n0, tDir, handed, uvs[0][0], uvs[0][1], luvs[0][0], luvs[0][1], matId, chart);
    const i1 = this._pushVertex(p1, n1, tDir, handed, uvs[1][0], uvs[1][1], luvs[1][0], luvs[1][1], matId, chart);
    const i2 = this._pushVertex(p2, n2, tDir, handed, uvs[2][0], uvs[2][1], luvs[2][0], luvs[2][1], matId, chart);
    const i3 = this._pushVertex(p3, n3, tDir, handed, uvs[3][0], uvs[3][1], luvs[3][0], luvs[3][1], matId, chart);

    this.indices.push(i0, i1, i2, i0, i2, i3);
    this.triMaterials.push(matId, matId);
  }

  // Axis-aligned solid box with world-aligned metric UVs and optional collision/walkable top.
  box(lo, hi, matSpec, opts = {}) {
    const [x0, y0, z0] = lo;
    const [x1, y1, z1] = hi;
    if (x1 <= x0 || y1 <= y0 || z1 <= z0) return this;
    const faces = opts.faces ?? {};
    const skip = new Set(opts.skipFaces ?? []);
    const p = opts.priority ?? 1.0;

    // +Y top
    if (!skip.has("py") && !skip.has("top")) {
      this.addQuad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], faces.py ?? faces.top ?? matSpec, {
        u0: x0, v0: -z1, u1: x1, v1: -z0, priority: p,
      });
    }
    // -Y bottom
    if (!skip.has("ny") && !skip.has("bottom")) {
      this.addQuad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], faces.ny ?? faces.bottom ?? matSpec, {
        u0: x0, v0: z0, u1: x1, v1: z1, priority: p,
      });
    }
    // +Z front
    if (!skip.has("pz")) {
      this.addQuad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], faces.pz ?? matSpec, {
        u0: x0, v0: y0, u1: x1, v1: y1, priority: p,
      });
    }
    // -Z back
    if (!skip.has("nz")) {
      this.addQuad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], faces.nz ?? matSpec, {
        u0: -x1, v0: y0, u1: -x0, v1: y1, priority: p,
      });
    }
    // +X right
    if (!skip.has("px")) {
      this.addQuad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], faces.px ?? matSpec, {
        u0: -z1, v0: y0, u1: -z0, v1: y1, priority: p,
      });
    }
    // -X left
    if (!skip.has("nx")) {
      this.addQuad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], faces.nx ?? matSpec, {
        u0: z0, v0: y0, u1: z1, v1: y1, priority: p,
      });
    }

    if (opts.walkable) {
      this.floors.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, y: y1, override: !!opts.overrideFloor });
    } else if (opts.solid !== false) {
      this.solids.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, minY: y0, maxY: y1 });
    }
    return this;
  }

  // Horizontal surface (floor facing +Y or ceiling facing -Y) with optional rectangular cutouts.
  _horizontalSurface(minX, minZ, maxX, maxZ, y, facingUp, matSpec, opts = {}) {
    const holes = opts.holes ?? [];
    // Extend outer perimeter by 6 mm past bounding wall planes (leaving interior hole cutouts exact)
    // so subdivided skylight ceilings and floors never exhibit 1-pixel T-junction sky leaks at seams.
    const pad = opts.padOuter === false ? 0 : 0.006;
    const oMinX = minX - pad;
    const oMaxX = maxX + pad;
    const oMinZ = minZ - pad;
    const oMaxZ = maxZ + pad;

    if (!holes.length) {
      if (facingUp) {
        this.addQuad([oMinX, y, oMaxZ], [oMaxX, y, oMaxZ], [oMaxX, y, oMinZ], [oMinX, y, oMinZ], matSpec, {
          u0: oMinX, v0: -oMaxZ, u1: oMaxX, v1: -oMinZ, priority: opts.priority ?? 1.0,
        });
      } else {
        this.addQuad([oMinX, y, oMinZ], [oMaxX, y, oMinZ], [oMaxX, y, oMaxZ], [oMinX, y, oMaxZ], matSpec, {
          u0: oMinX, v0: oMinZ, u1: oMaxX, v1: oMaxZ, priority: opts.priority ?? 1.0,
        });
      }
      return;
    }

    // Subdivide grid cleanly along all hole x/z coordinates, emitting non-hole cells.
    const xs = Array.from(
      new Set([oMinX, oMaxX, ...holes.flatMap((h) => [Math.max(oMinX, h[0]), Math.min(oMaxX, h[2])])]),
    ).sort((a, b) => a - b);
    const zs = Array.from(
      new Set([oMinZ, oMaxZ, ...holes.flatMap((h) => [Math.max(oMinZ, h[1]), Math.min(oMaxZ, h[3])])]),
    ).sort((a, b) => a - b);

    for (let ix = 0; ix < xs.length - 1; ix++) {
      for (let iz = 0; iz < zs.length - 1; iz++) {
        const ax = xs[ix], bx = xs[ix + 1];
        const az = zs[iz], bz = zs[iz + 1];
        if (bx - ax < 1e-4 || bz - az < 1e-4) continue;
        const cx = (ax + bx) * 0.5, cz = (az + bz) * 0.5;
        const insideHole = holes.some((h) => cx > h[0] && cx < h[2] && cz > h[1] && cz < h[3]);
        if (insideHole) continue;
        this._horizontalSurface(ax, az, bx, bz, y, facingUp, matSpec, { priority: opts.priority, padOuter: false });
      }
    }
  }

  floor(minX, minZ, maxX, maxZ, y, matSpec, opts = {}) {
    this._horizontalSurface(minX, minZ, maxX, maxZ, y, true, matSpec, opts);
    if (opts.walkable) {
      this.floors.push({ minX, maxX, minZ, maxZ, y, override: !!opts.overrideFloor });
    }
    return this;
  }

  ceiling(minX, minZ, maxX, maxZ, y, matSpec, opts = {}) {
    this._horizontalSurface(minX, minZ, maxX, maxZ, y, false, matSpec, opts);
    return this;
  }

  // Hollow architectural room shell (inward faces, optional baseboard trim, ceiling/floor holes).
  room(lo, hi, opts = {}) {
    const [x0, y0, z0] = lo;
    const [x1, y1, z1] = hi;
    const skip = new Set(opts.skipWalls ?? []);
    const floorMat = opts.floor ?? "tile_white";
    const ceilMat = opts.ceiling ?? "plaster_warm";
    const wallMat = opts.walls ?? "tile_white";

    if (!skip.has("floor")) {
      this.floor(x0, z0, x1, z1, y0, floorMat, {
        holes: opts.floorHoles,
        priority: opts.floorPriority ?? 1.2,
      });
    }
    if (!skip.has("ceiling")) {
      this.ceiling(x0, z0, x1, z1, y1, ceilMat, {
        holes: opts.ceilingHoles,
        priority: opts.ceilingPriority ?? 1.0,
      });
    }
    // Inner walls face INTO the room:
    // North (-Z boundary -> faces +Z)
    if (!skip.has("nz")) {
      this.addQuad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], opts.wallNZ ?? wallMat, {
        u0: x0, v0: y0, u1: x1, v1: y1,
      });
    }
    // South (+Z boundary -> faces -Z)
    if (!skip.has("pz")) {
      this.addQuad([x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], opts.wallPZ ?? wallMat, {
        u0: -x1, v0: y0, u1: -x0, v1: y1,
      });
    }
    // West (-X boundary -> faces +X)
    if (!skip.has("nx")) {
      this.addQuad([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], opts.wallNX ?? wallMat, {
        u0: -z1, v0: y0, u1: -z0, v1: y1,
      });
    }
    // East (+X boundary -> faces -X)
    if (!skip.has("px")) {
      this.addQuad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], opts.wallPX ?? wallMat, {
        u0: z0, v0: y0, u1: z1, v1: y1,
      });
    }

    // Optional baseboard trim along perimeter walls.
    if (opts.trim) {
      const th = opts.trimHeight ?? 0.12;
      const td = opts.trimDepth ?? 0.025;
      if (!skip.has("nz")) this.box([x0, y0, z0], [x1, y0 + th, z0 + td], opts.trim, { solid: false, skipFaces: ["nz", "ny"] });
      if (!skip.has("pz")) this.box([x0, y0, z1 - td], [x1, y0 + th, z1], opts.trim, { solid: false, skipFaces: ["pz", "ny"] });
      if (!skip.has("nx")) this.box([x0, y0, z0], [x0 + td, y0 + th, z1], opts.trim, { solid: false, skipFaces: ["nx", "ny"] });
      if (!skip.has("px")) this.box([x1 - td, y0, z0], [x1, y0 + th, z1], opts.trim, { solid: false, skipFaces: ["px", "ny"] });
    }

    if (opts.setBounds !== false && !this.walkBounds) {
      this.setWalkBounds(x0, z0, x1, z1, y0);
    }
    return this;
  }

  // Wall along X or Z pierced by one or more rectangular openings (doorways or windows).
  wallWithDoorway(lo, hi, opts = {}) {
    const [x0, y0, z0] = lo;
    const [x1, y1, z1] = hi;
    const alongX = (x1 - x0) >= (z1 - z0);
    const mat = opts.material ?? "wallpaper_yellow";
    const jambMat = opts.jambMaterial ?? mat;
    const openings = (
      opts.openings ?? [
        {
          pos: opts.doorX ?? opts.doorZ ?? (alongX ? (x0 + x1) * 0.5 : (z0 + z1) * 0.5),
          width: opts.doorWidth ?? 2.0,
          bottom: opts.bottom ?? y0,
          top: opts.doorHeight !== undefined ? y0 + opts.doorHeight : (opts.top ?? Math.min(y1 - 0.4, y0 + 2.4)),
        },
      ]
    )
      .map((o) => ({
        a: o.pos - o.width * 0.5,
        b: o.pos + o.width * 0.5,
        bottom: Math.max(y0, o.bottom ?? y0),
        top: Math.min(y1, o.top ?? y1),
      }))
      .sort((u, v) => u.a - v.a);

    const spanStart = alongX ? x0 : z0;
    const spanEnd = alongX ? x1 : z1;
    let cursor = spanStart;

    const emitBox = (a, b, yb, yt, isSolid, m = mat, skipFaces = []) => {
      if (b - a < 1e-4 || yt - yb < 1e-4) return;
      if (alongX) this.box([a, yb, z0], [b, yt, z1], m, { solid: isSolid, skipFaces });
      else this.box([x0, yb, a], [x1, yt, b], m, { solid: isSolid, skipFaces });
    };
    const internalSkip = alongX ? ["nx", "px"] : ["nz", "pz"];
    const hasTrim = Boolean(opts.trim);
    const th = hasTrim ? (opts.trimHeight ?? 0.10) : 0;
    const td = hasTrim ? (opts.trimDepth ?? 0.008) : 0;
    const wrapEnds = opts.trimWrapEnds ?? [false, false];
    const trimPriority = opts.trimPriority ?? 0.48;

    const emitSolidSeg = (a, b) => {
      if (b - a < 1e-4) return;
      if (!hasTrim) {
        emitBox(a, b, y0, y1, opts.solid !== false);
        return;
      }
      // Start upper wall cleanly at y0 + th (ZERO buried wall triangles inside the baseboard!),
      // wrap non-buried slim baseboard strips around exposed faces & jambs, and keep exact full-height collision.
      emitBox(a, b, y0 + th, y1, false, mat, ["ny", "py"]);
      const isStart = Math.abs(a - spanStart) < 1e-4;
      const isEnd = Math.abs(b - spanEnd) < 1e-4;
      const wrapA = !isStart || wrapEnds[0];
      const wrapB = !isEnd || wrapEnds[1];
      if (alongX) {
        this.baseboardWrap([a, y0, z0], [b, y0 + th, z1], opts.trim, {
          depth: td,
          sides: { nz: true, pz: true, nx: wrapA, px: wrapB },
          priority: trimPriority,
        });
        if (opts.solid !== false) {
          this.solids.push({ kind: "box", minX: a, maxX: b, minY: y0, maxY: y1, minZ: z0, maxZ: z1 });
        }
      } else {
        this.baseboardWrap([x0, y0, a], [x1, y0 + th, b], opts.trim, {
          depth: td,
          sides: { nx: true, px: true, nz: wrapA, pz: wrapB },
          priority: trimPriority,
        });
        if (opts.solid !== false) {
          this.solids.push({ kind: "box", minX: x0, maxX: x1, minY: y0, maxY: y1, minZ: a, maxZ: b });
        }
      }
    };

    for (const op of openings) {
      const a = Math.max(cursor, op.a);
      const b = Math.min(spanEnd, op.b);
      if (a > cursor + 1e-4) {
        emitSolidSeg(cursor, a);
      }
      // Sill below opening (for windows)
      if (op.bottom > y0 + 1e-4) {
        emitBox(a, b, y0, op.bottom, opts.solid !== false, jambMat, internalSkip);
      }
      // Lintel above opening
      if (op.top < y1 - 1e-4) {
        emitBox(a, b, op.top, y1, false, jambMat, internalSkip);
      }
      cursor = Math.max(cursor, b);
    }
    if (spanEnd > cursor + 1e-4) {
      emitSolidSeg(cursor, spanEnd);
    }

    return this;
  }

  // Emits strictly exterior perimeter baseboard strips around wall/pier footprint [x0..x1] x [z0..z1]
  // so 0% of the baseboard top lip (py) is buried beneath the upper wall (eliminates 1 px dark lightmap seam!).
  baseboardWrap(lo, hi, matSpec, opts = {}) {
    const [x0, y0, z0] = lo;
    const [x1, y1, z1] = hi;
    const td = opts.depth ?? 0.008;
    const s = opts.sides ?? { nx: true, px: true, nz: true, pz: true };
    const p = opts.priority ?? 0.48;
    const extNx = s.nx ? td : 0;
    const extPx = s.px ? td : 0;
    if (s.nz) {
      const skip = ["ny", "pz"];
      if (!s.nx) skip.push("nx");
      if (!s.px) skip.push("px");
      this.box([x0 - extNx, y0, z0 - td], [x1 + extPx, y1, z0], matSpec, { solid: false, skipFaces: skip, priority: p });
    }
    if (s.pz) {
      const skip = ["ny", "nz"];
      if (!s.nx) skip.push("nx");
      if (!s.px) skip.push("px");
      this.box([x0 - extNx, y0, z1], [x1 + extPx, y1, z1 + td], matSpec, { solid: false, skipFaces: skip, priority: p });
    }
    if (s.nx) {
      this.box([x0 - td, y0, z0], [x0, y1, z1], matSpec, { solid: false, skipFaces: ["ny", "px", "nz", "pz"], priority: p });
    }
    if (s.px) {
      this.box([x1, y0, z0], [x1 + td, y1, z1], matSpec, { solid: false, skipFaces: ["ny", "nx", "nz", "pz"], priority: p });
    }
    return this;
  }

  // Wall along X or Z pierced by one or more semicircular arches with smooth intrados
  // and symmetric architectural tile setting-out (crown mortar joint + spring course alignment).
  wallWithArch(lo, hi, opts = {}) {
    const [x0, y0, z0] = lo;
    const [x1, y1, z1] = hi;
    const alongX = opts.axis ? opts.axis === "x" : (x1 - x0) >= (z1 - z0);
    const mat = opts.material ?? "tile_white";
    const segs = opts.segments ?? 20;
    const tileMod = opts.tileModule ?? 0.20;
    const arches = (
      opts.arches ?? [
        {
          pos: opts.pos ?? (alongX ? (x0 + x1) * 0.5 : (z0 + z1) * 0.5),
          radius: opts.radius ?? 1.5,
          spring: opts.spring ?? y0 + 2.2,
        },
      ]
    )
      .slice()
      .sort((a, b) => a.pos - b.pos);

    const spanStart = alongX ? x0 : z0;
    const spanEnd = alongX ? x1 : z1;
    const t0 = alongX ? z0 : x0;
    const t1 = alongX ? z1 : x1;
    const thick = t1 - t0;
    const thickTiles = Math.max(1, Math.round(thick / tileMod)) * tileMod;

    const pt = (s, y, t) => (alongX ? [s, y, t] : [t, y, s]);
    let cursor = spanStart;

    for (const arch of arches) {
      const a = Math.max(cursor, arch.pos - arch.radius);
      const b = Math.min(spanEnd, arch.pos + arch.radius);
      const r = arch.radius;
      const spring = arch.spring;

      // Solid pier before arch
      if (a > cursor + 1e-4) {
        if (alongX) this.box([cursor, y0, z0], [a, y1, z1], mat, { solid: opts.solid !== false });
        else this.box([x0, y0, cursor], [x1, y1, a], mat, { solid: opts.solid !== false });
      }

      // Symmetric even tile course count along the arch intrados:
      // guarantees a centered crown mortar joint and full courses meeting both vertical jambs.
      const halfArc = Math.PI * r * 0.5;
      const halfCourses = Math.max(2, Math.round(halfArc / tileMod));
      const archTileSpan = halfCourses * 2 * tileMod;

      // Spandrel faces (front & back) extend cleanly from spring all the way to y1
      // in one seamless chart with exact world planar UVs (zero tile skew or header seam!).
      const spandrelH = y1 - spring;
      const spandrelFrontChart = this._beginChart(2 * r, spandrelH, 1.1);
      const spandrelBackChart = this._beginChart(2 * r, spandrelH, 1.1);
      const intradosChart = this._beginChart(Math.PI * r, thick, 1.15);

      // Top cap of arch wall over the opening
      if (alongX) {
        this.addQuad([a, y1, t1], [b, y1, t1], [b, y1, t0], [a, y1, t0], mat, {
          u0: a, v0: -t1, u1: b, v1: -t0, priority: 0.3,
        });
      } else {
        this.addQuad([t0, y1, b], [t1, y1, b], [t1, y1, a], [t0, y1, a], mat, {
          u0: t0, v0: -b, u1: t1, v1: -a, priority: 0.3,
        });
      }

      for (let i = 0; i < segs; i++) {
        const f0 = i / segs;
        const f1 = (i + 1) / segs;
        const ang0 = Math.PI * (1 - f0); // pi -> 0 (left to right along s)
        const ang1 = Math.PI * (1 - f1);
        const s0 = arch.pos + r * Math.cos(ang0);
        const s1 = arch.pos + r * Math.cos(ang1);
        const ay0 = spring + r * Math.sin(ang0);
        const ay1 = spring + r * Math.sin(ang1);
        const luA = (s0 - a) / (2 * r);
        const luB = (s1 - a) / (2 * r);
        const lvA = (ay0 - spring) / spandrelH;
        const lvB = (ay1 - spring) / spandrelH;

        // Front (+t1) and Back (-t0) spandrels reaching full height y1
        if (alongX) {
          this.addQuad(pt(s0, ay0, t1), pt(s1, ay1, t1), pt(s1, y1, t1), pt(s0, y1, t1), mat, {
            uvs: [[s0, ay0], [s1, ay1], [s1, y1], [s0, y1]],
            chart: spandrelFrontChart,
            luvs: [[luA, lvA], [luB, lvB], [luB, 1], [luA, 1]],
          });
          this.addQuad(pt(s1, ay1, t0), pt(s0, ay0, t0), pt(s0, y1, t0), pt(s1, y1, t0), mat, {
            uvs: [[-s1, ay1], [-s0, ay0], [-s0, y1], [-s1, y1]],
            chart: spandrelBackChart,
            luvs: [[1 - luB, lvB], [1 - luA, lvA], [1 - luA, 1], [1 - luB, 1]],
          });
          const n0 = [-Math.cos(ang0), -Math.sin(ang0), 0];
          const n1 = [-Math.cos(ang1), -Math.sin(ang1), 0];
          this.addQuad(pt(s0, ay0, t0), pt(s1, ay1, t0), pt(s1, ay1, t1), pt(s0, ay0, t1), mat, {
            u0: f0 * archTileSpan, v0: 0, u1: f1 * archTileSpan, v1: thickTiles,
            normals: [n0, n1, n1, n0],
            chart: intradosChart,
            lu0: f0, lv0: 0, lu1: f1, lv1: 1,
          });
        } else {
          this.addQuad(pt(s1, ay1, t1), pt(s0, ay0, t1), pt(s0, y1, t1), pt(s1, y1, t1), mat, {
            uvs: [[-s1, ay1], [-s0, ay0], [-s0, y1], [-s1, y1]],
            chart: spandrelFrontChart,
            luvs: [[1 - luB, lvB], [1 - luA, lvA], [1 - luA, 1], [1 - luB, 1]],
          });
          this.addQuad(pt(s0, ay0, t0), pt(s1, ay1, t0), pt(s1, y1, t0), pt(s0, y1, t0), mat, {
            uvs: [[s0, ay0], [s1, ay1], [s1, y1], [s0, y1]],
            chart: spandrelBackChart,
            luvs: [[luA, lvA], [luB, lvB], [luB, 1], [luA, 1]],
          });
          const n0 = [0, -Math.sin(ang0), -Math.cos(ang0)];
          const n1 = [0, -Math.sin(ang1), -Math.cos(ang1)];
          this.addQuad(pt(s0, ay0, t1), pt(s1, ay1, t1), pt(s1, ay1, t0), pt(s0, ay0, t0), mat, {
            u0: f0 * archTileSpan, v0: 0, u1: f1 * archTileSpan, v1: thickTiles,
            normals: [n0, n1, n1, n0],
            chart: intradosChart,
            lu0: f0, lv0: 0, lu1: f1, lv1: 1,
          });
        }
      }

      cursor = Math.max(cursor, b);
    }

    if (spanEnd > cursor + 1e-4) {
      if (alongX) this.box([cursor, y0, z0], [spanEnd, y1, z1], mat, { solid: opts.solid !== false });
      else this.box([x0, y0, cursor], [x1, y1, spanEnd], mat, { solid: opts.solid !== false });
    }
    return this;
  }

  // Smooth vertical cylinder (column or inward circular drum) with seamless integer-module
  // circumferential tile setting-out (zero vertical wrap sliver!).
  cylinder(x, z, y0, y1, radius, matSpec, opts = {}) {
    const segs = opts.segments ?? 24;
    const inside = !!opts.inside;
    const height = y1 - y0;
    const circum = TAU * radius;
    const tileMod = opts.tileModule ?? 0.20;
    const circumTileSpan = Math.max(4, Math.round(circum / tileMod)) * tileMod;
    const chart = this._beginChart(circum, height, opts.priority ?? 1.0);

    for (let i = 0; i < segs; i++) {
      const f0 = i / segs;
      const f1 = (i + 1) / segs;
      const a0 = f0 * TAU;
      const a1 = f1 * TAU;
      const c0 = Math.cos(a0), s0 = Math.sin(a0);
      const c1 = Math.cos(a1), s1 = Math.sin(a1);
      const p00 = [x + radius * c0, y0, z + radius * s0];
      const p10 = [x + radius * c1, y0, z + radius * s1];
      const p11 = [x + radius * c1, y1, z + radius * s1];
      const p01 = [x + radius * c0, y1, z + radius * s0];

      if (!inside) {
        // Outward normal: p10 -> p00 goes CCW viewed from outside (+Y up), so 1-f1 -> 1-f0 increases monotonically
        const n0 = [c0, 0, s0];
        const n1 = [c1, 0, s1];
        this.addQuad(p10, p00, p01, p11, matSpec, {
          u0: (1 - f1) * circumTileSpan, v0: y0, u1: (1 - f0) * circumTileSpan, v1: y1,
          normals: [n1, n0, n0, n1],
          chart,
          lu0: 1 - f1, lv0: 0, lu1: 1 - f0, lv1: 1,
        });
      } else {
        // Inward normal: p00 -> p10 goes right when facing outward from center
        const n0 = [-c0, 0, -s0];
        const n1 = [-c1, 0, -s1];
        this.addQuad(p00, p10, p11, p01, matSpec, {
          u0: f0 * circumTileSpan, v0: y0, u1: f1 * circumTileSpan, v1: y1,
          normals: [n0, n1, n1, n0],
          chart,
          lu0: f0, lv0: 0, lu1: f1, lv1: 1,
        });
      }
    }

    if (opts.caps) {
      const capChart = this._beginChart(radius * 2, radius * 2, 0.7);
      const centerTop = [x, y1, z];
      const nUp = [0, 1, 0];
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * TAU;
        const am = ((i + 0.5) / segs) * TAU;
        const a1 = ((i + 1) / segs) * TAU;
        const p0 = [x + radius * Math.cos(a0), y1, z + radius * Math.sin(a0)];
        const pm = [x + radius * Math.cos(am), y1, z + radius * Math.sin(am)];
        const p1 = [x + radius * Math.cos(a1), y1, z + radius * Math.sin(a1)];
        this.addQuad(centerTop, p1, pm, p0, matSpec, {
          uvs: [
            [x, -z],
            [p1[0], -p1[2]],
            [pm[0], -pm[2]],
            [p0[0], -p0[2]],
          ],
          normals: [nUp, nUp, nUp, nUp],
          chart: capChart,
          luvs: [
            [0.5, 0.5],
            [0.5 + 0.45 * Math.cos(a1), 0.5 + 0.45 * Math.sin(a1)],
            [0.5 + 0.45 * Math.cos(am), 0.5 + 0.45 * Math.sin(am)],
            [0.5 + 0.45 * Math.cos(a0), 0.5 + 0.45 * Math.sin(a0)],
          ],
        });
      }
    }

    if (!inside && opts.solid !== false) {
      this.solids.push({ kind: "circle", x, z, radius, minY: y0, maxY: y1 });
    }
    return this;
  }

  // Smooth inward upper hemispherical dome with optional crown oculus opening.
  dome(cx, cy, cz, radius, matSpec, opts = {}) {
    const phiSegs = opts.phiSegments ?? 28;
    const thSegs = opts.thetaSegments ?? 10;
    const oculus = opts.oculusRadius ?? 0;
    const thMax = oculus > 0 ? Math.acos(Math.min(0.99, oculus / radius)) : Math.PI * 0.495;
    const chart = this._beginChart(TAU * radius, radius * thMax, opts.priority ?? 0.9);

    for (let j = 0; j < thSegs; j++) {
      const v0 = j / thSegs;
      const v1 = (j + 1) / thSegs;
      const th0 = v0 * thMax;
      const th1 = v1 * thMax;
      const r0 = radius * Math.cos(th0), y0 = cy + radius * Math.sin(th0);
      const r1 = radius * Math.cos(th1), y1 = cy + radius * Math.sin(th1);
      for (let i = 0; i < phiSegs; i++) {
        const u0 = i / phiSegs;
        const u1 = (i + 1) / phiSegs;
        const ph0 = u0 * TAU;
        const ph1 = u1 * TAU;
        const p00 = [cx + r0 * Math.cos(ph0), y0, cz + r0 * Math.sin(ph0)];
        const p10 = [cx + r0 * Math.cos(ph1), y0, cz + r0 * Math.sin(ph1)];
        const p11 = [cx + r1 * Math.cos(ph1), y1, cz + r1 * Math.sin(ph1)];
        const p01 = [cx + r1 * Math.cos(ph0), y1, cz + r1 * Math.sin(ph0)];
        const n00 = norm3(sub3([cx, cy, cz], p00));
        const n10 = norm3(sub3([cx, cy, cz], p10));
        const n11 = norm3(sub3([cx, cy, cz], p11));
        const n01 = norm3(sub3([cx, cy, cz], p01));
        this.addQuad(p00, p10, p11, p01, matSpec, {
          u0: u0 * TAU * radius, v0: v0 * radius * thMax,
          u1: u1 * TAU * radius, v1: v1 * radius * thMax,
          normals: [n00, n10, n11, n01],
          chart,
          lu0: u0, lv0: v0, lu1: u1, lv1: v1,
        });
      }
    }
    return this;
  }

  // Flared 4-sided truncated-pyramid concrete column capital (brutalist parking mushroom capital).
  flaredCapital(cx, cz, y0, y1, rBot, rTop, matSpec, opts = {}) {
    const h = y1 - y0;
    const slant = Math.hypot(h, rTop - rBot);
    const prio = opts.priority ?? 0.6;
    const b0 = [cx - rBot, y0, cz + rBot];
    const b1 = [cx + rBot, y0, cz + rBot];
    const b2 = [cx + rBot, y0, cz - rBot];
    const b3 = [cx - rBot, y0, cz - rBot];
    const t0 = [cx - rTop, y1, cz + rTop];
    const t1 = [cx + rTop, y1, cz + rTop];
    const t2 = [cx + rTop, y1, cz - rTop];
    const t3 = [cx - rTop, y1, cz - rTop];

    // +Z, -Z, +X, -X outward sloped faces (CCW outward winding, world-metric UVs)
    this.addQuad(b0, b1, t1, t0, matSpec, { u0: -rBot, v0: 0, u1: rBot, v1: slant, priority: prio });
    this.addQuad(b2, b3, t3, t2, matSpec, { u0: -rBot, v0: 0, u1: rBot, v1: slant, priority: prio });
    this.addQuad(b1, b2, t2, t1, matSpec, { u0: -rBot, v0: 0, u1: rBot, v1: slant, priority: prio });
    this.addQuad(b3, b0, t0, t3, matSpec, { u0: -rBot, v0: 0, u1: rBot, v1: slant, priority: prio });
    return this;
  }

  // Smooth concave trumpet-flared round concrete mushroom column (Level 1 Vaulted Garage!).
  // Cylindrical shaft from y0..yFlare transitions smoothly via a hyperbolic bell flare to rTop at y1.
  trumpetColumn(cx, cz, y0, y1, rShaft, rTop, matSpec, opts = {}) {
    const segs = opts.segments ?? 24;
    const rings = opts.rings ?? 7;
    const yFlare = opts.yFlare ?? (y0 + (y1 - y0) * 0.48);
    const prio = opts.priority ?? 0.65;
    const circum = TAU * rShaft;
    const chart = this._beginChart(circum, y1 - y0, prio);

    // Profile points (y, r, ny_slope) from floor y0 to ceiling y1
    const prof = [];
    prof.push({ y: y0, r: rShaft, drdy: 0 });
    prof.push({ y: yFlare, r: rShaft, drdy: 0 });
    const flareH = Math.max(0.1, y1 - yFlare);
    const power = opts.flarePower ?? 2.35;
    for (let j = 1; j <= rings; j++) {
      const t = j / rings;
      const r = rShaft + (rTop - rShaft) * Math.pow(t, power);
      const drdy = ((rTop - rShaft) * power * Math.pow(Math.max(t, 1e-3), power - 1)) / flareH;
      prof.push({ y: yFlare + t * flareH, r, drdy });
    }

    const totalH = Math.max(1e-4, y1 - y0);
    for (let j = 0; j < prof.length - 1; j++) {
      const pA = prof[j];
      const pB = prof[j + 1];
      const lv0 = (pA.y - y0) / totalH;
      const lv1 = (pB.y - y0) / totalH;
      const v0 = pA.y;
      const v1 = pB.y;
      for (let i = 0; i < segs; i++) {
        const f0 = i / segs;
        const f1 = (i + 1) / segs;
        const a0 = f0 * TAU;
        const a1 = f1 * TAU;
        const c0 = Math.cos(a0), s0 = Math.sin(a0);
        const c1 = Math.cos(a1), s1 = Math.sin(a1);
        const q0 = [cx + pA.r * c1, pA.y, cz + pA.r * s1];
        const q1 = [cx + pA.r * c0, pA.y, cz + pA.r * s0];
        const q2 = [cx + pB.r * c0, pB.y, cz + pB.r * s0];
        const q3 = [cx + pB.r * c1, pB.y, cz + pB.r * s1];
        const nA1 = norm3([c1, -pA.drdy, s1]);
        const nA0 = norm3([c0, -pA.drdy, s0]);
        const nB0 = norm3([c0, -pB.drdy, s0]);
        const nB1 = norm3([c1, -pB.drdy, s1]);
        this.addQuad(q0, q1, q2, q3, matSpec, {
          u0: f1 * circum, v0, u1: f0 * circum, v1,
          normals: [nA1, nA0, nB0, nB1],
          chart,
          lu0: f1, lv0, lu1: f0, lv1,
        });
      }
    }

    if (opts.solid !== false) {
      this.solids.push({ kind: "circle", x: cx, z: cz, radius: rShaft, minY: y0, maxY: y1 });
    }
    return this;
  }

  // Organic procedural 3D hanging/climbing foliage ivy vine (2 crossed gently swaying continuous ribbons
  // evaluated with botanical stem + 3-lobed ivy leaf alpha-cutout in WGSL — 32 tris/vine, 1 UV2 chart, zero collision!).
  foliageVine(x, yTop, yBot, z, matSpec = "foliage_vine", opts = {}) {
    const height = Math.max(0.3, yTop - yBot);
    const seed = opts.seed ?? (x * 13.7 + z * 29.3);
    const width = opts.width ?? (opts.leafSize ? opts.leafSize * 2.15 : 0.38);
    const sway = opts.sway ?? 0.11;
    const segs = Math.max(3, Math.min(6, Math.round(height / 0.95)));
    const prio = opts.priority ?? 0.14;
    const baseAngle = (Math.abs(Math.sin(seed * 7.31)) * TAU);
    const vOff = Math.abs(Math.sin(seed * 3.17)) * 11.3;
    const vScale = opts.vScale ?? 2.05;

    // Single shared non-overlapping UV2 chart per vine strand
    const chart = this._beginChart(width * 2.0, height, prio);

    for (let c = 0; c < 2; c++) {
      const ang = baseAngle + c * (Math.PI * 0.5);
      const px = Math.cos(ang);
      const pz = Math.sin(ang);
      const luBase = c * 0.5;
      for (let i = 0; i < segs; i++) {
        const f0 = i / segs;
        const f1 = (i + 1) / segs;
        const y0 = yTop - f0 * height;
        const y1 = yTop - f1 * height;
        const hw0 = width * 0.5 * (0.95 + 0.18 * Math.sin(f0 * 4.5 + seed));
        const hw1 = width * 0.5 * (0.95 + 0.18 * Math.sin(f1 * 4.5 + seed));
        const ox0 = Math.sin(f0 * 4.2 + seed) * sway;
        const oz0 = Math.cos(f0 * 3.6 + seed * 1.4) * sway;
        const ox1 = Math.sin(f1 * 4.2 + seed) * sway;
        const oz1 = Math.cos(f1 * 3.6 + seed * 1.4) * sway;
        const p0 = [x + ox0 - px * hw0, y0, z + oz0 - pz * hw0];
        const p1 = [x + ox0 + px * hw0, y0, z + oz0 + pz * hw0];
        const p2 = [x + ox1 + px * hw1, y1, z + oz1 + pz * hw1];
        const p3 = [x + ox1 - px * hw1, y1, z + oz1 - pz * hw1];
        const v0 = vOff + f0 * height * vScale;
        const v1 = vOff + f1 * height * vScale;
        this.addQuad(p0, p1, p2, p3, matSpec, { u0: 0, v0, u1: 1, v1, chart, lu0: luBase, lv0: f0, lu1: luBase + 0.25, lv1: f1 });
        this.addQuad(p1, p0, p3, p2, matSpec, { u0: 0, v0, u1: 1, v1, chart, lu0: luBase + 0.25, lv0: f0, lu1: luBase + 0.5, lv1: f1 });
      }
    }
    return this;
  }

  // Straight staircase ascending along '+x', '-x', '+z', or '-z'.
  // Emits solid step geometry + smooth walkable ramp zone for collision.
  stairs(lo, hi, dir, steps, matSpec, opts = {}) {
    const [x0, y0, z0] = lo;
    const [x1, y1, z1] = hi;
    const count = Math.max(2, Math.round(steps));
    const dy = (y1 - y0) / count;
    const isX = dir === "+x" || dir === "-x";
    const span = isX ? x1 - x0 : z1 - z0;
    const prio = opts.priority ?? 1.0;

    for (let i = 0; i < count; i++) {
      const f0 = i / count;
      const f1 = (i + 1) / count;
      const prevTop = y0 + i * dy;
      const top = y0 + (i + 1) * dy;
      let sx0 = x0, sx1 = x1, sz0 = z0, sz1 = z1;
      if (dir === "+x") { sx0 = x0 + f0 * span; sx1 = x0 + f1 * span; }
      if (dir === "-x") { sx0 = x1 - f1 * span; sx1 = x1 - f0 * span; }
      if (dir === "+z") { sz0 = z0 + f0 * span; sz1 = z0 + f1 * span; }
      if (dir === "-z") { sz0 = z1 - f1 * span; sz1 = z1 - f0 * span; }

      // Emit each step as a solid vertical masonry column from y0 to top, skipping
      // buried internal walls against adjacent steps so lightmap texels never bleed black seams.
      const skip = ["ny"];
      if (dir === "+x") {
        skip.push("nx");
        if (i < count - 1) skip.push("px");
      } else if (dir === "-x") {
        skip.push("px");
        if (i < count - 1) skip.push("nx");
      } else if (dir === "+z") {
        skip.push("nz");
        if (i < count - 1) skip.push("pz");
      } else if (dir === "-z") {
        skip.push("pz");
        if (i < count - 1) skip.push("nz");
      }

      this.box([sx0, y0, sz0], [sx1, top, sz1], matSpec, {
        solid: false,
        skipFaces: skip,
        priority: prio,
      });

      // Emit ONLY the exposed riser face [prevTop .. top] on the descending side.
      if (dir === "+x") {
        this.addQuad([sx0, prevTop, sz0], [sx0, prevTop, sz1], [sx0, top, sz1], [sx0, top, sz0], matSpec, {
          u0: sz0, v0: prevTop, u1: sz1, v1: top, priority: prio,
        });
      } else if (dir === "-x") {
        this.addQuad([sx1, prevTop, sz1], [sx1, prevTop, sz0], [sx1, top, sz0], [sx1, top, sz1], matSpec, {
          u0: -sz1, v0: prevTop, u1: -sz0, v1: top, priority: prio,
        });
      } else if (dir === "+z") {
        this.addQuad([sx1, prevTop, sz0], [sx0, prevTop, sz0], [sx0, top, sz0], [sx1, top, sz0], matSpec, {
          u0: -sx1, v0: prevTop, u1: -sx0, v1: top, priority: prio,
        });
      } else if (dir === "-z") {
        this.addQuad([sx0, prevTop, sz1], [sx1, prevTop, sz1], [sx1, top, sz1], [sx0, top, sz1], matSpec, {
          u0: sx0, v0: prevTop, u1: sx1, v1: top, priority: prio,
        });
      }
    }

    if (opts.walkable !== false) {
      const isX = dir === "+x" || dir === "-x";
      const asc = dir === "+x" || dir === "+z";
      this.floors.push({
        kind: "ramp",
        axis: isX ? "x" : "z",
        minX: x0, maxX: x1, minZ: z0, maxZ: z1,
        y0: asc ? y0 : y1,
        y1: asc ? y1 : y0,
        override: !!opts.overrideFloor,
      });
    }
    return this;
  }

  // Cylindrical pipe or rail between two 3D points (handrails, ladders, ceiling conduits).
  pipe(p0, p1, radius, matSpec, opts = {}) {
    const segs = opts.segments ?? 10;
    const axis = sub3(p1, p0);
    const len = Math.hypot(axis[0], axis[1], axis[2]);
    if (len < 1e-5) return this;
    const dir = [axis[0] / len, axis[1] / len, axis[2] / len];
    const ref = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const uAx = norm3(cross3(ref, dir));
    const vAx = cross3(dir, uAx);
    const chart = this._beginChart(TAU * radius, len, 0.35);

    for (let i = 0; i < segs; i++) {
      const f0 = i / segs;
      const f1 = (i + 1) / segs;
      const a0 = f0 * TAU;
      const a1 = f1 * TAU;
      const n0 = [
        uAx[0] * Math.cos(a0) + vAx[0] * Math.sin(a0),
        uAx[1] * Math.cos(a0) + vAx[1] * Math.sin(a0),
        uAx[2] * Math.cos(a0) + vAx[2] * Math.sin(a0),
      ];
      const n1 = [
        uAx[0] * Math.cos(a1) + vAx[0] * Math.sin(a1),
        uAx[1] * Math.cos(a1) + vAx[1] * Math.sin(a1),
        uAx[2] * Math.cos(a1) + vAx[2] * Math.sin(a1),
      ];
      const q0 = [p0[0] + n0[0] * radius, p0[1] + n0[1] * radius, p0[2] + n0[2] * radius];
      const q1 = [p0[0] + n1[0] * radius, p0[1] + n1[1] * radius, p0[2] + n1[2] * radius];
      const q2 = [p1[0] + n1[0] * radius, p1[1] + n1[1] * radius, p1[2] + n1[2] * radius];
      const q3 = [p1[0] + n0[0] * radius, p1[1] + n0[1] * radius, p1[2] + n0[2] * radius];
      this.addQuad(q0, q1, q2, q3, matSpec, {
        u0: f0 * TAU * radius, v0: 0, u1: f1 * TAU * radius, v1: len,
        normals: [n0, n1, n1, n0],
        chart,
        lu0: f0, lv0: 0, lu1: f1, lv1: 1,
      });
    }
    return this;
  }

  // Stainless steel pool ladder (two vertical rails + curved tops + horizontal rungs).
  poolLadder(x, z, yBottom, yTop, opts = {}) {
    const mat = opts.material ?? "stainless_steel";
    const r = opts.tubeRadius ?? 0.024;
    const halfW = (opts.width ?? 0.56) * 0.5;
    const depth = opts.depth ?? 0.32;
    const facing = opts.facing ?? "+z"; // direction into pool
    const fx = facing === "+x" ? 1 : facing === "-x" ? -1 : 0;
    const fz = facing === "+z" ? 1 : facing === "-z" ? -1 : 0;
    const sx = -fz, sz = fx; // lateral axis

    for (const side of [-1, 1]) {
      const lx = x + sx * halfW * side;
      const lz = z + sz * halfW * side;
      // Vertical post in pool
      this.pipe([lx, yBottom, lz], [lx, yTop + 0.55, lz], r, mat);
      // Curved top grip back onto deck
      this.pipe([lx, yTop + 0.55, lz], [lx - fx * depth, yTop + 0.55, lz - fz * depth], r, mat);
      this.pipe([lx - fx * depth, yTop + 0.55, lz - fz * depth], [lx - fx * depth, yTop, lz - fz * depth], r, mat);
    }
    const rungs = opts.rungs ?? 4;
    for (let i = 1; i <= rungs; i++) {
      const ry = yBottom + (i / (rungs + 1)) * (yTop - yBottom + 0.15);
      this.pipe(
        [x - sx * halfW, ry, z - sz * halfW],
        [x + sx * halfW, ry, z + sz * halfW],
        r * 0.85,
        mat,
      );
    }
    return this;
  }

  // Sleek stainless-steel horizontal poolside handrail with vertical posts and mid-rail.
  handrail(p0, p1, yBase, height = 0.92, opts = {}) {
    const mat = opts.material ?? "stainless_steel";
    const r = opts.radius ?? 0.022;
    const dx = p1[0] - p0[0];
    const dz = p1[1] - p0[1];
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return this;
    const postSpacing = opts.postSpacing ?? 1.4;
    const posts = Math.max(2, Math.round(len / postSpacing) + 1);
    for (let i = 0; i < posts; i++) {
      const f = i / (posts - 1);
      const px = p0[0] + dx * f;
      const pz = p0[1] + dz * f;
      this.pipe([px, yBase, pz], [px, yBase + height, pz], r * 0.9, mat, { segments: 8 });
    }
    this.pipe([p0[0], yBase + height, p0[1]], [p1[0], yBase + height, p1[1]], r, mat, { segments: 8 });
    if (opts.midRail !== false) {
      this.pipe([p0[0], yBase + height * 0.54, p0[1]], [p1[0], yBase + height * 0.54, p1[1]], r * 0.78, mat, { segments: 8 });
    }
    return this;
  }

  // Helper: shoots ray from (cx, cy) along (cosA, sinA) to intersect bounding rect [s0, s1] x [y0, y1].
  _rayToRect2D(cx, cy, cosA, sinA, s0, s1, y0, y1) {
    let t = Infinity;
    if (cosA > 1e-7) t = Math.min(t, (s1 - cx) / cosA);
    else if (cosA < -1e-7) t = Math.min(t, (s0 - cx) / cosA);
    if (sinA > 1e-7) t = Math.min(t, (y1 - cy) / sinA);
    else if (sinA < -1e-7) t = Math.min(t, (y0 - cy) / sinA);
    return [cx + cosA * t, cy + sinA * t];
  }

  // Wall pierced by a circular ring tunnel (clipped cleanly by floor y0) or full circular porthole.
  // Generates watertight corner-exact planar faces with world-scale tile UVs + symmetric
  // crown-centered integer-module cylindrical reveal setting-out!
  ringWall(lo, hi, opts = {}) {
    const [x0, y0, z0] = lo;
    const [x1, y1, z1] = hi;
    const mat = opts.material ?? "tile_white";
    const tileMod = opts.tileModule ?? 0.20;
    const alongX = x1 - x0 >= z1 - z0;
    const sMin = alongX ? x0 : z0;
    const sMax = alongX ? x1 : z1;
    const t0 = alongX ? z0 : x0;
    const t1 = alongX ? z1 : x1;
    const thick = t1 - t0;
    const thickTiles = Math.max(1, Math.round(thick / tileMod)) * tileMod;
    const cx = opts.center ?? (sMin + sMax) * 0.5;
    const cy = opts.centerY ?? y0 + (y1 - y0) * 0.42;
    const r = opts.radius ?? Math.min((sMax - sMin) * 0.38, (y1 - y0) * 0.55);
    const segs = opts.segments ?? 36;

    const pt = (s, y, t) => (alongX ? [s, y, t] : [t, y, s]);
    const fullCircle = cy - r > y0 + 0.02;

    // Build sorted angle list including exact rectangle corners so outer perimeter is 100% watertight.
    const angles = [];
    let aStart, aEnd;
    if (fullCircle) {
      aStart = 0;
      aEnd = TAU;
      for (let i = 0; i <= segs; i++) angles.push((i / segs) * TAU);
    } else {
      const clipRatio = Math.max(-0.995, Math.min(0.995, (y0 - cy) / r));
      const aClip = Math.asin(clipRatio); // negative angle where circle meets y0 on the right
      aStart = aClip;
      aEnd = Math.PI - aClip;
      for (let i = 0; i <= segs; i++) angles.push(aStart + (i / segs) * (aEnd - aStart));
    }

    // Insert the 4 wall rectangle corners that fall inside (aStart, aEnd).
    const corners = [
      [sMax, y0],
      [sMax, y1],
      [sMin, y1],
      [sMin, y0],
    ];
    for (const [cs, cyC] of corners) {
      let ang = Math.atan2(cyC - cy, cs - cx);
      if (fullCircle && ang < 0) ang += TAU;
      if (!fullCircle && ang < aStart - 1e-4) ang += TAU;
      if (ang > aStart + 1e-4 && ang < aEnd - 1e-4) {
        angles.push(ang);
      }
    }
    angles.sort((a, b) => a - b);
    // Deduplicate near-identical angles.
    const uniq = [angles[0]];
    for (let i = 1; i < angles.length; i++) {
      if (angles[i] - uniq[uniq.length - 1] > 1e-4) uniq.push(angles[i]);
    }

    const wallW = sMax - sMin;
    const wallH = y1 - y0;
    const frontChart = this._beginChart(wallW, wallH, opts.priority ?? 1.15);
    const backChart = this._beginChart(wallW, wallH, opts.priority ?? 1.15);
    const revealChart = this._beginChart((aEnd - aStart) * r, thick, opts.priority ?? 1.2);

    const normLU = (s) => Math.max(0, Math.min(1, (s - sMin) / wallW));
    const normLV = (y) => Math.max(0, Math.min(1, (y - y0) / wallH));

    // Symmetric crown-centered reveal U mapping:
    // Crown (angle = PI/2) lands on u = 0 (exact center mortar joint); both floor bases
    // (or top/bottom of a full porthole) land on exact integer multiples of tileMod!
    const totalArc = aEnd - aStart;
    let revealU;
    if (fullCircle) {
      const halfCourses = Math.max(2, Math.round((Math.PI * r) / tileMod));
      const fullTileSpan = halfCourses * 2 * tileMod;
      revealU = (a) => ((a - Math.PI * 0.5) / TAU) * fullTileSpan;
    } else {
      const halfArcAng = Math.PI * 0.5 - aStart;
      const halfCourses = Math.max(2, Math.round((halfArcAng * r) / tileMod));
      const halfTileSpan = halfCourses * tileMod;
      revealU = (a) => ((a - Math.PI * 0.5) / halfArcAng) * halfTileSpan;
    }

    for (let i = 0; i < uniq.length - 1; i++) {
      const a0 = uniq[i];
      const a1 = uniq[i + 1];
      const c0 = Math.cos(a0), s0 = Math.sin(a0);
      const c1 = Math.cos(a1), s1 = Math.sin(a1);
      const in0 = [cx + r * c0, cy + r * s0];
      const in1 = [cx + r * c1, cy + r * s1];
      const out0 = this._rayToRect2D(cx, cy, c0, s0, sMin, sMax, y0, y1);
      const out1 = this._rayToRect2D(cx, cy, c1, s1, sMin, sMax, y0, y1);

      const f0 = (a0 - aStart) / totalArc;
      const f1 = (a1 - aStart) / totalArc;
      const ru0 = revealU(a0);
      const ru1 = revealU(a1);

      if (alongX) {
        // Front face (+z = t1): outward normal +Z => CCW in (x, y) is (in0 -> out0 -> out1 -> in1)
        this.addQuad(
          pt(in0[0], in0[1], t1),
          pt(out0[0], out0[1], t1),
          pt(out1[0], out1[1], t1),
          pt(in1[0], in1[1], t1),
          mat,
          {
            uvs: [in0, out0, out1, in1],
            chart: frontChart,
            luvs: [
              [normLU(in0[0]), normLV(in0[1])],
              [normLU(out0[0]), normLV(out0[1])],
              [normLU(out1[0]), normLV(out1[1])],
              [normLU(in1[0]), normLV(in1[1])],
            ],
          },
        );
        // Back face (-z = t0): outward normal -Z => reverse winding
        this.addQuad(
          pt(in1[0], in1[1], t0),
          pt(out1[0], out1[1], t0),
          pt(out0[0], out0[1], t0),
          pt(in0[0], in0[1], t0),
          mat,
          {
            uvs: [[-in1[0], in1[1]], [-out1[0], out1[1]], [-out0[0], out0[1]], [-in0[0], in0[1]]],
            chart: backChart,
            luvs: [
              [1 - normLU(in1[0]), normLV(in1[1])],
              [1 - normLU(out1[0]), normLV(out1[1])],
              [1 - normLU(out0[0]), normLV(out0[1])],
              [1 - normLU(in0[0]), normLV(in0[1])],
            ],
          },
        );
        // Inner cylindrical reveal (normal pointing inward toward circle center, v=0 flush at front t1)
        const n0 = [-c0, -s0, 0];
        const n1 = [-c1, -s1, 0];
        this.addQuad(
          pt(in0[0], in0[1], t1),
          pt(in1[0], in1[1], t1),
          pt(in1[0], in1[1], t0),
          pt(in0[0], in0[1], t0),
          mat,
          {
            u0: ru0, v0: 0, u1: ru1, v1: thickTiles,
            normals: [n0, n1, n1, n0],
            chart: revealChart,
            lu0: f0, lv0: 0, lu1: f1, lv1: 1,
          },
        );
      } else {
        // Wall along Z: +x = t1 face has outward normal +X => CCW in (z, y) is (in1 -> out1 -> out0 -> in0)
        this.addQuad(
          pt(in1[0], in1[1], t1),
          pt(out1[0], out1[1], t1),
          pt(out0[0], out0[1], t1),
          pt(in0[0], in0[1], t1),
          mat,
          {
            uvs: [[-in1[0], in1[1]], [-out1[0], out1[1]], [-out0[0], out0[1]], [-in0[0], in0[1]]],
            chart: frontChart,
            luvs: [
              [1 - normLU(in1[0]), normLV(in1[1])],
              [1 - normLU(out1[0]), normLV(out1[1])],
              [1 - normLU(out0[0]), normLV(out0[1])],
              [1 - normLU(in0[0]), normLV(in0[1])],
            ],
          },
        );
        // -x = t0 face has outward normal -X
        this.addQuad(
          pt(in0[0], in0[1], t0),
          pt(out0[0], out0[1], t0),
          pt(out1[0], out1[1], t0),
          pt(in1[0], in1[1], t0),
          mat,
          {
            uvs: [in0, out0, out1, in1],
            chart: backChart,
            luvs: [
              [normLU(in0[0]), normLV(in0[1])],
              [normLU(out0[0]), normLV(out0[1])],
              [normLU(out1[0]), normLV(out1[1])],
              [normLU(in1[0]), normLV(in1[1])],
            ],
          },
        );
        const n0 = [0, -s0, -c0];
        const n1 = [0, -s1, -c1];
        this.addQuad(
          pt(in0[0], in0[1], t0),
          pt(in1[0], in1[1], t0),
          pt(in1[0], in1[1], t1),
          pt(in0[0], in0[1], t1),
          mat,
          {
            u0: ru0, v0: 0, u1: ru1, v1: thickTiles,
            normals: [n0, n1, n1, n0],
            chart: revealChart,
            lu0: f0, lv0: 0, lu1: f1, lv1: 1,
          },
        );
      }
    }

    // Optional backlit glass fill inside a full circular porthole!
    if (opts.glassMaterial && fullCircle) {
      const gMat = opts.glassMaterial;
      const gT = opts.glassFacing === "-" ? t0 + thick * 0.25 : t1 - thick * 0.25;
      const gChart = this._beginChart(2 * r, 2 * r, 0.35);
      const centerPt = pt(cx, cy, gT);
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * TAU;
        const am = ((i + 0.5) / segs) * TAU;
        const a1 = ((i + 1) / segs) * TAU;
        const pA = pt(cx + r * Math.cos(a0), cy + r * Math.sin(a0), gT);
        const pM = pt(cx + r * Math.cos(am), cy + r * Math.sin(am), gT);
        const pB = pt(cx + r * Math.cos(a1), cy + r * Math.sin(a1), gT);
        const facePos = opts.glassFacing !== "-";
        if ((alongX && facePos) || (!alongX && !facePos)) {
          this.addQuad(centerPt, pA, pM, pB, gMat, { u0: 0, v0: 0, u1: 1, v1: 1, chart: gChart, lu0: 0, lv0: 0, lu1: 1, lv1: 1 });
        } else {
          this.addQuad(centerPt, pB, pM, pA, gMat, { u0: 0, v0: 0, u1: 1, v1: 1, chart: gChart, lu0: 0, lv0: 0, lu1: 1, lv1: 1 });
        }
      }
      if (opts.lightColor && opts.lightIntensity) {
        const hr = r * 0.72;
        const eT = opts.glassFacing === "-" ? t0 - 0.04 : t1 + 0.04;
        if (alongX) {
          if (opts.glassFacing !== "-") {
            this.addAreaLight([cx - hr, cy - hr, eT], [cx + hr, cy - hr, eT], [cx - hr, cy + hr, eT], opts.lightColor, opts.lightIntensity);
          } else {
            this.addAreaLight([cx + hr, cy - hr, eT], [cx - hr, cy - hr, eT], [cx + hr, cy + hr, eT], opts.lightColor, opts.lightIntensity);
          }
        } else {
          if (opts.glassFacing !== "-") {
            this.addAreaLight([eT, cy - hr, cx + hr], [eT, cy - hr, cx - hr], [eT, cy + hr, cx + hr], opts.lightColor, opts.lightIntensity);
          } else {
            this.addAreaLight([eT, cy - hr, cx - hr], [eT, cy - hr, cx + hr], [eT, cy + hr, cx - hr], opts.lightColor, opts.lightIntensity);
          }
        }
      }
    }

    // Collision solids on left & right piers flanking the circular opening (walk right through the ring!).
    if (opts.solid !== false) {
      if (fullCircle) {
        this.solids.push({ kind: "box", minX: x0, maxX: x1, minY: y0, maxY: y1, minZ: z0, maxZ: z1 });
      } else {
        const passHalf = Math.sqrt(Math.max(0.04, r * r - Math.pow(Math.max(0, cy - y0 - 0.5), 2))) * 0.90;
        const leftEnd = cx - passHalf;
        const rightStart = cx + passHalf;
        if (alongX) {
          if (leftEnd > x0 + 0.05) this.solids.push({ kind: "box", minX: x0, maxX: leftEnd, minY: y0, maxY: y1, minZ: z0, maxZ: z1 });
          if (x1 > rightStart + 0.05) this.solids.push({ kind: "box", minX: rightStart, maxX: x1, minY: y0, maxY: y1, minZ: z0, maxZ: z1 });
        } else {
          if (leftEnd > z0 + 0.05) this.solids.push({ kind: "box", minX: x0, maxX: x1, minY: y0, maxY: y1, minZ: z0, maxZ: leftEnd });
          if (z1 > rightStart + 0.05) this.solids.push({ kind: "box", minX: x0, maxX: x1, minY: y0, maxY: y1, minZ: rightStart, maxZ: z1 });
        }
      }
    }
    return this;
  }

  // Cantilevered spiral staircase wrapping a cylindrical column (clean non-overlapping slabs,
  // distortion-free Euclidean square tile UVs aligned across treads, soffits & rims, and solid lower collision).
  spiralStairs(cx, cz, y0, y1, innerR, outerR, startAngle, sweepAngle, steps, matSpec, opts = {}) {
    const count = Math.max(4, Math.round(steps));
    const dy = (y1 - y0) / count;
    const da = sweepAngle / count;
    const tileMod = opts.tileModule ?? 0.20;
    const slabH = opts.slabThickness ?? dy;
    const treadW = outerR - innerR;
    const radialTiles = Math.max(1, Math.round(treadW / tileMod)) * tileMod;
    const slabTiles = Math.max(1, Math.round(slabH / tileMod)) * tileMod;
    const outerChord = 2 * outerR * Math.sin(Math.abs(da) * 0.5);
    const outerTiles = Math.max(1, Math.round(outerChord / tileMod)) * tileMod;
    // Scale radial U slightly (~1%) so inner->outer edge lands cleanly on a full tile joint with zero slivers.
    const rScale = radialTiles / Math.max(treadW, 1e-4);
    // Odd outer tile count centers a full tile on step midline (t=0); even count centers a joint on t=0.
    const outerTileCount = Math.max(1, Math.round(outerChord / tileMod));
    const vCenterShift = (outerTileCount & 1) ? 0.5 * tileMod : 0.0;

    for (let i = 0; i < count; i++) {
      const a0 = startAngle + i * da;
      const a1 = startAngle + (i + 1) * da;
      const yTop = y0 + (i + 1) * dy;
      const yBot = Math.max(y0, yTop - slabH);

      const c0 = Math.cos(a0), s0 = Math.sin(a0);
      const c1 = Math.cos(a1), s1 = Math.sin(a1);
      const in0B = [cx + innerR * c0, yBot, cz + innerR * s0];
      const out0B = [cx + outerR * c0, yBot, cz + outerR * s0];
      const out1B = [cx + outerR * c1, yBot, cz + outerR * s1];
      const in1B = [cx + innerR * c1, yBot, cz + innerR * s1];

      const in0T = [cx + innerR * c0, yTop, cz + innerR * s0];
      const out0T = [cx + outerR * c0, yTop, cz + outerR * s0];
      const out1T = [cx + outerR * c1, yTop, cz + outerR * s1];
      const in1T = [cx + innerR * c1, yTop, cz + innerR * s1];

      const prio = opts.priority ?? 0.9;
      const aMid = 0.5 * (a0 + a1);
      const rx = Math.cos(aMid), rz = Math.sin(aMid);
      const tx = -rz, tz = rx;
      const rMid = 0.5 * (innerR + outerR);
      const stepCenter = [cx + rMid * rx, 0.5 * (yBot + yTop), cz + rMid * rz];

      // Exact isometric 2D Euclidean UV projection on horizontal step faces -> 100% square undistorted tiles!
      const horizUV = (p) => {
        const dx = p[0] - cx;
        const dz = p[2] - cz;
        const rProj = (dx * rx + dz * rz - innerR) * rScale;
        const tProj = dx * tx + dz * tz;
        return [rProj, tProj + vCenterShift];
      };

      // Always keep every vertex paired with its exact UV even when winding flips!
      const emitQuadUV = (q0, q1, q2, q3, uv0, uv1, uv2, uv3) => {
        const n = cross3(sub3(q1, q0), sub3(q3, q0));
        const qc = [
          0.25 * (q0[0] + q1[0] + q2[0] + q3[0]),
          0.25 * (q0[1] + q1[1] + q2[1] + q3[1]),
          0.25 * (q0[2] + q1[2] + q2[2] + q3[2]),
        ];
        const out = sub3(qc, stepCenter);
        if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] >= 0) {
          this.addQuad(q0, q1, q2, q3, matSpec, { uvs: [uv0, uv1, uv2, uv3], priority: prio });
        } else {
          this.addQuad(q0, q3, q2, q1, matSpec, { uvs: [uv0, uv3, uv2, uv1], priority: prio });
        }
      };

      // Top tread & bottom soffit: distortion-free Euclidean square tiles aligned to outer rim joints
      emitQuadUV(in0T, out0T, out1T, in1T, horizUV(in0T), horizUV(out0T), horizUV(out1T), horizUV(in1T));
      emitQuadUV(in0B, in1B, out1B, out0B, horizUV(in0B), horizUV(in1B), horizUV(out1B), horizUV(out0B));

      // Outer rim & radial risers: exact full tile courses (zero horizontal sliver drift across steps!)
      emitQuadUV(out0B, out1B, out1T, out0T, [0, 0], [outerTiles, 0], [outerTiles, slabTiles], [0, slabTiles]);
      emitQuadUV(in0B, out0B, out0T, in0T, [0, 0], [radialTiles, 0], [radialTiles, slabTiles], [0, slabTiles]);
      emitQuadUV(out1B, in1B, in1T, out1T, [0, 0], [radialTiles, 0], [radialTiles, slabTiles], [0, slabTiles]);

      // Register collision on lower reachable steps so the player cannot clip through the staircase.
      if (opts.solid !== false && yBot < y0 + 1.85) {
        const colR = Math.min(treadW * 0.42, 0.45);
        const rr = innerR + treadW * 0.55;
        this.solids.push({
          kind: "circle",
          x: cx + rr * Math.cos(aMid),
          z: cz + rr * Math.sin(aMid),
          radius: colR,
          minY: y0,
          maxY: yTop,
        });
      }
    }
    return this;
  }

  // Wall bay with backlit rounded-top/bottom pill frosted window, separate non-overlapping
  // lightmap charts, symmetric arch/sill tile setting-out, and automatic area light.
  pillWindowBay(lo, hi, opts = {}) {
    const [x0, y0, z0] = lo;
    const [x1, y1, z1] = hi;
    const mat = opts.material ?? "tile_white";
    const glassMat = opts.glassMaterial ?? "frosted_window";
    const tileMod = opts.tileModule ?? 0.20;
    const alongX = x1 - x0 >= z1 - z0;
    const sMin = alongX ? x0 : z0;
    const sMax = alongX ? x1 : z1;
    const t0 = alongX ? z0 : x0;
    const t1 = alongX ? z1 : x1;
    const thick = t1 - t0;
    const thickTiles = Math.max(1, Math.round(thick / tileMod)) * tileMod;
    const wWidth = opts.windowWidth ?? (sMax - sMin) * 0.44;
    const wSill = opts.sillY ?? y0 + 0.60;
    const wHead = opts.headY ?? y1 - 0.60;
    const radius = wWidth * 0.5;
    const midS = (sMin + sMax) * 0.5;
    const a = midS - radius;
    const b = midS + radius;
    const springTop = Math.max(wSill + 0.1, wHead - radius);
    const springBot = Math.min(springTop - 0.05, wSill + radius);
    const facePos = opts.facing !== "-";
    const internalSkip = alongX ? ["nx", "px"] : ["nz", "pz"];

    // Left & right full-height wall piers + flush sill & lintel (skipping hidden internal faces)
    if (alongX) {
      if (a > sMin + 0.01) this.box([sMin, y0, t0], [a, y1, t1], mat, { solid: opts.solid !== false });
      if (sMax > b + 0.01) this.box([b, y0, t0], [sMax, y1, t1], mat, { solid: opts.solid !== false });
      if (wSill > y0 + 0.01) this.box([a, y0, t0], [b, wSill, t1], mat, { solid: opts.solid !== false, skipFaces: internalSkip });
      if (y1 > wHead + 0.01) this.box([a, wHead, t0], [b, y1, t1], mat, { solid: opts.solid !== false, skipFaces: internalSkip });
    } else {
      if (a > sMin + 0.01) this.box([t0, y0, sMin], [t1, y1, a], mat, { solid: opts.solid !== false });
      if (sMax > b + 0.01) this.box([t0, y0, b], [t1, y1, sMax], mat, { solid: opts.solid !== false });
      if (wSill > y0 + 0.01) this.box([t0, y0, a], [t1, wSill, b], mat, { solid: opts.solid !== false, skipFaces: internalSkip });
      if (y1 > wHead + 0.01) this.box([t0, wHead, a], [t1, y1, b], mat, { solid: opts.solid !== false, skipFaces: internalSkip });
    }

    // Semicircular upper head & lower sill spandrels + reveals (each with its own lightmap chart!)
    const segs = 12;
    const pt = (s, y, t) => (alongX ? [s, y, t] : [t, y, s]);
    const halfCourses = Math.max(2, Math.round((Math.PI * radius * 0.5) / tileMod));
    const archTileSpan = halfCourses * 2 * tileMod;

    const spTopFront = this._beginChart(wWidth, radius, 0.9);
    const spTopBack = this._beginChart(wWidth, radius, 0.4);
    const spBotFront = this._beginChart(wWidth, radius, 0.9);
    const spBotBack = this._beginChart(wWidth, radius, 0.4);
    const revTopChart = this._beginChart(Math.PI * radius, thick, 0.95);
    const revBotChart = this._beginChart(Math.PI * radius, thick, 0.95);

    for (let i = 0; i < segs; i++) {
      const f0 = i / segs, f1 = (i + 1) / segs;
      const ang0 = Math.PI * (1 - f0), ang1 = Math.PI * (1 - f1);
      const s0 = midS + radius * Math.cos(ang0), s1 = midS + radius * Math.cos(ang1);
      const ay0 = springTop + radius * Math.sin(ang0), ay1 = springTop + radius * Math.sin(ang1);
      const by0 = springBot - radius * Math.sin(ang0), by1 = springBot - radius * Math.sin(ang1);
      const lu0 = (s0 - a) / wWidth, lu1 = (s1 - a) / wWidth;
      const lvTop0 = (ay0 - springTop) / radius, lvTop1 = (ay1 - springTop) / radius;
      const lvBot0 = (by0 - wSill) / radius, lvBot1 = (by1 - wSill) / radius;

      if (alongX) {
        // Upper spandrel front (+Z) & back (-Z)
        this.addQuad(pt(s0, ay0, t1), pt(s1, ay1, t1), pt(s1, wHead, t1), pt(s0, wHead, t1), mat, {
          uvs: [[s0, ay0], [s1, ay1], [s1, wHead], [s0, wHead]], chart: spTopFront,
          luvs: [[lu0, lvTop0], [lu1, lvTop1], [lu1, 1], [lu0, 1]],
        });
        this.addQuad(pt(s1, ay1, t0), pt(s0, ay0, t0), pt(s0, wHead, t0), pt(s1, wHead, t0), mat, {
          uvs: [[-s1, ay1], [-s0, ay0], [-s0, wHead], [-s1, wHead]], chart: spTopBack,
          luvs: [[1 - lu1, lvTop1], [1 - lu0, lvTop0], [1 - lu0, 1], [1 - lu1, 1]],
        });
        // Upper semicircular reveal
        const n0 = [-Math.cos(ang0), -Math.sin(ang0), 0], n1 = [-Math.cos(ang1), -Math.sin(ang1), 0];
        this.addQuad(pt(s0, ay0, t0), pt(s1, ay1, t0), pt(s1, ay1, t1), pt(s0, ay0, t1), mat, {
          u0: f0 * archTileSpan, v0: 0, u1: f1 * archTileSpan, v1: thickTiles,
          normals: [n0, n1, n1, n0], chart: revTopChart, lu0: f0, lv0: 0, lu1: f1, lv1: 1,
        });
        // Lower spandrel front (+Z) & back (-Z)
        this.addQuad(pt(s0, wSill, t1), pt(s1, wSill, t1), pt(s1, by1, t1), pt(s0, by0, t1), mat, {
          uvs: [[s0, wSill], [s1, wSill], [s1, by1], [s0, by0]], chart: spBotFront,
          luvs: [[lu0, 0], [lu1, 0], [lu1, lvBot1], [lu0, lvBot0]],
        });
        this.addQuad(pt(s1, wSill, t0), pt(s0, wSill, t0), pt(s0, by0, t0), pt(s1, by1, t0), mat, {
          uvs: [[-s1, wSill], [-s0, wSill], [-s0, by0], [-s1, by1]], chart: spBotBack,
          luvs: [[1 - lu1, 0], [1 - lu0, 0], [1 - lu0, lvBot0], [1 - lu1, lvBot1]],
        });
        // Lower semicircular reveal
        const nb0 = [-Math.cos(ang0), Math.sin(ang0), 0], nb1 = [-Math.cos(ang1), Math.sin(ang1), 0];
        this.addQuad(pt(s0, by0, t1), pt(s1, by1, t1), pt(s1, by1, t0), pt(s0, by0, t0), mat, {
          u0: f0 * archTileSpan, v0: 0, u1: f1 * archTileSpan, v1: thickTiles,
          normals: [nb0, nb1, nb1, nb0], chart: revBotChart, lu0: f0, lv0: 0, lu1: f1, lv1: 1,
        });
      }
    }

    // Recessed glowing frosted glass backing quad + real area light!
    const gT = facePos ? t0 + thick * 0.22 : t1 - thick * 0.22;
    const eT = facePos ? t1 + 0.04 : t0 - 0.04;
    const col = opts.lightColor ?? [1.0, 0.96, 0.86];
    const intensity = opts.lightIntensity ?? 15.0;
    if (alongX) {
      if (facePos) {
        this.addQuad([a, wSill, gT], [b, wSill, gT], [b, wHead, gT], [a, wHead, gT], glassMat, { u0: 0, v0: 0, u1: 1, v1: 1, priority: 0.3 });
        this.addAreaLight([a + 0.05, wSill + 0.08, eT], [b - 0.05, wSill + 0.08, eT], [a + 0.05, wHead - 0.08, eT], col, intensity);
      } else {
        this.addQuad([b, wSill, gT], [a, wSill, gT], [a, wHead, gT], [b, wHead, gT], glassMat, { u0: 0, v0: 0, u1: 1, v1: 1, priority: 0.3 });
        this.addAreaLight([b - 0.05, wSill + 0.08, eT], [a + 0.05, wSill + 0.08, eT], [b - 0.05, wHead - 0.08, eT], col, intensity);
      }
    }
    return this;
  }

  // Smooth Catmull-Rom 3D curved tubular geometry (fiberglass water slides, industrial conduits).
  curvedTube(controlPoints, radius, matSpec, opts = {}) {
    if (controlPoints.length < 2) return this;
    const stepsPerSeg = opts.stepsPerSegment ?? 8;
    const radialSegs = opts.radialSegments ?? 16;
    const pts = [];
    const n = controlPoints.length;
    const getP = (idx) => controlPoints[Math.max(0, Math.min(n - 1, idx))];

    for (let i = 0; i < n - 1; i++) {
      const p0 = getP(i - 1), p1 = getP(i), p2 = getP(i + 1), p3 = getP(i + 2);
      const count = i === n - 2 ? stepsPerSeg : stepsPerSeg - 1;
      for (let s = 0; s <= count; s++) {
        const t = s / stepsPerSeg;
        const t2 = t * t, t3 = t2 * t;
        const q = [0, 0, 0];
        for (let k = 0; k < 3; k++) {
          q[k] = 0.5 * (
            2 * p1[k] +
            (-p0[k] + p2[k]) * t +
            (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
            (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3
          );
        }
        pts.push(q);
      }
    }

    // Parallel-transport smooth Frenet frames along the curve (zero twist kinks!).
    const tangents = pts.map((_, i) => {
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(pts.length - 1, i + 1)];
      return norm3(sub3(next, prev));
    });
    const ref0 = Math.abs(tangents[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let curU = norm3(cross3(ref0, tangents[0]));
    const frames = [];
    let totalLen = 0;
    const cumLen = [0];
    for (let i = 0; i < pts.length; i++) {
      if (i > 0) {
        const d = sub3(pts[i], pts[i - 1]);
        totalLen += Math.hypot(d[0], d[1], d[2]);
        cumLen.push(totalLen);
        // Project previous U orthogonal to new tangent
        const t = tangents[i];
        const dotUT = curU[0] * t[0] + curU[1] * t[1] + curU[2] * t[2];
        curU = norm3([curU[0] - t[0] * dotUT, curU[1] - t[1] * dotUT, curU[2] - t[2] * dotUT]);
      }
      const curV = cross3(tangents[i], curU);
      frames.push({ u: curU, v: curV });
    }

    const wallThick = opts.wallThickness ?? 0.042;
    const innerR = Math.max(0.05, radius - wallThick);
    const chart = this._beginChart(TAU * radius, Math.max(1, totalLen), opts.priority ?? 0.65);

    // 1. Smooth constant-radius outer fiberglass shell (zero soft organic worm-lumps!).
    for (let i = 0; i < pts.length - 1; i++) {
      const pA = pts[i], pB = pts[i + 1];
      const fA = frames[i], fB = frames[i + 1];
      const v0 = cumLen[i], v1 = cumLen[i + 1];
      const lv0 = v0 / Math.max(totalLen, 1e-4);
      const lv1 = v1 / Math.max(totalLen, 1e-4);

      for (let j = 0; j < radialSegs; j++) {
        const u0 = j / radialSegs, u1 = (j + 1) / radialSegs;
        const a0 = u0 * TAU, a1 = u1 * TAU;
        const c0 = Math.cos(a0), s0 = Math.sin(a0);
        const c1 = Math.cos(a1), s1 = Math.sin(a1);
        const nA0 = [fA.u[0] * c0 + fA.v[0] * s0, fA.u[1] * c0 + fA.v[1] * s0, fA.u[2] * c0 + fA.v[2] * s0];
        const nA1 = [fA.u[0] * c1 + fA.v[0] * s1, fA.u[1] * c1 + fA.v[1] * s1, fA.u[2] * c1 + fA.v[2] * s1];
        const nB0 = [fB.u[0] * c0 + fB.v[0] * s0, fB.u[1] * c0 + fB.v[1] * s0, fB.u[2] * c0 + fB.v[2] * s0];
        const nB1 = [fB.u[0] * c1 + fB.v[0] * s1, fB.u[1] * c1 + fB.v[1] * s1, fB.u[2] * c1 + fB.v[2] * s1];

        const q0 = [pA[0] + nA0[0] * radius, pA[1] + nA0[1] * radius, pA[2] + nA0[2] * radius];
        const q1 = [pA[0] + nA1[0] * radius, pA[1] + nA1[1] * radius, pA[2] + nA1[2] * radius];
        const q2 = [pB[0] + nB1[0] * radius, pB[1] + nB1[1] * radius, pB[2] + nB1[2] * radius];
        const q3 = [pB[0] + nB0[0] * radius, pB[1] + nB0[1] * radius, pB[2] + nB0[2] * radius];
        this.addQuad(q0, q1, q2, q3, matSpec, {
          u0: u0 * TAU * radius, v0, u1: u1 * TAU * radius, v1,
          normals: [nA0, nA1, nB1, nB0],
          chart, lu0: u0, lv0, lu1: u1, lv1,
        });
      }
    }

    // 2. Crisp rigid bolted fiberglass flange collars along tube sections (authentic aqua-park slide joints!).
    if (opts.flanges) {
      const flangeMat = opts.flangeMaterial ?? matSpec;
      const flangeSpacing = opts.flangeSpacing ?? 2.05;
      const hw = 0.028;
      const rF = radius + 0.040;
      let nextDist = 1.35;
      for (let i = 2; i < pts.length - 2; i++) {
        if (cumLen[i] < nextDist || totalLen - cumLen[i] < 0.55) continue;
        nextDist = cumLen[i] + flangeSpacing;
        const fChart = this._beginChart(TAU * rF, 0.25, 0.35);
        const p = pts[i], t = tangents[i], f = frames[i];
        const pBack = [p[0] - t[0] * hw, p[1] - t[1] * hw, p[2] - t[2] * hw];
        const pFwd = [p[0] + t[0] * hw, p[1] + t[1] * hw, p[2] + t[2] * hw];
        const nBack = [-t[0], -t[1], -t[2]];
        for (let j = 0; j < radialSegs; j++) {
          const u0 = j / radialSegs, u1 = (j + 1) / radialSegs;
          const a0 = u0 * TAU, a1 = u1 * TAU;
          const c0 = Math.cos(a0), s0 = Math.sin(a0);
          const c1 = Math.cos(a1), s1 = Math.sin(a1);
          const n0 = [f.u[0] * c0 + f.v[0] * s0, f.u[1] * c0 + f.v[1] * s0, f.u[2] * c0 + f.v[2] * s0];
          const n1 = [f.u[0] * c1 + f.v[0] * s1, f.u[1] * c1 + f.v[1] * s1, f.u[2] * c1 + f.v[2] * s1];
          const bR0 = [pBack[0] + n0[0] * radius, pBack[1] + n0[1] * radius, pBack[2] + n0[2] * radius];
          const bR1 = [pBack[0] + n1[0] * radius, pBack[1] + n1[1] * radius, pBack[2] + n1[2] * radius];
          const bF0 = [pBack[0] + n0[0] * rF, pBack[1] + n0[1] * rF, pBack[2] + n0[2] * rF];
          const bF1 = [pBack[0] + n1[0] * rF, pBack[1] + n1[1] * rF, pBack[2] + n1[2] * rF];
          const fR0 = [pFwd[0] + n0[0] * radius, pFwd[1] + n0[1] * radius, pFwd[2] + n0[2] * radius];
          const fR1 = [pFwd[0] + n1[0] * radius, pFwd[1] + n1[1] * radius, pFwd[2] + n1[2] * radius];
          const fF0 = [pFwd[0] + n0[0] * rF, pFwd[1] + n0[1] * rF, pFwd[2] + n0[2] * rF];
          const fF1 = [pFwd[0] + n1[0] * rF, pFwd[1] + n1[1] * rF, pFwd[2] + n1[2] * rF];
          this.addQuad(bF0, bF1, fF1, fF0, flangeMat, { normals: [n0, n1, n1, n0], chart: fChart, lu0: u0, lv0: 0.3, lu1: u1, lv1: 0.7 });
          this.addQuad(bR0, bR1, bF1, bF0, flangeMat, { normals: [nBack, nBack, nBack, nBack], chart: fChart, lu0: u0, lv0: 0.0, lu1: u1, lv1: 0.3 });
          this.addQuad(fF0, fF1, fR1, fR0, flangeMat, { normals: [t, t, t, t], chart: fChart, lu0: u0, lv0: 0.7, lu1: u1, lv1: 1.0 });
        }
      }
    }

    // 3. Optional hollow fiberglass interior tunnel + rolled open exit rim lip!
    if (opts.hollow) {
      const innerMat = opts.innerMaterial ?? matSpec;
      const inChart = this._beginChart(TAU * innerR, Math.max(1, totalLen), (opts.priority ?? 0.65) * 0.9);
      for (let i = 0; i < pts.length - 1; i++) {
        const pA = pts[i], pB = pts[i + 1];
        const fA = frames[i], fB = frames[i + 1];
        const v0 = cumLen[i], v1 = cumLen[i + 1];
        const lv0 = v0 / Math.max(totalLen, 1e-4);
        const lv1 = v1 / Math.max(totalLen, 1e-4);
        for (let j = 0; j < radialSegs; j++) {
          const u0 = j / radialSegs, u1 = (j + 1) / radialSegs;
          const a0 = u0 * TAU, a1 = u1 * TAU;
          const c0 = Math.cos(a0), s0 = Math.sin(a0);
          const c1 = Math.cos(a1), s1 = Math.sin(a1);
          const nA0 = [fA.u[0] * c0 + fA.v[0] * s0, fA.u[1] * c0 + fA.v[1] * s0, fA.u[2] * c0 + fA.v[2] * s0];
          const nA1 = [fA.u[0] * c1 + fA.v[0] * s1, fA.u[1] * c1 + fA.v[1] * s1, fA.u[2] * c1 + fA.v[2] * s1];
          const nB0 = [fB.u[0] * c0 + fB.v[0] * s0, fB.u[1] * c0 + fB.v[1] * s0, fB.u[2] * c0 + fB.v[2] * s0];
          const nB1 = [fB.u[0] * c1 + fB.v[0] * s1, fB.u[1] * c1 + fB.v[1] * s1, fB.u[2] * c1 + fB.v[2] * s1];
          const q0 = [pA[0] + nA0[0] * innerR, pA[1] + nA0[1] * innerR, pA[2] + nA0[2] * innerR];
          const q1 = [pA[0] + nA1[0] * innerR, pA[1] + nA1[1] * innerR, pA[2] + nA1[2] * innerR];
          const q2 = [pB[0] + nB1[0] * innerR, pB[1] + nB1[1] * innerR, pB[2] + nB1[2] * innerR];
          const q3 = [pB[0] + nB0[0] * innerR, pB[1] + nB0[1] * innerR, pB[2] + nB0[2] * innerR];
          const su0 = u0 * TAU * innerR, su1 = u1 * TAU * innerR;
          this.addQuad(q0, q3, q2, q1, innerMat, {
            uvs: [[su0, v0], [su0, v1], [su1, v1], [su1, v0]],
            normals: [[-nA0[0], -nA0[1], -nA0[2]], [-nB0[0], -nB0[1], -nB0[2]], [-nB1[0], -nB1[1], -nB1[2]], [-nA1[0], -nA1[1], -nA1[2]]],
            chart: inChart,
            luvs: [[u0, lv0], [u0, lv1], [u1, lv1], [u1, lv0]],
          });
        }
      }
      // Flared exit rim collar at pts[last] so the open slide mouth has crisp molded fiberglass thickness
      const last = pts.length - 1;
      const pEnd = pts[last], tEnd = tangents[last], fEnd = frames[last];
      const rimR = radius + 0.022;
      const lipChart = this._beginChart(TAU * rimR, 0.2, 0.45);
      const pLip = [pEnd[0] + tEnd[0] * 0.04, pEnd[1] + tEnd[1] * 0.04, pEnd[2] + tEnd[2] * 0.04];
      for (let j = 0; j < radialSegs; j++) {
        const u0 = j / radialSegs, u1 = (j + 1) / radialSegs;
        const a0 = u0 * TAU, a1 = u1 * TAU;
        const c0 = Math.cos(a0), s0 = Math.sin(a0);
        const c1 = Math.cos(a1), s1 = Math.sin(a1);
        const n0 = [fEnd.u[0] * c0 + fEnd.v[0] * s0, fEnd.u[1] * c0 + fEnd.v[1] * s0, fEnd.u[2] * c0 + fEnd.v[2] * s0];
        const n1 = [fEnd.u[0] * c1 + fEnd.v[0] * s1, fEnd.u[1] * c1 + fEnd.v[1] * s1, fEnd.u[2] * c1 + fEnd.v[2] * s1];
        const o0 = [pEnd[0] + n0[0] * radius, pEnd[1] + n0[1] * radius, pEnd[2] + n0[2] * radius];
        const o1 = [pEnd[0] + n1[0] * radius, pEnd[1] + n1[1] * radius, pEnd[2] + n1[2] * radius];
        const l0 = [pLip[0] + n0[0] * rimR, pLip[1] + n0[1] * rimR, pLip[2] + n0[2] * rimR];
        const l1 = [pLip[0] + n1[0] * rimR, pLip[1] + n1[1] * rimR, pLip[2] + n1[2] * rimR];
        const i0 = [pEnd[0] + n0[0] * innerR, pEnd[1] + n0[1] * innerR, pEnd[2] + n0[2] * innerR];
        const i1 = [pEnd[0] + n1[0] * innerR, pEnd[1] + n1[1] * innerR, pEnd[2] + n1[2] * innerR];
        this.addQuad(o0, o1, l1, l0, matSpec, { normals: [n0, n1, n1, n0], chart: lipChart, lu0: u0, lv0: 0, lu1: u1, lv1: 0.5 });
        this.addQuad(l0, l1, i1, i0, matSpec, { normals: [tEnd, tEnd, tEnd, tEnd], chart: lipChart, lu0: u0, lv0: 0.5, lu1: u1, lv1: 1.0 });
      }
    }

    if (opts.solid) {
      let lastCol = null;
      for (const p of pts) {
        if (p[1] - radius > 2.2) continue;
        if (lastCol && Math.hypot(p[0] - lastCol[0], p[2] - lastCol[2]) < radius * 0.65) continue;
        this.solids.push({ kind: "circle", x: p[0], z: p[2], radius, minY: 0, maxY: p[1] + radius });
        lastCol = p;
      }
    }
    return this;
  }

  // Registers an analytical rectangular emitter quad for the GPU lightmapper.
  // Normal is normalize(cross(p1 - p0, p3 - p0)).
  addAreaLight(p0, p1, p3, color, intensity, opts = {}) {
    const eU = sub3(p1, p0);
    const eV = sub3(p3, p0);
    const cr = cross3(eU, eV);
    const area = Math.hypot(cr[0], cr[1], cr[2]);
    if (area < 1e-6) return this;
    const rad = [color[0] * intensity, color[1] * intensity, color[2] * intensity];
    const luma = 0.2126 * rad[0] + 0.7152 * rad[1] + 0.0722 * rad[2];
    this.lights.push({
      origin: p0,
      edgeU: eU,
      edgeV: eV,
      area,
      radiance: rad,
      power: luma * area,
      kind: opts.kind ?? 0, // 0 = area emitter, 1 = skylight portal
      flicker: opts.flicker ?? 0,
    });
    return this;
  }

  // Recessed ceiling fluorescent light fixture (bezel fits flush INSIDE width x depth grid bay).
  panelLight(pos, width, depth, opts = {}) {
    const [cx, y, cz] = pos;
    const hw = width * 0.5;
    const hd = depth * 0.5;
    const color = opts.color ?? [1.0, 0.95, 0.78];
    const intensity = opts.intensity ?? 10.0;
    const flicker = opts.flicker ?? 0;
    const off = Boolean(opts.off);

    // Flush inset white-enameled aluminum troffer frame fitting strictly inside the 1.20x0.60 m T-bar grid cell
    const margin = 0.014;
    const bezel = 0.022;
    const h = 0.009;
    const bx = Math.max(0.05, hw - margin);
    const bz = Math.max(0.05, hd - margin);
    const frameMat = this.material({
      base: "plaster_warm",
      name: "troffer_bezel_enamel",
      albedo: [0.76, 0.75, 0.68],
      roughness: 0.28,
      coat: 0.38,
      seed: 14.5,
    });
    this.box([cx - bx, y - h, cz - bz], [cx + bx, y, cz + bz], frameMat, {
      solid: false,
      skipFaces: ["py"],
      priority: 0.18,
    });

    const mat =
      opts.material ??
      this.material({
        base: "fluorescent_panel",
        albedo: off ? [0.46, 0.45, 0.40] : undefined,
        emissive: off ? [0, 0, 0] : color,
        emissiveStrength: off ? 0 : intensity,
        flicker: off ? 0 : flicker,
      });

    // Downward-facing prismatic diffuser quad cleanly inset within bezel frame
    const dx = Math.max(0.04, bx - bezel);
    const dz = Math.max(0.04, bz - bezel);
    const ly = y - h - 0.0015;
    const p0 = [cx - dx, ly, cz - dz];
    const p1 = [cx + dx, ly, cz - dz];
    const p2 = [cx + dx, ly, cz + dz];
    const p3 = [cx - dx, ly, cz + dz];
    this.addQuad(p0, p1, p2, p3, mat, { u0: 0, v0: 0, u1: 1, v1: 1, priority: 0.18 });

    if (!off && intensity > 0) {
      // Lightmapper emitter slightly offset below diffuser so shadow rays clear bezel cleanly
      const ey = y - h - 0.014;
      this.addAreaLight([cx - dx, ey, cz - dz], [cx + dx, ey, cz - dz], [cx - dx, ey, cz + dz], color, intensity, { flicker });
    }
    return this;
  }

  // Suspended industrial fluorescent tube fixture (metal hood + optional ceiling suspension rods + glowing underside).
  tubeLight(cx, y, cz, length, axis = "x", opts = {}) {
    const color = opts.color ?? [0.90, 0.96, 1.0];
    const intensity = opts.intensity ?? 16.0;
    const width = opts.width ?? 0.16;
    const flicker = opts.flicker ?? 0;
    const off = Boolean(opts.off);
    const hl = length * 0.5;
    const hw = width * 0.5;
    const hx = axis === "x" ? hl : hw;
    const hz = axis === "x" ? hw : hl;

    // Industrial steel reflector hood housing
    this.box([cx - hx - 0.025, y, cz - hz - 0.025], [cx + hx + 0.025, y + 0.085, cz + hz + 0.025], "dark_metal", {
      solid: false,
      priority: 0.25,
    });

    // Optional twin steel suspension rods anchoring the fixture solidly to the concrete ceiling
    if (opts.hangY !== undefined && opts.hangY > y + 0.09) {
      const rodSpan = Math.max(0.2, hl * 0.72);
      const r = 0.012;
      for (const s of [-1, 1]) {
        const rx = axis === "x" ? cx + s * rodSpan : cx;
        const rz = axis === "z" ? cz + s * rodSpan : cz;
        this.box([rx - r, y + 0.085, rz - r], [rx + r, opts.hangY, rz + r], "dark_metal", {
          solid: false,
          skipFaces: ["ny", "py"],
          priority: 0.15,
        });
      }
    }

    const mat =
      opts.material ??
      this.material({
        base: "fluorescent_panel",
        albedo: off ? [0.42, 0.44, 0.44] : undefined,
        emissive: off ? [0, 0, 0] : color,
        emissiveStrength: off ? 0 : intensity,
        flicker: off ? 0 : flicker,
      });
    const ly = y - 0.003;
    this.addQuad([cx - hx, ly, cz - hz], [cx + hx, ly, cz - hz], [cx + hx, ly, cz + hz], [cx - hx, ly, cz + hz], mat, {
      u0: 0, v0: 0, u1: 1, v1: 1, priority: 0.25,
    });
    if (!off && intensity > 0) {
      const ey = y - 0.02;
      this.addAreaLight([cx - hx, ey, cz - hz], [cx + hx, ey, cz - hz], [cx - hx, ey, cz + hz], color, intensity, { flicker });
    }
    return this;
  }

  // Vertical industrial fluorescent batten mounted directly onto a concrete column or corrugated metal wall!
  verticalTubeLight(cx, y0, y1, cz, facing = "+x", opts = {}) {
    const color = opts.color ?? [0.94, 0.99, 1.0];
    const intensity = opts.intensity ?? 48.0;
    const width = opts.width ?? 0.14;
    const depth = opts.depth ?? 0.065;
    const hw = width * 0.5;
    const mat =
      opts.material ??
      this.material({
        base: "fluorescent_panel",
        emissive: color,
        emissiveStrength: opts.emissiveStrength ?? 34.0,
        flicker: opts.flicker ?? 0,
      });

    const eps = 0.025;
    if (facing === "+x") {
      this.box([cx, y0, cz - hw - 0.02], [cx + 0.032, y1, cz + hw + 0.02], "dark_metal", { solid: false, skipFaces: ["nx"], priority: 0.16 });
      this.box([cx + 0.032, y0 + 0.02, cz - hw], [cx + depth, y1 - 0.02, cz + hw], mat, { solid: false, skipFaces: ["nx"], priority: 0.22 });
      const fx = cx + depth + eps;
      this.addAreaLight([fx, y0, cz + hw], [fx, y0, cz - hw], [fx, y1, cz + hw], color, intensity, { flicker: opts.flicker ?? 0 });
    } else if (facing === "-x") {
      this.box([cx - 0.032, y0, cz - hw - 0.02], [cx, y1, cz + hw + 0.02], "dark_metal", { solid: false, skipFaces: ["px"], priority: 0.16 });
      this.box([cx - depth, y0 + 0.02, cz - hw], [cx - 0.032, y1 - 0.02, cz + hw], mat, { solid: false, skipFaces: ["px"], priority: 0.22 });
      const fx = cx - depth - eps;
      this.addAreaLight([fx, y0, cz - hw], [fx, y0, cz + hw], [fx, y1, cz - hw], color, intensity, { flicker: opts.flicker ?? 0 });
    } else if (facing === "+z") {
      this.box([cx - hw - 0.02, y0, cz], [cx + hw + 0.02, y1, cz + 0.032], "dark_metal", { solid: false, skipFaces: ["nz"], priority: 0.16 });
      this.box([cx - hw, y0 + 0.02, cz + 0.032], [cx + hw, y1 - 0.02, cz + depth], mat, { solid: false, skipFaces: ["nz"], priority: 0.22 });
      const fz = cz + depth + eps;
      this.addAreaLight([cx - hw, y0, fz], [cx + hw, y0, fz], [cx - hw, y1, fz], color, intensity, { flicker: opts.flicker ?? 0 });
    } else {
      this.box([cx - hw - 0.02, y0, cz - 0.032], [cx + hw + 0.02, y1, cz], "dark_metal", { solid: false, skipFaces: ["pz"], priority: 0.16 });
      this.box([cx - hw, y0 + 0.02, cz - depth], [cx + hw, y1 - 0.02, cz - 0.032], mat, { solid: false, skipFaces: ["pz"], priority: 0.22 });
      const fz = cz - depth - eps;
      this.addAreaLight([cx + hw, y0, fz], [cx - hw, y0, fz], [cx + hw, y1, fz], color, intensity, { flicker: opts.flicker ?? 0 });
    }
    return this;
  }

  // Glowing EXIT sign or backlit wall sign (box + emissive face + area light).
  signLight(lo, hi, face = "+z", opts = {}) {
    const [x0, y0, z0] = lo;
    const [x1, y1, z1] = hi;
    const color = opts.color ?? [0.14, 1.0, 0.38];
    const intensity = opts.intensity ?? 12.0;
    const mat = this.material({
      base: opts.base ?? "exit_sign",
      emissive: color,
      emissiveStrength: intensity,
    });

    // Metal housing on non-emissive sides
    const skipFace = face === "+z" ? "pz" : face === "-z" ? "nz" : face === "+x" ? "px" : "nx";
    this.box(lo, hi, "dark_metal", { solid: false, skipFaces: [skipFace] });

    const eps = 0.012;
    if (face === "+z") {
      this.addQuad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], mat, { u0: 0, v0: 0, u1: 1, v1: 1, priority: 0.4 });
      this.addAreaLight([x0, y0, z1 + eps], [x1, y0, z1 + eps], [x0, y1, z1 + eps], color, intensity);
    } else if (face === "-z") {
      this.addQuad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], mat, { u0: 0, v0: 0, u1: 1, v1: 1, priority: 0.4 });
      this.addAreaLight([x1, y0, z0 - eps], [x0, y0, z0 - eps], [x1, y1, z0 - eps], color, intensity);
    } else if (face === "+x") {
      this.addQuad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], mat, { u0: 0, v0: 0, u1: 1, v1: 1, priority: 0.4 });
      this.addAreaLight([x1 + eps, y0, z1], [x1 + eps, y0, z0], [x1 + eps, y1, z1], color, intensity);
    } else {
      this.addQuad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], mat, { u0: 0, v0: 0, u1: 1, v1: 1, priority: 0.4 });
      this.addAreaLight([x0 - eps, y0, z0], [x0 - eps, y0, z1], [x0 - eps, y1, z0], color, intensity);
    }
    return this;
  }

  // Marks a ceiling skylight portal so the lightmapper & volumetric shafts sample sky cleanly.
  skylight(minX, minZ, maxX, maxZ, y, opts = {}) {
    const color = opts.color ?? [0.85, 0.94, 1.0];
    const intensity = opts.intensity ?? 5.5;
    this.skylights.push({ minX, minZ, maxX, maxZ, y, color, intensity });
    this.addAreaLight(
      [minX, y - 0.02, minZ],
      [maxX, y - 0.02, minZ],
      [minX, y - 0.02, maxZ],
      color,
      intensity,
      { kind: 1 },
    );
    return this;
  }

  // Declares an interactive water surface (optional — dry maps never call this).
  water(minX, minZ, maxX, maxZ, level = 0.42, opts = {}) {
    this.waters.push({
      minX,
      minZ,
      maxX,
      maxZ,
      level,
      absorption: opts.absorption ?? [0.42, 0.105, 0.058],
      waveAmp: opts.waveAmp ?? 0.012,
      causticStrength: opts.causticStrength ?? 1.35,
      cellSize: opts.cellSize ?? 0.075,
    });
    return this;
  }

  // Compiles all geometry into GPU-ready vertex/index buffers, UV2 lightmap atlas,
  // flat SAH BVH, packed lights, and collision data.
  compile(options = {}) {
    const atlas = packLightmapAtlas(this.charts, {
      atlasSize: options.atlasSize ?? this.atlasSize,
      texelsPerMeter: options.texelsPerMeter ?? this.texelsPerMeter,
      padding: 2,
    });

    const vCount = this.vertices.length;
    const vertexData = new ArrayBuffer(vCount * 64);
    const vf = new Float32Array(vertexData);
    const vu = new Uint32Array(vertexData);
    const positions = new Float32Array(vCount * 3);
    const uvs = new Float32Array(vCount * 2);
    const uv2s = new Float32Array(vCount * 2);

    for (let i = 0; i < vCount; i++) {
      const v = this.vertices[i];
      const o = i * 16;
      vf[o + 0] = v.x;
      vf[o + 1] = v.y;
      vf[o + 2] = v.z;
      vu[o + 3] = v.matId;
      vf[o + 4] = v.nx;
      vf[o + 5] = v.ny;
      vf[o + 6] = v.nz;
      vf[o + 7] = 0;
      vf[o + 8] = v.tx;
      vf[o + 9] = v.ty;
      vf[o + 10] = v.tz;
      vf[o + 11] = v.tw;
      vf[o + 12] = v.u;
      vf[o + 13] = v.v;
      vf[o + 14] = v.lu;
      vf[o + 15] = v.lv;
      positions[i * 3 + 0] = v.x;
      positions[i * 3 + 1] = v.y;
      positions[i * 3 + 2] = v.z;
      uvs[i * 2 + 0] = v.u;
      uvs[i * 2 + 1] = v.v;
      uv2s[i * 2 + 0] = v.lu;
      uv2s[i * 2 + 1] = v.lv;
    }

    const indexData = new Uint32Array(this.indices);
    const triMats = new Uint32Array(this.triMaterials);
    const bvh = buildBVH(positions, indexData, triMats, uvs, uv2s);

    // Pack Area Lights (64 bytes each):
    // vec4f origin_area
    // vec4f edgeU_power
    // vec4f edgeV_flags (flags = kind + flicker * 10)
    // vec4f radiance_cdf
    const lightCount = this.lights.length;
    const totalPower = this.lights.reduce((s, l) => s + Math.max(0.01, l.power), 0) || 1;
    const lightData = new Float32Array(Math.max(1, lightCount) * 16);
    let cdf = 0;
    for (let i = 0; i < lightCount; i++) {
      const l = this.lights[i];
      cdf += Math.max(0.01, l.power) / totalPower;
      const o = i * 16;
      lightData[o + 0] = l.origin[0];
      lightData[o + 1] = l.origin[1];
      lightData[o + 2] = l.origin[2];
      lightData[o + 3] = l.area;
      lightData[o + 4] = l.edgeU[0];
      lightData[o + 5] = l.edgeU[1];
      lightData[o + 6] = l.edgeU[2];
      lightData[o + 7] = l.power;
      lightData[o + 8] = l.edgeV[0];
      lightData[o + 9] = l.edgeV[1];
      lightData[o + 10] = l.edgeV[2];
      lightData[o + 11] = l.kind;
      lightData[o + 12] = l.radiance[0];
      lightData[o + 13] = l.radiance[1];
      lightData[o + 14] = l.radiance[2];
      lightData[o + 15] = i === lightCount - 1 ? 1.0 : cdf;
    }

    const walkBounds = this.walkBounds ?? {
      minX: this.bounds.minX,
      maxX: this.bounds.maxX,
      minZ: this.bounds.minZ,
      maxZ: this.bounds.maxZ,
    };

    return {
      vertexData,
      indexData,
      vertexCount: vCount,
      indexCount: indexData.length,
      triCount: bvh.triCount,
      bvh,
      materials: this.materials.entries,
      materialData: this.materials.packGPU(),
      lights: this.lights,
      lightData,
      lightCount,
      totalLightPower: totalPower,
      skylights: this.skylights,
      water: this.waters[0] ?? null,
      waters: this.waters,
      bookmarks: this.bookmarks,
      bounds: this.bounds,
      collision: {
        bounds: walkBounds,
        baseFloor: this.baseFloor,
        solids: this.solids,
        floors: this.floors,
      },
      atlas,
      stats: {
        vertices: vCount,
        triangles: bvh.triCount,
        bvhNodes: bvh.nodeCount,
        materials: this.materials.entries.length,
        lights: lightCount,
        charts: this.charts.length,
        atlasSize: atlas.atlasSize,
        texelsPerMeter: Number(atlas.texelsPerMeter.toFixed(2)),
        atlasUtilization: Number((atlas.utilization * 100).toFixed(1)),
        hasWater: this.waters.length > 0,
      },
    };
  }
}

export function createMap(options) {
  return new MapBuilder(options);
}
