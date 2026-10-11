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
let activeView = 'demandes';

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
    (!q || [d.ref, d.email, d.besoin, d.precisions, d.categorie, d.aide_attendue].some(v => v && String(v).toLowerCase().includes(q))));
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
  // Demandes envoyées avant le stockage Supabase : fichiers seulement dans Netlify Forms.
  if (!(d.fichiers || []).length) {
    add('Pièces jointes', d.pieces_jointes ? d.pieces_jointes + ' fichier(s), dans Netlify > Forms > beta-besoins' : '');
    add('Message vocal', d.vocal ? 'Oui, dans Netlify > Forms > beta-besoins' : '');
  }
  add('Ambassadeur', d.ambassadeur ? 'Oui, d’accord pour en parler' : '');
  add('Précisions', d.precisions);
  li.append(infos, SB.blocPieces(d), renderSuivi(d), renderChat(d), renderAdminNote('demande:' + d.id), renderMissionLink(d));
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
      await ADMIN.modifier(d.id, champs);
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
      await ADMIN.repondre(d.id, texte);
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
  const generation = panelRevision;
  const err = $('#listErr');
  err.hidden = true;
  $('#loading').hidden = false;
  try {
    [rows, last] = await Promise.all([ADMIN.demandes(), ADMIN.derniers()]);
    if (generation !== panelRevision) return;
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
$('#refresh').addEventListener('click', () => activeView === 'demandes' ? load() : loadPanel());

async function start() {
  ++panelRevision; rows = []; last = {}; $('#list').replaceChildren(); $('#stats').replaceChildren(); $('#adminPanel').replaceChildren(); show('off');
  if (!SB.ready) return show('off');
  const s = await SB.session();
  if (!s) return show('guest');
  if (!(await ADMIN.membre())) { $('#deniedWho').textContent = s.email || ''; return show('denied'); }
  $('#who').textContent = s.email || '';
  show('board');
  if (activeView === 'demandes') load(); else loadPanel();
}

// Private operational notes append to the journal, preserving every decision.
function renderAdminNote(subject, current = null) {
  const form = el('form', 'admin-note');
  const label = el('label', null, 'Décision admin (interne)'), select = el('select');
  select.setAttribute('aria-label', 'Décision interne');
  [['a_etudier','À étudier'],['a_contacter','À contacter'],['retenu','Retenu'],['non_retenu','Non retenu'],['suivi','Note de suivi']].forEach(([value,text]) => {
    const o = el('option', null, text); o.value = value; select.append(o);
  });
  const note = el('textarea'); note.required = true; note.maxLength = 4000; note.rows = 2;
  note.setAttribute('aria-label', 'Motif ou note interne'); note.placeholder = 'Motif, suivi ou référence de mission…';
  const btn = el('button', 'secondary', 'Consigner la décision'); btn.type = 'submit';
  const result = el('p'); result.setAttribute('role', 'status');
  if (current) result.textContent = current.statut + ' · ' + current.note + ' · ' + time(current.created_at);
  form.append(label, select, note, btn, result);
  form.addEventListener('submit', async e => {
    e.preventDefault(); btn.disabled = true;
    try { await ADMIN.noter(subject, select.value, note.value.trim()); result.textContent = 'Décision enregistrée dans le journal privé.'; note.value = ''; }
    catch (error) { result.textContent = msgOf(error); if ([401,403].includes(error.status)) await start(); }
    finally { btn.disabled = false; }
  });
  return form;
}
let panelRevision = 0;
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
  activeView = button.dataset.view;
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
  $('#requests').hidden = activeView !== 'demandes'; $('#adminPanel').hidden = activeView === 'demandes';
  ++panelRevision;
  if (activeView === 'demandes') load(); else loadPanel();
}));

