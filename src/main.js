import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";
import level from "../levels/poolrooms.json";
import { createFilm } from "./film.js";
import { buildWorld } from "./world.js";
import { createWaterMaterial } from "../materials/water.js";
import { createSoundscape } from "./audio.js";
import { movePlayer, canStand } from "./collision.js";

const host = document.getElementById("experience");
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance",
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
host.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color("#e4ead5");
scene.fog = new THREE.FogExp2("#b4ccba", 0.009);
const camera = new THREE.PerspectiveCamera(
  66,
  innerWidth / innerHeight,
  0.08,
  110,
);
camera.rotation.order = "YXZ";
const time = { value: 0 },
  disturbance = { value: 0 };
const world = buildWorld(scene, level, time, disturbance);
const film = createFilm(renderer, time);
const reflector = new Reflector(new THREE.PlaneGeometry(20, 50), {
  textureWidth: 1024,
  textureHeight: 1024,
  clipBias: 0.003,
});
reflector.rotation.x = -Math.PI / 2;
reflector.position.set(0, level.waterHeight, -10);
// Reflector performs the reflected scene pass and oblique clipping. Our own water shader
// reads its render target, retaining the view-dependent ripple and transmission layer.
const water = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 50),
  createWaterMaterial({
    time,
    disturbance,
    reflection: reflector.getRenderTarget().texture,
    textureMatrix: reflector.material.uniforms.textureMatrix.value,
  }),
);
water.rotation.x = -Math.PI / 2;
water.position.copy(reflector.position);
scene.add(water);
reflector.updateMatrixWorld();
const reflectionPass = reflector.onBeforeRender.bind(reflector);
const sound = createSoundscape(document.getElementById("audio-status"));
const position = { x: level.spawn.x, z: level.spawn.z };
let yaw = level.spawn.yaw,
  pitch = level.spawn.pitch,
  dragging = false,
  interacted = false,
  distance = 0;
