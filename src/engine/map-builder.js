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
    if (!holes.length) {
      if (facingUp) {
        this.addQuad([minX, y, maxZ], [maxX, y, maxZ], [maxX, y, minZ], [minX, y, minZ], matSpec, {
          u0: minX, v0: -maxZ, u1: maxX, v1: -minZ, priority: opts.priority ?? 1.0,
        });
      } else {
        this.addQuad([minX, y, minZ], [maxX, y, minZ], [maxX, y, maxZ], [minX, y, maxZ], matSpec, {
          u0: minX, v0: minZ, u1: maxX, v1: maxZ, priority: opts.priority ?? 1.0,
        });
      }
      return;
    }

    // Subdivide grid cleanly along all hole x/z coordinates, emitting non-hole cells.
    const xs = Array.from(
      new Set([minX, maxX, ...holes.flatMap((h) => [Math.max(minX, h[0]), Math.min(maxX, h[2])])]),
    ).sort((a, b) => a - b);
    const zs = Array.from(
      new Set([minZ, maxZ, ...holes.flatMap((h) => [Math.max(minZ, h[1]), Math.min(maxZ, h[3])])]),
    ).sort((a, b) => a - b);

    for (let ix = 0; ix < xs.length - 1; ix++) {
      for (let iz = 0; iz < zs.length - 1; iz++) {
        const ax = xs[ix], bx = xs[ix + 1];
        const az = zs[iz], bz = zs[iz + 1];
        if (bx - ax < 1e-4 || bz - az < 1e-4) continue;
        const cx = (ax + bx) * 0.5, cz = (az + bz) * 0.5;
        const insideHole = holes.some((h) => cx > h[0] && cx < h[2] && cz > h[1] && cz < h[3]);
        if (insideHole) continue;
        this._horizontalSurface(ax, az, bx, bz, y, facingUp, matSpec, { priority: opts.priority });
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

    const emitBox = (a, b, yb, yt, isSolid, m = mat) => {
      if (b - a < 1e-4 || yt - yb < 1e-4) return;
      if (alongX) this.box([a, yb, z0], [b, yt, z1], m, { solid: isSolid });
      else this.box([x0, yb, a], [x1, yt, b], m, { solid: isSolid });
    };

    for (const op of openings) {
      const a = Math.max(cursor, op.a);
      const b = Math.min(spanEnd, op.b);
      if (a > cursor + 1e-4) {
        emitBox(cursor, a, y0, y1, opts.solid !== false);
      }
      // Sill below opening (for windows)
      if (op.bottom > y0 + 1e-4) {
        emitBox(a, b, y0, op.bottom, opts.solid !== false, jambMat);
      }
      // Lintel above opening
      if (op.top < y1 - 1e-4) {
        emitBox(a, b, op.top, y1, false, jambMat);
      }
      cursor = Math.max(cursor, b);
    }
    if (spanEnd > cursor + 1e-4) {
      emitBox(cursor, spanEnd, y0, y1, opts.solid !== false);
    }

    // Optional baseboard trim along solid segments.
    if (opts.trim) {
      const th = opts.trimHeight ?? 0.12;
      const td = opts.trimDepth ?? 0.025;
      let c = spanStart;
      const trimSeg = (a, b) => {
        if (b - a < 1e-4) return;
        if (alongX) {
          this.box([a, y0, z0 - td], [b, y0 + th, z0], opts.trim, { solid: false, skipFaces: ["pz", "ny"] });
          this.box([a, y0, z1], [b, y0 + th, z1 + td], opts.trim, { solid: false, skipFaces: ["nz", "ny"] });
        } else {
          this.box([x0 - td, y0, a], [x0, y0 + th, b], opts.trim, { solid: false, skipFaces: ["px", "ny"] });
          this.box([x1, y0, a], [x1 + td, y0 + th, b], opts.trim, { solid: false, skipFaces: ["nx", "ny"] });
        }
      };
      for (const op of openings) {
        if (op.bottom <= y0 + th) {
          trimSeg(c, op.a);
          c = Math.max(c, op.b);
        }
      }
      trimSeg(c, spanEnd);
    }

    return this;
  }

  // Wall along X or Z pierced by one or more semicircular arches with smooth intrados.
  wallWithArch(lo, hi, opts = {}) {
    const [x0, y0, z0] = lo;
    const [x1, y1, z1] = hi;
    const alongX = opts.axis ? opts.axis === "x" : (x1 - x0) >= (z1 - z0);
    const mat = opts.material ?? "tile_white";
    const segs = opts.segments ?? 16;
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

    const pt = (s, y, t) => (alongX ? [s, y, t] : [t, y, s]);
    let cursor = spanStart;

    for (const arch of arches) {
      const a = Math.max(cursor, arch.pos - arch.radius);
      const b = Math.min(spanEnd, arch.pos + arch.radius);
      const r = arch.radius;
      const spring = arch.spring;
      const crown = Math.min(y1, spring + r);

      // Solid pier before arch
      if (a > cursor + 1e-4) {
        if (alongX) this.box([cursor, y0, z0], [a, y1, z1], mat, { solid: opts.solid !== false });
        else this.box([x0, y0, cursor], [x1, y1, a], mat, { solid: opts.solid !== false });
      }

      // Spandrel faces (front & back) extend cleanly from spring all the way to y1
      // in one seamless chart with exact planar UVs (zero tile skew or header seam!).
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
            u0: f0 * Math.PI * r, v0: t0, u1: f1 * Math.PI * r, v1: t1,
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
            u0: f0 * Math.PI * r, v0: t0, u1: f1 * Math.PI * r, v1: t1,
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

  // Smooth vertical cylinder (column or inward circular drum).
  cylinder(x, z, y0, y1, radius, matSpec, opts = {}) {
    const segs = opts.segments ?? 24;
    const inside = !!opts.inside;
    const height = y1 - y0;
    const circum = TAU * radius;
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
        // Outward normal: p10 -> p00 goes CCW viewed from outside (+Y up)
        const n0 = [c0, 0, s0];
        const n1 = [c1, 0, s1];
        this.addQuad(p10, p00, p01, p11, matSpec, {
          u0: f0 * circum, v0: y0, u1: f1 * circum, v1: y1,
          normals: [n1, n0, n0, n1],
          chart,
          lu0: f0, lv0: 0, lu1: f1, lv1: 1,
        });
      } else {
        // Inward normal: p00 -> p10 goes right when facing outward from center
        const n0 = [-c0, 0, -s0];
        const n1 = [-c1, 0, -s1];
        this.addQuad(p00, p10, p11, p01, matSpec, {
          u0: f0 * circum, v0: y0, u1: f1 * circum, v1: y1,
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
          u0: 0, v0: 0, u1: radius, v1: radius,
          normals: [nUp, nUp, nUp, nUp],
          chart: capChart,
          lu0: 0.5, lv0: 0.5,
          lu1: 0.5 + 0.45 * Math.cos(a1), lv1: 0.5 + 0.45 * Math.sin(a1),
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

  // Straight staircase ascending along '+x', '-x', '+z', or '-z'.
  // Emits solid step geometry + smooth walkable ramp zone for collision.
  stairs(lo, hi, dir, steps, matSpec, opts = {}) {
    const [x0, y0, z0] = lo;
    const [x1, y1, z1] = hi;
    const count = Math.max(2, Math.round(steps));
    const dy = (y1 - y0) / count;

    for (let i = 0; i < count; i++) {
      const f0 = i / count;
      const f1 = (i + 1) / count;
      const top = y0 + (i + 1) * dy;
      let sx0 = x0, sx1 = x1, sz0 = z0, sz1 = z1;
      if (dir === "+x") { sx0 = x0 + f0 * (x1 - x0); sx1 = x0 + f1 * (x1 - x0); }
      if (dir === "-x") { sx0 = x1 - f1 * (x1 - x0); sx1 = x1 - f0 * (x1 - x0); }
      if (dir === "+z") { sz0 = z0 + f0 * (z1 - z0); sz1 = z0 + f1 * (z1 - z0); }
      if (dir === "-z") { sz0 = z1 - f1 * (z1 - z0); sz1 = z1 - f0 * (z1 - z0); }
      this.box([sx0, y0, sz0], [sx1, top, sz1], matSpec, {
        solid: false,
        priority: opts.priority ?? 1.0,
      });
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

  // Recessed ceiling fluorescent light fixture (bezel + glowing prismatic panel + area light).
  panelLight(pos, width, depth, opts = {}) {
    const [cx, y, cz] = pos;
    const hw = width * 0.5;
    const hd = depth * 0.5;
    const color = opts.color ?? [1.0, 0.95, 0.78];
    const intensity = opts.intensity ?? 10.0;
    const flicker = opts.flicker ?? 0;

    // Compact recessed bezel housing (only 5 visible faces, low lightmap priority)
    const bezel = 0.035;
    const h = 0.025;
    this.box([cx - hw - bezel, y - h, cz - hd - bezel], [cx + hw + bezel, y, cz + hd + bezel], "dark_metal", {
      solid: false,
      skipFaces: ["py"],
      priority: 0.25,
    });

    const mat =
      opts.material ??
      this.material({
        base: "fluorescent_panel",
        emissive: color,
        emissiveStrength: intensity,
        flicker,
      });

    // Downward-facing glowing diffuser quad slightly below housing underside
    const ly = y - h - 0.002;
    const p0 = [cx - hw, ly, cz - hd];
    const p1 = [cx + hw, ly, cz - hd];
    const p2 = [cx + hw, ly, cz + hd];
    const p3 = [cx - hw, ly, cz + hd];
    this.addQuad(p0, p1, p2, p3, mat, { u0: 0, v0: 0, u1: 1, v1: 1, priority: 0.25 });

    // Lightmapper emitter slightly offset below diffuser so shadow rays clear bezel
    const ey = y - h - 0.018;
    this.addAreaLight([cx - hw, ey, cz - hd], [cx + hw, ey, cz - hd], [cx - hw, ey, cz + hd], color, intensity, { flicker });
    return this;
  }

  // Suspended industrial fluorescent tube fixture (housing + glowing underside + area light).
  tubeLight(cx, y, cz, length, axis = "x", opts = {}) {
    const color = opts.color ?? [0.90, 0.96, 1.0];
    const intensity = opts.intensity ?? 16.0;
    const width = opts.width ?? 0.16;
    const flicker = opts.flicker ?? 0;
    const hl = length * 0.5;
    const hw = width * 0.5;
    const hx = axis === "x" ? hl : hw;
    const hz = axis === "x" ? hw : hl;

    // Metal shroud
    this.box([cx - hx - 0.02, y, cz - hz - 0.02], [cx + hx + 0.02, y + 0.08, cz + hz + 0.02], "dark_metal", {
      solid: false,
      priority: 0.25,
    });

    const mat =
      opts.material ??
      this.material({
        base: "fluorescent_panel",
        emissive: color,
        emissiveStrength: intensity,
        flicker,
      });
    const ly = y - 0.003;
    this.addQuad([cx - hx, ly, cz - hz], [cx + hx, ly, cz - hz], [cx + hx, ly, cz + hz], [cx - hx, ly, cz + hz], mat, {
      u0: 0, v0: 0, u1: 1, v1: 1, priority: 0.25,
    });
    const ey = y - 0.02;
    this.addAreaLight([cx - hx, ey, cz - hz], [cx + hx, ey, cz - hz], [cx - hx, ey, cz + hz], color, intensity, { flicker });
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
    }

    const indexData = new Uint32Array(this.indices);
    const triMats = new Uint32Array(this.triMaterials);
    const bvh = buildBVH(positions, indexData, triMats);

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
