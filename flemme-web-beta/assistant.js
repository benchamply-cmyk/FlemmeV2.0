'use strict';
/* =========================================================================
   FLEMME — assistant IA de création de demande
   Une bulle en bas à droite ouvre une petite conversation : l'assistant
   (fonction Netlify /api/assistant, qui appelle Claude) pose quelques
   questions, puis prépare la demande. « Remplir le formulaire » la recopie
   dans l'écran #offer (via window.flemmePrefill, défini dans app.js) :
   l'utilisateur relit, ajoute son contact et envoie lui-même.
   ========================================================================= */
(() => {
  const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const API = (NATIVE ? 'https://www.flemme.org' : '') + '/api/assistant';
  const HELLO = 'Salut ! Dis-moi ce que tu as la flemme de faire. Je te pose quelques questions et je prépare ta demande pour toi.';
  const DOWN = 'L’assistant n’est pas disponible pour le moment. Tu peux décrire ta flemme directement dans le champ de l’accueil.';
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };

  let history = [], last = null, busy = false;

  // Bulle d'ouverture et panneau de conversation.
  const fab = el('button', 'ai-fab');
  fab.type = 'button';
  fab.setAttribute('aria-haspopup', 'dialog');
  fab.append(el('span', 'ai-fab-dot', '✦'), el('span', '', 'Me faire guider'));
  const panel = el('section', 'ai-panel');
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-labelledby', 'aiTitle');
  const head = el('div', 'ai-head');
  const title = el('h2', '', 'Assistant Flemme');
  title.id = 'aiTitle';
  const close = el('button', 'ai-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Fermer l’assistant');
  head.append(title, close);
  const log = el('div', 'ai-log');
  log.setAttribute('aria-live', 'polite');
  const chips = el('div', 'ai-chips');
  const form = el('form', 'ai-form');
  const input = el('textarea');
  input.rows = 1;
  input.maxLength = 2000;
  input.placeholder = 'Écris ta réponse…';
  input.setAttribute('aria-label', 'Ta réponse à l’assistant');
  const send = el('button', 'primary', '→');
  send.type = 'submit';
  send.setAttribute('aria-label', 'Envoyer');
  form.append(input, send);
  const note = el('p', 'ai-note', 'Réponses générées par une IA. Évite les informations sensibles.');
  panel.append(head, log, chips, form, note);
  document.body.append(fab, panel);

  const scroll = () => { log.scrollTop = log.scrollHeight; };
  const bubble = (who, text) => { const b = el('p', 'ai-msg ' + who, text); log.append(b); scroll(); return b; };

  function setChips(list, ready) {
    chips.replaceChildren();
    if (ready && last) {
      const go = el('button', 'primary ai-fill', 'Remplir le formulaire →');
      go.type = 'button';
      go.addEventListener('click', fill);
      chips.append(go);
    }
    (list || []).forEach(s => {
      const c = el('button', 'ai-chip', s);
      c.type = 'button';
      c.addEventListener('click', () => ask(s));
      chips.append(c);
    });
  }

  // Récapitulatif de la demande préparée, affiché quand elle est prête.
  function recap(d) {
    const box = el('div', 'ai-recap');
    [['Ton besoin', d.besoin], ['Catégorie', d.categorie], ['Pour quand', d.echeance], ['Précisions', d.precisions]]
      .filter(([, v]) => v).forEach(([k, v]) => { const p = el('p'); p.append(el('b', '', k + ' : '), document.createTextNode(v)); box.append(p); });
    log.append(box);
    scroll();
  }

  async function ask(text) {
    text = String(text || '').trim();
    if (!text || busy) return;
    busy = true; send.disabled = true;
    input.value = '';
    setChips([]);
    bubble('user', text);
    history.push({ role: 'user', content: text });
    const wait = bubble('bot wait', 'Je réfléchis…');
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.message) throw new Error(r.status);
      wait.remove();
      bubble('bot', data.message);
      history.push({ role: 'assistant', content: data.message });
      if (data.demande) last = data.demande;
      if (data.pret && last) recap(last);
      setChips(data.suggestions, data.pret);
    } catch (e) {
      wait.remove();
      history.pop(); // la question pourra être renvoyée
      bubble('bot err', history.length ? 'Oups, je n’ai pas pu répondre. Réessaie dans un instant.' : DOWN);
      if (last) setChips([], true);
    } finally {
      busy = false; send.disabled = false;
      input.focus();
    }
  }

  function fill() {
    if (!last || !window.flemmePrefill) return;
    window.flemmePrefill(last);
    toggle(false);
    // Le formulaire est prêt : il ne reste que le contact à indiquer.
    const contact = document.getElementById('contact');
    if (contact) setTimeout(() => contact.focus({ preventScroll: false }), 50);
  }

  function toggle(open) {
    panel.hidden = !open;
    fab.hidden = open;
    if (!open) { fab.focus(); return; }
    if (!log.childElementCount) {
      bubble('bot', HELLO);
      setChips(['Trouver un artisan', 'Prendre un rendez-vous', 'Un papier administratif', 'Préparer un voyage']);
      // Ce que la personne a déjà commencé à écrire sur l'accueil sert de point de départ.
      const draft = document.getElementById('task');
      if (draft && draft.value.trim()) input.value = draft.value.trim();
    }
    input.focus();
  }

  fab.addEventListener('click', () => toggle(true));
  close.addEventListener('click', () => toggle(false));
  panel.addEventListener('keydown', e => { if (e.key === 'Escape') toggle(false); });
  form.addEventListener('submit', e => { e.preventDefault(); ask(input.value); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input.value); } });
  document.querySelectorAll('[data-assistant]').forEach(b => {
    b.closest('[hidden]') && (b.closest('[hidden]').hidden = false);
    b.addEventListener('click', () => toggle(true));
  });
})();
