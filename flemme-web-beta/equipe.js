'use strict';
/* =========================================================================
   FLEMME — page équipe (equipe.html)
   Toutes les demandes clients : statut, mot de l'équipe, discussion.
   Réservée aux comptes de la table « equipe » (voir supabase/espace.sql) :
   les droits sont vérifiés par la base, pas seulement par cette page.
   ========================================================================= */

const $ = s => document.querySelector(s);
const show = id => ['off', 'guest', 'denied', 'board'].forEach(v => { $('#' + v).hidden = v !== id; });
const showError = (box, msg) => { box.textContent = msg; box.hidden = false; };
const msgOf = e => (e instanceof TypeError ? 'Connexion impossible. Vérifie ta connexion internet et réessaie.' : e.message);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const date = iso => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const time = iso => new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const STATUTS = [
  ['recue', 'Reçue'], ['en_etude', 'À l’étude'], ['acceptee', 'Acceptée'],
  ['en_cours', 'En cours'], ['terminee', 'Terminée'], ['refusee', 'Refusée'],
];
const LABEL = Object.fromEntries(STATUTS);

let rows = [], last = {};

// Une discussion attend une réponse si son dernier message vient du client.
const aRepondre = d => last[d.id] && last[d.id].auteur === 'client';

/* ---------- Liste ---------- */

function renderStats() {
  const n = s => rows.filter(d => d.statut === s).length;
  const items = [['repondre', 'À répondre', rows.filter(aRepondre).length], ...STATUTS.map(([id, nom]) => [id, nom, n(id)])];
  $('#stats').replaceChildren(...items.map(([id, nom, c]) => {
    const b = el('button', 'stat' + (id === 'repondre' && c ? ' hot' : ''));
    b.type = 'button';
    b.append(el('b', null, String(c)), nom);
    b.addEventListener('click', () => { $('#filter').value = id; renderList(); });
    return b;
  }));
}

function renderList() {
  const f = $('#filter').value, q = $('#search').value.trim().toLowerCase();
  const shown = rows.filter(d =>
    (!f || (f === 'repondre' ? aRepondre(d) : d.statut === f)) &&
    (!q || [d.ref, d.email, d.besoin, d.categorie, d.aide_attendue].some(v => v && String(v).toLowerCase().includes(q))));
  // Les discussions en attente d'une réponse d'abord, puis les plus récentes.
  shown.sort((a, b) => (aRepondre(b) - aRepondre(a)) || b.created_at.localeCompare(a.created_at));
  $('#list').replaceChildren(...shown.map(renderDemande));
  $('#none').hidden = shown.length > 0;
}

function renderDemande(d) {
  const li = el('li', 'card demande');
  const top = el('div', 'demande-top');
  const tags = el('div', 'tags');
  if (aRepondre(d)) tags.append(el('span', 'badge-new', 'Message à lire'));
  tags.append(el('span', 'pill pill-' + d.statut, LABEL[d.statut] || d.statut));
  top.append(el('span', 'ref', d.ref + ' · ' + date(d.created_at)), tags);
  li.append(top, el('p', 'besoin', d.besoin));

  const infos = el('dl', 'infos');
  const add = (k, v) => { if (v) infos.append(el('dt', null, k), el('dd', null, v)); };
  if (d.email) {
    infos.append(el('dt', null, 'Contact'));
    const dd = el('dd'), a = el('a', null, d.email);
    a.href = 'mailto:' + d.email + '?subject=' + encodeURIComponent('Ta demande Flemme ' + d.ref);
    dd.append(a);
    infos.append(dd);
  }
  add('Compte', d.user_id ? 'Oui' : 'Pas encore (demande envoyée sans être connecté)');
  add('Catégorie', d.categorie);
  add('Échéance', d.echeance);
  add('Fréquence', d.frequence);
  add('Aide attendue', d.aide_attendue);
  add('Ambassadeur', d.ambassadeur ? 'Oui, d’accord pour en parler' : '');
  li.append(infos, renderSuivi(d), renderChat(d));
  return li;
}

/* ---------- Statut et mot de l'équipe ---------- */

