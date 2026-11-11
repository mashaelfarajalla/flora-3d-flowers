import { FLOWERS } from './data.js';
import { ImageStage } from './fallback.js';

const gsap = window.gsap;
const { ScrollTrigger, Observer } = window;
gsap.registerPlugin(ScrollTrigger, Observer);

const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const pad = (n) => String(n).padStart(2, '0');
const N = FLOWERS.length;
const img = (id, kind) => `assets/img/${id}-${kind}.jpg`;
const isDesktop = () => window.innerWidth > 820;
const finePointer = window.matchMedia('(pointer: fine)').matches;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let index = 0;
let busy = false;
let stage;
let openOverlay = null;

/* ================================================================ */
/* Stage (WebGL with graceful fallback)                              */
/* ================================================================ */
async function createStage() {
  const el = $('#stage');
  try {
    const { Stage, hasWebGL } = await import('./stage.js');
    if (!hasWebGL()) throw new Error('WebGL unavailable');
    const st = new Stage(el, FLOWERS);
    await st.warmup();
    return st;
  } catch (err) {
    console.info('[Flora] Using image fallback:', err.message);
    el.innerHTML = '';
    return new ImageStage(el, FLOWERS);
  }
}

/* ================================================================ */
/* DOM builders                                                      */
/* ================================================================ */
function buildTitle(lines) {
  const h = document.createElement('h1');
  h.className = 'info__title';
  h.setAttribute('aria-label', lines.join(''));
  lines.forEach((l) => {
    const line = document.createElement('span');
    line.className = 'tline';
    line.setAttribute('aria-hidden', 'true');
    [...l].forEach((ch) => {
      const s = document.createElement('span');
      s.className = 'tchar';
      s.textContent = ch;
      line.appendChild(s);
    });
    h.appendChild(line);
  });
  return h;
}

function thumbLayer(src) {
  const d = document.createElement('div');
  d.className = 'thumb__layer';
  d.innerHTML = `<img src="${src}" alt="" draggable="false" decoding="async">`;
  return d;
}

function fillLeft(d) {
  $('.js-family').textContent = d.family;
  $('.js-desc').textContent = d.desc;
  $('.js-meta').innerHTML = d.meta.slice(0, 2).map((m) => `<div><dt>${m.k}</dt><dd>${m.v}</dd></div>`).join('');
}
function fillRight(d) {
  $('.js-ptitle').textContent = d.panelTitle;
  $('.js-ptext').textContent = d.panelText;
  $('.js-quote').textContent = d.quote;
}

function buildDots() {
  const wrap = $('.js-dots');
  wrap.innerHTML = FLOWERS.map((f, i) =>
    `<button class="dot" type="button" role="tab" aria-label="${f.title.join('')}" data-i="${i}"></button>`).join('');
  $('.js-total').textContent = pad(N);
  wrap.addEventListener('click', (e) => {
    const b = e.target.closest('.dot');
    if (b) go(+b.dataset.i);
  });
}
function updateDots(i) {
  $$('.dot').forEach((d, j) => {
    d.classList.toggle('is-active', j === i);
    d.setAttribute('aria-selected', j === i);
  });
}

function renderInitial() {
  const d = FLOWERS[0];
  $('.info__title-wrap').appendChild(buildTitle(d.title));
  fillLeft(d);
  fillRight(d);
  $('.js-thumb-wide').appendChild(thumbLayer(img(d.id, 'wide')));
  $('.js-thumb-tall').appendChild(thumbLayer(img(FLOWERS[1].id, 'tall')));
  document.documentElement.style.setProperty('--accent', d.accent);
  updateDots(0);
}

/* ================================================================ */
/* Slide transition                                                  */
/* ================================================================ */
function swapThumb(tl, box, src, at, dir) {
  const old = box.querySelector('.thumb__layer:last-child');
  const layer = thumbLayer(src);
  box.appendChild(layer);
  const im = layer.querySelector('img');
  tl.fromTo(layer,
    { clipPath: dir > 0 ? 'inset(0% 0% 0% 100%)' : 'inset(0% 100% 0% 0%)' },
    { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.3, ease: 'expo.inOut' }, at)
    .fromTo(im, { scale: 1.35, xPercent: dir * 12 }, { scale: 1, xPercent: 0, duration: 1.7, ease: 'expo.out' }, at + 0.1);
  if (old) tl.to(old.querySelector('img'), { xPercent: -dir * 18, scale: 1.08, duration: 1.3, ease: 'expo.inOut' }, at);
  tl.call(() => $$('.thumb__layer', box).slice(0, -1).forEach((n) => n.remove()), null, at + 1.5);
}

