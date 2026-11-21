// Linear finite-depth gravity-capillary spectral initial-value problem for wading body wakes,
// alternating collision-resolved footsteps, and ballistic kick-splash impacts.
// Ported from v1 body-waves.wgsl into the reusable v2 engine with a dynamic player-anchored domain.

struct BodyParams {
  clock: vec4f,          // x = time, y = dt, z = waterDepth, w = initializing (0 or 1)
  body: vec4f,           // x = bodyX, y = bodyZ, z = bodyAmp, w = 0
  motion: vec4f,         // x = vx, y = vz, z = impactCount, w = 0
  fft: vec4u,            // x = axis (0:X, 1:Z), y = stage (0..7), z = inverse (0/1), w = 0
  anchor: vec4f,         // x = minX, y = minZ, z = domainSize (24.0), w = dx (0.09375)
  contact: vec4f,        // x = footX, y = footZ, z = footTime, w = footStrength
  impacts: array<vec4f, 12>, // x, z, time, momentum
};

@group(0) @binding(0) var<uniform> P: BodyParams;
@group(0) @binding(1) var<storage, read> input: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> output: array<vec4f>;

const NX: u32 = 256u;
const NZ: u32 = 256u;
const N: u32 = 65536u;
const TAU: f32 = 6.28318530718;

