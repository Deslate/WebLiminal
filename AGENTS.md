# Content guide

Read `BRIEF.md` first. This is one Poolrooms scene, not a level platform. No UI framework, remote assets, telemetry, accounts, menus or start button. Preserve the immediate image, audio, and deterministic event. Do not configure or push a Git remote.

## Run and validate

- `npm ci`, then `npm run dev` (localhost:4173).
- `npm run build` validates content and produces portable static `dist/` with relative URLs.
- `npm test` checks swept movement and world boundaries.
- `npm run verify` runs a headed Chrome acceptance pass on the local Apple GPU; it takes about one minute and writes evidence into `docs/verification/`. Chrome must be installed. Do not run another browser benchmark concurrently.
- `HEADLESS=1 VERIFY_MODE=smoke npm run verify` is a short compatibility check, not a replacement for the headed performance test.

## Add content later

- `levels/*.json`: pure data only. The active level is explicitly imported by `src/main.js`; there is intentionally no loader/registry yet. Keep geometry inside bounds and spawn away from walls.
- `materials/`: tile slots export `createMaterial({ time, disturbance, waterHeight, color }) -> THREE.Material`. Time and disturbance are shared `{ value: number }` uniforms. `water.js` has the specialized reflection adapter. Do not fetch textures from the network.
- `scripts/validate-content.mjs`: CI entry point. Extend its checks when extending the JSON schema. No CI provider configured in v0.
- Keep physical solid bounds synchronized with visible geometry in `src/world.js`. Player height stays above the fixed floor; movement uses swept substeps in `src/collision.js`.
- The event starts at 34.6 seconds of visible scene time (32 seconds after the 2.6-second opening). It must work without sound and must not depend on randomness or a user gesture.
- A new browser may block Web Audio until input. Never disguise this as successful autoplay or bypass the policy. Defer sources until the context is running; avoid console warnings.

## Visual changes

Inspect an actual screenshot, not only code. After changing the initial scene, run `node scripts/generate-poster.mjs` against the dev server to refresh the first-paint image. Keep the canvas hidden until its first completed frame. Check the opening, the muted event, movement/collision, and the production build. No visible FPS/debug panels. Total deployed assets must remain below 20 MB.
