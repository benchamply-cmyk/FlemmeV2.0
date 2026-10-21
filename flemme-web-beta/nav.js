'use strict';
/* =========================================================================
   FLEMME — menu, en-tête et recherche (toutes les pages publiques)
   Le HTML de chaque page contient déjà les liens des onglets (lisibles sans
   JavaScript) ; ce fichier ajoute les menus déroulants (ordinateur), le menu burger
   (mobile), l'en-tête collant, le bouton « Confier ma flemme » sur mobile et la recherche.
   Un seul endroit à modifier pour changer l'arborescence : MENU ci-dessous.
   ========================================================================= */
(() => {

/* ---------- 1. Arborescence ---------- */

// Chaque onglet mène à sa page ; « items » sont ses entrées dans le menu.
// « mots » sert seulement à la recherche (synonymes que le visiteur pourrait taper).
const MENU = [
  { href: 'services.html', label: 'Services', items: [
    { href: 'services.html#disponibles', label: 'Déjà disponibles', mots: 'artisan devis rendez-vous achats main-d’œuvre' },
    { href: 'services.html#a-venir', label: 'Bientôt chez Flemme', mots: 'vacances apprentissage réseaux sociaux logistique standard téléphonique' },
    { href: 'services.html#proposer', label: 'Proposer une flemme', mots: 'idée suggestion' },
  ] },
  { href: 'demarche.html', label: 'Notre démarche', items: [
    { href: 'demarche.html#pourquoi', label: 'Pourquoi Flemme', mots: 'mission concept' },
    { href: 'demarche.html#comment', label: 'Comment ça marche', mots: 'étapes devis accord' },
    { href: 'demarche.html#engagements', label: 'Nos engagements', mots: 'prix confiance données' },
    { href: 'demarche.html#beta', label: 'Une bêta construite avec toi', mots: 'jetons gratuit' },
  ] },
  { href: 'ambassadeurs.html', label: 'Ambassadeurs', items: [
    { href: 'ambassadeurs.html#principe', label: 'Le principe', mots: 'contribuer' },
    { href: 'ambassadeurs.html#role', label: 'Ton rôle', mots: 'parrainage' },
    { href: 'ambassadeurs.html#devenir', label: 'Devenir ambassadeur', mots: 'inscription' },
  ] },
  { href: 'rejoindre.html', label: 'La Brigade', items: [
    { href: 'rejoindre.html#pourquoi', label: 'Libre, payé, épaulé', mots: 'brigadier facilitateur indépendant' },
    { href: 'rejoindre.html#comment', label: 'Comment ça marche', mots: 'candidature intervention' },
    { href: 'rejoindre.html#remuneration', label: 'Rémunération', mots: 'paiement pourcentage argent' },
    { href: 'rejoindre.html#grades', label: 'Les grades', mots: 'recrue brigadier-chef' },
    { href: 'rejoindre.html#faq', label: 'Questions fréquentes', mots: 'faq' },
    { href: 'rejoindre.html#postuler', label: 'Je m’engage', mots: 'postuler candidater recrutement' },
  ] },
];
// Pages hors menu, trouvables par la recherche.
const AUTRES = [
  { href: './', label: 'Accueil', mots: 'confier demande flemme' },
  { href: 'espace.html', label: 'Mon espace', mots: 'compte connexion suivi demandes' },
  { href: 'mentions.html', label: 'Mentions légales', mots: 'éditeur hébergeur' },
  { href: 'confidentialite.html', label: 'Confidentialité', mots: 'données rgpd cookies' },
];

const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
const SVGNS = 'http://www.w3.org/2000/svg';
function icon(name) {
  const svg = document.createElementNS(SVGNS, 'svg'), use = document.createElementNS(SVGNS, 'use');
  svg.setAttribute('class', 'ico');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  use.setAttribute('href', 'icons.svg#i-' + name);
  svg.append(use);
  return svg;
}
const page = (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '') + '.html';

/* ---------- 2. Menus déroulants ---------- */

// Ordinateur : onglets avec menus déroulants. Au survol (souris) le menu s'ouvre en CSS ; la flèche l'ouvre au clic, au toucher et au clavier.
const nav = document.querySelector('.site-nav');
const items = [];
const closeAll = except => items.forEach(it => { if (it !== except) { it.classList.remove('open'); it.querySelector('.nav-toggle').setAttribute('aria-expanded', 'false'); } });
if (nav) {
  MENU.forEach((m, i) => {
    const link = nav.querySelector('a[href="' + m.href + '"]');
    if (!link) return;
    if (page === m.href) link.setAttribute('aria-current', 'page');
    const item = el('div', 'nav-item');
    link.replaceWith(item);
    const toggle = el('button', 'nav-toggle');
    toggle.type = 'button';
    toggle.append(icon('chevron-down'));
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'navSub' + i);
    toggle.setAttribute('aria-label', 'Ouvrir le menu ' + m.label);
    const sub = el('ul', 'nav-sub');
    sub.id = 'navSub' + i;
    m.items.forEach(s => { const li = el('li', ''); const a = el('a', '', s.label); a.href = s.href; li.append(a); sub.append(li); });
    item.append(link, toggle, sub);
    toggle.addEventListener('click', () => {
      const open = !item.classList.contains('open');
      closeAll(item);
      item.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
      if (open) sub.querySelector('a').focus();
    });
    item.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') closeAll(); });
    items.push(item);
  });
  const home = nav.querySelector('a[href="./"]');
  if (home && page === 'index.html') home.setAttribute('aria-current', 'page');
  document.addEventListener('click', e => { if (!e.target.closest('.nav-item')) closeAll(); });
}

/* ---------- 3. Menu burger (mobile et petits écrans) ---------- */

// Sous 1100 px, les onglets sont masqués (CSS) et le bouton « Menu » ouvre un panneau :
// deux colonnes sur tablette, une liste plein écran sur mobile.
const right = document.querySelector('.head-right');
if (!nav || !right) return;

const menuBtn = el('button', 'menu-btn');
menuBtn.type = 'button';
menuBtn.setAttribute('aria-haspopup', 'dialog');
menuBtn.setAttribute('aria-expanded', 'false');
const bars = el('span', 'menu-bars');
bars.setAttribute('aria-hidden', 'true');
bars.append(el('i', ''), el('i', ''), el('i', ''));
menuBtn.append(bars, el('span', 'menu-btn-txt', 'Menu'));
right.append(menuBtn);

const menu = el('dialog', 'menu-dlg');
menu.setAttribute('aria-label', 'Menu du site');
const menuHead = el('div', 'menu-head');
const menuClose = el('button', 'search-close');
menuClose.type = 'button';
menuClose.setAttribute('aria-label', 'Fermer le menu');
menuClose.append(icon('x'));
const homeLink = el('a', 'menu-home', 'Accueil');
homeLink.href = './';
if (page === 'index.html') homeLink.setAttribute('aria-current', 'page');
menuHead.append(homeLink, menuClose);
const cols = el('div', 'menu-cols');
MENU.forEach(m => {
  const col = el('section', 'menu-col');
  const title = el('a', 'menu-title', m.label);
  title.href = m.href;
  if (page === m.href) title.setAttribute('aria-current', 'page');
  const ul = el('ul', '');
  m.items.forEach(s => { const li = el('li', ''); const a = el('a', '', s.label); a.href = s.href; li.append(a); ul.append(li); });
  col.append(title, ul);
  cols.append(col);
});
const menuFoot = el('div', 'menu-foot');
const menuCta = el('a', 'primary btn-link', 'Confier ma flemme →');
menuCta.href = './';
const menuSearch = el('button', 'secondary');
menuSearch.type = 'button';
menuSearch.append(icon('search'), document.createTextNode(' Rechercher'));
menuFoot.append(menuCta, menuSearch);
menu.append(menuHead, cols, menuFoot);
document.body.append(menu);

const openMenu = () => { menu.showModal(); menuBtn.setAttribute('aria-expanded', 'true'); };
menuBtn.addEventListener('click', openMenu);
menuClose.addEventListener('click', () => menu.close());
menu.addEventListener('close', () => menuBtn.setAttribute('aria-expanded', 'false'));
menu.addEventListener('click', e => { if (e.target === menu || e.target.closest('a')) menu.close(); });

/* ---------- 4. En-tête collant et bouton « Confier ma flemme » ---------- */

// L'en-tête reste en haut de l'écran ; il prend un fond dès qu'on a défilé.
const header = document.querySelector('header');
// Mobile : bouton collant en bas de l'écran. Sur l'accueil, il amène au champ de saisie
// et disparaît quand ce champ est visible ou pendant le formulaire de demande.
const stickyCta = el('a', 'sticky-cta primary btn-link', 'Confier ma flemme →');
stickyCta.href = './';
document.body.append(stickyCta);
const ask = document.querySelector('#flemmeForm');
const homeView = document.getElementById('home');
let askVisible = false;
if (ask) {
  stickyCta.addEventListener('click', e => {
    e.preventDefault();
    const task = document.getElementById('task');
    task.scrollIntoView({ behavior: 'smooth', block: 'center' });
    task.focus({ preventScroll: true });
  });
  new IntersectionObserver(([entry]) => { askVisible = entry.isIntersecting; onScroll(); }).observe(ask);
}
function onScroll() {
  if (header) header.classList.toggle('scrolled', scrollY > 8);
  const hide = ask ? (askVisible || !homeView.classList.contains('active')) : false;
  stickyCta.classList.toggle('off', hide);
}
addEventListener('scroll', onScroll, { passive: true });
addEventListener('popstate', onScroll);
document.addEventListener('click', () => setTimeout(onScroll));
onScroll();

/* ---------- 5. Recherche ---------- */

// Index : onglets, entrées des menus, autres pages et tous les services de content.js.
const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ');
const INDEX = [];
const add = (label, href, where, mots) => INDEX.push({ label, href, where, key: norm(label + ' ' + (mots || '')) });
MENU.forEach(m => { add(m.label, m.href, 'Page'); m.items.forEach(s => add(s.label, s.href, m.label, s.mots)); });
AUTRES.forEach(p => add(p.label, p.href, 'Page', p.mots));
const FL = window.FLEMME || {};
// Mêmes familles que l'accueil (app.js) et la page Services (services.js).
const DISPO = new Set(['boulot', 'rdv', 'achats']);
((FL.categories || {}).groupes || []).filter(g => DISPO.has(g.id)).forEach(g => {
  add(g.nom, 'services.html#' + g.id, 'Service', g.accroche);
  (g.sous || []).forEach(c => add(c.nom, './?service=' + encodeURIComponent(c.id), 'Confier cette flemme', (c.mots_cles || []).join(' ') + ' ' + (c.exemple || '')));
});

const btn = el('button', 'search-btn');
btn.type = 'button';
btn.setAttribute('aria-label', 'Rechercher sur le site');
btn.setAttribute('aria-keyshortcuts', '/');
btn.append(icon('search'), el('span', 'search-btn-txt', 'Rechercher'));
right.prepend(btn);

const dlg = el('dialog', 'search-dlg');
dlg.setAttribute('aria-label', 'Recherche');
const form = el('form', 'search-form');
form.method = 'dialog';
const input = el('input', '');
input.type = 'search';
input.placeholder = 'Un service, une page… (ex. plombier, rémunération)';
input.setAttribute('aria-label', 'Rechercher');
input.autocomplete = 'off';
const close = el('button', 'search-close');
close.type = 'submit';
close.setAttribute('aria-label', 'Fermer la recherche');
close.append(icon('x'));
form.append(icon('search'), input, close);
const list = el('ul', 'search-results');
list.setAttribute('role', 'list');
const empty = el('p', 'search-empty', 'Rien trouvé. Raconte directement ta flemme sur l’accueil, on s’en occupe.');
empty.hidden = true;
dlg.append(form, list, empty);
document.body.append(dlg);

function search() {
  const words = norm(input.value).split(/\s+/).filter(Boolean);
  list.replaceChildren();
  const hits = words.length ? INDEX.filter(r => words.every(w => r.key.includes(w))).slice(0, 12) : INDEX.filter(r => r.where === 'Page');
  hits.forEach(r => {
    const li = el('li', ''), a = el('a', '');
    a.href = r.href;
    a.append(el('span', 'search-where', r.where), el('span', 'search-label', r.label));
    li.append(a);
    list.append(li);
  });
  empty.hidden = hits.length > 0;
}
const open = () => { input.value = ''; search(); dlg.showModal(); input.focus(); };
btn.addEventListener('click', open);
menuSearch.addEventListener('click', () => { menu.close(); open(); });
input.addEventListener('input', search);
// Entrée : ouvre le premier résultat.
input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const a = list.querySelector('a'); if (a) location.href = a.href; } });
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
list.addEventListener('click', e => { if (e.target.closest('a')) dlg.close(); });
// « / » ou Ctrl+K ouvrent la recherche, sauf pendant la saisie dans un champ.
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeAll();
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
  if ((e.key === '/' && !typing) || (e.key === 'k' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); if (!dlg.open) open(); }
});

})();