function swapBlock(tl, els, fill, at) {
  tl.to(els, { y: -12, autoAlpha: 0, duration: 0.42, ease: 'power2.in', stagger: 0.04 }, at)
    .call(fill, null, at + 0.5)
    .fromTo(els, { y: 16, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.95, ease: 'power3.out', stagger: 0.07 }, at + 0.52);
}

function go(to, dir) {
  to = ((to % N) + N) % N;
  if (busy || to === index) return;
  if (dir === undefined) dir = to > index ? 1 : -1;
  busy = true;
  const from = index;
  index = to;
  const d = FLOWERS[to];
  const tl = gsap.timeline({ onComplete: () => { busy = false; } });

  tl.add(stage.transition(from, to, dir), 0);
  tl.to(document.documentElement, { '--accent': d.accent, duration: 1.4, ease: 'power2.inOut' }, 0.2);

  // Title: old letters drift out, new letters glide in
  const wrap = $('.info__title-wrap');
  const oldT = wrap.querySelector('.info__title');
  const h0 = wrap.offsetHeight;
  const newT = buildTitle(d.title);
  wrap.appendChild(newT);
  gsap.set(oldT, { position: 'absolute', top: 0, left: 0 });
  const h1 = newT.offsetHeight;
  const order = dir > 0 ? 'start' : 'end';
  tl.fromTo(wrap, { height: h0 }, { height: h1, duration: 1.1, ease: 'power3.inOut', clearProps: 'height' }, 0.25)
    .to($$('.tchar', oldT), { x: -dir * 46, autoAlpha: 0, duration: 0.75, ease: 'power2.in', stagger: { each: 0.03, from: order } }, 0)
    .from($$('.tchar', newT), { x: dir * 80, autoAlpha: 0, duration: 1.3, ease: 'expo.out', stagger: { each: 0.045, from: order } }, 0.5)
    .call(() => oldT.remove(), null, 1.0);

  swapBlock(tl, [$('.info__label'), $('.js-desc'), $('.js-meta')], () => fillLeft(d), 0.05);
  swapBlock(tl, [$('.js-ptitle'), $('.js-ptext'), $('.panel__quote')], () => fillRight(d), 0.15);
  swapThumb(tl, $('.js-thumb-wide'), img(d.id, 'wide'), 0.1, dir);
  swapThumb(tl, $('.js-thumb-tall'), img(FLOWERS[(to + 1) % N].id, 'tall'), 0.22, dir);

  const cur = $('.js-cur');
  tl.to(cur, { yPercent: -dir * 60, autoAlpha: 0, duration: 0.3, ease: 'power2.in' }, 0)
    .call(() => { cur.textContent = pad(to + 1); }, null, 0.3)
    .fromTo(cur, { yPercent: dir * 60, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.6, ease: 'power3.out' }, 0.32);
  updateDots(to);

  if (reduceMotion) tl.timeScale(1.8);
}
const next = () => go(index + 1, 1);
const prev = () => go(index - 1, -1);

/* ================================================================ */
/* Overlays (detail / about / blog)                                  */
/* ================================================================ */
function fillDetail(i) {
  const d = FLOWERS[i];
  const name = d.title.join('');
  $('.js-d-hero').src = img(d.id, 'full');
  $('.js-d-hero').alt = `${name} in full bloom`;
  $('.js-d-macro').src = img(d.id, 'macro');
  $('.js-d-macro').alt = `${name} petal macro`;
  $('.js-d-wide').src = img(d.id, 'wide');
  $('.js-d-wide').alt = `${name} close-up`;
  $('.js-d-family').textContent = d.family;
  $('.detail__title').textContent = name;
  $('.js-d-latin').textContent = d.latin;
  $('.js-d-long').textContent = d.details.long;
  $('.js-d-specs').innerHTML = [...d.meta.map((m) => [m.k, m.v]), ...d.details.specs]
    .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  $('.js-d-care').textContent = d.details.care;
  $('.js-d-count').textContent = `${pad(i + 1)} / ${pad(N)}`;
}

function setNav(name) {
  $$('.nav a').forEach((a) => a.classList.toggle('is-active', a.dataset.nav === name));
}

