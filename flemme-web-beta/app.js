'use strict';
/* =========================================================================
   FLEMME — logique de la page (JavaScript, sans framework)
   Le site est une « application d'une seule page » : toutes les étapes
   (accueil, demande, confirmation, facilitateur) sont dans
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
    plugin('Share').share({ title: 'Flemme', text: 'Aide-nous à comprendre les besoins du quotidien.', url: 'https://www.flemme.org' })));
}

if (!NATIVE) {
  const share = $('#shareBtn');
  share.hidden = false;
  share.addEventListener('click', async () => {
    const data = { title: 'Flemme · Bêta publique', text: 'Aide-nous à comprendre les besoins du quotidien.', url: 'https://www.flemme.org/' };
    try {
      if (navigator.share) await navigator.share(data);
      else { await navigator.clipboard.writeText(data.url); share.textContent = 'Lien copié !'; }
    } catch (err) {
      if (err.name !== 'AbortError') share.textContent = 'Partage ce lien : https://www.flemme.org/';
    }
  });
}

/* ---------- 3. Navigation entre les écrans ---------- */

const views = $$('.view');
let task = '', offer = null, ref = '';

// Affiche l'écran `id` et cache les autres. `push` ajoute une entrée dans
// l'historique pour que le bouton Retour du navigateur fonctionne.
function show(id, push = true, focus = true) {
  if (id === 'offer' && !task) id = 'home'; // pas de demande = retour à l'accueil
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
  buildOffer();
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
    id: c.id, e: c.emoji, n: c.nom, s: c.etoiles || 3, re: keywordRegex(c.mots_cles),
  })))
  .sort((a, b) => b.s - a.s);
const byId = id => CATS.find(c => c.id === id);

// Ordre de détection dans le texte libre : les catégories les plus précises d'abord
// (« résilier mon abonnement » doit tomber dans Abonnements avant Administratif).
const DETECT = ['abos', 'demenag', 'retours', 'factures', 'voyages', 'voiture', 'cadeaux', 'courses', 'repas', 'compar', 'eco', 'emails', 'travail', 'maison', 'tel', 'orga', 'appels', 'rdv', 'admin', 'recherche'];
const ORDER = [...DETECT.filter(byId), ...CATS.map(c => c.id).filter(i => !DETECT.includes(i))];

/* ---------- 6. Exemples et proposition ---------- */

$$('[data-example]').forEach(b => b.addEventListener('click', () => { taskInput.value = b.dataset.example; setCounter(); saveDraft(); taskInput.focus(); }));
$$('[data-focus-task]').forEach(b => b.addEventListener('click', () => { taskInput.scrollIntoView({ behavior: 'smooth', block: 'center' }); taskInput.focus({ preventScroll: true }); }));
$('#ambassadorBtn').addEventListener('click', () => { $('#missionForm input[name=ambassadeur]').checked = true; taskInput.scrollIntoView({ behavior: 'smooth', block: 'center' }); taskInput.focus({ preventScroll: true }); });

// La catégorie sert à analyser les besoins, sans promettre une prestation.
function classify(text) {
  return { cat: byId(ORDER.find(id => { const x = byId(id); return x.re && x.re.test(text); })) };
}

function buildOffer() {
  offer = classify(task);
  $('#summary').textContent = task;
  $('#mLabel').textContent = 'Ton besoin' + (offer.cat ? ' · ' + offer.cat.e + ' ' + offer.cat.n : '');
  show('offer');
}

/* ---------- 7. Envoi des formulaires (Netlify Forms) ---------- */

// Référence lisible et aléatoire, sans caractères ambigus (0/O, 1/I).
const genRef = () => 'FL-' + Array.from(crypto.getRandomValues(new Uint8Array(5)), n => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n % 32]).join('');

// Accepte un e-mail ou un numéro de téléphone (au moins 8 chiffres).
const isEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const isContact = v => isEmail(v) || v.replace(/\D/g, '').length >= 8;

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
  const contact = f.elements.contact.value.trim();
  const n = genRef();
  // On recopie le parcours dans les champs cachés pour le recevoir avec la demande.
  f.elements.task.value = task;
  f.elements.ref.value = n;
  f.elements.category.value = offer.cat ? offer.cat.n : '';
  // Copie pour l'espace personnel (sb.js), lue avant f.reset().
  const copy = {
    ref: n, besoin: task, email: isEmail(contact) ? contact.toLowerCase() : null,
    categorie: f.elements.category.value || null, echeance: f.elements.echeance.value || null,
    aide_attendue: f.elements.aide_attendue.value.trim() || null, frequence: f.elements.frequence.value || null,
    ambassadeur: f.elements.ambassadeur.checked,
  };
  sendForm(f, err, () => {
    ref = n;
    trackRequest(copy);
    f.reset();
    safe(() => SS.removeItem('flemmeDraft'));
    $('#missionRef').textContent = 'Demande ' + ref + ' · Nous te recontacterons pour te dire si nous pouvons t’aider.';
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

/* ---------- 8. Espace personnel (Supabase, voir sb.js) ---------- */

// Enregistre la demande pour qu'elle apparaisse dans l'espace, puis propose de la suivre.
// Netlify Forms reste la source principale : un échec ici n'empêche rien.
function trackRequest(copy) {
  const box = $('#trackBox');
  box.hidden = true;
  if (!window.SB || !SB.ready) return;
  const s = SB.current();
  if (!s && !copy.email) return; // contact par téléphone : rien à rattacher à un compte
  SB.deposer(copy).then(() => {
    const link = $('#trackLink');
    if (s) {
      $('#trackTxt').textContent = 'Retrouve cette demande et son avancement dans ton espace.';
      link.href = 'espace.html';
    } else {
      $('#trackTxt').textContent = 'Crée ton espace avec ' + copy.email + ' pour suivre l’avancement de ta demande. Pas de mot de passe : on t’envoie un lien.';
      link.href = 'espace.html?email=' + encodeURIComponent(copy.email);
    }
    box.hidden = false;
  }).catch(e => console.warn('Espace personnel : demande non enregistrée', e));
}

if (window.SB && SB.ready) {
  $('#spaceLink').hidden = false;
  // Connecté : on propose son e-mail comme contact.
  const s = SB.current();
  if (s && s.email) $('#contact').defaultValue = s.email; // reste après chaque envoi (reset)
}

// Remet tout à zéro pour une nouvelle demande.
function resetApp() {
  task = ''; ref = ''; offer = null;
  taskInput.value = ''; $('#missionForm').reset();
  setCounter();
  safe(() => SS.removeItem('flemmeDraft'));
  show('home');
}

/* ---------- 9. Textes modifiables depuis /admin ---------- */

(() => {
  const A = FL.accueil || {};
  if (A.badge) $('.badge').textContent = A.badge;
  // Textes grisés du champ : le premier s'affiche, puis ils défilent toutes les 3 s
  // tant que le champ est vide (sauf si l'utilisateur a demandé moins d'animations).
  const hints = (A.placeholders || []).filter(Boolean);
  if (hints.length) taskInput.placeholder = hints[0];
  if (hints.length > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    let i = 0;
    setInterval(() => {
      if (document.hidden || taskInput.value) return;
      i = (i + 1) % hints.length;
      taskInput.placeholder = hints[i];
    }, 3000);
  }
  const mail = $('footer a[href^="mailto:"]');
  if (mail && CT.email) mail.href = 'mailto:' + CT.email;
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