const keys = new Set();
const movementKeys = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ShiftLeft",
  "ShiftRight",
]);
function interact() {
  sound.unlock();
  interacted = true;
  document.body.classList.add("exploring");
}
addEventListener("keydown", (e) => {
  if (movementKeys.has(e.code)) {
    e.preventDefault();
    keys.add(e.code);
  }
  if (e.code === "KeyM" && !e.repeat) sound.toggle();
  else interact();
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => {
  keys.clear();
  dragging = false;
});
renderer.domElement.addEventListener("pointerdown", (e) => {
  interact();
  dragging = true;
  renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener("pointerup", () => (dragging = false));
renderer.domElement.addEventListener("pointercancel", () => (dragging = false));
renderer.domElement.addEventListener("pointermove", (e) => {
  if (dragging) {
    yaw -= e.movementX * 0.0024;
    pitch = THREE.MathUtils.clamp(pitch - e.movementY * 0.0024, -0.95, 0.95);
  }
});
let scale = Math.min(devicePixelRatio, 1.5);
function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(scale);
  renderer.setSize(innerWidth, innerHeight);
  film.resize(renderer.domElement.width, renderer.domElement.height);
}
addEventListener("resize", resize);
resize();
const clock = document.getElementById("timecode");
const frameTimes = [],
  qualityChanges = [],
  eventLog = [];
let startedAt = performance.now(),
  previous = startedAt,
  elapsed = 0,
  frame = 0,
  firstFrameMs = null,
  lastClock = -1,
  lastQualityCheck = startedAt,
  eventStarted = false,
  eventEnded = false;
addEventListener("visibilitychange", () => {
  previous = performance.now();
  if (document.hidden) {
    keys.clear();
    dragging = false;
  }
});
function sampleEvent(t) {
  const local = t - level.moment.start;
  if (local < 0) return 0;
  if (local < 1.4) return THREE.MathUtils.smoothstep(local, 0, 1.4);
  if (local < 6) return 1;
  return 1 - THREE.MathUtils.smoothstep(local, 6, level.moment.duration);
}
function render(now) {
  requestAnimationFrame(render);
  if (document.hidden) {
    previous = now;
    return;
  }
  const rawDt = now - previous,
    dt = Math.min(rawDt / 1000, 0.05);
  previous = now;
  // Real visible elapsed time is used for choreography; movement remains bounded.
  elapsed += rawDt / 1000;
  time.value = elapsed;
  disturbance.value = sampleEvent(elapsed);
  if (elapsed >= level.moment.start && !eventStarted) {
    eventStarted = true;
    eventLog.push({ event: "onset", time: elapsed });
    document.body.classList.add("moment");
  }
  if (elapsed >= level.moment.start + level.moment.duration && !eventEnded) {
    eventEnded = true;
    eventLog.push({ event: "end", time: elapsed });
    document.body.classList.remove("moment");
    document.querySelector(".coordinates").innerHTML =
      "DEPTH &nbsp; 0.18 M <em>／</em> OCCUPANCY &nbsp; 01";
  }
  world.shutterSolid.minX = disturbance.value > 0.69 ? -2.38 : 100;
  world.shutterSolid.maxX = disturbance.value > 0.69 ? 2.38 : 101;
  if (!canStand(position.x, position.z, level.bounds, world.solids)) {
    position.z = position.z < -25.55 ? -25.9 : -25.2;
  }
  let forward =
    Number(keys.has("KeyW") || keys.has("ArrowUp")) -
    Number(keys.has("KeyS") || keys.has("ArrowDown"));
  let strafe =
    Number(keys.has("KeyD") || keys.has("ArrowRight")) -
    Number(keys.has("KeyA") || keys.has("ArrowLeft"));
  const length = Math.hypot(forward, strafe);
  const speed = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 2.6 : 1.65;
  const oldX = position.x,
    oldZ = position.z;
  if (length) {
    forward /= length;
    strafe /= length;
    movePlayer(
      position,
      (-Math.sin(yaw) * forward + Math.cos(yaw) * strafe) * speed * dt,
      (-Math.cos(yaw) * forward - Math.sin(yaw) * strafe) * speed * dt,
      level.bounds,
      world.solids,
    );
  }
  const moved = Math.hypot(position.x - oldX, position.z - oldZ);
  distance += moved;
  camera.position.set(
    position.x,
    1.64 +
      Math.sin(elapsed * 0.65) * 0.009 +
      (moved > 0.0001 ? Math.sin(distance * 8) * 0.018 : 0),
    position.z,
  );
  const drift = interacted ? 0 : Math.sin(elapsed * 0.1) * 0.018;
  camera.rotation.set(
    pitch + Math.sin(elapsed * 0.34) * 0.0025,
    yaw + drift,
    Math.sin(elapsed * 0.28) * 0.0015,
  );
  const d = disturbance.value;
  world.hemi.intensity = 1.55 - d * 1.05;
  world.sun.intensity = 4.4 * (1 - d * 0.91);
  world.farGlow.intensity = 65 * (1 - d);
  world.nearGlow.intensity = 35 * (1 - d * 0.8);
  world.skyMaterial.color.setRGB(
    1 - d * 0.78,
    0.965 - d * 0.69,
    0.78 - d * 0.48,
  );
  scene.fog.color.setRGB(0.46 - d * 0.25, 0.6 - d * 0.29, 0.49 - d * 0.24);
  world.shutter.visible = d > 0.01;
  world.shutter.position.y = 10.2 - d * 7.45;
  // Only the event's moving shutter needs shadow-map refreshes.
  if (d > 0 || (eventEnded && frame % 60 === 0))
    renderer.shadowMap.needsUpdate = true;
  sound.update(elapsed, moved > 0.0001, d);
  camera.updateMatrixWorld();
  // The floor is below the clipping plane; hide the water to avoid recursive reflection.
  water.visible = false;
  reflectionPass(renderer, scene, camera);
  water.visible = true;
  film.render(scene, camera);
  if (firstFrameMs === null) {
    firstFrameMs = performance.now();
    host.style.visibility = "visible";
    document.getElementById("first-frame").style.visibility = "hidden";
    performance.mark("poolrooms:first-frame");
  }
  if (Math.floor(elapsed) !== lastClock) {
    lastClock = Math.floor(elapsed);
    clock.textContent = `00:${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(lastClock % 60).padStart(2, "0")}`;
  }
  if (frame++ > 10 && rawDt > 0) {
    frameTimes.push({ t: elapsed, ms: rawDt });
    if (frameTimes.length > 18000) frameTimes.shift();
  }
  if (now - lastQualityCheck > 2500 && frameTimes.length > 60) {
    // Cap isolated scheduling stalls (tab capture / OS pause); sustained slow frames still lower quality.
    const tail = frameTimes.slice(-90);
    const mean = tail.reduce((s, x) => s + Math.min(x.ms, 50), 0) / tail.length;
    if (mean > 23 && scale > 0.65) {
      scale = Math.max(0.65, scale - 0.2);
      resize();
      const size = scale < 1 ? 512 : 768;
      reflector.getRenderTarget().setSize(size, size);
      qualityChanges.push({ t: elapsed, scale, mean });
    }
    lastQualityCheck = now;
  }
}
requestAnimationFrame(render);
// Read-only diagnostics for reproducible acceptance tests; no on-screen debug UI.
Object.defineProperty(window, "__POOLROOMS__", {
  value: Object.freeze({
    snapshot: () => ({
      elapsed,
      firstFrameMs,
      position: { ...position, y: camera.position.y },
      yaw,
      pitch,
      validPosition: canStand(
        position.x,
        position.z,
        level.bounds,
        world.solids,
      ),
      pixelRatio: scale,
      drawingBuffer: {
        width: renderer.domElement.width,
        height: renderer.domElement.height,
      },
      audio: sound.inspect(),
      disturbance: disturbance.value,
      eventLog: [...eventLog],
      qualityChanges: [...qualityChanges],
      frames: frameTimes.slice(),
      renderer: renderer
        .getContext()
        .getParameter(
          renderer.getContext().getExtension("WEBGL_debug_renderer_info")
            ?.UNMASKED_RENDERER_WEBGL || renderer.getContext().RENDERER,
        ),
    }),
  }),
});