function open(id) {
  if (openOverlay === id) return;
  const prevOverlay = openOverlay;
  const el = $(`#${id}`);
  if (id === 'detail') fillDetail(index);
  openOverlay = id;
  el.setAttribute('aria-hidden', 'false');
  el.scrollTop = 0;
  setNav(id === 'detail' ? 'species' : id);
  const items = id === 'detail'
    ? [$('.detail__hero', el), ...$$('.detail__mini', el), ...$$('.detail__content > *', el)]
    : $$('.page__inner > *, .page__cols > div, .card', el);
  const tl = gsap.timeline();
  el.style.zIndex = 61;
  tl.set(el, { visibility: 'visible' })
    .fromTo(el, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.05, ease: 'expo.inOut' })
    .fromTo(items, { y: 40, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 1, ease: 'power3.out', stagger: 0.05 }, 0.55)
    .fromTo($('.overlay__close', el), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6 }, 0.7)
    .call(() => {
      if (prevOverlay) hideInstant(prevOverlay);
      el.style.zIndex = '';
      stage.pause(true);
      $('.overlay__close', el).focus({ preventScroll: true });
    });
  if (id === 'detail') tl.fromTo($('.js-d-hero'), { scale: 1.25 }, { scale: 1, duration: 2, ease: 'expo.out' }, 0.3);
}

function hideInstant(id) {
  const el = $(`#${id}`);
  gsap.set(el, { visibility: 'hidden', clipPath: 'inset(100% 0% 0% 0%)' });
  el.setAttribute('aria-hidden', 'true');
}

function close() {
  if (!openOverlay) return;
  const el = $(`#${openOverlay}`);
  openOverlay = null;
  setNav('species');
  stage.pause(false);
  gsap.timeline()
    .to(el, { clipPath: 'inset(0% 0% 100% 0%)', duration: 0.95, ease: 'expo.inOut' })
    .call(() => hideInstant(el.id));
  gsap.fromTo('.info, .panel', { y: 30 }, { y: 0, duration: 1.4, ease: 'expo.out', delay: 0.5 });
}

function detailStep(dir) {
  const target = (index + dir + N) % N;
  const content = $$('#detail .detail__content > *, #detail .detail__media > *');
  gsap.timeline()
    .to(content, { autoAlpha: 0, y: -14, duration: 0.35, ease: 'power2.in', stagger: 0.02 })
    .call(() => {
      stage.pause(false);
      go(target, dir);
      fillDetail(target);
    })
    .fromTo(content, { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.8, ease: 'power3.out', stagger: 0.04 })
    .fromTo($('.js-d-hero'), { scale: 1.2 }, { scale: 1, duration: 1.8, ease: 'expo.out' }, '<')
    .call(() => { if (openOverlay) stage.pause(true); }, null, '+=1.6');
}

/* ================================================================ */
/* Share                                                             */
/* ================================================================ */
function share(kind) {
  const url = encodeURIComponent(location.href.split('#')[0]);
  const text = encodeURIComponent(`${FLOWERS[index].title.join('')} — Flora, an interactive 3D flower showcase`);
  const links = {
    fb: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
    tw: `https://twitter.com/intent/tweet?url=${url}&text=${text}`,
  };
  if (links[kind]) window.open(links[kind], '_blank', 'noopener,width=620,height=560');
}

/* ================================================================ */
/* Custom cursor                                                     */
/* ================================================================ */
function initCursor() {
  if (!finePointer) return null;
  document.body.classList.add('has-cursor');
  const c = $('.cursor');
  const dot = $('.cursor-dot');
  const label = $('.cursor__label');
  const xTo = gsap.quickTo(c, 'x', { duration: 0.55, ease: 'power3' });
  const yTo = gsap.quickTo(c, 'y', { duration: 0.55, ease: 'power3' });
  const dxTo = gsap.quickTo(dot, 'x', { duration: 0.1 });
  const dyTo = gsap.quickTo(dot, 'y', { duration: 0.1 });
  let shown = false;
  const api = {
    dragging: false,
    move(x, y, target) {
      if (!shown) { gsap.to([c, dot], { opacity: 1, duration: 0.4 }); shown = true; }
      xTo(x); yTo(y); dxTo(x); dyTo(y);
      const link = target.closest('a, button, .card');
      const overFlower = !openOverlay && !link && !target.closest('.info, .panel, .header') && stage.isOverFlower(x, y);
      c.classList.toggle('is-link', !!link && !!link.dataset.cursor);
      c.classList.toggle('is-drag', overFlower && !api.dragging);
      c.classList.toggle('is-dragging', api.dragging);
      if (link && link.dataset.cursor) label.textContent = link.dataset.cursor === 'next' ? 'Next' : 'View';
      else label.textContent = 'Drag';
      gsap.to(dot, { scale: link ? 2.4 : 1, duration: 0.3, overwrite: 'auto' });
      return overFlower;
    },
  };
  document.addEventListener('mouseleave', () => { gsap.to([c, dot], { opacity: 0, duration: 0.3 }); shown = false; });
  return api;
}

