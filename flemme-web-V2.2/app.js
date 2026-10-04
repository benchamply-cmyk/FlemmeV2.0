'use strict';
/* =========================================================================
   FLEMME — logique de la page (JavaScript, sans framework)
   Le site est une « application d'une seule page » : toutes les étapes
   (accueil, précisions, proposition, confirmation, facilitateur) sont dans
   index.html, et ce fichier affiche l'une ou l'autre selon le parcours.
   ========================================================================= */

/* ---------- 1. Données et réglages ---------- */

// content.js (généré par build.js à partir de content/*.json) remplit window.FLEMME.
// Si le fichier manque, on repart d'un contenu vide pour que la page ne plante pas.
const FL = window.FLEMME || { accueil: {}, categories: { groupes: [] }, contact: {} };
const CT = FL.contact || {};

// Dans l'application mobile (Capacitor), la page est servie depuis le téléphone :
// il faut alors envoyer les formulaires au vrai site.
const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const FORM_URL = NATIVE ? 'https://www.flemme.org/' : '/';
const FAIL = 'L’envoi a échoué. Réessaie dans un instant'
  + (CT.email ? ', ou écris-nous à ' + CT.email : '')
  + (CT.telephone ? ' / appelle le ' + CT.telephone : '') + '.';

// Raccourcis : $('#id') = un élément, $$('.classe') = un tableau d'éléments.
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
// Exécute f sans faire planter la page (ex. : sessionStorage bloqué en navigation privée).
const safe = f => { try { return f(); } catch (e) {} };
const SS = window.sessionStorage;

// Typographie française : espace insécable fine avant ? ! ; : pour éviter
// qu'un « ? » se retrouve seul en début de ligne.
const typo = t => String(t).replace(/ ([?!;:»])/g, ' $1').replace(/« /g, '« ');

/* ---------- 2. Fonctions propres à l'application mobile ---------- */

const plugin = n => window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins[n];
// Petite vibration (uniquement dans l'app).
const buzz = type => safe(() => {
  const h = plugin('Haptics');
  if (h) type === 'ok' ? h.notification({ type: 'SUCCESS' }) : h.impact({ style: 'LIGHT' });
});
if (NATIVE) {
  safe(() => {
    const sb = plugin('StatusBar');
    if (sb) { sb.setStyle({ style: 'DARK' }); sb.setBackgroundColor && sb.setBackgroundColor({ color: '#57d68d' }); }
  });
  const share = $('#shareBtn');
  share.hidden = false;
  share.addEventListener('click', () => safe(() =>
    plugin('Share').share({ title: 'Flemme', text: 'T’as la flemme ? Flemme s’en occupe.', url: 'https://www.flemme.org' })));
}

/* ---------- 3. Navigation entre les écrans ---------- */

const views = $$('.view');
let task = '', pref = 'auto', offer = null, ref = '', cat = null;

// Affiche l'écran `id` et cache les autres. `push` ajoute une entrée dans
// l'historique pour que le bouton Retour du navigateur fonctionne.
function show(id, push = true, focus = true) {
  if ((id === 'clarify' || id === 'offer') && !task) id = 'home'; // pas de demande = retour à l'accueil
  if (id === 'tracking' && !ref) id = 'home';
  if (!$('#' + id)) id = 'home';
  views.forEach(v => v.classList.toggle('active', v.id === id));
  if (push && location.hash !== '#' + id) history.pushState(null, '', '#' + id);
  scrollTo(0, 0);
  // Accessibilité : on place le focus sur le titre pour les lecteurs d'écran.
  if (focus) {
    const h = $('#' + id + ' h1, #' + id + ' h2');
    if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
  }
}

// Tous les boutons qui portent data-go="…" changent d'écran.
document.addEventListener('click', e => {
  const b = e.target.closest('[data-go]');
  if (!b) return;
  e.preventDefault();
  const go = b.dataset.go;
  if (go === 'facilitateur') { $('#facForm').hidden = false; $('#facOk').hidden = true; }
  if (go === 'reset') resetApp();
  else if (go === 'offer') buildOffer();
  else show(go);
});
addEventListener('popstate', () => show(location.hash.slice(1) || 'home', false));

/* ---------- 4. Saisie de la demande ---------- */

const taskInput = $('#task');
const setCounter = () => { $('#counter').textContent = taskInput.value.length + '/280'; };
const saveDraft = () => safe(() => SS.setItem('flemmeDraft', taskInput.value));