fn cmul(a: vec2f, b: vec2f) -> vec2f {
  return vec2f(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

fn bitReverse8(v: u32) -> u32 {
  return reverseBits(v) >> 24u;
}

@compute @workgroup_size(128)
fn fft(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= N) { return; }
  let axis = P.fft.x;
  let stage = P.fft.y;
  let coordinate = select(i % NX, i / NX, axis == 1u);
  let half = 1u << stage;
  let width = half * 2u;
  let j = coordinate % half;
  let base = (coordinate / width) * width;
  var a = base + j;
  var b = a + half;
  if (stage == 0u) {
    a = bitReverse8(a);
    b = bitReverse8(b);
  }
  let ia = select((i / NX) * NX + a, a * NX + (i % NX), axis == 1u);
  let ib = select((i / NX) * NX + b, b * NX + (i % NX), axis == 1u);
  let angle = select(-1.0, 1.0, P.fft.z == 1u) * TAU * f32(j) / f32(width);
  let twiddle = vec2f(cos(angle), sin(angle));
  let av = input[ia];
  let bv = input[ib];
  let rotated = vec4f(cmul(bv.xy, twiddle), cmul(bv.zw, twiddle));
  var value = av + select(1.0, -1.0, (coordinate % width) >= half) * rotated;
  if (P.fft.z == 1u && stage == 7u) {
    value /= f32(NX);
  }
  output[i] = value;
}

@compute @workgroup_size(128)
fn evolve(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= N) { return; }
  let ix = i % NX;
  let iz = i / NX;
  // Zero Nyquist & DC modes to keep spatial field strictly real and volume-conserving.
  if (ix == 128u || iz == 128u) {
    output[i] = vec4f(0.0);
    return;
  }
  let dom = P.anchor.z;
  let dx = P.anchor.w;
  let invCellArea = 1.0 / (dx * dx);
  let kx = f32(select(i32(ix), i32(ix) - 256, ix > 128u)) / dom;
  let kz = f32(select(i32(iz), i32(iz) - 256, iz > 128u)) / dom;
  let k = TAU * vec2f(kx, kz);
  let km = length(k);
  if (km < 1e-5) {
    output[i] = vec4f(0.0);
    return;
  }

  let depth = max(0.05, P.clock.z);
  let omega = sqrt((9.81 * km + 0.000073 * km * km * km) * tanh(km * depth));
  var h = input[i].xy;
  var v = input[i].zw;

  let totalDt = P.clock.y;
  let substeps = max(1u, u32(ceil(totalDt * 240.0)));
  let dt = totalDt / f32(substeps);
  let speed = length(P.motion.xy);
  let direction = P.motion.xy / max(speed, 1e-4);

  // Soft excluded-volume body equilibrium + fore/aft dynamic pressure dipole + bow head.
  // Diverging Kelvin V-arms emerge purely from the dispersive initial-value dynamics.
  let radius = 0.18;
  let gaussian = TAU * radius * radius * invCellArea * exp(-0.5 * radius * radius * km * km);
  let dipole = dot(k, direction) * 0.22;
  let amplitude = P.body.z;
  let dynGaussian = TAU * 0.16 * 0.16 * invCellArea * exp(-0.5 * 0.16 * 0.16 * km * km);

  let bowRadius = 0.22 + depth;
  let bowGaussian = TAU * bowRadius * bowRadius * invCellArea * exp(-0.5 * bowRadius * bowRadius * km * km);
  let bowHead = (speed * speed / (2.0 * 9.81)) * 3.6 * (1.0 - smoothstep(1.05, 1.65, speed));
  let bowPressure = bowGaussian * 1.64872127 * bowHead * dot(k, direction) * bowRadius * select(0.0, 1.0, amplitude > 0.0);

  let footRadius = 0.135;
  let footprint = TAU * footRadius * footRadius * invCellArea * exp(-0.5 * footRadius * footRadius * km * km);
  let footLocal = P.contact.xy - P.anchor.xy;
  let footPhase = -dot(k, footLocal);
  let footPressure = vec2f(cos(footPhase), sin(footPhase)) * footprint * P.contact.w;

  for (var j = 0u; j < substeps; j++) {
    let subOffset = totalDt - (f32(j) + 0.5) * dt;
    let bodyLocal = P.body.xy + P.motion.xy * 0.22 - P.motion.xy * subOffset - P.anchor.xy;
    let phase = -dot(k, bodyLocal);
    let phaseRot = vec2f(cos(phase), sin(phase));
    let pressure = vec2f(
      gaussian * amplitude * 0.34,
      -dynGaussian * amplitude * 0.30 * speed * speed * dipole - bowPressure,
    );
    var equilibrium = cmul(phaseRot, pressure);

    // Alternating planted-foot pressure pulse (0.14 s smooth bell).
    let age = P.clock.x - subOffset - P.contact.z;
    if (age >= 0.0 && age < 0.14 && P.contact.w > 0.0) {
      let a = age / 0.14;
      let pulse = 16.0 * a * a * (1.0 - a) * (1.0 - a);
      equilibrium += footPressure * pulse;
    }

    if (P.clock.w > 0.5) {
      h = equilibrium;
      v = vec2f(0.0);
    }
    let c = cos(omega * dt);
    let s = sin(omega * dt);
    let nh = h * c + v * (s / omega) + equilibrium * (1.0 - c);
    v = v * c - h * (omega * s) + equilibrium * (omega * s);
    h = nh;
  }

  // Ballistic kick-splash & impulse impacts excite radial dispersive capillary-gravity rings.
  let impactCount = min(u32(P.motion.z + 0.5), 12u);
  let resolved = 1.0 - smoothstep(22.0, 30.0, km);
  for (var n = 0u; n < impactCount; n++) {
    let hit = P.impacts[n];
    let hitRadius = 0.08;
    let hitLocal = hit.xy - P.anchor.xy;
    let phase = -dot(k, hitLocal);
    let dv = -hit.w * resolved * invCellArea * km * tanh(km * depth) * exp(-0.5 * hitRadius * hitRadius * km * km) * vec2f(cos(phase), sin(phase));
    let age = max(0.0, P.clock.x - hit.z);
    h += dv * (sin(omega * age) / omega);
    v += dv * cos(omega * age);
  }

  // Physical viscous modal dissipation.
  let attenuation = exp(-totalDt * (0.035 + 0.00065 * km * km));
  output[i] = vec4f(h, v) * attenuation;
}

@compute @workgroup_size(128)
fn absorb(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= N) { return; }
  let ix = i % NX;
  let iz = i / NX;
  let halfDom = P.anchor.z * 0.5;
  let relX = abs(f32(ix) * P.anchor.w - halfDom);
  let relZ = abs(f32(iz) * P.anchor.w - halfDom);
  let edge = max(relX, relZ);
  // Generous 3.5 m exterior sponge prevents wakes from wrapping across the periodic FFT boundary.
  let s = smoothstep(halfDom - 3.6, halfDom - 0.15, edge);
  let damping = exp(-P.clock.y * 9.0 * s * s);
  output[i] = input[i] * damping;
}
