'use strict';
// Sélecteur de variantes UI/UX de l'aperçu (PR29). N'est pas chargé sur le site.
(() => {
  const root = document.documentElement;
  const VARIANTES = {
    actuel: ['A · Actuel', 'Le design V4.100 tel quel : fond lavande, cartes à bord épais et ombres pleines, typo « Affiche condensée ».'],
    nuit: ['B · Nuit', 'Fond encre, texte clair, vert et violet lumineux. Plus « app », reposant le soir, fort impact du titre.'],
    affiche: ['C · Affiche', 'Bandeau vert plein écran derrière le titre, angles vifs, aplats violets et noirs. Le plus affirmé, façon affiche de rue.'],
    aere: ['D · Aéré', 'Bords fins, ombres douces, boutons arrondis, plus d’espace entre les blocs. Plus calme et rassurant, moins « bêta ».'],
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
