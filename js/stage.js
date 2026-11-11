// Three.js stage: renderer, lighting, layout and cinematic flower transitions.
import * as THREE from 'three';
import { Flower } from './flowers.js';

const gsap = window.gsap;
const lerp = (a, b, t) => a + (b - a) * t;

export function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) {
    return false;
  }
}

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Stage {
  constructor(el, data) {
    this.el = el;
    this.data = data;
    this.current = 0;
    this.pointer = { x: 0, y: 0 };
    this.drag = { x: 0, y: 0 };
    this.rot = { x: 0, y: 0 };
    this.cam = { x: 0, y: 0 };
    this.paused = false;

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.setClearColor(0x000000, 0);
    el.appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    this.camera.position.set(0, 0, 9);

    // No PMREM environment: it cost ~0.6s on weak GPUs. Soft sky/ground light +
    // a gentle front fill give the same studio look much faster.

    // Lighting: soft cinematic key, coloured rims from behind.
    const L = data[0].light;
    this.key = new THREE.DirectionalLight(L.key, 2.6);
    this.key.position.set(-3, 4.5, 6);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1536, 1536);
    Object.assign(this.key.shadow.camera, { left: -2.4, right: 2.4, top: 2.4, bottom: -2.4, near: 1, far: 20 });
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.03;
    this.key.shadow.radius = 4;
    this.fill = new THREE.DirectionalLight(L.fill, 0.9);
    this.fill.position.set(4, -1.5, 3);
    this.rim = new THREE.DirectionalLight(L.rim, 3.2);
    this.rim.position.set(2.5, 3, -5);
    this.hemi = new THREE.HemisphereLight('#ffffff', '#1a1a1a', 0.9);
    this.front = new THREE.DirectionalLight('#ffffff', 0.8);
    this.front.position.set(0.5, 0.5, 8);
    this.scene.add(this.key, this.fill, this.rim, this.hemi, this.front);

    this.world = new THREE.Group();
    this.scene.add(this.world);

    this.flowers = data.map((d) => new Flower(d.id));
    this.flowers.forEach((f) => this.world.add(f.root));

    this.buildDust(data[0].accent);

    this.clock = new THREE.Clock();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(el);
    this.resize();

    r.setAnimationLoop(() => this.tick());
  }

  // Compile every shader up front (in parallel where supported) so the
  // intro and the first transitions never hitch. Resolves when ready.
  async warmup() {
    this.flowers.forEach((f) => { f.root.visible = true; });
    try {
      if (this.renderer.compileAsync) {
        await Promise.race([
          this.renderer.compileAsync(this.scene, this.camera),
          new Promise((res) => setTimeout(res, 4000)),
        ]);
      } else this.renderer.compile(this.scene, this.camera);
    } catch (e) {
      this.renderer.compile(this.scene, this.camera);
    }
    this.flowers.forEach((f) => f.setFade(0));
  }

  buildDust(color) {
    const N = 140;
    const pos = new Float32Array(N * 3);
    this.dustSpeed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 12;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 8;
      pos[i * 3 + 2] = -4 + Math.random() * 6;
      this.dustSpeed[i] = 0.04 + Math.random() * 0.12;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dustMat = new THREE.PointsMaterial({
      size: 0.035, map: dotTexture(), color, transparent: true, opacity: 0.55,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    });
    this.dust = new THREE.Points(geo, this.dustMat);
    this.scene.add(this.dust);
  }

  resize() {
    const w = this.el.clientWidth || 1;
    const h = this.el.clientHeight || 1;
    this.w = w; this.h = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    const dist = this.camera.position.z;
    const vh = 2 * dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const vw = vh * this.camera.aspect;
    const desktop = window.innerWidth > 820;
    const diameter = desktop ? Math.min(vh * 0.6, vw * 0.4) : Math.min(vh * 0.72, vw * 0.84);
    this.scale = diameter / 2.7;
    this.vh = vh;
    this.diameter = diameter;
    this.world.scale.setScalar(this.scale);
    this.world.position.y = desktop ? vh * 0.07 : vh * 0.06;
    this.travel = (vw * (desktop ? 0.27 : 0.42)) / this.scale;
  }

  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    if (this.paused) return;

    const k = 1 - Math.pow(0.0025, dt); // frame-rate independent smoothing
    this.rot.y = lerp(this.rot.y, this.pointer.x * 0.32 + this.drag.y, k);
    this.rot.x = lerp(this.rot.x, -this.pointer.y * 0.18 + this.drag.x, k);
    this.cam.x = lerp(this.cam.x, this.pointer.x * 0.25, k * 0.6);
    this.cam.y = lerp(this.cam.y, this.pointer.y * 0.15, k * 0.6);
    this.camera.position.x = this.cam.x;
    this.camera.position.y = this.cam.y;
    this.camera.lookAt(0, 0, 0);

    this.flowers.forEach((f, i) => {
      if (!f.root.visible) return;
      f.update(dt, t);
      f.tilt.rotation.y = this.rot.y;
      f.tilt.rotation.x = this.rot.x;
      f.tilt.position.y = Math.sin(t * 0.8 + i * 2) * 0.05;
      f.tilt.rotation.z = Math.sin(t * 0.5 + i) * 0.02;
    });

    const p = this.dust.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let y = p.getY(i) + this.dustSpeed[i] * dt;
      if (y > 4) y = -4;
      p.setY(i, y);
      p.setX(i, p.getX(i) + Math.sin(t * 0.3 + i) * 0.0008);
    }
    p.needsUpdate = true;
    this.dust.rotation.y = this.cam.x * 0.1;

    this.renderer.render(this.scene, this.camera);
    this.adapt(dt);
  }

  // Adaptive resolution: drop pixel ratio on slow devices to keep motion fluid.
  adapt(dt) {
    this.perf = this.perf || { acc: 0, n: 0 };
    this.perf.acc += dt; this.perf.n++;
    if (this.perf.n < 45) return;
    const avg = this.perf.acc / this.perf.n;
    this.perf.acc = 0; this.perf.n = 0;
    const pr = this.renderer.getPixelRatio();
    if (avg > 1 / 40 && pr > 0.75) {
      this.renderer.setPixelRatio(Math.max(0.75, pr - 0.25));
      this.renderer.setSize(this.w, this.h, false);
      if (avg > 1 / 20) this.renderer.shadowMap.type = THREE.PCFShadowMap;
    }
  }

  /* ---------------- interaction ---------------- */
  setPointer(nx, ny) { this.pointer.x = nx; this.pointer.y = ny; }
  dragBy(dx, dy) {
    this.drag.y = THREE.MathUtils.clamp(this.drag.y + dx * 0.006, -1.1, 1.1);
    this.drag.x = THREE.MathUtils.clamp(this.drag.x + dy * 0.004, -0.6, 0.6);
  }
  release() {
    gsap.to(this.drag, { x: 0, y: 0, duration: 1.6, ease: 'elastic.out(1, 0.55)' });
  }
  isOverFlower(cx, cy) {
    const rect = this.el.getBoundingClientRect();
    const v = new THREE.Vector3(0, 0, 0).applyMatrix4(this.world.matrixWorld).project(this.camera);
    const sx = rect.left + (v.x * 0.5 + 0.5) * rect.width;
    const sy = rect.top + (-v.y * 0.5 + 0.5) * rect.height;
    const radius = (this.diameter / 2 / this.vh) * rect.height;
    return Math.hypot(cx - sx, cy - sy) < radius * 1.05;
  }

  /* ---------------- colour / lighting ---------------- */
  lightTo(i, tl, at = 0, dur = 1.6) {
    const L = this.data[i].light;
    const acc = this.data[i].accent;
    const pairs = [[this.key.color, L.key], [this.fill.color, L.fill], [this.rim.color, L.rim], [this.dustMat.color, acc]];
    pairs.forEach(([c, hex]) => {
      const to = new THREE.Color(hex);
      tl.to(c, { r: to.r, g: to.g, b: to.b, duration: dur, ease: 'power2.inOut' }, at);
    });
  }

  /* ---------------- animations ---------------- */
  intro() {
    const f = this.flowers[0];
    const tl = gsap.timeline();
    const s = { fade: 0, open: 0 };
    f.root.position.set(0, -0.4, -1.2);
    f.root.scale.setScalar(0.75);
    f.root.rotation.set(0, -0.6, 0);
    f.setOpen(0);
    tl.to(s, { fade: 1, duration: 1.4, ease: 'power2.out', onUpdate: () => f.setFade(s.fade) }, 0)
      .to(s, { open: 1, duration: 2.6, ease: 'power3.out', onUpdate: () => f.setOpen(s.open) }, 0.1)
      .to(f.root.position, { x: 0, y: 0, z: 0, duration: 2.4, ease: 'expo.out' }, 0)
      .to(f.root.scale, { x: 1, y: 1, z: 1, duration: 2.4, ease: 'expo.out' }, 0)
      .to(f.root.rotation, { y: 0, duration: 2.6, ease: 'power3.out' }, 0);
    return tl;
  }

  transition(from, to, dir) {
    const A = this.flowers[from];
    const B = this.flowers[to];
    const T = this.travel;
    const tl = gsap.timeline();
    const a = { fade: A.u.uFade.value, open: A.open };
    const b = { fade: 0, open: 0.12 };

    // outgoing: drifts out of focus, shrinks, folds and dims to black
    tl.to(A.root.position, { x: -dir * T, y: -0.45, z: -1.6, duration: 1.5, ease: 'power3.inOut' }, 0)
      .to(A.root.scale, { x: 0.5, y: 0.5, z: 0.5, duration: 1.5, ease: 'power3.inOut' }, 0)
      .to(A.root.rotation, { y: -dir * 0.75, duration: 1.5, ease: 'power2.inOut' }, 0)
      .to(a, { open: 0.55, duration: 1.3, ease: 'power2.in', onUpdate: () => A.setOpen(a.open) }, 0)
      .to(a, { fade: 0, duration: 1.15, ease: 'power2.in', onUpdate: () => A.setFade(a.fade) }, 0.25);

    // incoming: enters from the opposite side small and closed, then blooms
    B.root.position.set(dir * T, -0.35, -1.6);
    B.root.scale.setScalar(0.45);
    B.root.rotation.set(0, dir * 0.85, 0);
    B.setOpen(b.open);
    B.setFade(0);
    tl.to(B.root.position, { x: 0, y: 0, z: 0, duration: 1.8, ease: 'expo.out' }, 0.45)
      .to(B.root.scale, { x: 1, y: 1, z: 1, duration: 1.8, ease: 'expo.out' }, 0.45)
      .to(B.root.rotation, { y: 0, duration: 2.1, ease: 'power3.out' }, 0.45)
      .to(b, { fade: 1, duration: 1.1, ease: 'power2.out', onUpdate: () => B.setFade(b.fade) }, 0.45)
      .to(b, { open: 1, duration: 2.2, ease: 'power3.out', onUpdate: () => B.setOpen(b.open) }, 0.5);

    this.lightTo(to, tl, 0.2);
    this.current = to;
    return tl;
  }

  pause(v) { this.paused = v; }
}
