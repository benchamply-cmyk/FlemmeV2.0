'use strict';
/* =========================================================================
   FLEMME — logique de la page (JavaScript, sans framework)
   Le site est une « application d'une seule page » : toutes les étapes
   (accueil, demande, confirmation) sont dans
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
  if (go === 'reset') resetApp();
  else show(go);
});
addEventListener('popstate', () => show(location.hash.slice(1) || 'home', false));

/* ---------- 4. Saisie de la demande ---------- */

const taskInput = $('#task');
const saveDraft = () => safe(() => SS.setItem('flemmeDraft', taskInput.value));

taskInput.addEventListener('input', saveDraft);
$('#flemmeForm').addEventListener('submit', e => {
  e.preventDefault(); // on ne recharge pas la page : on passe à l'écran suivant
  // Un enregistrement en cours est d'abord arrêté, puis joint à la demande.
  if (recorder) { afterVoice = () => $('#flemmeForm').requestSubmit(); recorder.stop(); return; }
  task = taskInput.value.trim();
  if (!task && !voiceFile) {
    homeVoiceMsg.textContent = 'Écris ta flemme ou laisse un message vocal.';
    taskInput.focus();
    return;
  }
  if (task) return buildOffer();
  task = 'Message vocal';
  buildOffer(null);
  $('#summary').textContent = 'Demande en message vocal';
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
    id: c.id, n: c.nom, s: c.etoiles || 3, re: keywordRegex(c.mots_cles),
  })))
  .sort((a, b) => b.s - a.s);
const byId = id => CATS.find(c => c.id === id);

// Ordre de détection dans le texte libre : les résultats les plus précis d'abord
// (« vendre sur Vinted » avant « estimer un prix », « dermatologue » avant « médecin »,
// les résumés avant « synthèse », « recherche » en tout dernier car très large). Ceux absents de la liste passent après.
const DETECT = ['location', 'leasing', 'resiliation', 'vinted', 'leboncoin', 'estimation', 'politique', 'specialiste', 'rdvbanque', 'rdvadmin', 'actu', 'livre', 'film', 'histoire', 'synthese', 'serviceclient', 'devis', 'menage', 'jardinier', 'demenagement', 'cuisinier', 'artisan', 'vols', 'trains', 'hotels', 'activites', 'itineraire', 'programme', 'voiture', 'cadeau', 'prix', 'langue', 'prof', 'fiches', 'devoirs', 'cours', 'informatique', 'sav', 'reclamation', 'assurances', 'banque', 'documents', 'formulaires', 'medecin', 'recherche'];
const ORDER = [...DETECT.filter(byId), ...CATS.map(c => c.id).filter(i => !DETECT.includes(i))];

/* ---------- 6. Exemples et proposition ---------- */

// Un clic sur une section ou un service mène directement au formulaire de demande (#offer),
// avec ce choix comme besoin et comme catégorie.
function startOffer(label, cat) {
  task = label;
  buildOffer(cat);
  buzz();
}
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
// Icône au trait (sprite icons.svg, icônes Lucide) : monochrome, prend la couleur du texte.
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
const ideaButton = (cls, iconName, label, onClick) => {
  const b = el('button', cls);
  b.type = 'button';
  b.append(icon(iconName), el('span', '', label));
  b.addEventListener('click', onClick);
  return b;
};

