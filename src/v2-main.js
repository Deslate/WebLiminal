// WebLiminal Application Shell.
// Connects lightweight declarative levels to the unified WebGPU engine,
// FPS/drag camera controls, collision, procedural audio, and developer inspector.

import { LEVEL_LIST, selectLevel } from "../levels/v2/index.js";
import { createMap } from "./engine/map-builder.js";
import { createRenderer } from "./engine/renderer.js";
import { movePlayer, sampleFloorHeight, PLAYER_EYE_HEIGHT } from "./engine/collision.js";
import { createAudioEngine } from "./engine/audio.js";

const viewport = document.getElementById("viewport");
const canvas = document.createElement("canvas");
viewport.appendChild(canvas);

const hudTitle = document.getElementById("hud-title");
const hudSubtitle = document.getElementById("hud-subtitle");
const hudBake = document.getElementById("hud-bake");
const hudFps = document.getElementById("hud-fps");
const audioStatus = document.getElementById("audio-status");
const fatalEl = document.getElementById("fatal-error");

const inspector = document.getElementById("inspector");
const btnInspector = document.getElementById("btn-inspector");
const btnCloseInsp = document.getElementById("btn-close-insp");
const levelButtonsEl = document.getElementById("level-buttons");
const bookmarkButtonsEl = document.getElementById("bookmark-buttons");
const selDebug = document.getElementById("sel-debug");
const rngExposure = document.getElementById("rng-exposure");
const outExposure = document.getElementById("out-exposure");
const chkVhs = document.getElementById("chk-vhs");
const chkSsr = document.getElementById("chk-ssr");
const chkVol = document.getElementById("chk-vol");
const chkBloom = document.getElementById("chk-bloom");
const statsEl = document.getElementById("scene-stats");

const params = new URLSearchParams(location.search);
if (params.get("capture") === "1") document.body.classList.add("capture");

const audio = createAudioEngine(audioStatus);

let renderer;
try {
  renderer = await createRenderer(canvas, {
    texSize: params.has("texSize") ? Number(params.get("texSize")) : undefined,
    atlasSize: params.has("atlasSize") ? Number(params.get("atlasSize")) : undefined,
    targetSpp: params.has("spp") ? Number(params.get("spp")) : undefined,
  });
} catch (err) {
  fatalEl.hidden = false;
  fatalEl.textContent = `WebLiminal failed to initialize: ${err.message}`;
  throw err;
}

let activeLevel = null;
let compiledScene = null;
let activeBookmark = 0;
let loadingLevel = false;
let paused = false;

const pose = { x: 0, y: PLAYER_EYE_HEIGHT, z: 0, yaw: 0, pitch: 0, footY: 0 };
let walkBobPhase = 0;
let wakeDistAccum = 0;
let wakeSide = 1;

function syncResize() {
  const rect = viewport.getBoundingClientRect();
  const dprCap = renderer.isSoftware ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.resize(rect.width || 960, rect.height || 540, dprCap);
}
syncResize();
addEventListener("resize", syncResize);
new ResizeObserver(syncResize).observe(viewport);

function renderStats(stats, bake) {
  const rows = [
    ["Triangles", stats.triangles.toLocaleString()],
    ["BVH Nodes", stats.bvhNodes.toLocaleString()],
    ["Materials Baked", `${stats.materials} (${renderer.settings.texSize}px)`],
    ["Area Lights", String(stats.lights)],
    ["Lightmap Atlas", `${stats.atlasSize}² (${stats.texelsPerMeter} tx/m, ${stats.atlasUtilization}%)`],
    ["Water Sim", stats.hasWater ? "Active" : "Disabled (0 ms)"],
    ["Tex Bake Time", `${bake.textureMs} ms`],
    ["Init GI Bake", `${bake.initBakeMs} ms`],
  ];
  statsEl.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
}

function renderBookmarkButtons() {
  const bms = compiledScene?.bookmarks ?? [];
  bookmarkButtonsEl.innerHTML = "";
  bms.forEach((bm, idx) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = bm.name;
    b.classList.toggle("active", idx === activeBookmark);
    b.addEventListener("click", () => jumpToBookmark(idx));
    bookmarkButtonsEl.appendChild(b);
  });
}

function renderLevelButtons() {
  levelButtonsEl.innerHTML = "";
  LEVEL_LIST.forEach((lvl, idx) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = `${idx + 1}. ${lvl.id}`;
    b.classList.toggle("active", activeLevel?.id === lvl.id);
    b.addEventListener("click", () => loadLevel(lvl.id));
    levelButtonsEl.appendChild(b);
  });
}

function setPose(spawn) {
  pose.x = spawn.x;
  pose.z = spawn.z;
  pose.yaw = spawn.yaw ?? 0;
  pose.pitch = spawn.pitch ?? 0;
  const floorY = compiledScene ? sampleFloorHeight(pose.x, pose.z, compiledScene.collision) : 0;
  pose.footY = floorY;
  pose.y = spawn.y ?? floorY + PLAYER_EYE_HEIGHT;
}

