import * as THREE from "three";
import { createMaterial } from "../materials/ivory-tile.js";

export function buildWorld(scene, level, time, disturbance) {
  const solids = [];
  const tile = createMaterial({
    time,
    disturbance,
    waterHeight: level.waterHeight,
  });
  const pale = createMaterial({
    time,
    disturbance,
    waterHeight: level.waterHeight,
    color: "#e9e6cf",
  });
  const floorMaterial = createMaterial({
    time,
    disturbance,
    waterHeight: level.waterHeight,
    color: "#b3d1bc",
  });
  function box(w, h, d, x, y, z, material = tile, collide = false) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (collide)
      solids.push({
        minX: x - w / 2,
        maxX: x + w / 2,
        minZ: z - d / 2,
        maxZ: z + d / 2,
      });
    return mesh;
  }
  const floor = box(20, 0.3, 50, 0, -0.18, -10, floorMaterial);
  box(0.6, 7.4, 50, -10.3, 3.7, -10, pale);
  box(0.6, 7.4, 50, 10.3, 3.7, -10, pale);
  box(20, 7.4, 0.6, 0, 3.7, 15.3, pale);
  box(20, 7.4, 0.6, 0, 3.7, -35.3, tile);
  const plaster = new THREE.MeshStandardMaterial({
    color: "#eee9d5",
    roughness: 0.85,
  });
  // Ceiling strips leave real skylight openings, so the sun casts architectural shadows.
  box(3, 0.4, 50, -8.5, 7.6, -10, plaster);
  box(10.2, 0.4, 50, 1.9, 7.6, -10, plaster);
  box(1.5, 0.4, 50, 9.25, 7.6, -10, plaster);
  for (const z of [13, 4, -7, -18, -29, -35])
    box(20, 0.45, 1.1, 0, 7.6, z, plaster);
  const skyMaterial = new THREE.MeshBasicMaterial({
    color: "#fffbe0",
    side: THREE.DoubleSide,
  });
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(60, 90), skyMaterial);
  sky.rotation.x = Math.PI / 2;
  sky.position.set(0, 10, -10);
  scene.add(sky);
  const arches = [];
  const half = 3.325,
    radius = 2.38,
    spring = 3.05;
  for (const z of level.portalRows) {
    const row = new THREE.Group();
    scene.add(row);
    arches.push(row);
    for (const x of level.bays) {
      const s = new THREE.Shape();
      s.moveTo(-half, 0);
      s.lineTo(-half, 7.4);
      s.lineTo(half, 7.4);
      s.lineTo(half, 0);
      s.lineTo(radius, 0);
      s.lineTo(radius, spring);
      s.absarc(0, spring, radius, 0, Math.PI, false);
      s.lineTo(-radius, 0);
      s.lineTo(-half, 0);
      const geometry = new THREE.ExtrudeGeometry(s, {
        depth: 0.85,
        bevelEnabled: true,
        bevelSize: 0.035,
        bevelThickness: 0.035,
        bevelSegments: 1,
        curveSegments: 36,
        steps: 1,
      });
      const mesh = new THREE.Mesh(geometry, tile);
      mesh.position.set(x, 0, z - 0.425);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      row.add(mesh);
      for (const side of [-1, 1]) {
        const cx = x + side * (radius + (half - radius) / 2);
        solids.push({
          minX: cx - (half - radius) / 2 - 0.04,
          maxX: cx + (half - radius) / 2 + 0.04,
          minZ: z - 0.47,
          maxZ: z + 0.47,
        });
        box(half - radius + 0.13, 0.15, 1.02, cx, 0.09, z, tile, true);
      }
    }
  }
  // A dry ledge that never quite reaches the far end. Collision includes every step.
  for (let i = 0; i < 3; i++)
    box(
      0.45,
      0.18 * (i + 1),
      9,
      -8.0 - i * 0.45,
      0.09 * (i + 1),
      5.5,
      pale,
      true,
    );
  box(0.9, 0.55, 9, -9.55, 0.275, 5.5, pale, true);
  // Inset dark doorway: depth, no monster.
  box(
    2.15,
    3.8,
    0.025,
    0,
    1.9,
    -34.97,
    new THREE.MeshBasicMaterial({ color: "#152a25" }),
  );
  box(0.18, 4.0, 0.2, -1.16, 2, -34.8, pale);
  box(0.18, 4, 0.2, 1.16, 2, -34.8, pale);
  box(2.5, 0.18, 0.2, 0, 4, -34.8, pale);
  // A subtle waterline band and numeric depth marking, made locally with canvas.
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 512;
  labelCanvas.height = 128;
  const c = labelCanvas.getContext("2d");
  c.fillStyle = "#626f5d";
  c.font = "26px monospace";
  c.textAlign = "center";
  c.fillText("0.18 M", 256, 76);
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 0.375),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(labelCanvas),
      transparent: true,
      depthWrite: false,
    }),
  );
  label.position.set(9.983, 1.1, 3);
  label.rotation.y = -Math.PI / 2;
  scene.add(label);
  const hemi = new THREE.HemisphereLight("#fff7d9", "#668c7d", 2.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight("#fff0c2", 4.4);
  sun.position.set(-9, 17, 9);
  sun.target.position.set(2, 0, -9);
  scene.add(sun, sun.target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -25;
  sun.shadow.camera.right = 25;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 65;
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 3;
  const farGlow = new THREE.PointLight("#e7ffd5", 65, 20, 2);
  farGlow.position.set(0, 5, -27);
  scene.add(farGlow);
  const nearGlow = new THREE.PointLight("#e5fff0", 35, 19, 2);
  nearGlow.position.set(-5, 5, 5);
  scene.add(nearGlow);
  // A thin architectural occluder slides across the last portal during the event.
  const shutter = box(4.74, 5.55, 0.13, 0, 10.2, -25.55, tile);
  shutter.visible = false;
  const shutterSolid = { minX: 100, maxX: 101, minZ: -25.65, maxZ: -25.45 };
  solids.push(shutterSolid);
  return {
    shutterSolid,
    solids,
    floor,
    hemi,
    sun,
    farGlow,
    nearGlow,
    skyMaterial,
    shutter,
    arches,
  };
}
