// Graceful fallback when WebGL is unavailable: photographic flowers with the
// same transition choreography, driven by GSAP on DOM elements.
const gsap = window.gsap;

export class ImageStage {
  constructor(el, data) {
    this.el = el;
    this.current = 0;
    el.classList.add('is-fallback');
    this.items = data.map((d) => {
      const w = document.createElement('div');
      w.className = 'fb-flower';
      w.innerHTML = `<div class="fb-stem"></div><img src="assets/img/${d.id}-full.jpg" alt="${d.title.join('')} flower" decoding="async">`;
      el.appendChild(w);
      gsap.set(w, { autoAlpha: 0, xPercent: -50, yPercent: -50 });
      return w;
    });
  }

  intro() {
    return gsap.fromTo(this.items[0], { autoAlpha: 0, scale: 0.8 }, { autoAlpha: 1, scale: 1, duration: 1.8, ease: 'expo.out' });
  }

  transition(from, to, dir) {
    const A = this.items[from];
    const B = this.items[to];
    const tl = gsap.timeline();
    const travel = window.innerWidth * 0.27;
    tl.to(A, { x: -dir * travel, scale: 0.5, autoAlpha: 0, duration: 1.4, ease: 'power3.inOut' }, 0)
      .fromTo(B, { x: dir * travel, scale: 0.45, autoAlpha: 0 }, { x: 0, scale: 1, autoAlpha: 1, duration: 1.8, ease: 'expo.out' }, 0.45);
    this.current = to;
    return tl;
  }

  setPointer(nx, ny) {
    gsap.to(this.items[this.current], { rotationY: nx * 10, rotationX: -ny * 6, duration: 1, ease: 'power2.out', overwrite: 'auto' });
  }
  dragBy() {}
  release() {}
  isOverFlower() { return false; }
  pause() {}
}