function jumpToBookmark(index) {
  const bms = compiledScene?.bookmarks ?? [];
  if (!bms[index]) return;
  activeBookmark = index;
  setPose(bms[index].spawn);
  renderBookmarkButtons();
}

async function loadLevel(levelId) {
  if (loadingLevel) return;
  loadingLevel = true;
  const lvl = selectLevel(levelId);
  hudTitle.textContent = lvl.title;
  hudSubtitle.textContent = lvl.subtitle;
  hudBake.classList.remove("converged");
  hudBake.textContent = "Synthesizing PBR Textures & Baking GI…";

  try {
    const seed = params.has("seed") ? Number(params.get("seed")) : undefined;
    const builder = createMap({ atlasSize: renderer.settings.atlasSize });
    lvl.build(builder, { seed });
    const compiled = builder.compile({ atlasSize: renderer.settings.atlasSize });

    const { stats, bake } = await renderer.loadScene(compiled, lvl.atmosphere);
    activeLevel = lvl;
    compiledScene = compiled;
    activeBookmark = 0;
    setPose(lvl.spawn);

    audio.setProfile(lvl.audio);
    rngExposure.value = String(renderer.settings.exposure);
    outExposure.textContent = renderer.settings.exposure.toFixed(2);
    renderLevelButtons();
    renderBookmarkButtons();
    renderStats(stats, bake);

    // Sync URL query param without reloading
    const u = new URL(location.href);
    u.searchParams.set("level", lvl.id);
    history.replaceState(null, "", u);
  } finally {
    loadingLevel = false;
  }
}

// --- Input Controls ---
const keys = new Set();
let dragging = false;

addEventListener("keydown", (e) => {
  if (e.target.closest?.("input, select, textarea")) return;
  if (e.code === "KeyG" && !e.repeat) {
    inspector.hidden = !inspector.hidden;
    e.preventDefault();
    return;
  }
  if (e.code === "Escape" && !inspector.hidden) {
    inspector.hidden = true;
    return;
  }
  if (e.code === "Tab" && !e.repeat) {
    e.preventDefault();
    paused = !paused;
    audio.setPaused(paused);
    return;
  }
  if (e.code === "KeyM" && !e.repeat) {
    audio.toggle();
    return;
  }
  if (e.code === "KeyV" && !e.repeat) {
    renderer.setSettings({ vhsMode: !renderer.settings.vhsMode });
    chkVhs.checked = renderer.settings.vhsMode;
    return;
  }
  if (e.code === "KeyB" && !e.repeat) {
    const len = compiledScene?.bookmarks?.length ?? 0;
    if (len > 1) jumpToBookmark((activeBookmark + 1) % len);
    return;
  }
  if (!e.repeat && ["Digit1", "Digit2", "Digit3"].includes(e.code)) {
    const idx = Number(e.code.slice(-1)) - 1;
    if (LEVEL_LIST[idx]) loadLevel(LEVEL_LIST[idx].id);
    return;
  }

  audio.unlock();
  if (
    ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"].includes(
      e.code,
    )
  ) {
    keys.add(e.code);
    e.preventDefault();
  }
});

addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => {
  keys.clear();
  dragging = false;
});

canvas.addEventListener("pointerdown", (e) => {
  audio.unlock();
  if (document.pointerLockElement === canvas) return;
  dragging = true;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointerup", () => {
  dragging = false;
});
canvas.addEventListener("pointercancel", () => {
  dragging = false;
});
canvas.addEventListener("dblclick", () => {
  canvas.requestPointerLock?.();
});
addEventListener("pointermove", (e) => {
  if (dragging || document.pointerLockElement === canvas) {
    pose.yaw -= e.movementX * 0.0024;
    pose.pitch = Math.max(-1.42, Math.min(1.25, pose.pitch - e.movementY * 0.0024));
  }
});

// Inspector UI hooks
btnInspector.addEventListener("click", () => {
  inspector.hidden = !inspector.hidden;
});
btnCloseInsp.addEventListener("click", () => {
  inspector.hidden = true;
});
selDebug.addEventListener("change", () => {
  renderer.setSettings({ debugView: Number(selDebug.value) });
});
rngExposure.addEventListener("input", () => {
  const v = Number(rngExposure.value);
  outExposure.textContent = v.toFixed(2);
  renderer.setSettings({ exposure: v });
});
chkVhs.addEventListener("change", () => renderer.setSettings({ vhsMode: chkVhs.checked }));
chkSsr.addEventListener("change", () => renderer.setSettings({ ssrEnabled: chkSsr.checked }));
chkVol.addEventListener("change", () => renderer.setSettings({ volumetricEnabled: chkVol.checked }));
chkBloom.addEventListener("change", () => renderer.setSettings({ bloomEnabled: chkBloom.checked }));

// Boot default or URL-requested level
await loadLevel(params.get("level") || undefined);

// --- Main Real-Time Loop ---
let prevTime = performance.now();
let elapsed = 0;
let fpsFrames = 0;
let fpsLast = performance.now();
let currentFps = 0;

