'use strict';
// Illustrations animées de l'aperçu (PR31), à cocher et combiner dans le panneau.
// Rien n'est chargé sur le site tant qu'une option n'est pas retenue.
(() => {
  const root = document.documentElement;
  const calme = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const body = document.querySelector('.vx-panel .vx-body');
  const scene = document.querySelector('.metal-scene') || document.body;
  if (!body) return;

  const ILLUS = {
    globe: 'Globe terrestre en rotation (accueil)',
    globefil: '… style fil de fer chromé (au lieu des points)',
    reseau: 'Réseau internet : points reliés et messages qui circulent',
    icones: 'Icônes communication qui flottent (@, wifi, bulles, courrier)',
    poignee: 'Poignée de main (bloc Ambassadeurs)',
    contrat: 'Contrat et signature qui s’écrit (bloc Brigade)',
  };
  const on = k => root.hasAttribute('data-il-' + k);

  // Panneau
  const h = document.createElement('h4'); h.textContent = 'Illustrations animées (combinables)';
  body.append(h);
  for (const [k, txt] of Object.entries(ILLUS)) {
    const l = document.createElement('label'), c = document.createElement('input');
    c.type = 'checkbox'; c.checked = ['globe', 'reseau', 'poignee', 'contrat'].includes(k);
    const apply = () => { root.toggleAttribute('data-il-' + k, c.checked); dispatchEvent(new Event('vx-illus')); };
    c.onchange = apply; apply(); l.append(c, txt); body.append(l);
    if (k === 'globefil') l.classList.add('vx-sub');
  }

  // Dégradé chromé partagé par les SVG
  const NS = 'http://www.w3.org/2000/svg';
  // Les traits sont clairs et pleins (un dégradé dans un SVG masqué ne s'affiche pas partout).
  const defs = '';

  /* ---------- 1. Globe terrestre ---------- */
  // Terres en grille 64 × 32 (5,6° par case), par rangée : [début, fin] en colonnes.
  const TERRE = [
    [], [[21, 27]], [[11, 18], [19, 28], [49, 56]], [[2, 7], [7, 19], [22, 28], [34, 37], [37, 63]],
    [[2, 7], [7, 20], [23, 25], [28, 28], [33, 37], [37, 63]], [[3, 8], [8, 14], [17, 21], [33, 37], [37, 61]],
    [[9, 21], [30, 31], [32, 39], [39, 57], [59, 60]], [[10, 20], [31, 39], [39, 55]], [[10, 19], [30, 37], [36, 55], [56, 56]],
    [[10, 18], [30, 34], [36, 40], [40, 53], [56, 56]], [[11, 17], [30, 37], [38, 42], [42, 53]],
    [[12, 14], [17, 17], [29, 38], [38, 42], [44, 47], [49, 53]], [[13, 15], [29, 38], [39, 41], [45, 46], [48, 51]],
    [[16, 16], [29, 39], [45, 45], [49, 50]], [[17, 21], [29, 39], [49, 49], [53, 53]], [[18, 23], [33, 39], [49, 52]],
    [[17, 25], [33, 38], [50, 56]], [[18, 25], [34, 38], [56, 58]], [[18, 25], [34, 38], [40, 40], [54, 56]],
    [[19, 24], [34, 38], [40, 40], [52, 58]], [[19, 24], [34, 37], [52, 59]], [[19, 23], [35, 37], [52, 59]],
    [[19, 21], [56, 58], [63, 63]], [[19, 20], [57, 57], [62, 62]], [[18, 20]], [[19, 19]], [], [[20, 22]],
    [[0, 63]], [[0, 63]], [[0, 63]], [[0, 63]],
  ];
  const pts = [];
  TERRE.forEach((rangs, r) => rangs.forEach(([a, b]) => {
    if (r >= 29) return;
    for (let c = a; c <= b; c++) for (let k = 0; k < 10; k++) {
      const dx = Math.random(), dy = Math.random();
      const lat = (90 - (r + dy) * 5.625) * Math.PI / 180, lon = (-180 + (c + dx) * 5.625) * Math.PI / 180;
      if (Math.abs(lat) < 1.45) pts.push([lat, lon]);
    }
  }));
  const globe = document.createElement('canvas'); globe.className = 'il il-globe'; globe.setAttribute('aria-hidden', 'true');
  scene.append(globe);
  const g = globe.getContext('2d'); let rot = 0;
  const tilt = 16 * Math.PI / 180;
  const proj = (lat, lon, R) => {
    const x = Math.cos(lat) * Math.sin(lon + rot), y0 = Math.sin(lat), z0 = Math.cos(lat) * Math.cos(lon + rot);
    const y = y0 * Math.cos(tilt) - z0 * Math.sin(tilt), z = y0 * Math.sin(tilt) + z0 * Math.cos(tilt);
    return [R + x * R, R - y * R, z];
  };
  function dessineGlobe() {
    const dpr = Math.min(devicePixelRatio || 1, 2), S = globe.clientWidth * dpr;
    if (!S) return;
    if (globe.width !== S) { globe.width = globe.height = S; }
    const R = S / 2 * .96; g.setTransform(1, 0, 0, 1, S / 2 - R, S / 2 - R); g.clearRect(-S, -S, 3 * S, 3 * S);
    // Sphère : halo et ombre
    const halo = g.createRadialGradient(R * .7, R * .55, R * .1, R, R, R * 1.05);
    halo.addColorStop(0, 'rgba(165,204,255,.28)'); halo.addColorStop(.7, 'rgba(30,79,168,.18)'); halo.addColorStop(1, 'rgba(1,4,12,.0)');
    g.fillStyle = halo; g.beginPath(); g.arc(R, R, R, 0, 7); g.fill();
    g.strokeStyle = 'rgba(207,226,255,.45)'; g.lineWidth = 1.2 * dpr; g.beginPath(); g.arc(R, R, R, 0, 7); g.stroke();
    // Méridiens et parallèles
    const fil = on('globefil');
    g.strokeStyle = fil ? 'rgba(207,226,255,.55)' : 'rgba(165,204,255,.16)'; g.lineWidth = (fil ? 1.1 : .8) * dpr;
    for (let m = 0; m < 12; m++) { g.beginPath(); let up = false; for (let la = -90; la <= 90; la += 4) { const [x, y, z] = proj(la * Math.PI / 180, m * Math.PI / 6, R); if (z > 0) { up ? g.lineTo(x, y) : g.moveTo(x, y); up = true; } else up = false; } g.stroke(); }
    for (let la = -60; la <= 60; la += 30) { g.beginPath(); let up = false; for (let lo = 0; lo <= 361; lo += 4) { const [x, y, z] = proj(la * Math.PI / 180, lo * Math.PI / 180, R); if (z > 0) { up ? g.lineTo(x, y) : g.moveTo(x, y); up = true; } else up = false; } g.stroke(); }
    // Terres : points lumineux, ou contours pleins en fil de fer
    for (const [lat, lon] of pts) {
      const [x, y, z] = proj(lat, lon, R); if (z <= 0) continue;
      const a = .25 + .75 * z;
      g.fillStyle = fil ? `rgba(165,204,255,${a * .55})` : `rgba(${200 + 55 * z | 0},${225 + 30 * z | 0},255,${a})`;
      const s = (fil ? 2 : 1.45) * dpr * (.6 + .4 * z);
      g.beginPath(); g.arc(x, y, s, 0, 7); g.fill();
    }
    // Reflet brillant
    const spec = g.createRadialGradient(R * .62, R * .45, 0, R * .62, R * .45, R * .7);
    spec.addColorStop(0, 'rgba(255,255,255,.22)'); spec.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = spec; g.beginPath(); g.arc(R, R, R, 0, 7); g.fill();
  }

  /* ---------- 2. Réseau internet ---------- */
  const net = document.createElement('canvas'); net.className = 'il il-reseau'; net.setAttribute('aria-hidden', 'true');
  scene.append(net);
  const n = net.getContext('2d');
  const noeuds = Array.from({ length: 46 }, () => ({ x: Math.random(), y: Math.random(), vx: (Math.random() - .5) * .00025, vy: (Math.random() - .5) * .00025 }));
  const messages = [];
  function dessineReseau() {
    const dpr = Math.min(devicePixelRatio || 1, 2), W = net.clientWidth * dpr, H = net.clientHeight * dpr;
    if (net.width !== W || net.height !== H) { net.width = W; net.height = H; }
    n.clearRect(0, 0, W, H);
    const lim = 170 * dpr;
    for (const p of noeuds) { if (!calme) { p.x += p.vx; p.y += p.vy; } if (p.x < 0 || p.x > 1) p.vx *= -1; if (p.y < 0 || p.y > 1) p.vy *= -1; }
    const liens = [];
    for (let i = 0; i < noeuds.length; i++) for (let j = i + 1; j < noeuds.length; j++) {
      const a = noeuds[i], b = noeuds[j], d = Math.hypot((a.x - b.x) * W, (a.y - b.y) * H);
      if (d < lim) { liens.push([a, b]); n.strokeStyle = `rgba(165,204,255,${.32 * (1 - d / lim)})`; n.lineWidth = dpr; n.beginPath(); n.moveTo(a.x * W, a.y * H); n.lineTo(b.x * W, b.y * H); n.stroke(); }
    }
    for (const p of noeuds) { n.fillStyle = 'rgba(207,226,255,.75)'; n.beginPath(); n.arc(p.x * W, p.y * H, 2.2 * dpr, 0, 7); n.fill(); }
    // Messages qui circulent le long des liens
    if (!calme && liens.length && messages.length < 9 && Math.random() < .06) messages.push({ l: liens[Math.random() * liens.length | 0], t: 0 });
    for (const m of messages) {
      m.t += .012; const [a, b] = m.l, x = (a.x + (b.x - a.x) * m.t) * W, y = (a.y + (b.y - a.y) * m.t) * H;
      const gr = n.createRadialGradient(x, y, 0, x, y, 9 * dpr); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(165,204,255,0)');
      n.fillStyle = gr; n.beginPath(); n.arc(x, y, 9 * dpr, 0, 7); n.fill();
    }
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].t >= 1) messages.splice(i, 1);
  }

  /* ---------- 3. Icônes communication ---------- */
  const ICONES = [
    ['<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>', 8, 30, 0],
    ['<path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1"/>', 84, 40, 1.2],
    ['<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.2-4.6A8 8 0 1 1 21 12Z"/><path d="M8 11h8M8 14h5"/>', 14, 72, 2.4],
    ['<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>', 78, 80, .6],
    ['<path d="M4 10a8 8 0 0 1 16 0M7.5 10a4.5 4.5 0 0 1 9 0"/><circle cx="12" cy="10" r="1.2"/><path d="M12 11v10M9 21h6"/>', 46, 92, 1.8],
    ['<circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/><circle cx="18" cy="18" r="2.2"/><path d="M8 17l8-9M8.2 18H15.8M18 8.2v7.6"/>', 92, 12, 3],
  ];
  const ic = document.createElement('div'); ic.className = 'il il-icones'; ic.setAttribute('aria-hidden', 'true');
  ic.innerHTML = ICONES.map(([d, x, y, del], i) => `<svg viewBox="0 0 24 24" style="left:${x}vw;top:${y}vh;animation-delay:-${del}s;--v:${.2 + (i % 3) * .2}">${defs}<g fill="none" stroke="#dbe8ff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${d}</g></svg>`).join('');
  scene.append(ic);

  /* ---------- 4. Poignée de main ---------- */
  const amb = document.getElementById('ambassadors');
  if (amb) {
    amb.insertAdjacentHTML('afterbegin', `<svg class="il il-poignee" viewBox="0 0 240 160" aria-hidden="true">${defs}
      <g fill="none" stroke="#dbe8ff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <path class="il-trace" d="M4 64h46l22-14c8-5 18-5 26 0l22 12"/>
        <path class="il-trace" d="M236 64h-46l-24-12c-8-4-17-3-24 2L104 82c-6 5-6 13 0 17s13 3 18-1l20-15"/>
        <path class="il-trace" d="M50 64v44h14l30 24c6 5 14 4 18-1 4-5 3-12-2-16"/>
        <path class="il-trace" d="M94 108l22 18c5 4 12 3 16-2 4-5 3-12-2-15"/>
        <path class="il-trace" d="M116 102l20 16c5 4 12 3 15-2 4-5 3-11-2-15"/>
        <path class="il-trace" d="M138 96l14 11c5 4 11 3 15-2 3-5 2-11-3-14l-27-22"/>
        <path class="il-trace" d="M190 64v44h-16l-8-6"/>
        <path class="il-trace" d="M4 54v62M236 54v62"/>
      </g>
      <g class="il-eclats" stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M120 22v12M104 28l6 8M136 28l-6 8"/></g></svg>`);
  }

  /* ---------- 5. Contrat et signature ---------- */
  const bri = document.getElementById('brigade');
  if (bri) {
    bri.insertAdjacentHTML('afterbegin', `<svg class="il il-contrat" viewBox="0 0 220 280" aria-hidden="true">${defs}
      <g fill="none" stroke="#dbe8ff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M30 16h120l40 40v208H30Z" fill="rgba(9,22,48,.55)"/><path d="M150 16v40h40"/>
        <path d="M54 62h70M54 84h112M54 102h112M54 120h96M54 138h112M54 156h80" stroke-width="1.6" opacity=".7"/>
        <path d="M54 226h112" stroke-width="1.4" opacity=".6"/>
        <path class="il-signe" d="M60 220c8-22 14-30 18-26s-6 30-2 30 12-30 18-30-4 24 2 24 10-16 16-16 0 12 6 12 8-8 14-8 4 6 10 6"/>
        <circle cx="168" cy="186" r="20" stroke-width="2"/><path d="M158 186l7 7 13-14" stroke-width="2.6"/>
      </g>
      <g class="il-stylo"><path d="M0 0l8-30 10 3-8 30-8 4Z" fill="#cfe2ff" stroke="#0b2a66" stroke-width="1"/></g></svg>`);
  }

  // Boucle d'animation : tourne seulement pour les options cochées et visibles.
  let t0 = performance.now();
  function frame(t) {
    const dt = Math.min(64, t - t0); t0 = t;
    if (on('globe') && !globe.hidden) { if (!calme) rot += dt * .00018; dessineGlobe(); }
    if (on('reseau')) dessineReseau();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // Globe seulement sur l'accueil
  const home = document.getElementById('home');
  const vue = () => { globe.hidden = !(home && home.classList.contains('active')); };
  new MutationObserver(vue).observe(home || document.body, { attributes: true, attributeFilter: ['class'] }); vue();
})();