function renderSuivi(d) {
  const form = el('form', 'suivi');
  const lStat = el('label', null, 'Statut'), sel = el('select');
  sel.id = 'statut-' + d.id; lStat.htmlFor = sel.id;
  STATUTS.forEach(([id, nom]) => { const o = el('option', null, nom); o.value = id; o.selected = id === d.statut; sel.append(o); });
  const lMsg = el('label', null, 'Mot de l’équipe (visible par le client dans son espace)'), txt = el('textarea');
  txt.id = 'mot-' + d.id; lMsg.htmlFor = txt.id; txt.rows = 2; txt.value = d.message || '';
  const row = el('div', 'row'), btn = el('button', 'primary', 'Enregistrer'), ok = el('span', 'ok'), err = el('p', 'err');
  btn.type = 'submit'; ok.hidden = true; err.hidden = true; err.setAttribute('role', 'alert');
  row.append(btn, ok);
  form.append(lStat, sel, lMsg, txt, row, err);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    btn.disabled = true; ok.hidden = true; err.hidden = true;
    try {
      const champs = { statut: sel.value, message: txt.value.trim() || null };
      await SB.equipe.modifier(d.id, champs);
      Object.assign(d, champs);
      ok.textContent = 'Enregistré. Le client le voit dans son espace.';
      ok.hidden = false;
      renderStats();
      li(form).querySelector('.pill').className = 'pill pill-' + d.statut;
      li(form).querySelector('.pill').textContent = LABEL[d.statut];
    } catch (x) {
      if (x.status === 401) return start();
      showError(err, msgOf(x));
    } finally {
      btn.disabled = false;
    }
  });
  return form;
}
const li = n => n.closest('li');

/* ---------- Discussion ---------- */

function renderChat(d) {
  const box = el('details', 'chat');
  box.append(el('summary', null, 'Discussion avec le client'));
  const list = el('ol', 'chat-list'), err = el('p', 'err');
  err.hidden = true; err.setAttribute('role', 'alert');
  const form = el('form', 'chat-form'), label = el('label', 'sr', 'Ta réponse'), input = el('textarea');
  input.id = 'rep-' + d.id; label.htmlFor = input.id;
  input.maxLength = 2000; input.required = true; input.rows = 2; input.placeholder = 'Ta réponse au client…';
  const send = el('button', 'primary', 'Répondre');
  send.type = 'submit';
  form.append(label, input, send);
  box.append(list, err, form);

  async function refresh() {
    try {
      const msgs = await SB.messages(d.id);
      list.replaceChildren(...(msgs.length ? msgs.map(m => {
        const item = el('li', 'msg msg-' + m.auteur);
        item.append(el('p', null, m.texte), el('span', null, (m.auteur === 'equipe' ? 'Équipe' : 'Client') + ' · ' + time(m.created_at)));
        return item;
      }) : [el('li', 'msg-empty', 'Pas encore de message. Tu peux écrire le premier.')]));
      list.scrollTop = list.scrollHeight;
      err.hidden = true;
    } catch (x) {
      if (x.status === 401) return start();
      showError(err, msgOf(x));
    }
  }
  box.addEventListener('toggle', () => { if (box.open) refresh(); });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const texte = input.value.trim();
    if (!texte) return;
    send.disabled = true; err.hidden = true;
    try {
      await SB.equipe.repondre(d.id, texte);
      input.value = '';
      last[d.id] = { auteur: 'equipe', created_at: new Date().toISOString() };
      const badge = li(box).querySelector('.badge-new');
      if (badge) badge.remove();
      renderStats();
      await refresh();
    } catch (x) {
      if (x.status === 401) return start();
      showError(err, msgOf(x));
    } finally {
      send.disabled = false;
    }
  });
  return box;
}

/* ---------- Démarrage ---------- */

async function load() {
  const err = $('#listErr');
  err.hidden = true;
  $('#loading').hidden = false;
  try {
    [rows, last] = await Promise.all([SB.equipe.demandes(), SB.equipe.derniers()]);
    renderStats();
    renderList();
  } catch (e) {
    if (e.status === 401) return start();
    showError(err, msgOf(e));
  } finally {
    $('#loading').hidden = true;
  }
}

$('#filter').addEventListener('change', renderList);
$('#search').addEventListener('input', renderList);
$('#refresh').addEventListener('click', load);

async function start() {
  if (!SB.ready) return show('off');
  const s = await SB.session();
  if (!s) return show('guest');
  if (!(await SB.equipe.membre())) { $('#deniedWho').textContent = s.email || ''; return show('denied'); }
  $('#who').textContent = s.email || '';
  show('board');
  load();
}
start();
