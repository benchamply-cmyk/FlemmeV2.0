'use strict';
// Sélecteur de variantes UI/UX de l'aperçu (PR29). N'est pas chargé sur le site.
(() => {
  const root = document.documentElement;
  const VARIANTES = {
    actuel: ['A · Actuel', 'Le design V4.100 tel quel : fond lavande, cartes à bord épais et ombres pleines, typo « Affiche condensée ».'],
    nuit: ['B · Nuit', 'Fond encre, texte clair, vert et violet lumineux. Plus « app », reposant le soir, fort impact du titre.'],
    affiche: ['C · Affiche', 'Bandeau de couleur plein écran derrière le titre, angles vifs, aplats violets et noirs. Le plus affirmé, façon affiche de rue.'],
    aere: ['D · Aéré', 'Bords fins, ombres douces, boutons arrondis, plus d’espace entre les blocs. Plus calme et rassurant, moins « bêta ».'],
    'nuit aere': ['E · B+D', 'Le mélange B + D : fond encre et accents lumineux de B, avec les bords fins, les ombres douces, les boutons arrondis et l’espace de D. Le mot « flemme » prend la couleur d’accent.'],
  };
  // Couleur d'accent : le vert de la marque ou une nuance de bleu.
  const ACCENTS = {
    vert: ['Vert', '#57d68d'], azur: ['Azur', '#4cc2ff'], electrique: ['Électrique', '#5b8cff'],
    cyan: ['Cyan', '#2fdde8'], lagon: ['Lagon', '#3fb6c8'], glacier: ['Glacier', '#a5ccff'],
    gamme: ['Gamme Glacier', 'linear-gradient(90deg, #e6f0ff, #a5ccff, #3572d0, #142c57)'],
  };
  const UX = {
    chips: 'Exemples cliquables sous le champ (un clic remplit la demande)',
    marquee: 'Bandeau défilant des services sous le formulaire',
    sticky: 'Bouton « Confier ma flemme » collant en bas de l’écran',
  };
  const store = { get: k => { try { return localStorage.getItem('vx-' + k); } catch { return null; } },
                  set: (k, v) => { try { localStorage.setItem('vx-' + k, v); } catch {} } };

  // Panneau
  const panel = document.createElement('details');
  panel.className = 'vx-panel'; panel.open = innerWidth > 700;
  panel.innerHTML = '<summary>Variantes UI/UX · PR29</summary><div class="vx-body"><div class="vx-seg" role="group" aria-label="Variante visuelle"></div><p class="vx-desc"></p><h4>Options UX (combinables)</h4></div>';
  const seg = panel.querySelector('.vx-seg'), desc = panel.querySelector('.vx-desc'), body = panel.querySelector('.vx-body');
  const setV = v => {
    if (v === 'actuel') root.removeAttribute('data-v'); else root.setAttribute('data-v', v);
    seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === v));
    desc.textContent = VARIANTES[v][1]; store.set('v', v);
  };
  for (const [v, [nom]] of Object.entries(VARIANTES)) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.v = v; b.textContent = nom;
    b.onclick = () => setV(v); seg.append(b);
  }
  const sw = document.createElement('div'); sw.className = 'vx-swatches'; sw.setAttribute('role', 'group'); sw.setAttribute('aria-label', 'Couleur d’accent');
  const setA = a => {
    if (a === 'vert') root.removeAttribute('data-accent'); else root.setAttribute('data-accent', a);
    sw.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.a === a)); store.set('accent', a);
  };
  for (const [a, [nom, hex]] of Object.entries(ACCENTS)) {
    const b = document.createElement('button'), i = document.createElement('i');
    b.type = 'button'; b.dataset.a = a; i.style.background = hex; b.append(i, nom); b.onclick = () => setA(a); sw.append(b);
  }
  // Gamme Glacier : chaque nuance et son rôle (au survol).
  const GAMME = [['50', '#f3f8ff', 'fonds doux, cartes au survol'], ['100', '#e6f0ff', 'fond de page'], ['200', '#cfe2ff', 'bordures douces, puces, bloc Brigade'],
    ['300', '#a5ccff', 'accent : « flemme », bouton principal, bloc Ambassadeurs'], ['400', '#7cb0f7', 'survol, pastille en direct'], ['500', '#5390ea', 'icônes, liens'],
    ['600', '#3572d0', 'focus, étiquettes, point du logo'], ['700', '#2758a8', '« Pas nous. », ombres pleines'], ['800', '#1e4280', 'bloc Brigade (nuit)'], ['900', '#142c57', 'bandeau défilant, fonds nuit']];
  const gm = document.createElement('div'); gm.className = 'vx-gamme';
  for (const [n, hex, role] of GAMME) { const c = document.createElement('span'); c.style.background = hex; c.dataset.r = n + ' · ' + hex + ' · ' + role; c.title = c.dataset.r; gm.append(c); }
  const hA = document.createElement('h4'); hA.textContent = 'Couleur d’accent';
  body.querySelector('h4').before(hA, sw, gm);
  setA(ACCENTS[store.get('accent')] ? store.get('accent') : 'vert');
  for (const [k, txt] of Object.entries(UX)) {
    const l = document.createElement('label'), c = document.createElement('input');
    c.type = 'checkbox'; c.checked = store.get('ux-' + k) === '1';
    const apply = () => { root.toggleAttribute('data-ux-' + k, c.checked); store.set('ux-' + k, c.checked ? '1' : '0'); };
    c.onchange = apply; apply(); l.append(c, txt); body.append(l);
  }
  document.body.append(panel);
  setV(VARIANTES[store.get('v')] ? store.get('v') : 'actuel');

  // Exemples cliquables : les exemples des services disponibles.
  const form = document.getElementById('flemmeForm'), task = document.getElementById('task');
  const groupes = ((window.FLEMME || {}).categories || {}).groupes || [];
  const exemples = groupes.flatMap(g => (g.sous || []).map(s => s.exemple)).filter(Boolean).slice(0, 5);
  const chips = document.createElement('ul'); chips.className = 'vx-chips'; chips.setAttribute('aria-label', 'Exemples');
  for (const ex of exemples) {
    const li = document.createElement('li'), b = document.createElement('button');
    b.type = 'button'; b.textContent = ex; b.onclick = () => { task.value = ex; task.focus(); };
    li.append(b); chips.append(li);
  }
  form.after(chips);

  // Bandeau défilant : les noms des services, en double pour boucler sans saut.
  const noms = groupes.flatMap(g => (g.sous || []).map(s => s.nom)).filter(Boolean);
  const mq = document.createElement('div'); mq.className = 'vx-marquee'; mq.setAttribute('aria-hidden', 'true');
  const track = document.createElement('div');
  for (const n of [...noms, ...noms]) { const s = document.createElement('span'); s.textContent = n; track.append(s); }
  mq.append(track); chips.after(mq);

  // Bouton collant : visible quand le champ principal n'est plus à l'écran.
  const sticky = document.createElement('div'); sticky.className = 'vx-sticky';
  sticky.innerHTML = '<button type="button" class="primary">Confier ma flemme →</button>';
  sticky.querySelector('button').onclick = () => { task.scrollIntoView({ behavior: 'smooth', block: 'center' }); task.focus({ preventScroll: true }); };
  document.body.append(sticky);
  new IntersectionObserver(([e]) => sticky.classList.toggle('show', !e.isIntersecting && document.getElementById('home').classList.contains('active'))).observe(form);
})();