async function loadPanel() {
  const target = $('#adminPanel'), revision = ++panelRevision, view = activeView;
  target.replaceChildren(el('p', 'loading', 'Chargement…'));
  try {
    if (!(await ADMIN.membre())) { await start(); return; }
    const journal = await ADMIN.journal();
    const latest = subject => journal.find(j => j.sujet === subject);
    const list = el('ol', 'admin-items');
    let title, explanation;
    if (view === 'brigade') {
      title = 'Candidatures Brigade'; explanation = 'Les deux étapes d’une candidature sont regroupées. Les envois d’origine restent conservés.';
      const data = await ADMIN.service('brigade');
      const groups = new Map();
      data.items.sort((a,b) => a.created_at.localeCompare(b.created_at)).forEach(row => {
        const key = row.data.candidat || row.id;
        if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row);
      });
      [...groups.entries()].reverse().forEach(([key, history]) => {
        const info = Object.assign({}, ...history.map(r => r.data));
        const card = el('li', 'card'); card.append(el('h3', null, info.nom || key), el('p', 'ref', key + ' · ' + history.length + ' envoi(s)'));
        const details = el('dl', 'infos');
        ['email','telephone','ville','mode','competences','disponibilite','statut','pourquoi'].forEach(k => {
          if (info[k]) details.append(el('dt', null, k), el('dd', null, String(info[k])));
        });
        const all = el('details'); all.append(el('summary', null, 'Envois d’origine'), el('pre', 'admin-detail', JSON.stringify(history, null, 2)));
        card.append(details, all, renderAdminNote('brigade:' + key, latest('brigade:' + key))); list.append(card);
      });
    } else if (view === 'ambassadeurs') {
      title = 'Ambassadeurs'; explanation = 'Personnes ayant accepté de parler de Flemme dans une demande. Cet accord reste distinct d’une validation de candidature.';
      const demandes = await ADMIN.demandes(), people = new Map();
      demandes.filter(d => d.ambassadeur).forEach(d => { const key = d.email?.toLowerCase() || d.id; if (!people.has(key)) people.set(key, []); people.get(key).push(d); });
      people.forEach((requests, key) => {
        const card = el('li', 'card'); card.append(el('h3', null, requests[0].email || 'Contact dans le formulaire'), el('p', null, 'Demandes : ' + requests.map(d => d.ref).join(', ')), renderAdminNote('ambassadeur:' + key, latest('ambassadeur:' + key))); list.append(card);
      });
    } else if (view === 'agents') {
      const missions = await ADMIN.service('missions');
      title = 'Agents et missions'; explanation = missions.backend === 'netlify'
        ? 'Manager Netlify qualifie les demandes à votre initiative. Les résultats restent internes. Search, Compare, Writer et Quality ne sont pas encore raccordés à cette version. Le blocage conserve un résultat déjà en cours de génération sans reprendre le traitement.'
        : 'Manager qualifie ; Search, Compare, Writer et Quality produisent et contrôlent les livrables. Les commandes modifient l’état de la mission. Une exécution déjà lancée n’est pas interrompue par le blocage.';
      for (const mission of missions.items) list.append(renderMission(mission));
    } else {
      title = 'Journal administrateur'; explanation = 'Historique des décisions internes, modifications et réponses. Les actions Manager sont également historisées dans chaque mission.';
      journal.forEach(item => { const card = el('li', 'card'); card.append(el('h3', null, item.sujet), el('p', null, item.statut + ' · ' + time(item.created_at)), el('p', 'admin-detail', item.note)); list.append(card); });
    }
    if (revision !== panelRevision || activeView !== view) return;
    target.replaceChildren(el('h2', null, title), el('p', null, explanation), list);
    if (!list.children.length) target.append(el('p', null, 'Aucun élément reçu.'));
  } catch (error) {
    if (revision !== panelRevision) return;
    if ([401,403].includes(error.status)) return start();
    const message = el('p', 'err', msgOf(error)); message.setAttribute('role', 'alert'); target.replaceChildren(message);
  }
}
const MISSION_LABELS = {qualifying:'Qualification en cours',qualified:'Qualifiée',waiting_information:'Informations attendues',human_required:'Intervention humaine',out_of_catalog:'Hors catalogue',in_progress:'En cours',blocked:'Bloquée',completed:'Terminée',cancelled:'Annulée'};
function renderMission(mission) {
  const card = el('li', 'card');
  card.append(el('h3', null, 'Mission ' + mission.mission_id), el('p', null, (MISSION_LABELS[mission.state] || 'À qualifier') + ' · ' + mission.delivery_count + ' livrable(s) · révision ' + mission.revision));
  const open = el('button', 'secondary', 'Examiner et piloter'); open.type = 'button';
  const detail = el('div'); card.append(open, detail);
  open.addEventListener('click', async () => {
    open.disabled = true; detail.replaceChildren(el('p', null, 'Chargement de la mission…'));
    try {
      const snapshot = await ADMIN.service('mission:' + mission.mission_id);
      const result = el('details'); result.open = true;
      result.append(el('summary', null, 'Qualification, agents, résultats et historique'), renderMissionSnapshot(snapshot));
      const form = el('form', 'admin-note'), select = el('select'), note = el('textarea');
      select.setAttribute('aria-label', 'État de la mission');
      const allowed = {qualifying:['blocked'],qualified:['blocked','in_progress'],human_required:['blocked','in_progress'],in_progress:['blocked','completed'],blocked:snapshot.job_id?[]:['in_progress']};
      [['blocked','Bloquer la mission'],['in_progress','Reprendre le traitement'],['completed','Marquer la mission terminée']].filter(([v]) => (allowed[snapshot.state] || []).includes(v)).forEach(([v,t]) => { const o = el('option', null, t); o.value = v; select.append(o); });
      note.required = true; note.maxLength = 2000; note.setAttribute('aria-label', 'Motif de la commande'); note.placeholder = 'Motif obligatoire, conservé dans l’historique';
      const btn = el('button', 'primary', 'Appliquer la commande'); btn.type = 'submit'; const status = el('p'); status.setAttribute('role','status');
      form.append(select,note,btn,status);
      if (!select.options.length) { select.disabled = true; note.disabled = true; btn.disabled = true; status.textContent = 'Aucune commande disponible dans cet état.'; }
      form.addEventListener('submit', async e => {
        e.preventDefault(); btn.disabled = true;
        try {
          await ADMIN.service('mission:' + mission.mission_id, { method:'POST', body:{state:select.value,note:note.value.trim(),expected_revision:snapshot.revision} });
          status.textContent = 'État enregistré. Rechargez la mission pour la prochaine commande.'; form.querySelectorAll('select,textarea').forEach(x => x.disabled = true);
        } catch(error) { status.textContent = msgOf(error); if ([401,403].includes(error.status)) await start(); else btn.disabled = false; }
      });
      detail.replaceChildren(result,form);
    } catch(error) { detail.replaceChildren(el('p','err',msgOf(error))); if ([401,403].includes(error.status)) await start(); }
    finally { open.disabled = false; }
  });
  return card;
}

