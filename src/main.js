import level from "../levels/poolrooms.json";
import { createRenderer } from "./render/renderer.js";
import { ROOM } from "./render/geometry.js";
import { movePlayer, canStand } from "./collision.js";
import { createSoundscape } from "./audio.js";
const canvas = document.createElement("canvas");
document.querySelector("#experience").appendChild(canvas);
const sound = createSoundscape(document.getElementById("audio-status"));
const view = { ...level.spawn };
const keys = new Set();
let dragging = false,
  elapsed = 0,
  previous = performance.now(),
  ready = false,
  frameMs = [],
  completed = 0,
  firstFrame = null,
  scale = Math.min(1,1280/innerWidth),
  paused = false,
  holdTime = false,
  targetSamples = 0;
const runId = crypto.randomUUID();
const renderer = await createRenderer(canvas).catch((e) => {
  document.getElementById("audio-status").textContent = e.message;
  console.error(e);
  throw e;
});
function resize() {
  renderer.resize(innerWidth, innerHeight, scale);
}
resize();
addEventListener("resize", resize);
addEventListener("keydown", (e) => {
  if (
    [
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "ShiftLeft",
    ].includes(e.code)
  ) {
    keys.add(e.code);
    e.preventDefault();
  }
  if (e.code === "KeyM" && !e.repeat) sound.toggle();
  else sound.unlock();
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => {
  keys.clear();
  dragging = false;
});
canvas.addEventListener("pointerdown", (e) => {
  dragging = true;
  canvas.setPointerCapture(e.pointerId);
  sound.unlock();
});
canvas.addEventListener("pointerup", () => (dragging = false));
canvas.addEventListener("pointercancel", () => (dragging = false));
canvas.addEventListener("pointermove", (e) => {
  if (dragging) {
    view.yaw -= e.movementX * 0.002;
    view.pitch = Math.max(
      -0.9,
      Math.min(0.9, view.pitch - e.movementY * 0.002),
    );
  }
});
addEventListener("visibilitychange", () => {
  previous = performance.now();
});
let lastCompleted = performance.now(),
  lastView = "",
  lastResize = 0,
  lastSimulation = performance.now();
function scheduleFrame(delay=0) { setTimeout(()=>tick(performance.now()),delay); }
async function tick(now) {
  const dt = Math.min((now - previous) / 1000, 0.05);
  previous = now;
  if (!holdTime && !document.hidden && !paused) elapsed += dt;
  if (
    paused ||
    document.hidden ||
    renderer.busy ||
    (targetSamples && renderer.samples >= targetSamples)
  ) { scheduleFrame(16);return; }
  const moveDt=Math.min((now-lastSimulation)/1000,.05);lastSimulation=now;
  let f =
    Number(keys.has("KeyW") || keys.has("ArrowUp")) -
    Number(keys.has("KeyS") || keys.has("ArrowDown"));
  let s =
    Number(keys.has("KeyD") || keys.has("ArrowRight")) -
    Number(keys.has("KeyA") || keys.has("ArrowLeft"));
  const norm = Math.hypot(f, s);
  const speed = keys.has("ShiftLeft") ? 2.4 : 1.6;
  if (norm) {
    f /= norm;
    s /= norm;
    movePlayer(
      view,
      (-Math.sin(view.yaw) * f + Math.cos(view.yaw) * s) * moveDt * speed,
      (-Math.cos(view.yaw) * f - Math.sin(view.yaw) * s) * moveDt * speed,
      ROOM,
      renderer.solids,
    );
  }
  const sig = [view.x, view.z, view.yaw, view.pitch].join(",");
  const moving = sig !== lastView;
  lastView = sig;
  let anomaly = 0;
  if (!holdTime && elapsed > 34.6 && elapsed < 43) {
    anomaly = Math.min(1, (elapsed - 34.6) / 1.4, (43 - elapsed) / 2.4);
  }
  sound.update(elapsed, norm > 0, anomaly);
  const did = await renderer.render(view, elapsed, moving, 1 - anomaly * 0.94);
  if (did) {
    const done = performance.now();
    if (ready) {
      frameMs.push({ t: elapsed, ms: done - lastCompleted });
      if (frameMs.length > 12000) frameMs.shift();
    }
    lastCompleted = done;
    completed++;
    if (!ready) {
      ready = true;
      firstFrame = done;
      canvas.style.visibility = "visible";
      document.getElementById("experience").style.visibility = "visible";
    }
    if (completed % 15 === 0)
      document.getElementById("timecode").textContent =
        `00:${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(Math.floor(elapsed) % 60).padStart(2, "0")}`;
    if (!holdTime && frameMs.length > 60 && done - lastResize > 4000) {
      const samples = frameMs
        .slice(-60)
        .map((f) => f.ms)
        .sort((a, b) => a - b);
      if (samples[30] > 34.5 && scale > 0.36) {
        scale = Math.max(0.36, scale - 0.07);
        resize();
        lastResize = done;
      }
    }
  }
  // Do not wait an extra refresh after a 17–25 ms GPU task. Submit the next
  // actual render when its predecessor is complete, capped at 60 submissions/s.
  scheduleFrame(Math.max(0,1000/60-(performance.now()-now)));
}
requestAnimationFrame(tick);
Object.defineProperty(window, "__POOLROOMS_V1__", {
  value: {
    snapshot: () => ({
      runId,
      view: { ...view },
      elapsed,
      firstFrameMs: firstFrame,
      completedFrames: completed,
      frames: frameMs.slice(),
      internal: renderer.resolution,
      samples: renderer.samples,
      config: renderer.config,
      staticExposure: renderer.autoStatic,
      lightingBatches: renderer.lightingBatches,
      cameraHistory: false,
      cameraSamplesPerPixel: 4,
      dynamics: renderer.dynamics,
      errors: renderer.errors,
      audio: sound.inspect(),
      validPosition: canStand(view.x, view.z, ROOM, renderer.solids),
    }),
    async configure(parameters) {
      paused = true;
      while (renderer.busy) await new Promise((r) => setTimeout(r, 5));
      if (parameters.view) Object.assign(view, parameters.view);
      if (parameters.scale) {
        scale = parameters.scale;
        resize();
      }
      targetSamples = parameters.targetSamples || 0;
      holdTime = parameters.freeze ?? holdTime;
      if (holdTime) elapsed = 12;
      renderer.configure(parameters);
      frameMs = [];
      paused = false;
    },
    // Capture the exact production renderer at consecutive specified times.
    // This pauses scheduling, NOT wave evolution: the supplied time advances it.
    async renderEvidence(time, pose, moving=true) {
      paused=true;
      while(renderer.busy)await new Promise(r=>setTimeout(r,1));
      Object.assign(view,pose);
      await renderer.render(view,time,moving,1);
      return {png:canvas.toDataURL('image/png'),dynamics:renderer.dynamics,view:{...view}};
    },
    // Evidence automation changes the actual camera, without rebuilding light.
    setView(patch) { Object.assign(view, patch); },
    audit: () => renderer.audit(),
  },
});
