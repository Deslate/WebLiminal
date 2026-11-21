// Fast binned-SAH flat BVH builder for GPU ray tracing (lightmapping & volumetrics).
// Output layout:
//   nodes: 8 floats/u32s (32 bytes) per node:
//     [minX, minY, minZ, leftFirst (u32), maxX, maxY, maxZ, triCount (u32)]
//     If triCount > 0: leaf covering tris [leftFirst .. leftFirst + triCount)
//     If triCount == 0: internal node with children leftFirst and leftFirst + 1
//   tris: 16 floats/u32s (64 bytes) per triangle:
//     vec4f v0_mat  (v0.x, v0.y, v0.z, materialId as bitcast u32)
//     vec4f e1_pad  (e1.x, e1.y, e1.z, 0)
//     vec4f e2_pad  (e2.x, e2.y, e2.z, 0)
//     vec4f n_pad   (gn.x, gn.y, gn.z, area)

export const BVH_NODE_WORDS = 8;
export const BVH_TRI_WORDS = 16;

export function buildBVH(positions, indices, materialIds) {
  const triCount = Math.floor(indices.length / 3);
  if (triCount === 0) {
    const emptyNodes = new ArrayBuffer(BVH_NODE_WORDS * 4);
    const emptyTris = new ArrayBuffer(BVH_TRI_WORDS * 4);
    return { nodeData: emptyNodes, triData: emptyTris, nodeCount: 1, triCount: 0 };
  }

  // Per-triangle bounds & centroids.
  const bMinX = new Float32Array(triCount);
  const bMinY = new Float32Array(triCount);
  const bMinZ = new Float32Array(triCount);
  const bMaxX = new Float32Array(triCount);
  const bMaxY = new Float32Array(triCount);
  const bMaxZ = new Float32Array(triCount);
  const centX = new Float32Array(triCount);
  const centY = new Float32Array(triCount);
  const centZ = new Float32Array(triCount);
  const triOrder = new Uint32Array(triCount);

  for (let t = 0; t < triCount; t++) {
    triOrder[t] = t;
    const i0 = indices[t * 3] * 3;
    const i1 = indices[t * 3 + 1] * 3;
    const i2 = indices[t * 3 + 2] * 3;
    const x0 = positions[i0], y0 = positions[i0 + 1], z0 = positions[i0 + 2];
    const x1 = positions[i1], y1 = positions[i1 + 1], z1 = positions[i1 + 2];
    const x2 = positions[i2], y2 = positions[i2 + 1], z2 = positions[i2 + 2];
    bMinX[t] = Math.min(x0, x1, x2);
    bMinY[t] = Math.min(y0, y1, y2);
    bMinZ[t] = Math.min(z0, z1, z2);
    bMaxX[t] = Math.max(x0, x1, x2);
    bMaxY[t] = Math.max(y0, y1, y2);
    bMaxZ[t] = Math.max(z0, z1, z2);
    centX[t] = (x0 + x1 + x2) * (1 / 3);
    centY[t] = (y0 + y1 + y2) * (1 / 3);
    centZ[t] = (z0 + z1 + z2) * (1 / 3);
  }

  const maxNodes = Math.max(2, triCount * 2);
  const nodeBuf = new ArrayBuffer(maxNodes * BVH_NODE_WORDS * 4);
  const nodeF = new Float32Array(nodeBuf);
  const nodeU = new Uint32Array(nodeBuf);
  let nodesUsed = 1;

  const setBounds = (idx, first, count) => {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < count; i++) {
      const t = triOrder[first + i];
      if (bMinX[t] < minX) minX = bMinX[t];
      if (bMinY[t] < minY) minY = bMinY[t];
      if (bMinZ[t] < minZ) minZ = bMinZ[t];
      if (bMaxX[t] > maxX) maxX = bMaxX[t];
      if (bMaxY[t] > maxY) maxY = bMaxY[t];
      if (bMaxZ[t] > maxZ) maxZ = bMaxZ[t];
    }
    const o = idx * BVH_NODE_WORDS;
    // Slight epsilon pad prevents flat axis-aligned walls from hitting zero-thickness AABB issues.
    nodeF[o + 0] = minX - 1e-4;
    nodeF[o + 1] = minY - 1e-4;
    nodeF[o + 2] = minZ - 1e-4;
    nodeF[o + 4] = maxX + 1e-4;
    nodeF[o + 5] = maxY + 1e-4;
    nodeF[o + 6] = maxZ + 1e-4;
  };

  nodeU[3] = 0;
  nodeU[7] = triCount;
  setBounds(0, 0, triCount);

  const BINS = 8;
  const binCount = new Int32Array(BINS);
  const binMinX = new Float32Array(BINS), binMinY = new Float32Array(BINS), binMinZ = new Float32Array(BINS);
  const binMaxX = new Float32Array(BINS), binMaxY = new Float32Array(BINS), binMaxZ = new Float32Array(BINS);
  const leftArea = new Float32Array(BINS - 1);
  const leftCount = new Int32Array(BINS - 1);
  const rightArea = new Float32Array(BINS - 1);
  const rightCount = new Int32Array(BINS - 1);

  const area = (minX, minY, minZ, maxX, maxY, maxZ) => {
    const dx = Math.max(0, maxX - minX);
    const dy = Math.max(0, maxY - minY);
    const dz = Math.max(0, maxZ - minZ);
    return dx * dy + dy * dz + dz * dx;
  };

  const stack = [0];
  while (stack.length > 0) {
    const nodeIdx = stack.pop();
    const o = nodeIdx * BVH_NODE_WORDS;
    const first = nodeU[o + 3];
    const count = nodeU[o + 7];
    if (count <= 4) continue;

    // Centroid bounds.
    let cMinX = Infinity, cMinY = Infinity, cMinZ = Infinity;
    let cMaxX = -Infinity, cMaxY = -Infinity, cMaxZ = -Infinity;
    for (let i = 0; i < count; i++) {
      const t = triOrder[first + i];
      if (centX[t] < cMinX) cMinX = centX[t];
      if (centY[t] < cMinY) cMinY = centY[t];
      if (centZ[t] < cMinZ) cMinZ = centZ[t];
      if (centX[t] > cMaxX) cMaxX = centX[t];
      if (centY[t] > cMaxY) cMaxY = centY[t];
      if (centZ[t] > cMaxZ) cMaxZ = centZ[t];
    }

    const parentCost =
      count *
      area(nodeF[o], nodeF[o + 1], nodeF[o + 2], nodeF[o + 4], nodeF[o + 5], nodeF[o + 6]);
    let bestCost = parentCost;
    let bestAxis = -1;
    let bestSplit = 0;

    const cMin = [cMinX, cMinY, cMinZ];
    const cMax = [cMaxX, cMaxY, cMaxZ];
    const cents = [centX, centY, centZ];

    for (let axis = 0; axis < 3; axis++) {
      const span = cMax[axis] - cMin[axis];
      if (span < 1e-5) continue;
      const scale = BINS / span;
      binCount.fill(0);
      binMinX.fill(Infinity); binMinY.fill(Infinity); binMinZ.fill(Infinity);
      binMaxX.fill(-Infinity); binMaxY.fill(-Infinity); binMaxZ.fill(-Infinity);

      const cArr = cents[axis];
      const base = cMin[axis];
      for (let i = 0; i < count; i++) {
        const t = triOrder[first + i];
        const b = Math.min(BINS - 1, Math.max(0, Math.floor((cArr[t] - base) * scale)));
        binCount[b]++;
        if (bMinX[t] < binMinX[b]) binMinX[b] = bMinX[t];
        if (bMinY[t] < binMinY[b]) binMinY[b] = bMinY[t];
        if (bMinZ[t] < binMinZ[b]) binMinZ[b] = bMinZ[t];
        if (bMaxX[t] > binMaxX[b]) binMaxX[b] = bMaxX[t];
        if (bMaxY[t] > binMaxY[b]) binMaxY[b] = bMaxY[t];
        if (bMaxZ[t] > binMaxZ[b]) binMaxZ[b] = bMaxZ[t];
      }

      let lMinX = Infinity, lMinY = Infinity, lMinZ = Infinity;
      let lMaxX = -Infinity, lMaxY = -Infinity, lMaxZ = -Infinity;
      let lCnt = 0;
      for (let b = 0; b < BINS - 1; b++) {
        if (binCount[b] > 0) {
          lCnt += binCount[b];
          if (binMinX[b] < lMinX) lMinX = binMinX[b];
          if (binMinY[b] < lMinY) lMinY = binMinY[b];
          if (binMinZ[b] < lMinZ) lMinZ = binMinZ[b];
          if (binMaxX[b] > lMaxX) lMaxX = binMaxX[b];
          if (binMaxY[b] > lMaxY) lMaxY = binMaxY[b];
          if (binMaxZ[b] > lMaxZ) lMaxZ = binMaxZ[b];
        }
        leftCount[b] = lCnt;
        leftArea[b] = lCnt > 0 ? area(lMinX, lMinY, lMinZ, lMaxX, lMaxY, lMaxZ) : 0;
      }

      let rMinX = Infinity, rMinY = Infinity, rMinZ = Infinity;
      let rMaxX = -Infinity, rMaxY = -Infinity, rMaxZ = -Infinity;
      let rCnt = 0;
      for (let b = BINS - 1; b > 0; b--) {
        if (binCount[b] > 0) {
          rCnt += binCount[b];
          if (binMinX[b] < rMinX) rMinX = binMinX[b];
          if (binMinY[b] < rMinY) rMinY = binMinY[b];
          if (binMinZ[b] < rMinZ) rMinZ = binMinZ[b];
          if (binMaxX[b] > rMaxX) rMaxX = binMaxX[b];
          if (binMaxY[b] > rMaxY) rMaxY = binMaxY[b];
          if (binMaxZ[b] > rMaxZ) rMaxZ = binMaxZ[b];
        }
        rightCount[b - 1] = rCnt;
        rightArea[b - 1] = rCnt > 0 ? area(rMinX, rMinY, rMinZ, rMaxX, rMaxY, rMaxZ) : 0;
      }

      for (let b = 0; b < BINS - 1; b++) {
        if (leftCount[b] === 0 || rightCount[b] === 0) continue;
        const cost = leftCount[b] * leftArea[b] + rightCount[b] * rightArea[b];
        if (cost < bestCost) {
          bestCost = cost;
          bestAxis = axis;
          bestSplit = base + ((b + 1) * span) / BINS;
        }
      }
    }

    if (bestAxis < 0) continue;

    // Partition triOrder in place.
    const cArr = cents[bestAxis];
    let i = first;
    let j = first + count - 1;
    while (i <= j) {
      if (cArr[triOrder[i]] < bestSplit) {
        i++;
      } else {
        const tmp = triOrder[i];
        triOrder[i] = triOrder[j];
        triOrder[j] = tmp;
        j--;
      }
    }
    const leftSize = i - first;
    if (leftSize === 0 || leftSize === count) continue;

    const leftIdx = nodesUsed;
    const rightIdx = nodesUsed + 1;
    nodesUsed += 2;

    nodeU[o + 3] = leftIdx;
    nodeU[o + 7] = 0;

    nodeU[leftIdx * BVH_NODE_WORDS + 3] = first;
    nodeU[leftIdx * BVH_NODE_WORDS + 7] = leftSize;
    setBounds(leftIdx, first, leftSize);

    nodeU[rightIdx * BVH_NODE_WORDS + 3] = i;
    nodeU[rightIdx * BVH_NODE_WORDS + 7] = count - leftSize;
    setBounds(rightIdx, i, count - leftSize);

    stack.push(rightIdx, leftIdx);
  }

  // Pack triangles in BVH leaf order for linear memory access on GPU.
  const triData = new ArrayBuffer(triCount * BVH_TRI_WORDS * 4);
  const triF = new Float32Array(triData);
  const triU = new Uint32Array(triData);

  for (let k = 0; k < triCount; k++) {
    const t = triOrder[k];
    const i0 = indices[t * 3] * 3;
    const i1 = indices[t * 3 + 1] * 3;
    const i2 = indices[t * 3 + 2] * 3;
    const x0 = positions[i0], y0 = positions[i0 + 1], z0 = positions[i0 + 2];
    const e1x = positions[i1] - x0, e1y = positions[i1 + 1] - y0, e1z = positions[i1 + 2] - z0;
    const e2x = positions[i2] - x0, e2y = positions[i2 + 1] - y0, e2z = positions[i2 + 2] - z0;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    const len = Math.hypot(nx, ny, nz);
    const invLen = len > 1e-12 ? 1 / len : 0;
    const o = k * BVH_TRI_WORDS;
    triF[o + 0] = x0; triF[o + 1] = y0; triF[o + 2] = z0;
    triU[o + 3] = materialIds[t];
    triF[o + 4] = e1x; triF[o + 5] = e1y; triF[o + 6] = e1z; triF[o + 7] = 0;
    triF[o + 8] = e2x; triF[o + 9] = e2y; triF[o + 10] = e2z; triF[o + 11] = 0;
    triF[o + 12] = nx * invLen; triF[o + 13] = ny * invLen; triF[o + 14] = nz * invLen;
    triF[o + 15] = len * 0.5;
  }

  return {
    nodeData: nodeBuf.slice(0, nodesUsed * BVH_NODE_WORDS * 4),
    triData,
    nodeCount: nodesUsed,
    triCount,
  };
}

