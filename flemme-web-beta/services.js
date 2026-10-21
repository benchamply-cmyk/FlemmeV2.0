'use strict';
/* =========================================================================
   FLEMME — page Services : détail des services déjà disponibles
   Les cartes viennent de content.js (content/categories.json). Chaque service
   mène à l'accueil avec ce service déjà choisi (./?service=…), qui ouvre le
   formulaire de demande.
   ========================================================================= */
(() => {
const FL = window.FLEMME || { categories: { groupes: [] } };
// Mêmes familles que sur l'accueil (app.js) : le reste du catalogue n'est pas encore proposé.
const DISPO = new Set(['boulot', 'rdv', 'achats']);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
const SVGNS = 'http://www.w3.org/2000/svg';
function icon(name) {
  const svg = document.createElementNS(SVGNS, 'svg'), use = document.createElementNS(SVGNS, 'use');
  svg.setAttribute('class', 'ico');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  use.setAttribute('href', 'icons.svg#i-' + (name || 'sparkles'));
  svg.append(use);
  return svg;
}
const grid = document.getElementById('svcGrid');
if (!grid) return;
(FL.categories.groupes || []).filter(g => DISPO.has(g.id)).forEach(g => {
  const card = el('article', 'svc-card');
  card.id = g.id;
  const head = el('div', 'svc-card-head');
  head.append(icon(g.icone), el('h3', '', g.nom));
  card.append(head);
  if (g.accroche) card.append(el('p', 'svc-card-tag', g.accroche));
  const list = el('ul', 'svc-card-list');
  (g.sous || []).forEach(c => {
    const li = el('li', ''), a = el('a', '');
    a.href = './?service=' + encodeURIComponent(c.id);
    a.append(icon(c.icone), el('span', '', c.nom));
    li.append(a);
    list.append(li);
  });
  card.append(list);
  if (g.resultat) { const r = el('p', 'svc-result'); r.append(el('b', '', 'Résultat livré : '), document.createTextNode(g.resultat)); card.append(r); }
  grid.append(card);
});
// Arrivée par un lien services.html#boulot : la carte est créée après le chargement, on y descend ensuite.
const target = location.hash && document.getElementById(location.hash.slice(1));
if (target) target.scrollIntoView();
})();
