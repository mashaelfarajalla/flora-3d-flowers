// Procedural, physically-shaded 3D flowers.
// Each flower is built from instanced, individually-shaped petals arranged with
// phyllotaxis (golden-angle) spirals. Petals carry per-instance base/tip colours
// and are shaded with a patched MeshStandardMaterial (faked sheen, veins, translucency).
import * as THREE from 'three';

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const D = Math.PI / 180;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const C = (hex) => new THREE.Color(hex);

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mixC(a, b, t) { return C(a).lerp(C(b), t); }
function vary(c, R, amt = 0.08) {
  const k = 1 + (R() - 0.5) * amt * 2;
  return new THREE.Color(c.r * k, c.g * k, c.b * k);
}

/* ------------------------------------------------------------------ */
/* Petal geometry: a bent, cupped, tapered strip.                      */
/* Local space: base at origin, petal grows along +Y, front faces +Z.  */
/* ------------------------------------------------------------------ */
function petalGeometry(o) {
  const {
    width = 0.3, baseW = 0.3, tipExp = 3, tipRound = 0.5,
    roll = 1.2, rollTip = 0.6, curl = 0.2, curlTip = 0.3,
    ridge = 0.015, segX = 6, segY = 12,
  } = o;
  const pos = [], uv = [], idx = [];
  let py = 0, pz = 0;
  const ds = 1 / segY;
  for (let j = 0; j <= segY; j++) {
    const v = j / segY;
    const phi = curl * v + curlTip * v * v;
    const ty = Math.cos(phi), tz = Math.sin(phi);
    const ny = -Math.sin(phi), nz = Math.cos(phi);
    const base = lerp(baseW, 1, smooth(0, 0.42, v));
    const tip = Math.pow(Math.max(0, 1 - Math.pow(v, tipExp)), tipRound);
    const hw = width * base * Math.max(tip, 0.0) * 0.5;
    const r = lerp(roll, rollTip, v);
    for (let i = 0; i <= segX; i++) {
      const u = (i / segX) * 2 - 1;
      let x, z;
      if (Math.abs(r) < 1e-3) { x = u * hw; z = 0; }
      else { const th = u * r; x = (Math.sin(th) / r) * hw; z = ((1 - Math.cos(th)) / r) * hw; }
      z -= ridge * (1 - Math.min(1, Math.abs(u) * 3)) * Math.sin(Math.PI * v);
      pos.push(x, py + ny * z, pz + nz * z);
      uv.push(i / segX, v);
    }
    py += ty * ds; pz += tz * ds;
  }
  for (let j = 0; j < segY; j++) {
    for (let i = 0; i < segX; i++) {
      const a = j * (segX + 1) + i, b = a + 1, c = a + segX + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function jitterGeo(p, R, amt = 0.12) {
  const q = { ...p };
  for (const k of ['roll', 'rollTip', 'curl', 'curlTip', 'width']) {
    if (typeof q[k] === 'number') q[k] *= 1 + (R() - 0.5) * amt * 2;
  }
  return q;
}

/* ------------------------------------------------------------------ */
/* Materials                                                          */
/* ------------------------------------------------------------------ */
function petalMaterial(u, o) {
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: o.roughness ?? 0.62,
    metalness: 0,
    side: THREE.DoubleSide,
    envMapIntensity: o.env ?? 0.55,
  });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, {
      uFade: u.uFade,
      uVein: { value: o.vein },
      uVeinFreq: { value: o.veinFreq },
      uGlow: { value: o.glow },
      uTipPow: { value: o.tipPow ?? 1 },
      uSheen: { value: new THREE.Color(o.sheen) },
    });
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec3 aBase; attribute vec3 aTip; attribute float aSeed;
varying vec3 vBase; varying vec3 vTip; varying vec2 vPUv; varying float vSeed;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
vBase = aBase; vTip = aTip; vPUv = uv; vSeed = aSeed;`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uFade; uniform float uVein; uniform float uVeinFreq; uniform float uGlow; uniform float uTipPow; uniform vec3 uSheen;
varying vec3 vBase; varying vec3 vTip; varying vec2 vPUv; varying float vSeed;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float pg = pow(smoothstep(0.0, 1.0, vPUv.y), uTipPow);
vec3 petalCol = mix(vBase, vTip, pg);
float pcx = abs(vPUv.x - 0.5) * 2.0;
float vw = sin(vPUv.x * uVeinFreq + vSeed * 6.2831 + sin(vPUv.y * 6.0 + vSeed * 9.0) * 0.8);
petalCol *= 1.0 - uVein * smoothstep(0.1, 1.0, vw) * (0.35 + 0.65 * vPUv.y);
petalCol *= 1.0 - 0.16 * (1.0 - smoothstep(0.0, 0.14, pcx)) * vPUv.y;
petalCol *= mix(0.12, 1.0, smoothstep(0.0, 0.55, vPUv.y));
diffuseColor.rgb *= petalCol;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float prim = 1.0 - abs(dot(normal, normalize(vViewPosition)));
totalEmissiveRadiance += petalCol * uGlow * (0.2 + pow(prim, 2.0)) * smoothstep(0.1, 0.95, vPUv.y);
totalEmissiveRadiance += uSheen * pow(prim, 3.0) * 0.12 * smoothstep(0.3, 1.0, vPUv.y);`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
gl_FragColor *= uFade;`);
  };
  return m;
}

function fadeMaterial(u, params) {
  const m = new THREE.MeshStandardMaterial(params);
  m.onBeforeCompile = (s) => {
    s.uniforms.uFade = u.uFade;
    s.fragmentShader = 'uniform float uFade;\n' + s.fragmentShader.replace(
      '#include <dithering_fragment>',
      '#include <dithering_fragment>\ngl_FragColor *= uFade;'
    );
  };
  return m;
}

/* ------------------------------------------------------------------ */
/* Flower configurations                                              */
/* ------------------------------------------------------------------ */
const CONFIGS = {
  dahlia: {
    seed: 11,
    scale: 1.0,
    headTilt: -0.16,
    material: { sheen: '#ffb3cc', vein: 0.08, veinFreq: 22, glow: 0.1, tipPow: 0.9, roughness: 0.58 },
    core: { radius: 0.2, color: '#5c0f2a' },
    stem: { color: '#7b6a2a', top: '#5d5a22' },
    layers: (() => {
      const TOTAL = 236;
      const place = (gi, R) => {
        const k = gi / (TOTAL - 1);
        return {
          az: gi * GOLDEN,
          r: 0.33 * Math.sqrt(k),
          z: 0.4 * (1 - Math.pow(k, 1.25)),
          tilt: lerp(80, -6, Math.pow(k, 0.8)) * D + (R() - 0.5) * 7 * D,
          s: lerp(0.3, 1.0, Math.pow(k, 0.65)) * (0.94 + R() * 0.12),
          twist: (R() - 0.5) * 0.22,
        };
      };
      const color = (gi, R) => {
        const k = gi / (TOTAL - 1);
        return [
          vary(mixC('#c7637f', '#2e0211', smooth(0, 0.8, k)), R),
          vary(mixC('#ffc9cf', '#a3123f', smooth(0.1, 0.9, k)), R, 0.06),
        ];
      };
      return [
        { offset: 0, count: 74, place, color, closedTilt: 88 * D,
          geo: { width: 0.52, baseW: 0.42, tipExp: 2.2, tipRound: 0.65, roll: 2.6, rollTip: 2.1, curl: 0.55, curlTip: 0.45 } },
        { offset: 74, count: 82, place, color, closedTilt: 86 * D,
          geo: { width: 0.48, baseW: 0.4, tipExp: 2.3, tipRound: 0.6, roll: 2.1, rollTip: 1.5, curl: 0.35, curlTip: 0.1 } },
        { offset: 156, count: 80, place, color, closedTilt: 84 * D,
          geo: { width: 0.46, baseW: 0.38, tipExp: 2.1, tipRound: 0.6, roll: 1.6, rollTip: 0.95, curl: 0.18, curlTip: -0.3 } },
      ];
    })(),
  },

  gerbera: {
    seed: 23,
    scale: 0.93,
    headTilt: -0.14,
    material: { sheen: '#c9b0ff', vein: 0.1, veinFreq: 26, glow: 0.12, tipPow: 0.8, roughness: 0.5 },
    disc: { radius: 0.27, height: 0.1 },
    stem: { color: '#8c9077', top: '#6f7a4c' },
    layers: [
      { count: 34, closedTilt: 86 * D,
        geo: { width: 0.165, baseW: 0.35, tipExp: 3.6, tipRound: 0.42, roll: 0.75, rollTip: 0.25, curl: 0.08, curlTip: -0.22, ridge: 0.012, segY: 20 },
        place: (i, R) => ({ az: (i / 34) * Math.PI * 2 + (R() - 0.5) * 0.06, r: 0.26, z: 0.015,
          tilt: (3 + R() * 8) * D, s: 1.1 + R() * 0.08, twist: (R() - 0.5) * 0.3 }),
        color: (i, R) => [vary(C('#2e0a6e'), R), vary(C('#8f5cf5'), R, 0.07)] },
      { count: 32, closedTilt: 86 * D,
        geo: { width: 0.15, baseW: 0.35, tipExp: 3.6, tipRound: 0.42, roll: 0.9, rollTip: 0.35, curl: 0.1, curlTip: -0.12, ridge: 0.012, segY: 20 },
        place: (i, R) => ({ az: ((i + 0.5) / 32) * Math.PI * 2 + (R() - 0.5) * 0.06, r: 0.25, z: 0.05,
          tilt: (13 + R() * 7) * D, s: 0.92 + R() * 0.06, twist: (R() - 0.5) * 0.3 }),
        color: (i, R) => [vary(C('#250857'), R), vary(C('#7444dc'), R, 0.07)] },
      { count: 46, closedTilt: 80 * D,
        geo: { width: 0.09, baseW: 0.5, tipExp: 3, tipRound: 0.4, roll: 1.0, rollTip: 0.5, curl: 0.2, curlTip: 0.1 },
        place: (i, R) => ({ az: (i / 46) * Math.PI * 2 + R() * 0.1, r: 0.255, z: 0.08,
          tilt: (40 + R() * 14) * D, s: 0.3 + R() * 0.06, twist: (R() - 0.5) * 0.4 }),
        color: (i, R) => [vary(C('#2a0b55'), R), vary(C('#6a3cc4'), R)] },
    ],
  },

  chrysanthemum: {
    seed: 37,
    scale: 0.9,
    headTilt: -0.2,
    material: { sheen: '#ffd690', vein: 0.1, veinFreq: 24, glow: 0.16, tipPow: 0.9 },
    core: { radius: 0.2, color: '#d98a00' },
    stem: { color: '#5f7a2c', top: '#4f6a22' },
    layers: [
      { count: 140, closedTilt: 88 * D,
        geo: { width: 0.3, baseW: 0.4, tipExp: 2.4, tipRound: 0.7, roll: 2.4, rollTip: 2.0, curl: 0.5, curlTip: 1.25 },
        place: (i, R) => { const k = i / 139; return {
          az: i * GOLDEN, r: 0.26 * Math.sqrt(k), z: 0.24 * (1 - k),
          tilt: lerp(82, 46, k) * D + (R() - 0.5) * 8 * D,
          s: lerp(0.32, 0.84, Math.pow(k, 0.6)) * (0.95 + R() * 0.1), twist: (R() - 0.5) * 0.3 }; },
        color: (i, R) => { const k = i / 139; return [
          vary(mixC('#ffcf2e', '#f08a00', k), R), vary(mixC('#fff3a0', '#ffc61a', smooth(0, 1, k)), R, 0.05)]; } },
      { count: 44, closedTilt: 86 * D,
        geo: { width: 0.22, baseW: 0.4, tipExp: 1.9, tipRound: 0.6, roll: 1.7, rollTip: 1.2, curl: 0.2, curlTip: 0.55 },
        place: (i, R) => ({ az: (140 + i) * GOLDEN, r: 0.27, z: 0.03,
          tilt: (22 + R() * 16) * D, s: 0.95 + R() * 0.15, twist: (R() - 0.5) * 0.35 }),
        color: (i, R) => [vary(C('#e2620c'), R), vary(R() > 0.5 ? C('#ffb42a') : C('#ff9a1f'), R)] },
      { count: 52, closedTilt: 84 * D,
        geo: { width: 0.17, baseW: 0.45, tipExp: 1.5, tipRound: 0.55, roll: 1.25, rollTip: 0.5, curl: -0.05, curlTip: -0.55 },
        place: (i, R) => ({ az: (184 + i) * GOLDEN, r: 0.27, z: -0.02,
          tilt: (-4 - R() * 36) * D, s: 1.12 + R() * 0.28, twist: (R() - 0.5) * 0.4 }),
        color: (i, R) => [vary(C('#7e2404'), R), vary(R() > 0.82 ? C('#ffb02e') : C('#f0701c'), R)] },
    ],
  },
};

const SEPALS = {
  count: 12, closedTilt: -40 * D, mat: 'green',
  geo: { width: 0.28, baseW: 0.5, tipExp: 1.4, tipRound: 0.6, roll: 0.8, rollTip: 0.3, curl: -0.2, curlTip: -0.2 },
  place: (i, R) => ({ az: (i / 12) * Math.PI * 2 + R() * 0.2, r: 0.12, z: -0.1,
    tilt: (-55 + R() * 12) * D, s: 0.42 + R() * 0.08, twist: 0 }),
  color: (i, R) => [vary(C('#2c4214'), R), vary(C('#6d8a34'), R)],
};

/* ------------------------------------------------------------------ */
/* Flower                                                              */
/* ------------------------------------------------------------------ */
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'ZXY');
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export class Flower {
  constructor(id) {
    const cfg = CONFIGS[id];
    this.id = id;
    this.cfg = cfg;
    this.u = { uFade: { value: 0 } };
    this.open = 1;

    this.root = new THREE.Group();   // position / scale (transitions)
    this.tilt = new THREE.Group();   // pointer rotation
    this.head = new THREE.Group();   // head orientation
    this.spin = new THREE.Group();   // slow idle spin
    this.root.add(this.tilt);
    this.tilt.add(this.head);
    this.head.add(this.spin);
    this.head.rotation.x = cfg.headTilt;
    this.head.position.y = 0;
    this.tilt.scale.setScalar(cfg.scale);

    this.mats = [];
    this.petalMat = petalMaterial(this.u, cfg.material);
    this.greenMat = petalMaterial(this.u, { sheen: '#a9c46a', vein: 0.12, veinFreq: 30, glow: 0.05, tipPow: 1 });
    this.mats.push(this.petalMat, this.greenMat);

    this.groups = [];
    const R = rng(cfg.seed);
    cfg.layers.forEach((L) => this.buildLayer(L, R));
    this.buildLayer(SEPALS, R, this.head);
    if (cfg.disc) this.buildDisc(cfg.disc, R);
    if (cfg.core) this.buildCore(cfg.core);
    this.buildStem(cfg.stem);
    this.setOpen(1);
    this.setFade(0);
  }

  buildLayer(L, R, parent = this.spin) {
    const variants = 3;
    const geos = Array.from({ length: variants }, () => petalGeometry(jitterGeo(L.geo, R)));
    const items = Array.from({ length: variants }, () => []);
    for (let i = 0; i < L.count; i++) {
      const gi = (L.offset ?? 0) + i;
      const p = L.place(L.offset !== undefined ? gi : i, R);
      const [base, tip] = L.color(L.offset !== undefined ? gi : i, R);
      items[i % variants].push({ ...p, base, tip, seed: R() });
    }
    const mat = L.mat === 'green' ? this.greenMat : this.petalMat;
    geos.forEach((geo, n) => {
      const list = items[n];
      if (!list.length) { geo.dispose(); return; }
      const aBase = new Float32Array(list.length * 3);
      const aTip = new Float32Array(list.length * 3);
      const aSeed = new Float32Array(list.length);
      list.forEach((it, j) => {
        aBase.set([it.base.r, it.base.g, it.base.b], j * 3);
        aTip.set([it.tip.r, it.tip.g, it.tip.b], j * 3);
        aSeed[j] = it.seed;
      });
      geo.setAttribute('aBase', new THREE.InstancedBufferAttribute(aBase, 3));
      geo.setAttribute('aTip', new THREE.InstancedBufferAttribute(aTip, 3));
      geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(aSeed, 1));
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      parent.add(mesh);
      this.groups.push({ mesh, items: list, L });
    });
  }

  buildDisc(d, R) {
    const N = 620;
    const geo = new THREE.SphereGeometry(1, 8, 6);
    const mat = fadeMaterial(this.u, { roughness: 0.85, metalness: 0, envMapIntensity: 0.4 });
    this.mats.push(mat);
    const mesh = new THREE.InstancedMesh(geo, mat, N);
    const col = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const k = i / (N - 1);
      const r = d.radius * Math.sqrt(k);
      const a = i * GOLDEN;
      const z = d.height * (1 - k * k) + 0.02;
      const sz = lerp(0.008, 0.02, k);
      _p.set(Math.cos(a) * r, Math.sin(a) * r, z);
      _e.set(-Math.sin(a) * k * 0.6, Math.cos(a) * k * 0.6, 0, 'XYZ');
      _q.setFromEuler(_e);
      _s.set(sz, sz, sz * 1.8);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      if (k < 0.3) col.set('#0d0412');
      else if (k < 0.8) col.set(R() < 0.33 ? '#ffc93a' : '#2a0a3d');
      else col.set(R() < 0.5 ? '#4a1784' : '#32105c');
      mesh.setColorAt(i, col);
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.spin.add(mesh);
    // base of the disc
    const base = new THREE.Mesh(
      new THREE.SphereGeometry(d.radius * 1.02, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      fadeMaterial(this.u, { color: '#0a0310', roughness: 0.95 })
    );
    this.mats.push(base.material);
    base.rotation.x = Math.PI / 2;
    base.scale.set(1, d.height / d.radius, 1);
    base.receiveShadow = true;
    this.spin.add(base);
  }

  buildCore(c) {
    const mat = fadeMaterial(this.u, { color: c.color, roughness: 0.8 });
    this.mats.push(mat);
    const m = new THREE.Mesh(new THREE.SphereGeometry(c.radius, 24, 16), mat);
    m.scale.set(1, 1, 1.4);
    m.position.z = 0.12;
    m.receiveShadow = true;
    this.spin.add(m);
  }

  buildStem(s) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.0, -0.12),
      new THREE.Vector3(0.0, -0.45, -0.3),
      new THREE.Vector3(0.04, -1.5, -0.3),
      new THREE.Vector3(-0.03, -2.8, -0.22),
      new THREE.Vector3(0.02, -4.8, -0.15),
    ]);
    const geo = new THREE.TubeGeometry(curve, 90, 0.052, 14, false);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const top = C(s.top), bot = C(s.color);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      tmp.copy(top).lerp(bot, smooth(-0.2, -1.6, y));
      const f = smooth(-3.6, -1.4, y);
      colors.set([tmp.r * f, tmp.g * f, tmp.b * f], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = fadeMaterial(this.u, { vertexColors: true, roughness: 0.5, metalness: 0, envMapIntensity: 0.5 });
    this.mats.push(mat);
    const stem = new THREE.Mesh(geo, mat);
    stem.receiveShadow = true;
    stem.castShadow = true;
    this.tilt.add(stem);

    // receptacle where the stem meets the head
    const recMat = fadeMaterial(this.u, { color: s.top, roughness: 0.6 });
    this.mats.push(recMat);
    const rec = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 16), recMat);
    rec.scale.set(1, 1, 0.75);
    rec.position.z = -0.1;
    this.head.add(rec);
  }

  /** 0 = closed bud, 1 = fully open bloom */
  setOpen(v) {
    this.open = v;
    for (const g of this.groups) {
      const { mesh, items, L } = g;
      const ct = L.closedTilt ?? 85 * D;
      for (let j = 0; j < items.length; j++) {
        const it = items[j];
        const tilt = lerp(ct, it.tilt, v);
        const sc = it.s * lerp(0.55, 1, v);
        const r = it.r * lerp(0.55, 1, v);
        _p.set(Math.cos(it.az) * r, Math.sin(it.az) * r, it.z);
        _e.set(tilt, it.twist, it.az - Math.PI / 2, 'ZXY');
        _q.setFromEuler(_e);
        _s.set(sc, sc, sc);
        _m.compose(_p, _q, _s);
        mesh.setMatrixAt(j, _m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  setFade(v) {
    this.u.uFade.value = v;
    this.root.visible = v > 0.002;
  }

  update(dt, t) {
    this.spin.rotation.z += dt * 0.05;
  }

  dispose() {
    this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.mats.forEach((m) => m.dispose());
  }
}
