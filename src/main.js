import {LAB_DEFAULTS,normalizeLab,readLab,saveLab} from "./lab-settings.js";
import {createLabMenu} from "./lab-menu.js";
let labPanel=null,labState={...LAB_DEFAULTS},labApplying=false,labPauseAfter=false;
import {createWakeTrail} from "./wake-trail.js";
const wakeTrail=createWakeTrail();
import { selectLevel } from "../levels/index.js";
import { loadWindow, regionIndex, worldPosition } from "./world.js";
import { createRenderer } from "./render/renderer.js";
import { movePlayer, canStand } from "./collision.js";
import { createSoundscape } from "./audio.js";
const canvas = document.createElement("canvas");
document.querySelector("#experience").appendChild(canvas);
const sound = createSoundscape(document.getElementById("audio-status"));
let level;
try {
  level = selectLevel(new URLSearchParams(location.search).get("level"));
} catch (e) {
  document.getElementById("audio-status").textContent = e.message;
  throw e;
}
const bookmarks = level.world?.bookmarks ?? [{ name: level.id, address: { x: 0, z: 0 } }];
let activeRegion = 0, regionChanging = false;
let windowLevel = loadWindow(level, bookmarks[0].address);
const view = { ...windowLevel.spawn };
let observer=null,bodyEnabled=true;
function cameraPose(){return observer||view;}
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
let renderer = await createRenderer(canvas, windowLevel).catch((e) => {
  document.getElementById("audio-status").textContent = e.message;
  console.error(e);
  throw e;
});
let ROOM = renderer.bounds;
let resizePending = false;
function resize() {
  if (paused) { resizePending = true; return; }
  resizePending = false;
  renderer.resize(innerWidth, innerHeight, scale);
}
resize();
addEventListener("resize", resize);
addEventListener("keydown", (e) => {
  if (e.target.closest?.('input, select, textarea, [contenteditable="true"]')) return;
  const destination = regionIndex(e.code, activeRegion, bookmarks.length);
  if (destination !== null && !labPanel?.isOpen) {
    e.preventDefault();
    if (!e.repeat && !regionChanging) teleport(destination).catch(console.error);
    return;
  }
  if (regionChanging) return;
  if(e.code==="KeyG"){e.preventDefault();if(!e.repeat){keys.clear();dragging=false;labPanel?.toggle();labPanel?.update({paused,frames:frameMs,internal:renderer.resolution});}return;}
  if(e.code==="Escape"&&labPanel?.isOpen){e.preventDefault();labPanel.close();return;}
  if (e.code === "Tab") {
    e.preventDefault();
    if (!e.repeat) {if(labApplying)labPauseAfter=!labPauseAfter;else setPaused(!paused);}
    return;
  }
  if (paused || labPanel?.isOpen) return;
  if (
    [
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "ArrowUp",
      "ArrowDown",
      "ShiftLeft",
    ].includes(e.code)
  ) {
    keys.add(e.code);
    e.preventDefault();
  }
  if(e.code==="KeyV"&&!e.repeat){
    if(observer)observer=null;
    else {
      const x=Math.max(ROOM.minX+.6,Math.min(ROOM.maxX-.6,view.x+(view.x>3?-2.8:2.8)));
      const z=Math.max(ROOM.minZ+.6,Math.min(ROOM.maxZ-.6,view.z+(view.z>5?-3.6:3.6)));
      observer={x,y:4.7,z,yaw:Math.atan2(x-view.x,z-view.z),pitch:Math.atan2(windowLevel.optics.waterLevel-4.7,Math.hypot(x-view.x,z-view.z))};
    }
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
  if (paused) return;
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
      -1.45,
      Math.min(0.9, view.pitch - e.movementY * 0.002),
    );
  }
});
addEventListener("visibilitychange", () => {
  resetClock();
  if (document.hidden) cancelFrame();
  else scheduleFrame();
});
let lastCompleted = performance.now(),
  lastView = "",
  lastResize = 0,
  lastSimulation = performance.now();
