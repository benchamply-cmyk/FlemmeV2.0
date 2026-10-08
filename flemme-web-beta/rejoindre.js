'use strict';
/* =========================================================================
   FLEMME — page « Rejoindre la Brigade anti-flemme » (rejoindre.html)
   Candidature en deux temps, dans le formulaire Netlify « facilitateur » :
   1. Candidature express (30 s) : envoyée tout de suite, avec etape=1.
      Un candidat qui s'arrête là est quand même enregistré.
   2. Profil (2 min, facultatif) : renvoie tout le formulaire avec etape=2.
   Les deux envois portent le même identifiant « candidat » (ex. BR-K7M2Q)
   pour les rapprocher dans Netlify Forms.
   Sans JavaScript, le formulaire s'envoie en une seule fois (etape=2).
   ========================================================================= */

const CT = (window.FLEMME && window.FLEMME.contact) || {};
const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const FORM_URL = NATIVE ? 'https://www.flemme.org/' : '/';
const FAIL = 'L’envoi a échoué. Réessaie dans un instant'
  + (CT.email ? ', ou écris-nous à ' + CT.email : '')
  + (CT.telephone ? ' / appelle le ' + CT.telephone : '') + '.';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const safe = f => { try { return f(); } catch (e) {} };
const SS = window.sessionStorage;
const KEY = 'flemmeBrigade';

const form = $('#brigadeForm');
const step1 = $('#step1'), step2 = $('#step2');
let phase = 1;

// Identifiant de candidature : BR- + 5 caractères sans ambiguïté (pas de 0/O, 1/I).
const newRef = () => {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const n = new Uint32Array(5);
  crypto.getRandomValues(n);
  return 'BR-' + [...n].map(x => abc[x % abc.length]).join('');
};

/* ---------- Brouillon : conservé si la page est rechargée ---------- */

function saveDraft() {
  const d = { phase, candidat: form.candidat.value, champs: {} };
  for (const el of form.elements) {
    if (!el.name || el.type === 'hidden' || el.name === 'bot-field') continue;
    if (el.type === 'checkbox') { if (el.checked) (d.champs[el.name] = d.champs[el.name] || []).push(el.value); }
    else d.champs[el.name] = el.value;
  }
  safe(() => SS.setItem(KEY, JSON.stringify(d)));
}

function loadDraft() {
  const d = safe(() => JSON.parse(SS.getItem(KEY)));
  if (!d || !d.champs) return;
  for (const el of form.elements) {
    if (!el.name || el.type === 'hidden' || !(el.name in d.champs)) continue;
    const v = d.champs[el.name];
    if (el.type === 'checkbox') el.checked = Array.isArray(v) && v.includes(el.value);
    else el.value = v;
  }
  if (d.candidat) form.candidat.value = d.candidat;
  if (d.phase === 2) showStep2(false);
}

/* ---------- Affichage des étapes ---------- */

function showStep2(focus = true) {
  phase = 2;
  step1.hidden = true;
  step2.hidden = false;
  $('#step2Ok').hidden = false;
  $('#skip').hidden = false;
  $('#applyProgress').classList.add('done');
  $('#applyStep').textContent = 'Étape 2 sur 2 · 2 minutes, facultatif';
  $('#applyTitle').textContent = 'Parle-nous de toi.';
  if (focus) $('#applyTitle').focus({ preventScroll: false });
}

function showDone() {
  safe(() => SS.removeItem(KEY));
  form.hidden = true;
  $('#applyProgress').hidden = true;
  $('#applyStep').hidden = true;
  $('#applyTitle').hidden = true;
  const ok = $('#brigadeOk');
  ok.hidden = false;
  ok.querySelector('h2').focus();
}

/* ---------- Envoi à Netlify Forms ---------- */

// Les cases à cocher multiples (mode, compétences, disponibilités) sont réunies
// en une seule valeur « A, B, C » pour être lisibles dans Netlify Forms.
function encode(fd) {
  const out = new URLSearchParams(), seen = {};
  for (const [k, v] of fd) (seen[k] = seen[k] || []).push(v);
  for (const k in seen) out.set(k, seen[k].filter(Boolean).join(', '));
  return out.toString();
}

async function send(btn, errBox) {
  const label = btn.textContent;
  errBox.hidden = true;
  btn.disabled = true;
  btn.textContent = 'Envoi…';
  try {
    form.etape.value = String(phase);
    const r = await fetch(FORM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: encode(new FormData(form))
    });
    if (!r.ok) throw new Error(r.status);
    return true;
  } catch (x) {
    errBox.textContent = FAIL;
    errBox.hidden = false;
    return false;
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  if (phase === 1) {
    const err = $('#err1');
    if (!form.querySelector('input[name=mode]:checked')) {
      err.textContent = 'Choisis au moins une façon d’intervenir : à distance ou sur place.';
      err.hidden = false;
      return;
    }
    if (await send($('#send1'), err)) { showStep2(); saveDraft(); }
  } else if (await send($('#send2'), $('#err2'))) {
    showDone();
  }
});

// « Je complèterai plus tard » : la candidature express est déjà enregistrée.
$('#skip').addEventListener('click', showDone);

/* ---------- Compteur du champ « Pourquoi toi ? » ---------- */

const why = $('#bWhy'), count = $('#whyCount');
const updateCount = () => {
  const left = 280 - why.value.length;
  count.textContent = left < 280 ? left + ' signe' + (left > 1 ? 's' : '') + ' restant' + (left > 1 ? 's' : '') : '280 signes maximum';
};
why.addEventListener('input', updateCount);

/* ---------- Démarrage ---------- */

// Avec JavaScript, l'étape 2 n'apparaît qu'après l'envoi de l'étape 1.
step2.hidden = true;
form.etape.value = '1';
form.candidat.value = newRef();
loadDraft();
updateCount();
form.addEventListener('input', saveDraft);
form.addEventListener('change', saveDraft);
