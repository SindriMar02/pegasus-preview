// Pegasus Pictures prototype. Motion numbers: PSP probes (Lenis lerp .085, master scrub 1.2, wipe masks .8/.1,
// bracket ease .16,1,.3,1) + the RVK build (slate loader, sticky stage with a transparent follow-on).
import { GEO } from './geo.js';
import { FILM, BRANDS, CUT, ORIGINALS } from './data.js';
import { estimate, fmtISK } from './rebate.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const html = document.documentElement;
const RM = html.classList.contains('rm');
const FINE = matchMedia('(pointer: fine)').matches;
const MQ_D = matchMedia('(min-width: 768px)');
const hasGsap = typeof window.gsap !== 'undefined';
const img = (k) => `assets/img/${k}.webp`;

/* ---------- content ---------- */
function renderCredits() {
  const fill = (ol, items, plate) => {
    ol.innerHTML = items.map((c, i) => `<li class="fp__i" data-i="${i}"><span class="mono fp__n">${String(i + 1).padStart(2, '0')}</span><span class="fp__t">${c.name}</span></li>`).join('');
    plate.innerHTML = items.map((c, i) => `<img src="${img(c.img)}" alt="" width="700" height="933" decoding="async" data-i="${i}">`).join('');
  };
  fill($('#fp-film'), FILM, $('#plate-a'));
  fill($('#fp-brand'), BRANDS, $('#plate-b'));
}
function renderCut() {
  const track = $('#cut-track');
  track.insertAdjacentHTML('beforeend', CUT.map((c, i) => `
    <figure class="cut__f">
      <div class="cut__img"><img src="assets/cut/${c.img}.jpg" alt="" decoding="async" width="1920" height="820"></div>
      <figcaption class="mono"><span>${c.slug}</span><span>${c.time}</span><span>${String(i + 1).padStart(2, '0')} / ${String(CUT.length).padStart(2, '0')}</span></figcaption>
    </figure>`).join('') + `
    <div class="cut__end"><p class="d cut__endh">Every location. <em>One</em> call.</p><button class="act" type="button" data-request>Start a production</button></div>`);
}
function renderOriginals() {
  $('#orig-grid').innerHTML = ORIGINALS.map((o) => `
    <li class="og">
      <div class="og__p"><img src="${img(o.img)}" alt="Poster: ${o.title}" width="700" height="1000" loading="lazy" decoding="async"></div>
      <p class="og__t">${o.title}</p>
      <p class="mono og__m">${o.kind}${o.local ? ` / ${o.local}` : ''}</p>
      ${o.note ? `<p class="og__a">${o.note}</p>` : ''}
    </li>`).join('');
}

/* ---------- location finder ---------- */
const VIEWS = { IS: [-420, 112, 565, 420], GL: [-3216, -2080, 3633, 2700], NO: [39, -900, 2422, 1800] }; // all at the map's 545:405 aspect
const PLACES = GEO.places;
let cc = 'IS', cat = 'All', activeId = null, view = VIEWS.IS.slice();