$('#adminLogin').addEventListener('submit', async e => {
  e.preventDefault(); const button = e.currentTarget.querySelector('button'); button.disabled = true; $('#loginError').hidden = true;
  try { await SB.login($('#adminEmail').value.trim(), $('#adminPassword').value); $('#adminPassword').value = ''; await start(); }
  catch(error) { showError($('#loginError'), msgOf(error)); } finally { button.disabled = false; }
});
$('#adminLogout').addEventListener('click', async () => { await SB.logout(); await start(); });
function renderMissionLink(d) {
  const form = el('form','admin-note'), input = el('input');
  input.type = 'text'; input.required = true; input.placeholder = 'Identifiant de mission Manager';
  input.setAttribute('aria-label','Identifiant de mission à associer');
  input.pattern = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
  const button = el('button','secondary','Associer une mission à cette demande'); button.type = 'submit';
  const result = el('p'); result.setAttribute('role','status');
  const qualify = el('button','primary','Qualifier cette demande avec le Manager'); qualify.type='button';
  const info = el('p',null,'Le texte de la demande et ses précisions sont transmis à OpenAI pour une qualification interne, facturée sur votre compte API. Aucun message n’est envoyé au client. Les pièces jointes ne sont pas analysées par cette version.');
  qualify.addEventListener('click',async () => {
    qualify.disabled=true; result.textContent='Qualification en cours…';
    try {
      const mission=await ADMIN.service('qualifier:'+d.id,{method:'POST',body:{}});
      result.textContent='Mission '+mission.mission_id+' · '+MISSION_LABELS[mission.state]+'. Résultat disponible dans Agents et missions.';
    } catch(error) {result.textContent=msgOf(error); if([401,403].includes(error.status)) await start();}
    finally {qualify.disabled=false;}
  });
  form.append(qualify,info,input,button,result);
  ADMIN.liens(d.id).then(links => {
    if(links.length) result.textContent = 'Missions associées : ' + links.map(x => x.mission_id).join(', ');
  }).catch(error => { result.textContent = msgOf(error); });
  form.addEventListener('submit', async e => {
    e.preventDefault(); button.disabled = true;
    try {
      await ADMIN.service('mission:' + input.value.trim()); // verify mission exists before linking
      await ADMIN.lier(d.id,input.value.trim()); result.textContent = 'Mission associée : ' + input.value.trim(); input.value = '';
    } catch(error) { result.textContent = msgOf(error); if([401,403].includes(error.status)) await start(); }
    finally { button.disabled = false; }
  }); return form;
}
start().catch(error => { show('off'); $('#off h2').textContent = msgOf(error); });

function renderMissionSnapshot(snapshot) {
  const box = el('div');
  box.append(el('h3',null,'Brief et qualification'));
  if (!(snapshot.turns || []).length) box.append(el('p',null,'Aucun brief enregistré.'));
  (snapshot.turns || []).forEach(turn => {
    box.append(el('p','admin-detail',turn.request_text), el('p','admin-detail',turn.assessment?.user_response?.message || 'Qualification enregistrée.'));
    if(turn.assessment?.workflow) box.append(el('p',null,'Workflow : '+turn.assessment.workflow));
    (turn.assessment?.missing_information||[]).forEach(item=>box.append(el('p',null,'À préciser : '+(typeof item==='string'?item:item.name))));
    (turn.assessment?.qualification_questions||[]).forEach(item=>box.append(el('p',null,typeof item==='string'?item:item.question)));
    (turn.treatment_blockers||[]).forEach(item=>box.append(el('p',null,item)));
  });
  box.append(el('h3',null,'Résultats des agents'));
  if (!(snapshot.deliveries || []).length) box.append(el('p',null,'Aucun livrable enregistré.'));
  (snapshot.deliveries || []).forEach(delivery => {
    const result = delivery.result || {};
    box.append(el('p',null,'Agents : ' + (result.agents || []).join(' → ')), el('p',null,result.quality?.passed ? 'Contrôle qualité réussi' : 'Contrôle qualité non confirmé'), el('p','admin-detail',result.markdown || 'Résultat vide.'));
    (result.comparison?.warnings || []).forEach(warning => box.append(el('p',null,warning)));
  });
  box.append(el('h3',null,'Historique du traitement'));
  (snapshot.events || []).forEach(event => box.append(el('p','admin-detail',time(event.created_at) + ' · ' + (MISSION_LABELS[event.state] || event.kind) + ' · ' + (event.note || ''))));
  return box;
}