taskInput.addEventListener('input', () => { setCounter(); saveDraft(); });
$('#flemmeForm').addEventListener('submit', e => {
  e.preventDefault(); // on ne recharge pas la page : on passe à l'écran suivant
  task = taskInput.value.trim();
  if (!task) return;
  $('#taskTitle').textContent = '“' + task + '”';
  show('clarify');
});

/* ---------- 5. Catégories ---------- */

// Transforme la clé « mots_cles » en une expression régulière compilée une seule fois.
// Si un mot-clé saisi dans /admin est mal formé, on l'ignore au lieu de tout casser.
function keywordRegex(words) {
  if (!words || !words.length) return null;
  try { return new RegExp('(^|[^a-zà-ÿ])(' + words.join('|') + ')', 'i'); }
  catch (e) { console.warn('Mots-clés invalides ignorés :', words); return null; }
}

// Liste à plat de toutes les sous-catégories, triées par importance (étoiles).
const CATS = (FL.categories.groupes || [])
  .flatMap(g => (g.sous || []).map(c => ({
    id: c.id, e: c.emoji, n: c.nom, s: c.etoiles || 3, t: c.type || 'ia',
    w: c.taches || [], re: keywordRegex(c.mots_cles),
  })))
  .sort((a, b) => b.s - a.s);
const byId = id => CATS.find(c => c.id === id);
const GROUPS = (FL.categories.groupes || []).map(g => ({ id: g.id, e: g.emoji, n: g.nom, ids: (g.sous || []).map(c => c.id) }));

// Ordre de détection dans le texte libre : les catégories les plus précises d'abord
// (« résilier mon abonnement » doit tomber dans Abonnements avant Administratif).
const DETECT = ['abos', 'demenag', 'retours', 'factures', 'voyages', 'voiture', 'cadeaux', 'courses', 'repas', 'compar', 'eco', 'emails', 'travail', 'maison', 'tel', 'orga', 'appels', 'rdv', 'admin', 'recherche'];
const ORDER = [...DETECT.filter(byId), ...CATS.map(c => c.id).filter(i => !DETECT.includes(i))];

const grid = $('#catGrid'), subs = $('#catSubs'), tasksBox = $('#catTasks');

// Petite fabrique d'éléments : el('button', 'chip', 'Texte').
// textContent (et jamais innerHTML) empêche toute injection de code.
function el(tag, cls, text) {
  const x = document.createElement(tag);
  if (cls) x.className = cls;
  if (text != null) x.textContent = text;
  return x;
}

GROUPS.forEach(g => {
  const b = el('button', 'cat', g.e + ' ' + g.n);
  b.type = 'button'; b.dataset.g = g.id; b.setAttribute('aria-pressed', 'false');
  grid.append(b);
});

function setCat(id) {
  cat = id;
  $$('.sub').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
  const c = byId(id);
  $('#catTag').hidden = !c;
  if (c) $('#catTagTxt').textContent = c.e + ' ' + c.n;
}

function showGroup(id) {
  $$('#catGrid .cat').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.g === id)));
  subs.replaceChildren();
  tasksBox.hidden = true;
  const g = GROUPS.find(x => x.id === id);
  if (!g) { subs.hidden = true; return; }
  const list = el('div', 'sublist');
  list.setAttribute('role', 'group');
  list.setAttribute('aria-label', 'Sous-catégories : ' + g.n);
  g.ids.map(byId).filter(Boolean).forEach(c => {
    const b = el('button', 'sub', c.e + ' ' + c.n);
    b.type = 'button'; b.dataset.id = c.id; b.setAttribute('aria-pressed', String(cat === c.id));
    list.append(b);
  });
  subs.append(el('p', '', g.e + ' ' + g.n + ' : choisis une sous-catégorie'), list);
  subs.hidden = false;
}