function dms(lat, lon) {
  const f = (v, p, n) => { const a = Math.abs(v); const d = Math.floor(a); const m = Math.round((a - d) * 60); return `${d}°${String(m).padStart(2, '0')}′${v >= 0 ? p : n}`; };
  return `${f(lat, 'N', 'S')} ${f(lon, 'E', 'W')}`;
}
function laea(lon, lat) { // same projection as build_geo.py (LAEA 68N 16W, km)
  const r = Math.PI / 180, L0 = 68 * r, l0 = -16 * r, l = lon * r, p = lat * r;
  const k = Math.sqrt(2 / (1 + Math.sin(L0) * Math.sin(p) + Math.cos(L0) * Math.cos(p) * Math.cos(l - l0)));
  return [k * Math.cos(p) * Math.sin(l - l0) * 6371, -k * (Math.cos(L0) * Math.sin(p) - Math.sin(L0) * Math.cos(p) * Math.cos(l - l0)) * 6371];
}
function renderMap() {
  const svg = $('#map');
  const ac = []; for (let lon = -80; lon <= 40; lon += 1) ac.push(laea(lon, 66.5622));
  const acd = 'M' + ac.map((p) => p.map((v) => v.toFixed(1)).join(' ')).join('L');
  const lab = laea(-30.5, 66.5622);
  svg.innerHTML = `
    <g class="map__land">${Object.values(GEO.land).map((d) => `<path d="${d}"/>`).join('')}</g>
    <path class="map__ac" d="${acd}"/>
    <text class="map__acl" x="${lab[0].toFixed(1)}" y="${lab[1].toFixed(1)}">ARCTIC CIRCLE 66°33′N</text>
    <g class="map__pins">${PLACES.map((p) => `
      <g class="pin" data-id="${p.id}" data-cc="${p.cc}" transform="translate(${p.x} ${p.y})" tabindex="-1">
        <circle class="pin__hit" r="1"/><circle class="pin__dot" r="1"/><text class="pin__l" x="0" y="0">${p.name}</text>
      </g>`).join('')}</g>`;
  $$('.pin', svg).forEach((g) => g.addEventListener('click', () => select(g.dataset.id, true)));
  setView(VIEWS.IS, false);
}
function applyView(v) {
  const svg = $('#map');
  svg.setAttribute('viewBox', v.map((n) => n.toFixed(1)).join(' '));
  const px = svg.getBoundingClientRect().width || 800;
  const u = Math.max(v[2] / px, v[3] / (svg.getBoundingClientRect().height || 560)); // km per css px
  svg.style.setProperty('--u', u);
  $$('.pin', svg).forEach((g) => {
    const p = PLACES.find((q) => q.id === g.dataset.id);
    const on = p.id === activeId;
    g.querySelector('.pin__dot').setAttribute('r', (on ? 7 : 4.5) * u);
    g.querySelector('.pin__hit').setAttribute('r', 16 * u);
    const t = g.querySelector('.pin__l');
    t.setAttribute('x', 9 * u); t.setAttribute('y', 4 * u); t.style.fontSize = 11.5 * u + 'px';
  });
  const l = $('.map__acl', svg); l.style.fontSize = 10 * u + 'px';
  $('.map__ac', svg).style.strokeWidth = 1.2 * u;
}
function setView(target, animate) {
  if (!animate || RM || !hasGsap) { view = target.slice(); applyView(view); return; }
  const o = { a: view[0], b: view[1], c: view[2], d: view[3] };
  gsap.to(o, { a: target[0], b: target[1], c: target[2], d: target[3], duration: 0.7, ease: 'power3.inOut', overwrite: true,
    onUpdate: () => { view = [o.a, o.b, o.c, o.d]; applyView(view); } });
}
function visible() { return PLACES.filter((p) => p.cc === cc && (cat === 'All' || p.cat.split(' · ').includes(cat))); }
function renderChips() {
  const cats = ['All', ...new Set(PLACES.filter((p) => p.cc === cc).flatMap((p) => p.cat.split(' · ')))];
  $('#chips').innerHTML = cats.map((c) => `<button type="button" class="chip" aria-pressed="${c === cat}" data-cat="${c}">${c}</button>`).join('');
  $$('#chips .chip').forEach((b) => b.addEventListener('click', () => { cat = b.dataset.cat; renderChips(); renderStrip(); const v = visible(); if (!v.find((p) => p.id === activeId)) select(v[0]?.id); }));
}
function renderStrip() {
  const v = visible();
  $('#strip').innerHTML = v.map((p) => `
    <button type="button" class="strip__i" data-id="${p.id}" aria-pressed="${p.id === activeId}" aria-label="${p.name}">
      ${p.photo ? `<img src="${img('loc-' + p.id)}" alt="" width="935" height="525" loading="lazy">` : `<span class="strip__ph mono">${p.name}</span>`}
    </button>`).join('');
  $$('#strip .strip__i').forEach((b, i, all) => {
    b.addEventListener('click', () => select(b.dataset.id));
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault(); const n = all[(i + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length]; n.focus(); select(n.dataset.id);
    });
  });
  $$('.pin').forEach((g) => g.classList.toggle('is-hidden', !v.find((p) => p.id === g.dataset.id)));
}
function select(id, fromMap) {
  const p = PLACES.find((q) => q.id === id); if (!p) return;
  activeId = id;
  const box = $('#vfr-img');
  const next = p.photo ? `<img src="${img('loc-' + p.id)}" alt="${p.name}, ${p.cat}" width="935" height="525" decoding="async">`
    : `<div class="vfr__none"><p class="mono">No library frames yet</p><p>Scouting in ${p.cc === 'NO' ? 'Norway' : 'Greenland'} on request. Tell Pegasus what the scene needs.</p></div>`;
  box.innerHTML = next;
  if (hasGsap && !RM) gsap.fromTo(box.firstElementChild, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: 'power2.out' });
  $('#vfr-name').textContent = p.name;
  $('#vfr-cat').textContent = p.cat;
  $('#vfr-geo').innerHTML = `${dms(p.lat, p.lon)} <a href="https://www.openstreetmap.org/${p.osm}" rel="noopener">OSM</a>`;
  $('#vfr-km').textContent = p.kmFromRvk ? `${p.kmFromRvk.toLocaleString('en-GB')} km from Reykjavík, as the crow flies` : 'Pegasus base';
  $('#vfr-note').textContent = '';
  $$('.pin').forEach((g) => g.classList.toggle('is-on', g.dataset.id === id));
  $$('#strip .strip__i').forEach((b) => b.setAttribute('aria-pressed', b.dataset.id === id));
  applyView(view);
  if (fromMap) $(`#strip .strip__i[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center' });
}
function setCountry(next, focus) {
  cc = next; cat = 'All';
  $$('#tabs [role=tab]').forEach((t) => { const on = t.dataset.cc === cc; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; if (on && focus) t.focus(); });
  $('#finder-panel').setAttribute('aria-labelledby', 'tab-' + cc);
  renderChips(); renderStrip(); select(visible()[0]?.id); setView(VIEWS[cc], !focus); // arrow keys: no camera move
}
function initFinder() {
  renderMap(); renderChips(); renderStrip(); select('hjorleifshofdi');
  const tabs = $$('#tabs [role=tab]');
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => setCountry(t.dataset.cc));
    t.addEventListener('keydown', (e) => {
      const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (!k) return;
      e.preventDefault(); setCountry(tabs[(i + k + tabs.length) % tabs.length].dataset.cc, true);
    });
  });
  addEventListener('resize', () => applyView(view));
}

/* ---------- rebate calculator ---------- */
function initCalc() {
  const f = $('#calc');
  let shown = 0;
  const run = () => {
    const r = estimate({ type: f.type.value, spend: f.spend.value, days: f.days.value, shoot: f.shoot.value, crew: f.crew.value, youth: f.youth.checked, over80: f.over80.checked });
    $('#r-rate').textContent = r.eligible ? r.rate + '%' : 'Not eligible';
    const isk = $('#r-isk');
    if (hasGsap && !RM) { const o = { v: shown }; gsap.to(o, { v: r.isk, duration: 0.5, ease: 'power3.out', overwrite: true, onUpdate: () => { isk.textContent = fmtISK(o.v); } }); }
    else isk.textContent = fmtISK(r.isk);
    shown = r.isk;
    $('#r-checks').innerHTML = r.checks.map((c) => `<li class="${c.ok ? 'ok' : ''}"><span class="mono">${c.ok ? 'Met' : 'Not yet'}</span>${c.label}</li>`).join('');
    $('#r-checks').hidden = !r.eligible || (r.youth && r.rate === 35 && !r.checks.every((c) => c.ok));
    $('#r-gap').textContent = (r.eligible && r.gap.length ? `To reach 35%: ${r.gap.join(', ')}. ` : '') + (r.note || '');
  };
  f.addEventListener('input', run); f.addEventListener('change', run); f.addEventListener('submit', (e) => e.preventDefault());
  run();
}

/* ---------- menu (focus-guard rule: pointer opens onto the panel, keyboard onto the first link) ---------- */
let lenis = null;
function initMenu() {
  const b = $('#burger'), m = $('#menu');
  const close = (restore) => { m.hidden = true; b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-label', 'Open menu'); html.classList.remove('menu-open'); lenis?.start(); if (restore) b.focus(); };
  b.addEventListener('click', (e) => {
    if (!m.hidden) return close(e.detail === 0);
    m.hidden = false; b.setAttribute('aria-expanded', 'true'); b.setAttribute('aria-label', 'Close menu'); html.classList.add('menu-open'); lenis?.stop();
    (e.detail === 0 ? m.querySelector('a') : m).focus({ preventScroll: true });
    if (hasGsap && !RM && e.detail !== 0) gsap.fromTo($$('nav a', m), { yPercent: 40, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.32, stagger: 0.03, ease: 'power3.out' }); // keyboard opens instantly
  });
  m.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(true); });
  $$('a', m).forEach((a) => a.addEventListener('click', () => close(false)));
}

/* ---------- request sheet ---------- */
function initRequest() {
  const d = $('#req'), form = $('#req-form');
  const steps = $$('[data-step]', d), dots = $$('.req__steps li', d);
  let step = 0, opener = null;
  const show = (n) => {
    step = n;
    steps.forEach((s) => { s.hidden = Number(s.dataset.step) !== n; });
    dots.forEach((li, i) => li.classList.toggle('on', i <= n));
    $('#req-back').hidden = n === 0 || n === 4;
    $('#req-next').textContent = n === 3 ? 'Prepare brief' : n === 4 ? 'Done' : 'Next';
  };
  const open = (e) => {
    opener = e.currentTarget; form.reset(); $$('.fld__e', d).forEach((x) => x.classList.remove('on')); show(0);
    lenis?.stop(); d.showModal();
    (e.detail === 0 ? d.querySelector('input') : form).focus({ preventScroll: true });
  };
  $$('[data-request]').forEach((btn) => btn.addEventListener('click', open));
  d.addEventListener('close', () => { lenis?.start(); opener?.focus({ preventScroll: true }); });
  $('#req-x').addEventListener('click', () => d.close());
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  $('#req-back').addEventListener('click', () => show(Math.max(0, step - 1)));
  $('#req-next').addEventListener('click', () => {
    if (step === 4) return d.close();
    if (step === 3) {
      const name = form.name.value.trim(), email = form.email.value.trim();
      const okN = !!name, okE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      $('#e-name').classList.toggle('on', !okN); $('#e-email').classList.toggle('on', !okE);
      form.name.setAttribute('aria-invalid', !okN); form.email.setAttribute('aria-invalid', !okE);
      if (!okN) return form.name.focus(); if (!okE) return form.email.focus();
      const fd = new FormData(form);
      $('#req-brief').textContent = [
        `Project: ${fd.get('kind')}${fd.get('title') ? `, "${fd.get('title')}"` : ''}`,
        `Where: ${fd.getAll('where').join(', ') || 'Not set'}`,
        `Shoot starts: ${fd.get('month') || 'Not set'}${fd.get('sdays') ? `, ${fd.get('sdays')} shooting days` : ''}`,
        `Needs: ${fd.getAll('svc').join(', ') || 'Not set'}`,
        `From: ${name}${fd.get('company') ? `, ${fd.get('company')}` : ''} <${email}>`,
        fd.get('note') ? `Note: ${fd.get('note')}` : '',
      ].filter(Boolean).join('\n');
    }
    show(step + 1);
    const first = steps.find((s) => !s.hidden)?.querySelector('input, textarea');
    if (first && html.getAttribute('data-input') === 'key') first.focus();
  });
}

/* ---------- motion ---------- */
function tc(frames) { const f = frames % 25, s = Math.floor(frames / 25) % 60, m = Math.floor(frames / 1500) % 60, h = Math.floor(frames / 90000); return [h, m, s, f].map((n) => String(n).padStart(2, '0')).join(':'); }

function loader(done) {
  const slate = $('#slate');
  let seen = false;
  try { seen = sessionStorage.getItem('pg-intro') === '1'; sessionStorage.setItem('pg-intro', '1'); } catch (e) { /* private mode: play it */ }
  if (RM || !hasGsap || seen || /[?&]nointro\b/.test(location.search)) { slate.remove(); done(); return; }
  html.classList.add('loading');
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  scrollTo(0, 0); // the intro always opens on the reel
  const ruleEl = $('#slate-rule');
  let finished = false, started = false, tl = null;
  const start = () => { if (!started) { started = true; done(); } }; // hero entrance begins as the slate lifts, never behind it
  const finish = () => { if (finished) return; finished = true; tl?.kill(); slate.remove(); html.classList.remove('loading'); start(); };
  const fail = setTimeout(finish, 3000); // hard failsafe: rAF may never tick in a hidden tab
  const o = { f: 0 };
  tl = gsap.timeline({ onComplete: () => { clearTimeout(fail); finish(); } });
  tl.to('.slate__wipe', { scaleX: 1, duration: 0.5, ease: 'power3.inOut' }, 0.15)
    .set('.slate__mark img', { opacity: 1 })
    .set('.slate__wipe', { transformOrigin: 'left center' })
    .to('.slate__wipe', { scaleX: 0, duration: 0.5, ease: 'power3.inOut' })
    .to(o, { f: 1, duration: 1.5, ease: 'power2.inOut', onUpdate: () => { if (!finished) ruleEl.style.transform = `scaleX(${o.f})`; } }, 0)
    .to('.slate__mark, .slate__rule', { opacity: 0, duration: 0.35, ease: 'power2.out' }, 1.55)
    .to(slate, { clipPath: 'inset(0 0 100% 0)', duration: 0.75, ease: 'expo.inOut' }, 1.6)
    .call(start, null, 1.85);
}

function heroIn() {
  const reel = $('#reel'), btn = $('#reel-toggle');
  const setPlaying = (on) => { btn.setAttribute('aria-pressed', String(!on)); btn.setAttribute('aria-label', on ? 'Pause the showreel' : 'Play the showreel'); $('#reel-state').textContent = on ? 'REC' : 'PAUSED'; };
  btn.addEventListener('click', () => { if (reel.paused) { reel.play().catch(() => {}); setPlaying(true); } else { reel.pause(); setPlaying(false); } });
  if (RM) { setPlaying(false); return; } // reduced motion: poster frame, play on request
  reel.play().catch(() => setPlaying(false));
  if (!hasGsap) return;
  if (MQ_D.matches) gsap.fromTo('.stage__h .ln__in', { yPercent: 105 }, { yPercent: 0, duration: 1.1, stagger: 0.09, ease: 'expo.out' });
  else gsap.fromTo('.stage__h', { y: 28, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, ease: 'expo.out' }); // phone: the lines flow, so no per-line mask
  gsap.fromTo('.stage__sub, .stage__copy .act, .deck', { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, stagger: 0.08, delay: 0.35, ease: 'power3.out' });
}

function deckClock() {
  const v = $('#reel'), t = $('#deck-tc'), h = $('#deck-head');
  const tick = () => { if (v.duration) { t.textContent = tc(Math.floor(v.currentTime * 25)); h.style.transform = `translateX(${(v.currentTime / v.duration) * 100}%)`; } };
  if (hasGsap) gsap.ticker.add(tick); else setInterval(tick, 200);
}

function scenes() {
  if (RM || !hasGsap || typeof ScrollTrigger === 'undefined') return;
  gsap.registerPlugin(ScrollTrigger);
  html.classList.add('gs'); // only now may the wipe-mask lines start hidden
  if (FINE) {
    lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 1, smoothWheel: true, syncTouch: false });
    window.__lenis = lenis; // QA hook: lets probes jump to a scroll position
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000)); gsap.ticker.lagSmoothing(0);
    $$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => { const el = $(a.getAttribute('href')); if (!el) return; e.preventDefault(); lenis.scrollTo(el, { offset: 0 }); }));
  }
  // stage hand-off: the manifesto is transparent, so its type flows over the still-playing reel
  gsap.timeline({ scrollTrigger: { trigger: '#mani', start: 'top bottom', end: 'top top', scrub: true } })
    .to('#stage-dim', { opacity: 0.72, ease: 'none' }, 0)
    .to('#reel', { scale: 1.14, ease: 'none' }, 0)
    .to('#stage-copy', { y: -90, opacity: 0, ease: 'none' }, 0)
    .to('#deck', { opacity: 0, ease: 'none', duration: 0.35 }, 0);
  ScrollTrigger.create({ trigger: '#mani', start: 'top 70px', onToggle: (s) => $('#hd').classList.toggle('hd--solid', s.isActive || s.progress > 0), end: 'max' });
  // PSP wipe masks, position-tied (reversible), one line after another
  const wl = gsap.timeline({ scrollTrigger: { trigger: '.mani__h', start: 'top 85%', end: 'bottom 45%', scrub: 0.6 } });
  $$('.mani__h .wl').forEach((line, i) => {
    const m = line.querySelector('.wl__m'), t = line.querySelector('.wl__t');
    wl.fromTo(m, { scaleX: 0, transformOrigin: 'right center' }, { scaleX: 1, duration: 0.8, ease: 'power2.inOut' }, i * 0.1 * 4)
      .fromTo(t, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01 }, '>')
      .to(m, { scaleX: 0, transformOrigin: 'left center', duration: 0.8, ease: 'power2.inOut' }, '>');
  });
  gsap.fromTo('.mani__body, .mani__lands li', { y: 40, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.05, ease: 'none', scrollTrigger: { trigger: '.mani__body', start: 'top 92%', end: 'top 60%', scrub: true } });

  const mm = gsap.matchMedia();
  mm.add('(min-width: 768px)', () => {
    // credits: focus pull over a pin (CA Film activeIndex = floor(progress * N))
    const items = $$('#credits .fp__i'), N = items.length, nf = FILM.length;
    const setActive = (k) => {
      items.forEach((li, i) => li.classList.toggle('on', i === k));
      const a = k < nf ? k : nf - 1, b = k < nf ? 0 : k - nf;
      $$('#plate-a img').forEach((im) => im.classList.toggle('on', Number(im.dataset.i) === a));
      $$('#plate-b img').forEach((im) => im.classList.toggle('on', Number(im.dataset.i) === b));
      $('.plate--b').classList.toggle('lit', k >= nf); $('.plate--a').classList.toggle('lit', k < nf);
    };
    setActive(0);
    ScrollTrigger.create({ trigger: '#credits-pin', start: 'top top', end: '+=' + N * 110, pin: true, anticipatePin: 1,
      onUpdate: (s) => setActive(Math.min(N - 1, Math.floor(s.progress * N))) });
    // THE CUT: pinned horizontal pan (scrub 1.2 = PSP master pin)
    const track = $('#cut-track');
    const dist = () => track.scrollWidth - innerWidth;
    gsap.to(track, { x: () => -dist(), ease: 'none', scrollTrigger: { trigger: '#cut-pin', start: 'top top', end: () => '+=' + dist(), pin: true, scrub: 1.2, anticipatePin: 1, invalidateOnRefresh: true } });
    return () => items.forEach((li) => li.classList.remove('on'));
  });
  mm.add('(max-width: 767px)', () => {
    $$('#credits .fp__i').forEach((li) => li.classList.add('on'));
    $$('#plate-a img')[0]?.classList.add('on');
  });
  // close: PSP footer heading lines yPercent 105 -> 0, position-tied
  gsap.fromTo('.close__h .ln__in', { yPercent: 105 }, { yPercent: 0, stagger: 0.12, ease: 'none', scrollTrigger: { trigger: '.close__h', start: 'top 90%', end: 'top 55%', scrub: true } });
  // section headings: one rise each, position-tied
  $$('.credits__h, .finder__h, .rebate__h, .orig__h, .people__h').forEach((h) => gsap.fromTo(h, { y: 60, opacity: 0 }, { y: 0, opacity: 1, ease: 'none', scrollTrigger: { trigger: h, start: 'top 95%', end: 'top 70%', scrub: true } }));
  gsap.fromTo('.og', { y: 50, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.04, ease: 'none', scrollTrigger: { trigger: '.orig__grid', start: 'top 90%', end: 'top 45%', scrub: true } });
  // reveals whose height changes later (fonts, images) need a refresh
  addEventListener('load', () => ScrollTrigger.refresh());
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
}

/* ---------- boot ---------- */
renderCredits(); renderCut(); renderOriginals();
initFinder(); initCalc(); initMenu(); initRequest(); deckClock();
scenes();
loader(heroIn);
html.classList.add('ready');
setTimeout(() => html.classList.add('ready'), 5000);
