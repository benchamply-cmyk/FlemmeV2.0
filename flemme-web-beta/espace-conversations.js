'use strict';
/* =========================================================================
   FLEMME — Mes conversations avec Flemme Manager, dans l'espace client.
   Lecture seule : liste des conversations, messages et livrables. Toutes les
   commandes (nouvelle conversation, agents, historique) sont dans /gestionadmin.
   ========================================================================= */
(() => {
  const $ = id => document.getElementById(id);
  const LABELS = { draft: 'Nouveau besoin', qualified: 'Brief qualifié', waiting_information: 'Informations attendues', human_required: 'Intervention humaine nécessaire', out_of_catalog: 'Hors catalogue', in_progress: 'En cours', blocked: 'Bloquée', completed: 'Terminée', cancelled: 'Annulée' };
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const when = iso => new Date(iso).toLocaleString('fr-FR');
  const URL_MANAGER = ((window.FLEMME || {}).managerV2 || {}).url;
  if (!URL_MANAGER || !window.ManagerV2API || !window.SB) return;
  let client, current = null, offset = 0, started = false;
  const notice = text => { $('convNotice').textContent = text; };

  async function list(more) {
    if (!more) { offset = 0; $('convList').replaceChildren(new Option('Choisis une conversation', '')); }
    const rows = await client.list(offset);
    rows.forEach(r => $('convList').append(new Option(when(r.created_at) + ' — ' + (LABELS[r.state] || r.state), r.id)));
    offset += rows.length;
    $('convOlder').hidden = rows.length < 100;
    return rows.length;
  }
  function render(saved) {
    current = saved;
    $('convThread').hidden = false;
    $('convState').textContent = 'Mission : ' + (LABELS[saved.mission.state] || saved.mission.state);
    $('convMessages').replaceChildren(...saved.messages.map(m => {
      const card = el('article', 'manager-message from-' + (m.role === 'user' ? 'user' : 'manager'));
      card.append(el('p', null, m.role === 'user' ? 'Toi' : 'Flemme Manager'), el('p', null, m.assessment ? m.assessment.user_response.message : m.content));
      if (m.assessment) m.assessment.qualification_questions.forEach(q => card.append(el('p', null, q.question)));
      const t = el('time', null, when(m.created_at)); t.dateTime = m.created_at; card.append(t);
      return card;
    }));
    $('convDeliveryList').replaceChildren();
  }
  async function run(action) {
    try { await action(); } catch (e) { notice(e.status ? e.message : 'Connexion interrompue. Réessaie dans un instant.'); }
  }
  async function start() {
    if (started) return;
    if (!(await SB.session())) return;
    started = true;
    client = ManagerV2API.createClient(URL_MANAGER, () => SB.session());
    await run(async () => {
      const count = await list(false);
      $('conversations').hidden = false; $('convTile').hidden = false;
      notice(count ? '' : 'Aucune conversation pour l’instant.');
    });
  }
  $('convList').addEventListener('change', () => run(async () => { const id = $('convList').value; if (!id) return; notice(''); render(await client.read(id)); }));
  $('convOlder').addEventListener('click', () => run(() => list(true)));
  $('convDeliveries').addEventListener('click', () => run(async () => {
    if (!current) return;
    const rows = (await client.deliveries(current.id)).filter(r => r.output && r.output.payload.result);
    $('convDeliveryList').replaceChildren(...(rows.length ? rows.map(r => {
      const a = el('article'); a.append(el('h3', null, 'Livrable du ' + when(r.run.created_at)));
      a.append(el('pre', 'manager-message', r.output.payload.result.markdown || 'Livrable sans texte.'));
      return a;
    }) : [el('p', 'hint', 'Aucun livrable pour cette conversation.')]));
  }));
  // L'espace s'affiche après la connexion (espace.js) : on charge les conversations à ce moment-là.
  const space = $('space');
  new MutationObserver(() => { if (!space.hidden) start(); else { started = false; $('conversations').hidden = true; $('convTile').hidden = true; $('convThread').hidden = true; } }).observe(space, { attributes: true, attributeFilter: ['hidden'] });
  if (!space.hidden) start();
})();
