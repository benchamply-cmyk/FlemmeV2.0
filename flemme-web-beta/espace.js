'use strict';
/* =========================================================================
   FLEMME — espace personnel (espace.html)
   1. Connexion par e-mail (lien ou code) ou Google / Apple, via sb.js.
   2. Liste des demandes de la personne, avec leur avancement, le mot
      de l'équipe et une discussion par demande. Le statut et les réponses
      de l'équipe se gèrent dans Supabase (voir README).
   ========================================================================= */

const $ = s => document.querySelector(s);
const show = id => ['off', 'login', 'space'].forEach(v => { $('#' + v).hidden = v !== id; });
const showError = (box, msg) => { box.textContent = msg; box.hidden = false; };
const NET = 'Connexion impossible. Vérifie ta connexion internet et réessaie.';
const msgOf = e => (e instanceof TypeError ? NET : e.message);

/* ---------- 1. Avancement d'une demande ---------- */

// Étapes affichées dans l'ordre ; « refusee » remplace la suite du parcours.
const STEPS = [
  { id: 'recue', nom: 'Demande reçue', txt: 'Merci ! Ta demande est bien arrivée.' },
  { id: 'en_etude', nom: 'À l’étude', txt: 'On regarde si on peut vraiment t’aider.' },
  { id: 'acceptee', nom: 'Acceptée', txt: 'On prend ta mission.' },
  { id: 'en_cours', nom: 'En cours', txt: 'On s’en occupe.' },
  { id: 'terminee', nom: 'Terminée', txt: 'Ta demande est traitée. Ton avis nous intéresse !' },
];
const REFUSED = { id: 'refusee', nom: 'Pas possible pour l’instant', txt: 'On ne sait pas encore bien faire ça. On t’explique pourquoi ci-dessous.' };
const LABEL = Object.fromEntries([...STEPS, REFUSED].map(s => [s.id, s.nom]));

const date = iso => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

function renderDemande(d) {
  const li = el('li', 'card demande');
  const top = el('div', 'demande-top');
  top.append(el('span', 'ref', d.ref + ' · ' + date(d.created_at)), el('span', 'pill pill-' + d.statut, LABEL[d.statut] || d.statut));
  li.append(top, el('p', 'besoin', d.besoin));
  if (d.categorie || d.echeance) li.append(el('p', 'meta', [d.categorie, d.echeance].filter(Boolean).join(' · ')));

  if (d.message) {
    const m = el('div', 'team-msg');
    m.append(el('b', null, 'Le mot de l’équipe'), el('p', null, d.message));
    li.append(m);
  }

  // Frise : étapes passées pleines, étape actuelle en gras, suivantes grisées.
  const refused = d.statut === 'refusee';
  const steps = refused ? [STEPS[0], STEPS[1], REFUSED] : STEPS;
  const at = steps.findIndex(s => s.id === d.statut);
  const tl = el('div', 'timeline');
  steps.forEach((s, i) => {
    const row = el('div', i < at ? 'complete' : i === at ? 'active-step' + (refused ? ' refused' : '') : '');
    row.append(el('b', null, s.nom));
    if (i === at) row.append(el('span', null, s.txt));
    tl.append(row);
  });
  li.append(tl, renderChat(d));
  if (d.updated_at && d.updated_at.slice(0, 10) !== d.created_at.slice(0, 10)) li.append(el('p', 'meta', 'Mise à jour le ' + date(d.updated_at)));
  return li;
}

/* ---------- 2. Discussion avec l'équipe ---------- */

const time = iso => new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const POLL = 20000; // nouvelles réponses relues toutes les 20 s tant que le fil est ouvert

function renderChat(d) {
  const box = el('details', 'chat');
  box.append(el('summary', null, 'Discuter avec l’équipe'));
  const list = el('ol', 'chat-list');
  const err = el('p', 'err');
  err.hidden = true;
  err.setAttribute('role', 'alert');
  const form = el('form', 'chat-form');
  const label = el('label', 'sr', 'Ton message');
  const input = el('textarea');
  input.id = 'msg-' + d.id; label.htmlFor = input.id;
  input.maxLength = 2000; input.required = true; input.rows = 2;
  input.placeholder = 'Une question, une précision, un retour…';
  const send = el('button', 'primary', 'Envoyer');
  send.type = 'submit';
  form.append(label, input, send);
  box.append(list, err, form);

  let timer = null, count = -1;
  async function refresh() {
    try {
      const rows = await SB.messages(d.id);
      if (rows.length === count) return; // rien de nouveau : on ne touche pas au fil
      count = rows.length;
      list.replaceChildren(...(rows.length ? rows.map(m => {
        const li = el('li', 'msg msg-' + m.auteur);
        li.append(el('p', null, m.texte), el('span', null, (m.auteur === 'equipe' ? 'Équipe Flemme' : 'Toi') + ' · ' + time(m.created_at)));
        return li;
      }) : [el('li', 'msg-empty', 'Pas encore de message. Écris-nous si tu as une question ou une précision à ajouter.')]));
      list.scrollTop = list.scrollHeight;
      err.hidden = true;
    } catch (e) {
      if (e.status === 401) return start();
      showError(err, msgOf(e));
    }
  }
  box.addEventListener('toggle', () => {
    clearInterval(timer);
    if (!box.open) return;
    refresh();
    timer = setInterval(() => { if (!document.hidden && box.isConnected) refresh(); else if (!box.isConnected) clearInterval(timer); }, POLL);
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const texte = input.value.trim();
    if (!texte) return;
    send.disabled = true;
    err.hidden = true;
    try {
      await SB.ecrire(d.id, texte);
      input.value = '';
      await refresh();
    } catch (x) {
      showError(err, msgOf(x));
    } finally {
      send.disabled = false;
    }
  });
  return box;
}