// Les 7 résultats concrets (content/categories.json) : une carte chacun. Le détail des
// services s'ouvre en menu déroulant au survol de la souris ou au clic (au toucher sur mobile).
const cats = [];
const closeCats = except => cats.forEach(c => { if (c !== except) { c.classList.remove('open'); c.querySelector('.cat-toggle').setAttribute('aria-expanded', 'false'); } });
(FL.categories.groupes || []).forEach((g, i) => {
  const groupCat = { n: g.nom };
  const card = el('div', 'cat');
  // La carte entière mène au formulaire ; la flèche ouvre le détail (utile sur mobile).
  const head = el('button', 'cat-head');
  head.type = 'button';
  head.append(icon(g.icone), el('span', 'cat-title', g.nom));
  if (g.accroche) head.append(el('span', 'cat-tag', g.accroche));
  head.addEventListener('click', () => startOffer(g.nom, groupCat));
  const toggle = el('button', 'cat-toggle');
  toggle.type = 'button';
  toggle.append(icon('chevron-down'));
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'catMenu' + i);
  toggle.setAttribute('aria-label', 'Voir le détail : ' + g.nom);
  const menu = el('div', 'cat-menu');
  menu.id = 'catMenu' + i;
  const list = el('ul', '');
  const item = (iconName, label, onClick) => { const li = el('li', ''); li.append(ideaButton('svc-item', iconName, label, onClick)); list.append(li); };
  (g.sous || []).forEach(c => item(c.icone, c.nom, () => startOffer(c.nom, byId(c.id))));
  // Service « Autre » ajouté automatiquement à chaque section.
  item('plus', 'Autre', () => startOffer('Autre demande', groupCat));
  menu.append(list);
  if (g.resultat) { const r = el('p', 'svc-result'); r.append(el('b', '', 'Résultat livré : '), document.createTextNode(g.resultat)); menu.append(r); }
  const top = el('div', 'cat-top');
  top.append(head, toggle);
  card.append(top, menu);
  toggle.addEventListener('click', () => {
    const open = !card.classList.contains('open');
    closeCats(card);
    card.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
  });
  card.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') closeCats(); });
  cats.push(card);
  $('#catGrid').append(card);
});
document.addEventListener('click', e => { if (!e.target.closest('.cat')) closeCats(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCats(); });
$$('[data-focus-task]').forEach(b => b.addEventListener('click', () => { taskInput.scrollIntoView({ behavior: 'smooth', block: 'center' }); taskInput.focus({ preventScroll: true }); }));
$('#ambassadorBtn').addEventListener('click', () => { $('#missionForm input[name=ambassadeur]').checked = true; taskInput.scrollIntoView({ behavior: 'smooth', block: 'center' }); taskInput.focus({ preventScroll: true }); });

// La catégorie sert à analyser les besoins, sans promettre une prestation.
function classify(text) {
  return { cat: byId(ORDER.find(id => { const x = byId(id); return x.re && x.re.test(text); })) };
}

// `cat` est fourni quand on vient d'une section ou d'un service ; sinon on le déduit du texte libre.
function buildOffer(cat) {
  offer = { cat: cat !== undefined ? cat : classify(task).cat };
  $('#summary').textContent = task;
  $('#mLabel').textContent = 'Ton besoin' + (offer.cat && offer.cat.n !== task ? ' · ' + offer.cat.n : '');
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
// `extra(data)` peut compléter les données envoyées (ex. : le message vocal enregistré).
async function sendForm(form, errBox, onSuccess, extra) {
  const btn = form.querySelector('button[type=submit]');
  const label = btn.textContent;
  errBox.hidden = true;
  btn.disabled = true;
  btn.textContent = 'Envoi…';
  try {
    const data = new FormData(form);
    if (extra) extra(data);
    // Avec des fichiers (enctype multipart), le FormData part tel quel : le navigateur
    // choisit lui-même l'en-tête Content-Type.
    const r = await fetch(FORM_URL, form.enctype === 'multipart/form-data'
      ? { method: 'POST', body: data }
      : { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(data).toString() });
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

/* ---------- 7 bis. Pièces jointes, message vocal et dictée ---------- */

// Netlify Forms accepte un fichier par champ et 8 Mo par envoi : 3 champs « fichier »
// (le 2e et le 3e apparaissent à la demande) et un champ « vocal ».
const MAX_UPLOAD = 8 * 1024 * 1024;
const slots = $$('.file-slot');
let voiceFile = null;
const chosenFiles = () => $$('#missionForm input[type=file]:not([name=vocal])').map(i => i.files[0]).filter(Boolean);
$('#addFile').addEventListener('click', e => {
  const next = slots.find(s => s.hidden);
  if (next) { next.hidden = false; next.querySelector('input').focus(); }
  if (!slots.some(s => s.hidden)) e.currentTarget.hidden = true;
});
function resetAttachments() {
  slots.forEach((s, i) => { s.hidden = i > 0; });
  $('#addFile').hidden = false;
  clearVoice();
}

// Message vocal : enregistré dans le navigateur (MediaRecorder), 3 minutes au plus.
// On peut l'enregistrer dès l'accueil (à la place du texte) ou dans le formulaire :
// c'est le même message, joint à la demande et réécoutable dans le formulaire.
const voiceBtn = $('#voiceBtn'), voiceTimer = $('#voiceTimer'), voiceAudio = $('#voiceAudio');
const homeVoiceBtn = $('#homeVoiceBtn'), homeVoiceMsg = $('#homeVoiceMsg');
const VOICE_UI = {
  form: { btn: voiceBtn, out: voiceTimer, idle: 'Enregistrer un message vocal' },
  home: { btn: homeVoiceBtn, out: homeVoiceMsg, idle: 'Message vocal' },
};
let recorder = null, voiceTick = null, afterVoice = null;
const VOICE_MAX = 180;
const mmss = t => Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
const setLabel = (btn, txt) => { btn.querySelector('span').textContent = txt; };
function clearVoice() {
  voiceFile = null;
  if (voiceAudio.src) { URL.revokeObjectURL(voiceAudio.src); voiceAudio.removeAttribute('src'); }
  $('#voicePreview').hidden = true;
  voiceBtn.hidden = false;
  setLabel(homeVoiceBtn, VOICE_UI.home.idle);
  homeVoiceMsg.textContent = '';
}
async function startVoice(where) {
  const ui = VOICE_UI[where];
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (e) {
    const txt = 'Impossible d’accéder au micro. Vérifie l’autorisation de ton navigateur.';
    if (where === 'home') homeVoiceMsg.textContent = txt; else showError($('#err'), txt);
    return;
  }
  const chunks = [];
  let t = 0;
  recorder = new MediaRecorder(stream);
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  recorder.onstop = () => {
    stream.getTracks().forEach(tr => tr.stop());
    clearInterval(voiceTick);
    ui.btn.classList.remove('rec');
    ui.btn.setAttribute('aria-pressed', 'false');
    recorder = null;
    if (where === 'form') { voiceTimer.hidden = true; setLabel(voiceBtn, ui.idle); }
    if (chunks.length) {
      const type = chunks[0].type || 'audio/webm';
      const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
      clearVoice();
      voiceFile = new File(chunks, 'message-vocal.' + ext, { type });
      voiceAudio.src = URL.createObjectURL(voiceFile);
      $('#voicePreview').hidden = false;
      voiceBtn.hidden = true;
      setLabel(homeVoiceBtn, 'Réenregistrer');
      homeVoiceMsg.textContent = 'Message vocal de ' + mmss(Math.max(t, 1)) + ' enregistré. Il sera joint à ta demande.';
    } else if (where === 'home') { setLabel(homeVoiceBtn, ui.idle); homeVoiceMsg.textContent = ''; }
    const next = afterVoice; afterVoice = null;
    if (next) next();
  };
  recorder.start();
  ui.btn.classList.add('rec');
  ui.btn.setAttribute('aria-pressed', 'true');
  setLabel(ui.btn, 'Arrêter l’enregistrement');
  ui.out.textContent = 'Enregistrement… 0:00 / ' + mmss(VOICE_MAX);
  ui.out.hidden = false;
  voiceTick = setInterval(() => {
    t += 1;
    ui.out.textContent = 'Enregistrement… ' + mmss(t) + ' / ' + mmss(VOICE_MAX);
    if (t >= VOICE_MAX) recorder.stop();
  }, 1000);
}
if (window.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
  $('#voiceBox').hidden = false;
  homeVoiceBtn.hidden = false;
  voiceBtn.addEventListener('click', () => { if (recorder) recorder.stop(); else startVoice('form'); });
  homeVoiceBtn.addEventListener('click', () => { if (recorder) recorder.stop(); else startVoice('home'); });
  $('#voiceDel').addEventListener('click', () => { clearVoice(); voiceBtn.focus(); });
}

$('#missionForm').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target, err = $('#err');
  if (!isContact(f.elements.contact.value.trim())) {
    showError(err, 'Indique une adresse e-mail ou un numéro de téléphone valide.');
    f.elements.contact.focus();
    return;
  }
  if (recorder) { showError(err, 'Arrête d’abord l’enregistrement du message vocal.'); voiceBtn.focus(); return; }
  const files = chosenFiles();
  if (files.reduce((t, x) => t + x.size, 0) + (voiceFile ? voiceFile.size : 0) > MAX_UPLOAD) {
    showError(err, 'Tes fichiers dépassent 8 Mo au total. Retire-en un ou envoie des versions plus légères.');
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
    precisions: f.elements.precisions.value.trim() || null,
    pieces_jointes: files.length, vocal: !!voiceFile,
    ambassadeur: f.elements.ambassadeur.checked,
  };
  // Copie des fichiers dans l'espace (Supabase Storage), sous la référence de la demande.
  const uploads = files.map((file, i) => ({ chemin: n + '/' + (i + 1) + '-' + safeName(file.name), file }));
  if (voiceFile) uploads.push({ chemin: n + '/' + voiceFile.name, file: voiceFile });
  copy.fichiers = uploads.map(u => u.chemin);
  const voice = voiceFile;
  sendForm(f, err, () => {
    ref = n;
    trackRequest(copy, uploads);
    f.reset(); resetAttachments();
    safe(() => SS.removeItem('flemmeDraft'));
    $('#missionRef').textContent = 'Demande ' + ref + ' · Nous te recontacterons pour te dire si nous pouvons t’aider.';
    show('tracking');
  }, data => { if (voice) data.set('vocal', voice); });
});

// La candidature Brigadier (ex-Facilitateur) a sa propre page : rejoindre.html.

/* ---------- 8. Espace personnel (Supabase, voir sb.js) ---------- */

// Enregistre la demande pour qu'elle apparaisse dans l'espace, puis propose de la suivre.
// Netlify Forms reste la source principale : un échec ici n'empêche rien.
// Nom de fichier sans accents ni caractères spéciaux, pour un chemin de stockage sûr.
const safeName = name => (name || 'fichier').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(-60) || 'fichier';

function trackRequest(copy, uploads = []) {
  const box = $('#trackBox');
  box.hidden = true;
  if (!window.SB || !SB.ready) return;
  const s = SB.current();
  if (!s && !copy.email) return; // contact par téléphone : rien à rattacher à un compte
  // Si la base n'a pas encore les colonnes du formulaire enrichi (script
  // supabase/formulaire-enrichi.sql pas encore exécuté), on réessaie sans les fichiers,
  // puis avec les anciens champs.
  const sansFichiers = Object.assign({}, copy);
  delete sansFichiers.fichiers;
  SB.deposer(copy).catch(() => {
    uploads = []; // sans le compartiment de stockage, les fichiers restent dans Netlify Forms
    return SB.deposer(sansFichiers);
  }).catch(() => {
    const old = Object.assign({}, copy, { besoin: copy.besoin.slice(0, 280), aide_attendue: copy.precisions ? copy.precisions.slice(0, 600) : null });
    delete old.precisions; delete old.pieces_jointes; delete old.vocal; delete old.fichiers;
    return SB.deposer(old);
  }).then(() =>
    // Fichiers copiés un par un, avant d'afficher le lien vers l'espace (quitter la page
    // couperait l'envoi). Un fichier refusé n'empêche rien : il reste reçu via Netlify Forms.
    uploads.reduce((p, u) => p.then(() => SB.envoyerFichier(u.chemin, u.file).catch(e => console.warn('Fichier non copié', u.chemin, e))), Promise.resolve())
  ).then(() => {
    const link = $('#trackLink');
    if (s) {
      $('#trackTxt').textContent = 'Retrouve cette demande et son avancement dans ton espace.';
      link.href = 'espace.html';
    } else {
      $('#trackTxt').textContent = 'Crée ton espace avec ' + copy.email + ' pour suivre l’avancement de ta demande. Ça prend une minute.';
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
  taskInput.value = ''; $('#missionForm').reset(); resetAttachments();
  safe(() => SS.removeItem('flemmeDraft'));
  show('home');
}

/* ---------- 9. Textes modifiables depuis /admin ---------- */

(() => {
  const A = FL.accueil || {};
  if (A.accroche) $('#heroLead').textContent = A.accroche;
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
if (draft) taskInput.value = draft;

// Les anciens liens flemme.org/#facilitateur mènent à la page de la Brigade anti-flemme.
if (location.hash === '#facilitateur') location.replace('rejoindre.html');
history.replaceState(null, '', './');
show('home', false, false);

// Service worker : permet au site de s'afficher même hors connexion.
if (!NATIVE && 'serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