/* ================================================================ */
/* Input                                                             */
/* ================================================================ */
function initInput(cursor) {
  let down = null;

  window.addEventListener('pointermove', (e) => {
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = (e.clientY / window.innerHeight) * 2 - 1;
    if (e.pointerType === 'mouse') stage.setPointer(nx, ny);
    if (cursor && e.pointerType === 'mouse') cursor.move(e.clientX, e.clientY, e.target);
    if (down && down.id === e.pointerId) {
      stage.dragBy(e.clientX - down.lx, e.clientY - down.ly);
      down.lx = e.clientX; down.ly = e.clientY;
    }
  }, { passive: true });

  window.addEventListener('pointerdown', (e) => {
    if (openOverlay || e.button > 0) return;
    if (e.target.closest('a, button, .info, .panel, .header')) return;
    const onStage = e.target.closest('#stage') || stage.isOverFlower(e.clientX, e.clientY);
    if (!onStage) return;
    down = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, t: performance.now() };
    if (cursor) { cursor.dragging = true; cursor.move(e.clientX, e.clientY, e.target); }
  });

  const end = (e) => {
    if (!down || down.id !== e.pointerId) return;
    const dx = e.clientX - down.x;
    const dt = performance.now() - down.t;
    down = null;
    stage.release();
    if (cursor) { cursor.dragging = false; cursor.move(e.clientX, e.clientY, e.target); }
    // a quick horizontal flick switches flower
    if (Math.abs(dx) > 70 && dt < 450) (dx < 0 ? next : prev)();
  };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);

  // Gyro-free mobile parallax: gently rotate with touch position.
  window.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (t) stage.setPointer((t.clientX / window.innerWidth) * 2 - 1, 0);
  }, { passive: true });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') return close();
    if (openOverlay === 'detail' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) return detailStep(e.key === 'ArrowRight' ? 1 : -1);
    if (openOverlay) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); next(); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); prev(); }
  });

  // Desktop: wheel / trackpad switches flowers (page itself doesn't scroll).
  Observer.create({
    target: window,
    type: 'wheel',
    tolerance: 30,
    onDown: () => { if (isDesktop() && !openOverlay) next(); },
    onUp: () => { if (isDesktop() && !openOverlay) prev(); },
  });

  // UI controls
  $('.js-detail').addEventListener('click', () => open('detail'));
  $('.js-thumb-wide').addEventListener('click', () => open('detail'));
  $('.js-thumb-tall').addEventListener('click', next);
  $('.js-d-prev').addEventListener('click', () => detailStep(-1));
  $('.js-d-next').addEventListener('click', () => detailStep(1));
  $$('[data-close]').forEach((b) => b.addEventListener('click', close));
  $$('[data-nav]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    const n = a.dataset.nav;
    if (n === 'species') close();
    else open(n);
  }));
  $$('[data-share]').forEach((a) => a.addEventListener('click', (e) => {
    if (a.dataset.share === 'ig') return;
    e.preventDefault();
    share(a.dataset.share);
  }));
  $$('[data-open-flower]').forEach((c) => c.addEventListener('click', () => {
    const i = +c.dataset.openFlower;
    hideInstant('blog');
    openOverlay = null;
    stage.pause(false);
    if (i !== index) go(i);
    gsap.delayedCall(i !== index ? 1.4 : 0.1, () => open('detail'));
  }));

  // Pause rendering while the tab is hidden.
  document.addEventListener('visibilitychange', () => stage.pause(document.hidden || !!openOverlay));
}