function showTasks(c) {
  tasksBox.replaceChildren(el('p', '', 'Ce que les gens repoussent en « ' + c.n.toLowerCase() + ' » :'));
  c.w.forEach(w => {
    const chip = el('button', 'chip', w);
    chip.type = 'button';
    chip.addEventListener('click', () => {
      taskInput.value = w + ' ';
      setCounter(); saveDraft();
      taskInput.focus();
      taskInput.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    tasksBox.append(chip);
  });
  tasksBox.hidden = false;
}

grid.addEventListener('click', e => { const b = e.target.closest('.cat'); if (b) showGroup(b.dataset.g); });
subs.addEventListener('click', e => {
  const b = e.target.closest('.sub');
  if (!b) return;
  setCat(b.dataset.id);
  showTasks(byId(b.dataset.id));
});
$('#catClear').addEventListener('click', () => { setCat(null); tasksBox.hidden = true; });

/* ---------- 6. Précisions et proposition ---------- */

function setPref(v) {
  pref = v;
  $$('.choice').forEach(x => {
    const on = x.dataset.v === v;
    x.classList.toggle('selected', on);
    x.setAttribute('aria-pressed', String(on));
  });
}
$$('.choice').forEach(b => b.addEventListener('click', () => { setPref(b.dataset.v); buzz('light'); }));

// Trois façons de traiter une demande : IA seule, IA + humain, IA + personne sur place.
const TYPES = {
  ia: { route: ['🤖 Agent IA'], delay: fast => fast ? 'Quelques minutes' : '< 2 h', saved: '30 à 90 min' },
  h: { route: ['🤖 IA prépare', '🎧 Assistant humain'], delay: fast => fast ? 'Quelques heures' : '< 24 h', saved: '45 min à 2 h' },
  f: { route: ['🤖 IA organise', '🧑 Flemmeur sur place'], delay: fast => fast ? 'Aujourd’hui' : '24–72 h', saved: '1 à 3 h' },
};
const ON_SITE = keywordRegex(['nettoy', 'terrasse', 'récupér', 'déposer', 'porter']);

// Devine la catégorie et le type de prise en charge à partir du texte.
function classify(text) {
  const c = cat ? byId(cat) : byId(ORDER.find(id => { const x = byId(id); return x.re && x.re.test(text); }));
  const type = ON_SITE.test(text) ? 'f' : c ? c.t : 'ia';
  const T = TYPES[type] || TYPES.ia;
  return { cat: c, route: T.route, price: 'Sur devis', delay: T.delay(pref === 'fast'), saved: T.saved };
}

function buildOffer() {
  offer = classify(task);
  const r = $('#route');
  r.replaceChildren();
  offer.route.forEach((step, i) => { if (i) r.append(el('b', '', '→')); r.append(el('span', '', step)); });
  r.hidden = offer.route.length < 2; // pas de puce « Agent IA » quand l'IA traite seule
  $('#price').textContent = offer.price;
  $('#delay').textContent = offer.delay;
  $('#summary').textContent = task;
  $('#saved').textContent = offer.saved;
  $('#mLabel').textContent = 'Mission' + (offer.cat ? ' · ' + offer.cat.e + ' ' + offer.cat.n : '');
  show('offer');
}

/* ---------- 7. Envoi des formulaires (Netlify Forms) ---------- */

// Référence lisible et aléatoire, sans caractères ambigus (0/O, 1/I).
const genRef = () => 'FL-' + Array.from(crypto.getRandomValues(new Uint8Array(5)), n => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n % 32]).join('');

// Accepte un e-mail ou un numéro de téléphone (au moins 8 chiffres).
const isContact = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || v.replace(/\D/g, '').length >= 8;

// Envoie un formulaire comme le ferait le navigateur, mais sans quitter la page.
// Pendant l'envoi, le bouton est désactivé pour éviter les doubles clics.
async function sendForm(form, errBox, onSuccess) {
  const btn = form.querySelector('button[type=submit]');
  const label = btn.textContent;
  errBox.hidden = true;
  btn.disabled = true;
  btn.textContent = 'Envoi…';
  try {
    const r = await fetch(FORM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(new FormData(form)).toString(),
    });
    if (!r.ok) throw new Error(r.status);
    onSuccess();
    buzz('ok');
  } catch (x) {
    showError(errBox, FAIL);
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}
const showError = (box, msg) => { box.textContent = msg; box.hidden = false; };

$('#missionForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target, err = $('#err');
  if (!isContact(f.elements.contact.value.trim())) {
    showError(err, 'Indique une adresse e-mail ou un numéro de téléphone valide.');
    f.elements.contact.focus();
    return;
  }
  const n = genRef();
  const prefs = { auto: 'Le moins d’effort', cheap: 'Le moins cher', fast: 'Le plus rapide' };
  // On recopie le parcours dans les champs cachés pour le recevoir avec la demande.
  f.elements.task.value = task;
  f.elements.when.value = $('#when').value;
  f.elements.pref.value = prefs[pref];
  f.elements.route.value = offer.route.join(' → ');
  f.elements.price.value = offer.price;
  f.elements.ref.value = n;
  f.elements.category.value = offer.cat ? offer.cat.n : '';
  sendForm(f, err, () => {
    ref = n;
    f.reset();
    safe(() => SS.removeItem('flemmeDraft'));
    $('#missionRef').textContent = 'Mission ' + ref + ' · Nous analysons ta demande et t’envoyons un devis à l’adresse indiquée.';
    show('tracking');
  });
});

