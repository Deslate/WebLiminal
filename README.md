# Workroom

A real-time, physically based Backrooms renderer in the browser. The first level is Poolrooms: stateful GPU water, photon-traced caustics, diffuse light transport and procedural glazed tile, with no bitmap assets. WebGPU + vanilla JavaScript + Vite, no runtime dependencies.

The plan is multiple levels, endlessly generated maps and online exploration on top of this rendering base. See [AGENTS.md](AGENTS.md) for the vision, architecture and roadmap.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:4173/ in a desktop browser with WebGPU. WASD or arrow keys to walk, drag to look, Shift to walk fast, V for the overhead view, Tab to pause, M to mute, G for the light transport lab. Sound starts after the first user gesture. There is no WebGL fallback.

```sh
npm test
npm run build
npm run benchmark
```

Docs: [physical model and approximations](docs/PHYSICS.md), [light transport lab](docs/LIGHTING-LAB.md).

Licensed under Apache-2.0.