/* ================================================================ */
/* Scroll-driven parallax (mobile / stacked layout)                  */
/* ================================================================ */
function initScroll() {
  const mm = gsap.matchMedia();
  mm.add('(max-width: 820px)', () => {
    gsap.to('#stage', {
      yPercent: 18, autoAlpha: 0.35, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: '60% top', scrub: true },
    });
    gsap.utils.toArray('.panel, .bottom').forEach((el) => {
      gsap.from(el, {
        y: 50, autoAlpha: 0, duration: 1.1, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      });
    });
  });
  mm.add('(min-width: 821px)', () => {
    // subtle parallax of side columns following the pointer
    const lx = gsap.quickTo('.info', 'x', { duration: 1.2, ease: 'power3' });
    const rx = gsap.quickTo('.panel', 'x', { duration: 1.2, ease: 'power3' });
    const onMove = (e) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      lx(nx * -8); rx(nx * -14);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  });
}

/* ================================================================ */
/* Preload + intro                                                   */
/* ================================================================ */
function preload(onProgress) {
  const srcs = FLOWERS.flatMap((f) => [img(f.id, 'wide'), img(f.id, 'tall')]);
  let done = 0;
  const total = srcs.length + 1;
  const tick = () => onProgress(++done / total);
  const imgs = srcs.map((s) => new Promise((res) => {
    const i = new Image();
    i.onload = i.onerror = () => { tick(); res(); };
    i.src = s;
  }));
  const fonts = (document.fonts ? document.fonts.ready : Promise.resolve()).then(tick);
  return Promise.all([...imgs, fonts]);
}

async function init() {
  buildDots();
  renderInitial();
  if (!finePointer) $('.hint span').textContent = 'Swipe to switch · Drag to explore';
  const cursor = initCursor();

  const ui = ['.header', '.info__label', '.js-desc', '.js-meta', '.panel__thumbs', '.js-ptitle', '.js-ptext', '.panel__quote', '.js-detail', '.bottom', '.hint'];
  gsap.set(ui, { autoAlpha: 0 });
  gsap.set('.tchar', { yPercent: 110, autoAlpha: 0 });

  const counter = $('.loader__count span');
  const bar = $('.loader__bar i');
  const prog = { v: 0 };
  gsap.from('.loader__logo span', { yPercent: 110, duration: 1, ease: 'expo.out', stagger: 0.06 });
  const progressTo = (p) => gsap.to(prog, {
    v: p, duration: 0.6, ease: 'power2.out', overwrite: true,
    onUpdate: () => { counter.textContent = Math.round(prog.v * 100); gsap.set(bar, { scaleX: prog.v }); },
  });

  const [st] = await Promise.all([
    createStage(),
    preload((p) => progressTo(p * 0.95)),
    new Promise((r) => setTimeout(r, 900)),
  ]);
  stage = st;
  initInput(cursor);
  initScroll();
  await new Promise((res) => progressTo(1).eventCallback('onComplete', res));

  const tl = gsap.timeline({ onComplete: () => document.body.classList.remove('is-loading') });
  tl.to('.loader__inner', { autoAlpha: 0, y: -20, duration: 0.6, ease: 'power2.in' })
    .to('.loader', { clipPath: 'inset(0% 0% 100% 0%)', duration: 1.1, ease: 'expo.inOut' }, 0.4)
    .set('.loader', { display: 'none' })
    .add(stage.intro(), 0.75)
    .to('.header', { autoAlpha: 1, duration: 1 }, 1.2)
    .to('.info__label', { autoAlpha: 1, duration: 0.8 }, 1.3)
    .to('.tchar', { yPercent: 0, autoAlpha: 1, duration: 1.3, ease: 'expo.out', stagger: 0.05 }, 1.35)
    .fromTo(['.js-desc', '.js-meta'], { y: 20 }, { y: 0, autoAlpha: 1, duration: 1.1, ease: 'power3.out', stagger: 0.1 }, 1.6)
    .fromTo('.panel__thumbs', { clipPath: 'inset(0% 0% 0% 100%)' }, { clipPath: 'inset(0% 0% 0% 0%)', autoAlpha: 1, duration: 1.4, ease: 'expo.inOut' }, 1.4)
    .fromTo(['.js-ptitle', '.js-ptext', '.panel__quote', '.js-detail'], { y: 20 }, { y: 0, autoAlpha: 1, duration: 1, ease: 'power3.out', stagger: 0.08 }, 1.8)
    .to(['.bottom', '.hint'], { autoAlpha: 1, duration: 1 }, 2.2)
    .call(() => ScrollTrigger.refresh());
}

init().catch((err) => {
  console.error('[Flora] init failed', err);
  gsap.to('.loader', { autoAlpha: 0, duration: 0.6 });
});