$('#facForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target, err = $('#facErr');
  if (!f.querySelector('input[name=mode]:checked')) {
    showError(err, 'Choisis au moins une façon d’aider (à distance ou sur place).');
    return;
  }
  sendForm(f, err, () => { f.reset(); f.hidden = true; $('#facOk').hidden = false; });
});

// Remet tout à zéro pour une nouvelle demande.
function resetApp() {
  setCat(null); showGroup(null); setPref('auto');
  task = ''; ref = ''; offer = null;
  taskInput.value = ''; $('#when').selectedIndex = 0;
  setCounter();
  safe(() => SS.removeItem('flemmeDraft'));
  show('home');
}

/* ---------- 8. Textes modifiables depuis /admin ---------- */

// « **mot** » devient <strong>mot</strong>, sans jamais utiliser innerHTML.
function rich(target, text) {
  typo(text).split('**').forEach((part, i) => {
    if (!part) return;
    target.append(i % 2 ? el('strong', '', part) : document.createTextNode(part));
  });
}

(() => {
  const A = FL.accueil || {};
  if (A.badge) $('.badge').textContent = A.badge;
  if (A.placeholder) taskInput.placeholder = A.placeholder;
  const blocks = $$('.promise > div');
  (A.blocs || []).slice(0, blocks.length).forEach((b, i) => {
    blocks[i].querySelector('b').textContent = b.titre;
    blocks[i].querySelector('span').textContent = b.texte;
  });
  if (A.phrases && A.phrases.length) {
    const list = $('#rotList');
    list.replaceChildren();
    A.phrases.forEach((t, i) => { const p = el('p', 'lead' + (i ? '' : ' on')); rich(p, t); list.append(p); });
  }
  const mail = $('footer a[href^="mailto:"]');
  if (mail && CT.email) mail.href = 'mailto:' + CT.email;
})();

/* ---------- 9. Phrases d'accroche qui défilent ---------- */

(() => {
  const phrases = $$('#rotList p'), pauseBtn = $('#rotPause'), nextBtn = $('#rotNext');
  if (phrases.length < 2) { $('.rotctl').hidden = true; return; }
  let i = 0, timer;
  // Si l'utilisateur a demandé moins d'animations dans son système, on démarre en pause.
  let paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const go = n => { phrases[i].classList.remove('on'); i = (n + phrases.length) % phrases.length; phrases[i].classList.add('on'); };
  const tick = () => { clearTimeout(timer); if (!paused) timer = setTimeout(() => { go(i + 1); tick(); }, 5000); };
  const setPaused = p => {
    paused = p;
    pauseBtn.textContent = p ? '▶' : '❚❚';
    pauseBtn.setAttribute('aria-label', p ? 'Relancer les phrases d’accroche' : 'Mettre en pause les phrases d’accroche');
    tick();
  };
  pauseBtn.addEventListener('click', () => setPaused(!paused));
  nextBtn.addEventListener('click', () => { go(i + 1); tick(); });
  // Économise la batterie : pas de défilement quand l'onglet est caché.
  document.addEventListener('visibilitychange', () => document.hidden ? clearTimeout(timer) : tick());
  setPaused(paused);
})();

/* ---------- 10. Démarrage ---------- */

const draft = safe(() => SS.getItem('flemmeDraft'));
if (draft) { taskInput.value = draft; setCounter(); }

// Un lien direct vers flemme.org/#facilitateur ouvre le formulaire Facilitateur.
const start = location.hash === '#facilitateur' ? 'facilitateur' : 'home';
history.replaceState(null, '', start === 'home' ? './' : '#' + start);
show(start, false, false);

// Service worker : permet au site de s'afficher même hors connexion.
if (!NATIVE && 'serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