// Reference CPU ray-BVH intersector for unit testing and validation.
export function intersectBVH(bvh, ro, rd, maxT = 1e9) {
  if (bvh.triCount === 0) return null;
  const nodeF = new Float32Array(bvh.nodeData);
  const nodeU = new Uint32Array(bvh.nodeData);
  const triF = new Float32Array(bvh.triData);
  const triU = new Uint32Array(bvh.triData);

  const invX = 1 / (Math.abs(rd[0]) > 1e-12 ? rd[0] : 1e-12);
  const invY = 1 / (Math.abs(rd[1]) > 1e-12 ? rd[1] : 1e-12);
  const invZ = 1 / (Math.abs(rd[2]) > 1e-12 ? rd[2] : 1e-12);

  const hitAABB = (o, bestT) => {
    const tx0 = (nodeF[o + 0] - ro[0]) * invX;
    const tx1 = (nodeF[o + 4] - ro[0]) * invX;
    const ty0 = (nodeF[o + 1] - ro[1]) * invY;
    const ty1 = (nodeF[o + 5] - ro[1]) * invY;
    const tz0 = (nodeF[o + 2] - ro[2]) * invZ;
    const tz1 = (nodeF[o + 6] - ro[2]) * invZ;
    const tmin = Math.max(Math.min(tx0, tx1), Math.min(ty0, ty1), Math.min(tz0, tz1));
    const tmax = Math.min(Math.max(tx0, tx1), Math.max(ty0, ty1), Math.max(tz0, tz1));
    return tmax >= Math.max(tmin, 0) && tmin < bestT ? tmin : Infinity;
  };

  let bestT = maxT;
  let bestTri = -1;
  let bestMat = 0;
  const stack = [0];
  if (hitAABB(0, bestT) === Infinity) return null;

  while (stack.length > 0) {
    const idx = stack.pop();
    const o = idx * BVH_NODE_WORDS;
    const leftFirst = nodeU[o + 3];
    const count = nodeU[o + 7];
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        const t = (leftFirst + i) * BVH_TRI_WORDS;
        const e1x = triF[t + 4], e1y = triF[t + 5], e1z = triF[t + 6];
        const e2x = triF[t + 8], e2y = triF[t + 9], e2z = triF[t + 10];
        const px = rd[1] * e2z - rd[2] * e2y;
        const py = rd[2] * e2x - rd[0] * e2z;
        const pz = rd[0] * e2y - rd[1] * e2x;
        const det = e1x * px + e1y * py + e1z * pz;
        if (Math.abs(det) < 1e-8) continue;
        const invDet = 1 / det;
        const tx = ro[0] - triF[t + 0];
        const ty = ro[1] - triF[t + 1];
        const tz = ro[2] - triF[t + 2];
        const u = (tx * px + ty * py + tz * pz) * invDet;
        if (u < 0 || u > 1) continue;
        const qx = ty * e1z - tz * e1y;
        const qy = tz * e1x - tx * e1z;
        const qz = tx * e1y - ty * e1x;
        const v = (rd[0] * qx + rd[1] * qy + rd[2] * qz) * invDet;
        if (v < 0 || u + v > 1) continue;
        const dist = (e2x * qx + e2y * qy + e2z * qz) * invDet;
        if (dist > 1e-5 && dist < bestT) {
          bestT = dist;
          bestTri = leftFirst + i;
          bestMat = triU[t + 3];
        }
      }
    } else {
      const dL = hitAABB(leftFirst * BVH_NODE_WORDS, bestT);
      const dR = hitAABB((leftFirst + 1) * BVH_NODE_WORDS, bestT);
      if (dL < dR) {
        if (dR < bestT) stack.push(leftFirst + 1);
        if (dL < bestT) stack.push(leftFirst);
      } else {
        if (dL < bestT) stack.push(leftFirst);
        if (dR < bestT) stack.push(leftFirst + 1);
      }
    }
  }

  return bestTri >= 0 ? { t: bestT, tri: bestTri, material: bestMat } : null;
}