function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, Math.max(0.001, (now - prevTime) / 1000));
  prevTime = now;

  if (paused || loadingLevel || !compiledScene) return;
  elapsed += dt;

  // Player movement + stair elevation + live water wake impulses
  let forward = Number(keys.has("KeyW") || keys.has("ArrowUp")) - Number(keys.has("KeyS") || keys.has("ArrowDown"));
  let strafe = Number(keys.has("KeyD") || keys.has("ArrowRight")) - Number(keys.has("KeyA") || keys.has("ArrowLeft"));
  const len = Math.hypot(forward, strafe);
  const water = compiledScene.water;
  const inWater = Boolean(water && pose.footY < water.level - 0.05);
  const sprint = keys.has("ShiftLeft") || keys.has("ShiftRight");
  const speed = inWater ? (sprint ? 2.4 : 1.45) : sprint ? 4.4 : 2.55;

  const beforeX = pose.x;
  const beforeZ = pose.z;
  if (len > 0) {
    forward /= len;
    strafe /= len;
    const dx = (-Math.sin(pose.yaw) * forward + Math.cos(pose.yaw) * strafe) * speed * dt;
    const dz = (-Math.cos(pose.yaw) * forward - Math.sin(pose.yaw) * strafe) * speed * dt;
    movePlayer(pose, dx, dz, compiledScene.collision, dt);
    walkBobPhase += dt * (inWater ? 6.2 : sprint ? 11.5 : 8.2);
  }

  const moved = Math.hypot(pose.x - beforeX, pose.z - beforeZ);
  if (inWater && moved > 1e-4) {
    wakeDistAccum += moved;
    if (wakeDistAccum >= 0.22) {
      wakeDistAccum = 0;
      wakeSide = -wakeSide;
      const sideX = Math.cos(pose.yaw) * 0.14 * wakeSide;
      const sideZ = -Math.sin(pose.yaw) * 0.14 * wakeSide;
      renderer.addWake(pose.x + sideX, pose.z + sideZ, 0.36, -0.22);
    }
  }

  audio.update(elapsed, len > 0, inWater);

  // Subtle vertical walking head-bob (zero when standing still)
  const bob = len > 0 ? Math.sin(walkBobPhase) * 0.022 : 0;
  const renderPose = { ...pose, y: pose.y + bob };
  renderer.render(renderPose, elapsed, dt);

  // Update bake progress & FPS HUD
  const bk = renderer.getBakeState();
  if (bk.bakedSpp < bk.targetSpp) {
    hudBake.classList.remove("converged");
    hudBake.textContent = `BAKING GI · ${bk.bakedSpp}/${bk.targetSpp} SPP`;
  } else if (!hudBake.classList.contains("converged")) {
    hudBake.classList.add("converged");
    hudBake.textContent = `GI READY · ${bk.bakedSpp} SPP · ${bk.textureMs + bk.initBakeMs} ms boot`;
  }

  fpsFrames++;
  if (now - fpsLast >= 400) {
    currentFps = Math.round((fpsFrames * 1000) / (now - fpsLast));
    hudFps.textContent = `${currentFps} FPS`;
    fpsFrames = 0;
    fpsLast = now;
  }
}
requestAnimationFrame(tick);

// Public automation & debugging handle for capture scripts and testing.
window.__WEBLIMINAL__ = {
  levels: () => LEVEL_LIST.map((l) => l.id),
  loadLevel,
  jumpToBookmark,
  setPose(p) {
    setPose({ ...pose, ...p });
  },
  setSettings(patch) {
    renderer.setSettings(patch);
    if (patch.exposure !== undefined) {
      rngExposure.value = String(patch.exposure);
      outExposure.textContent = Number(patch.exposure).toFixed(2);
    }
    if (patch.debugView !== undefined) selDebug.value = String(patch.debugView);
    if (patch.vhsMode !== undefined) chkVhs.checked = Boolean(patch.vhsMode);
  },
  async renderFrame(targetSpp = null) {
    paused = true;
    if (targetSpp) await renderer.bakeTo(targetSpp);
    if (compiledScene?.water) {
      renderer.addWake(pose.x - Math.sin(pose.yaw) * 2.2, pose.z - Math.cos(pose.yaw) * 2.2, 0.45, -0.26);
      for (let i = 0; i < 4; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        renderer.render(pose, elapsed + i * 0.05, 0.05);
        await renderer.waitIdle();
      }
    }
    await new Promise((r) => requestAnimationFrame(r));
    renderer.render(pose, elapsed + 1.2, 0.016);
    await renderer.waitIdle();
    return {
      level: activeLevel?.id,
      fps: currentFps,
      resolution: renderer.getResolution(),
      stats: compiledScene?.stats,
      bake: renderer.getBakeState(),
      errors: renderer.getErrors(),
    };
  },
  snapshot: () => ({
    level: activeLevel?.id,
    pose: { ...pose },
    fps: currentFps,
    resolution: renderer.getResolution(),
    stats: compiledScene?.stats,
    bake: renderer.getBakeState(),
    errors: renderer.getErrors(),
    isSoftware: renderer.isSoftware,
  }),
};