let frameTimer = null, tickRunning = false, resumeFrame = false;
function resetClock() {
  previous = lastSimulation = performance.now();
  lastCompleted = null;
  resumeFrame = true;
}
function cancelFrame() {
  if (frameTimer !== null) clearTimeout(frameTimer);
  frameTimer = null;
}
function setPaused(value) {
  if (paused === value) return;
  paused = value;
  keys.clear();
  dragging = false;
  sound.setPaused(value);
  document.body.classList.toggle("paused", value);
  labPanel?.update({paused,frames:frameMs,internal:renderer.resolution});
  if (value) cancelFrame();
  else { resetClock(); scheduleFrame(); }
}
function scheduleFrame(delay=0) {
  if (regionChanging || labApplying || paused || document.hidden || tickRunning || frameTimer !== null ||
      (targetSamples && renderer.samples >= targetSamples)) return;
  frameTimer = setTimeout(() => { frameTimer = null; tick(performance.now()); }, delay);
}
async function tick(now) {
  if (regionChanging || labApplying || paused || document.hidden || tickRunning) return;
  if (renderer.busy) { scheduleFrame(16); return; }
  tickRunning = true;
  try {
    const dt = resumeFrame ? 0 : Math.min((now - previous) / 1000, 0.05);
    const moveDt = resumeFrame ? 0 : Math.min((now-lastSimulation)/1000,.05);
    resumeFrame = false;
    previous = lastSimulation = now;
    if (!holdTime) elapsed += dt;
    if (resizePending) resize();
    let f =
      Number(keys.has("KeyW") || keys.has("ArrowUp")) -
      Number(keys.has("KeyS") || keys.has("ArrowDown"));
    let s =
      Number(keys.has("KeyD")) -
      Number(keys.has("KeyA"));
    const norm = Math.hypot(f, s);
    // Wading drag caps locomotion below this height-field model's critical wave speed.
    const immersed=renderer.config.waterLevel>view.y-1.62+.04;
    const speed = immersed ? (keys.has("ShiftLeft") ? 1.6 : .8) : (keys.has("ShiftLeft") ? 2.4 : 1.6);
    const beforeMove={x:view.x,z:view.z};
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
    const contact=wakeTrail.advance(beforeMove,view,elapsed,renderer.config.waterLevel);
    if(contact)renderer.addWake(contact);
    const sig = [view.x, view.z, view.yaw, view.pitch].join(",");
    const moving = sig !== lastView;
    lastView = sig;
    let anomaly = 0;
    if (!holdTime && elapsed > 34.6 && elapsed < 43) {
      anomaly = Math.min(1, (elapsed - 34.6) / 1.4, (43 - elapsed) / 2.4);
    }
    sound.update(elapsed, norm > 0, anomaly);
    renderer.setBody(bodyEnabled?view:null);
    const did = await renderer.render(cameraPose(), elapsed, moving, 1 - anomaly * 0.94);
    if (did) {
      const done = performance.now();
      if (ready && lastCompleted !== null) {
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
      labPanel?.update({paused,frames:frameMs,internal:renderer.resolution});
      if (labState.resolution==="auto" && !paused && !holdTime && frameMs.length > 12 && done - lastResize > 300) {
        const samples = frameMs
          .slice(-12)
          .map((f) => f.ms)
          .sort((a, b) => a - b);
        if (samples[6] > 31.5 && scale > 0.36) {
          scale = Math.max(0.36, scale * Math.min(.93, Math.sqrt(28.5 / samples[6])));
          resize();
          lastResize = done;
        } else if(samples[6] < 28 && done-lastResize>1200 && scale < Math.min(1,1280/innerWidth)) {
          // Recover detail after leaving a costly inspection view. Hysteresis
          // avoids chasing individual frame spikes or oscillating every frame.
          scale=Math.min(Math.min(1,1280/innerWidth),scale+.025);
          resize();lastResize=done;
        }
      }
    }
  } finally { tickRunning = false; }
  // Do not wait an extra refresh after a 17–25 ms GPU task. Submit the next
  // actual render when its predecessor is complete, capped at 60 submissions/s.
  scheduleFrame(Math.max(0,1000/60-(performance.now()-now)));
}
async function applyLab(value,persist=true){
  if (regionChanging) throw Error('A region is loading');
  const next=normalizeLab(value);
  if(JSON.stringify(next)!==JSON.stringify(labState)){
    if(labApplying)throw Error("A settings change is already in progress");
    labApplying=true;labPauseAfter=paused;setPaused(true);
    try{
      while(renderer.busy||tickRunning)await new Promise(r=>setTimeout(r,5));
      await renderer.setLab(next);labState=next;
      scale=next.resolution==="auto"?Math.min(1,1280/innerWidth):next.resolution;
      renderer.resize(innerWidth,innerHeight,scale);resizePending=false;
      elapsed=0;wakeTrail.reset();frameMs=[];lastCompleted=null;resetClock();
      // Explicit edits refresh one paused frame; Tab during rebuild records intent.
      renderer.setBody(bodyEnabled?view:null);await renderer.render(cameraPose(),elapsed,false,1);
    }finally{labApplying=false;if(!labPauseAfter)setPaused(false);}
  }
  labPanel?.sync();return persist?saveLab(localStorage,labState):true;
}
async function teleport(index) {
  if (!Number.isInteger(index) || !bookmarks[index]) throw Error('Unknown location');
  if (regionChanging || labApplying) throw Error('A region or settings change is in progress');
  if (index === activeRegion) return;
  const next = loadWindow(level, bookmarks[index].address);
  const wasPaused = paused;
  regionChanging = true;
  setPaused(true);
  const status = document.getElementById('audio-status');
  status.textContent = `Loading ${bookmarks[index].name}...`;
  try {
    while (tickRunning || renderer.busy) await new Promise(r => setTimeout(r, 5));
    await renderer.destroy();
    // One resident window bounds GPU memory. Rebase the player to local metres.
    renderer = await createRenderer(canvas, next);
    await renderer.setLab(labState);
    windowLevel = next;
    activeRegion = index;
    ROOM = renderer.bounds;
    Object.assign(view, next.spawn);
    observer = null;
    elapsed = 0; targetSamples = 0; holdTime = false;
    wakeTrail.reset(); frameMs = []; lastView = ''; lastCompleted = null;
    renderer.resize(innerWidth, innerHeight, scale);
    resizePending = false;
    renderer.setBody(bodyEnabled ? view : null);
    await renderer.render(view, 0, false, 1);
    document.querySelector('.caption h1').textContent = bookmarks[index].name;
    document.querySelector('.caption .index').textContent = `POOLROOMS / LOCATION ${index + 1} OF ${bookmarks.length}`;
    document.querySelector('.coordinates').textContent = `DEPTH ${next.optics.waterLevel.toFixed(2)} M / OCCUPANCY 01`;
    status.textContent = '';
  } catch (error) {
    status.textContent = `Location loading failed: ${error.message}. Reload to recover.`;
    throw error;
  } finally {
    regionChanging = false;
    if (renderer && activeRegion === index && !wasPaused) setPaused(false);
    resetClock();
  }
}
labPanel=createLabMenu({apply:applyLab,getState:()=>({...labState})});
await applyLab(readLab(localStorage),false);
scheduleFrame();
Object.defineProperty(window, "__POOLROOMS_V1__", {
  value: {
    snapshot: () => ({
      runId,
      level: level.id,
      region: activeRegion,
      regionChanging,
      address: { ...windowLevel.address },
      worldView: worldPosition(windowLevel.address, view, windowLevel.orientation),
      paused,
      frameScheduled: frameTimer !== null,
      rendering: tickRunning || renderer.busy,
      view: { ...view },
      observer,
      elapsed,
      firstFrameMs: firstFrame,
      completedFrames: completed,
      frames: frameMs.slice(),
      internal: renderer.resolution,
      samples: renderer.samples,
      config: renderer.config,
      lab: {...labState},
      labMenuOpen:labPanel.isOpen,
      labApplying,
      staticExposure: renderer.autoStatic,
      lightingBatches: renderer.lightingBatches,
      cameraHistory: false,
      cameraSamplesPerPixel: {opaque:2,water:4,edges:8},
      dynamics: renderer.dynamics,
      wakes:renderer.wakes,
      errors: renderer.errors,
      audio: sound.inspect(),
      validPosition: canStand(view.x, view.z, ROOM, renderer.solids),
    }),
    async configure(parameters) {
      if(parameters.lab)await applyLab(parameters.lab,false);
      setPaused(true);
      while (renderer.busy) await new Promise((r) => setTimeout(r, 5));
      if (parameters.view) Object.assign(view, parameters.view);
      if (parameters.scale) {
        scale = parameters.scale;
        renderer.resize(innerWidth, innerHeight, scale);
        resizePending = false;
      }
      targetSamples = parameters.targetSamples || 0;
      holdTime = parameters.freeze ?? holdTime;
      if (holdTime) elapsed = 12;
      wakeTrail.reset();
      renderer.configure(parameters);
      bodyEnabled=parameters.body!==false;renderer.setBody(bodyEnabled?view:null);
      frameMs = [];
      lastCompleted = null;
      setPaused(parameters.pause ?? false);
    },
    // Capture the exact production renderer at consecutive specified times.
    // This pauses scheduling, NOT wave evolution: the supplied time advances it.
    async renderEvidence(time, pose, moving=true, capture=true) {
      setPaused(true);
      while(renderer.busy)await new Promise(r=>setTimeout(r,1));
      Object.assign(view,pose);
      await renderer.render(view,time,moving,1);
      return {png:capture?canvas.toDataURL('image/png'):null,dynamics:renderer.dynamics,view:{...view}};
    },
    // Diagnostic replay injects physical sources, never a rendered ring.
    injectWaveSource(source) { renderer.addWake(source); },
    async pause() { setPaused(true);while(renderer.busy)await new Promise(r=>setTimeout(r,1)); },
    // Evidence automation changes the actual camera, without rebuilding light.
    setView(patch) { Object.assign(view, patch); },
    setObserver(pose){observer=pose?{...pose}:null;},
    async renderActorEvidence(time,actor,camera,capture=true){
      setPaused(true);while(renderer.busy)await new Promise(r=>setTimeout(r,1));
      const before={...view};Object.assign(view,actor);
      const contact=wakeTrail.advance(before,view,time,renderer.config.waterLevel);if(contact)renderer.addWake(contact);
      renderer.setBody(view);await renderer.render(camera,time,true,1);
      return {png:capture?canvas.toDataURL():null,view:{...view},dynamics:renderer.dynamics};
    },
    setLab: (value)=>applyLab(value,false),
    teleport,
    audit: (options) => renderer.audit(options),
  },
});