async function loadList() {
  const err = $('#listErr');
  err.hidden = true;
  $('#loading').hidden = false;
  try {
    const rows = await SB.demandes();
    $('#list').replaceChildren(...rows.map(renderDemande));
    $('#empty').hidden = rows.length > 0;
  } catch (e) {
    if (e.status === 401) return start(); // session expirée : retour à la connexion
    showError(err, msgOf(e));
  } finally {
    $('#loading').hidden = true;
  }
}

function openSpace(s) {
  $('#who').textContent = s.email || '';
  document.querySelectorAll('.me').forEach(n => { n.textContent = s.email || ''; });
  show('space');
  loadList();
}

/* ---------- 3. Connexion ---------- */

let email = '';

$('#mailForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, err = $('#mailErr'), btn = f.querySelector('button');
  email = f.elements.email.value.trim().toLowerCase();
  err.hidden = true;
  btn.disabled = true;
  try {
    await SB.sendLink(email);
    $('#sentTo').textContent = email;
    f.hidden = true;
    $('#codeForm').hidden = false;
    $('#code').focus();
  } catch (x) {
    showError(err, msgOf(x));
  } finally {
    btn.disabled = false;
  }
});

$('#codeForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target, err = $('#codeErr'), btn = f.querySelector('button[type=submit]');
  const code = f.elements.code.value.replace(/\s/g, '');
  err.hidden = true;
  if (!/^\d{6,10}$/.test(code)) return showError(err, 'Le code contient 6 chiffres.');
  btn.disabled = true;
  try {
    openSpace(await SB.verify(email, code));
  } catch (x) {
    showError(err, x.status === 403 || x.code === 'otp_expired' ? 'Code incorrect ou expiré. Vérifie-le ou demande un nouveau lien.' : msgOf(x));
  } finally {
    btn.disabled = false;
  }
});

$('#otherMail').addEventListener('click', () => {
  $('#codeForm').hidden = true;
  $('#codeForm').reset();
  $('#mailForm').hidden = false;
  $('#email').focus();
});

async function signOut(everywhere) {
  await SB.logout(everywhere);
  $('#list').replaceChildren();
  start();
}
$('#logout').addEventListener('click', () => signOut(false));
$('#logoutAll').addEventListener('click', () => signOut(true));

$('#deleteAccount').addEventListener('click', async e => {
  if (!confirm('Supprimer définitivement ton compte et toutes tes demandes ? Cette action est irréversible.')) return;
  const btn = e.target, err = $('#accountErr');
  err.hidden = true;
  btn.disabled = true;
  try {
    await SB.supprimer();
    $('#list').replaceChildren();
    show('login');
    showError($('#mailErr'), 'Ton compte et tes demandes ont été supprimés.');
  } catch (x) {
    showError(err, msgOf(x));
  } finally {
    btn.disabled = false;
  }
});

// Boutons Google / Apple : affichés seulement si le fournisseur est activé dans Supabase.
document.querySelectorAll('[data-provider]').forEach(b => b.addEventListener('click', async () => {
  $('#socialErr').hidden = true;
  try { await SB.oauth(b.dataset.provider); } catch (x) { showError($('#socialErr'), msgOf(x)); }
}));
async function showProviders() {
  const on = await SB.providers();
  let any = false;
  document.querySelectorAll('[data-provider]').forEach(b => { b.hidden = !on[b.dataset.provider]; any = any || !b.hidden; });
  $('#social').hidden = !any;
}

/* ---------- 4. Démarrage ---------- */

async function start() {
  if (!SB.ready) return show('off');
  let s = null;
  try {
    s = (await SB.fromLink()) || (await SB.session());
  } catch (e) {
    show('login');
    showProviders();
    return showError($('#mailErr'), msgOf(e));
  }
  if (s) return openSpace(s);
  show('login');
  showProviders();
  const prefill = new URLSearchParams(location.search).get('email');
  if (prefill && !$('#email').value) $('#email').value = prefill;
}
start();
