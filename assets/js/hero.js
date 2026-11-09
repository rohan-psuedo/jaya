/* =========================================================
   JAYA — cinematic scroll hero
   Two frame sequences scrubbed on one canvas:
     1. Saree  — silk close-up, pull back, the saree falls
     2. Store  — revealed from the top down as the saree drops,
                 then a walk through the boutique doors
   ========================================================= */
(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- timeline (hero scroll progress 0 → 1) ----------
  // The saree frames are pre-composited: the silk is cut out of its original room and
  // stands in front of the Jaya storefront, centred on the glass doors. Its last frame is
  // pixel-identical to the first store frame, so the hand-off is a seamless continuation.
  const SAREE_COUNT = 141;
  const STORE_COUNT = 125;
  const FPS = 24;

  const T = {
    sareeA: [0.00, 0.30, 0, 85],      // silk close-up → pull back to the storefront   (p0, p1, f0, f1)
    sareeB: [0.30, 0.52, 85, 140],    // the fall — slowed down on purpose
    store: [0.545, 0.94, 0, STORE_COUNT - 1],   // a breath at the doors, then walk inside
  };

  // ---------- helpers ----------
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const inv = (a, b, v) => clamp((v - a) / (b - a));
  const smooth = (a, b, v) => { const t = inv(a, b, v); return t * t * (3 - 2 * t); };
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const pad = (n, l = 3) => String(n).padStart(l, "0");

  // ---------- DOM ----------
  const hero = document.getElementById("hero");
  const stage = hero.querySelector(".hero__stage");
  const canvas = document.getElementById("heroCanvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  const caps = [...hero.querySelectorAll(".cap")].map((el) => ({
    el, inP: parseFloat(el.dataset.in), outP: parseFloat(el.dataset.out), live: false, last: -1,
  }));
  const titleCap = caps.find((c) => c.el.classList.contains("cap--title"));
  const hudRoman = document.getElementById("hudRoman");
  const hudName = document.getElementById("hudName");
  const hudProgress = document.getElementById("hudProgress");
  const hudTC = document.getElementById("hudTC");
  const scrollCue = document.getElementById("scrollCue");
  const nav = document.getElementById("nav");

  document.getElementById("year").textContent = new Date().getFullYear();

  // ---------- split headings into chars ----------
  document.querySelectorAll(".split").forEach((el) => {
    let i = 0;
    const walk = (node) => {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(" ")); return; }
            const w = document.createElement("span");
            w.className = "w";
            [...part].forEach((c) => {
              const s = document.createElement("span");
              s.className = "ch";
              s.style.setProperty("--i", i++);
              s.textContent = c;
              w.appendChild(s);
            });
            frag.appendChild(w);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1 && child.tagName !== "BR") {
          walk(child);
        }
      });
    };
    walk(el);
    el.setAttribute("aria-label", el.textContent.replace(/\s+/g, " ").trim());
  });

  // ---------- canvas sizing ----------
  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(stage.clientWidth * DPR);
    const h = Math.round(stage.clientHeight * DPR);
    if (w === W && h === H) return;
    W = canvas.width = w;
    H = canvas.height = h;
    measure();
    dirty = true;
  }

  // ---------- frame loading ----------
  const needW = Math.max(innerWidth, innerHeight * 16 / 9) * Math.min(devicePixelRatio || 1, 2);
  const SIZE = needW <= 1100 ? "sm" : "lg";
  const seq = {
    saree: { count: SAREE_COUNT, frames: new Array(SAREE_COUNT), dir: `assets/frames/saree/${SIZE}/` },
    store: { count: STORE_COUNT, frames: new Array(STORE_COUNT), dir: `assets/frames/store/${SIZE}/` },
  };

  // Load order: coarse keyframes first across both clips, then progressively fill the gaps.
  const queue = [];
  const queued = new Set();
  const push = (name, i) => {
    const k = name + i;
    if (i < 0 || i >= seq[name].count || queued.has(k)) return;
    queued.add(k); queue.push([name, i]);
  };
  for (let i = 0; i < 24; i++) push("saree", i);              // opening second, in full
  [8, 4, 2, 1].forEach((step) => {
    for (let i = 0; i < SAREE_COUNT; i += step) push("saree", i);
    for (let i = 0; i < STORE_COUNT; i += step) push("store", i);
  });
  const gateCount = queue.findIndex(([n, i]) => n === "store" && i === 0) + Math.ceil(STORE_COUNT / 8);

  let loaded = 0, inFlight = 0, qi = 0, started = false;
  const MAX_IN_FLIGHT = 6;

  function pump() {
    while (inFlight < MAX_IN_FLIGHT && qi < queue.length) {
      const [name, i] = queue[qi++];
      inFlight++;
      const img = new Image();
      img.decoding = "async";
      img.src = seq[name].dir + pad(i + 1) + ".webp";
      const done = (ok) => {
        inFlight--;
        if (ok) seq[name].frames[i] = img;
        loaded++;
        onProgress();
        dirty = true;
        pump();
      };
      img.onload = () => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => done(true));
      img.onerror = () => done(false);
    }
  }

  const loaderEl = document.getElementById("loader");
  const loaderBar = document.getElementById("loaderBar");
  const loaderPct = document.getElementById("loaderPct");
  let introStart = 0;

  function onProgress() {
    const pct = Math.min(1, loaded / gateCount);
    loaderBar.style.transform = `scaleX(${pct})`;
    loaderPct.textContent = Math.round(pct * 100) + "%";
    if (!started && loaded >= gateCount) start();
  }

  function start() {
    if (started) return;
    started = true;
    loaderEl.classList.add("is-done");
    document.body.classList.remove("is-loading");
    introStart = performance.now() + 500;
  }
  // Never hold people hostage on a slow connection
  setTimeout(() => { if (seq.saree.frames[0]) start(); }, 9000);
  setTimeout(start, 16000);

  function frameAt(name, idx) {
    const s = seq[name];
    const i = clamp(Math.round(idx), 0, s.count - 1);
    if (s.frames[i]) return s.frames[i];
    for (let d = 1; d < s.count; d++) {
      if (s.frames[i - d]) return s.frames[i - d];
      if (s.frames[i + d]) return s.frames[i + d];
    }
    return null;
  }

  // Cover-fit geometry (all frames share one aspect ratio)
  function cover(img, zoom = 1) {
    const s = Math.max(W / img.naturalWidth, H / img.naturalHeight) * zoom;
    const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
    return { x: (W - dw) / 2, y: (H - dh) / 2, w: dw, h: dh };
  }

  // Draw a fractional frame index, cross-blending neighbours for buttery scrubbing
  function drawSeq(c, name, idx, zoom) {
    const s = seq[name];
    const i0 = clamp(Math.floor(idx), 0, s.count - 1);
    const t = idx - i0;
    const a = s.frames[i0] || frameAt(name, idx);
    if (!a) return null;
    const g = cover(a, zoom);
    c.globalAlpha = 1;
    c.drawImage(a, g.x, g.y, g.w, g.h);
    const b = s.frames[i0 + 1];
    if (b && t > 0.02 && s.frames[i0]) {
      c.globalAlpha = t;
      c.drawImage(b, g.x, g.y, g.w, g.h);
      c.globalAlpha = 1;
    }
    return g;
  }

  // ---------- scroll ----------
  let heroTop = 0, heroRange = 1;
  function measure() {
    const r = hero.getBoundingClientRect();
    heroTop = r.top + window.scrollY;
    heroRange = Math.max(1, hero.offsetHeight - stage.offsetHeight);
  }
  const targetP = () => clamp((window.scrollY - heroTop) / heroRange);

  let p = 0, dirty = true, lastT = performance.now(), firstFrame = true;

  // ---------- render ----------
  function render(now) {
    const dt = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;

    const tp = targetP();
    if (firstFrame) { p = tp; firstFrame = false; }
    const k = reduceMotion ? 30 : 6.5;                // inertia: lower = heavier, more filmic
    const np = p + (tp - p) * (1 - Math.exp(-dt * k));
    if (Math.abs(np - p) > 1e-6) dirty = true;
    p = Math.abs(tp - np) < 1e-5 ? tp : np;

    // title intro after the loader lifts
    let intro = 1;
    if (titleCap) {
      intro = started ? easeOut(clamp((now - introStart) / 1800)) : 0;
      if (intro < 1) dirty = true;
    }

    if (dirty && W && H) {
      dirty = false;
      draw(intro);
    }
    requestAnimationFrame(render);
  }

  function draw(intro) {
    // ----- saree frame index -----
    let sf;
    if (p <= T.sareeA[1]) sf = lerp(T.sareeA[2], T.sareeA[3], inv(T.sareeA[0], T.sareeA[1], p));
    else sf = lerp(T.sareeB[2], T.sareeB[3], inv(T.sareeB[0], T.sareeB[1], p));

    // ----- store frame index -----
    const stf = lerp(T.store[2], T.store[3], inv(T.store[0], T.store[1], p));

    // One continuous virtual camera across both clips: a slow settle from 1.06 → 1.0 that
    // lands exactly at the hand-off, so the saree's last frame and the store's first match 1:1.
    const zoom = 1 + 0.06 * (1 - easeOut(smooth(0, T.sareeB[1], p)));

    ctx.fillStyle = "#0d0607";
    ctx.fillRect(0, 0, W, H);

    if (p < T.store[0]) {
      drawSeq(ctx, "saree", sf, zoom);
    } else {
      drawSeq(ctx, "store", stf, 1);
    }

    // ----- letterbox: tighten into the fall, open up for the boutique -----
    const lb = lerp(0.075, 0.115, smooth(0.28, 0.4, p)) * (1 - smooth(0.5, 0.62, p));
    stage.style.setProperty("--lb", (lb * stage.clientHeight).toFixed(1) + "px");

    // ----- legibility shade -----
    const shade = 0.85 - 0.35 * smooth(0.36, 0.44, p) * (1 - smooth(0.5, 0.56, p)) + 0.15 * smooth(0.88, 0.95, p);
    stage.style.setProperty("--shade", shade.toFixed(3));

    // ----- captions -----
    const f = 0.035;
    for (const c of caps) {
      const vin = c.inP <= 0 ? 1 : smooth(c.inP, c.inP + f, p);
      const vout = c.outP >= 1 ? 1 : 1 - smooth(c.outP - f, c.outP, p);
      let v = vin * vout;
      if (c === titleCap) v *= intro;
      v = Math.round(v * 1000) / 1000;
      if (v !== c.last) {
        c.el.style.setProperty("--v", v);
        c.last = v;
        const live = v > 0.001;
        if (live !== c.live) { c.el.classList.toggle("is-live", live); c.live = live; }
      }
    }

    // ----- HUD -----
    const ch = p < 0.25 ? ["I", "The Silk"] : p < 0.53 ? ["II", "The Veil"] : ["III", "The House"];
    if (hudRoman.textContent !== ch[0]) { hudRoman.textContent = ch[0]; hudName.textContent = ch[1]; }
    hudProgress.style.transform = `scaleX(${p.toFixed(4)})`;
    const secs = p < T.store[0] ? sf / FPS : (SAREE_COUNT / FPS) + stf / FPS;
    const fr = Math.floor((secs % 1) * FPS);
    const s = Math.floor(secs);
    hudTC.textContent = `00:00:${pad(s, 2)}:${pad(fr, 2)}`;

    scrollCue.classList.toggle("is-hidden", p > 0.015 || !started);
  }

  // ---------- page chrome ----------
  function onScroll() {
    dirty = true;
    nav.classList.toggle("is-solid", window.scrollY > heroTop + heroRange + stage.offsetHeight * 0.85);
    parallax();
  }

  const fig = document.querySelector(".house__figure");
  const figImg = fig && fig.querySelector("img");
  function parallax() {
    if (!fig || reduceMotion) return;
    const r = fig.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    const t = (r.top + r.height / 2 - innerHeight / 2) / innerHeight;
    figImg.style.setProperty("--py", (t * -60).toFixed(1) + "px");
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
    });
  }, { threshold: 0.18, rootMargin: "0px 0px -6% 0px" });
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

  // cursor-following preview for the collection list
  const preview = document.getElementById("cursorPreview");
  const previewImg = preview && preview.querySelector("img");
  if (preview && window.matchMedia("(hover: hover)").matches) {
    let mx = 0, my = 0, px = 0, py = 0, on = false;
    const tick = () => {
      px += (mx - px) * 0.14; py += (my - py) * 0.14;
      preview.style.transform = `translate3d(${px}px, ${py}px, 0) translate(-50%, -50%) scale(${on ? 1 : 0.85}) rotate(${(mx - px) * 0.04}deg)`;
      requestAnimationFrame(tick);
    };
    tick();
    document.querySelectorAll(".clist__item").forEach((item) => {
      item.addEventListener("mouseenter", () => { previewImg.src = item.dataset.img; on = true; preview.classList.add("is-on"); });
      item.addEventListener("mouseleave", () => { on = false; preview.classList.remove("is-on"); });
    });
    window.addEventListener("mousemove", (e) => { mx = e.clientX; my = e.clientY; }, { passive: true });
  }

  // ---------- boot ----------
  window.addEventListener("resize", () => { resize(); measure(); onScroll(); });
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("load", () => { measure(); dirty = true; });
  resize();
  onScroll();
  pump();
  requestAnimationFrame(render);
})();
