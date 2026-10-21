/* Aperçu seulement (jamais publié sur le site) : remplace sb.js et manager-v2-api.js
   par des données fictives pour voir Mon espace et Mes conversations sans compte.
   Un petit sélecteur en bas de l'écran change l'état : déconnecté, espace rempli, espace vide. */
(() => {
  'use strict';
  const KEY = 'flemme-apercu-etat';
  let etat = 'connecte';
  try { etat = localStorage.getItem(KEY) || 'connecte'; } catch (e) {}
  const setEtat = v => { etat = v; try { localStorage.setItem(KEY, v); } catch (e) {} };

  window.FLEMME = window.FLEMME || {};
  FLEMME.supabase = { url: 'https://demo.invalid', cle: 'demo' };
  FLEMME.managerV2 = { url: 'https://manager.demo' };

  const jour = n => new Date(Date.now() - n * 864e5).toISOString();
  const compte = { email: 'ben@exemple.fr', access_token: 'demo', id: 'demo' };
  const ok = v => new Promise(r => setTimeout(() => r(v), 250));
  const DEMANDES = [
    { id: 'd1', ref: 'FL-2481', statut: 'en_cours', created_at: jour(3), updated_at: jour(0), categorie: 'Artisans et travaux', echeance: 'Avant fin octobre', besoin: 'Trouver un plombier pour remplacer le ballon d’eau chaude (200 L) et comparer au moins deux devis.', message: 'Deux artisans passent jeudi entre 9 h et 11 h. On t’envoie les devis dès réception.', precisions: 'Appartement au 3e sans ascenseur, accès cave possible.' },
    { id: 'd2', ref: 'FL-2475', statut: 'en_etude', created_at: jour(5), updated_at: jour(5), categorie: 'Administratif', besoin: 'Résilier mon abonnement de salle de sport et récupérer les deux mois payés d’avance.' },
    { id: 'd3', ref: 'FL-2402', statut: 'terminee', created_at: jour(19), updated_at: jour(12), categorie: 'Rendez-vous', besoin: 'Prendre rendez-vous chez un dermatologue à Lyon avant décembre.', message: 'Rendez-vous confirmé le 4 novembre à 10 h 30 avec le Dr Martin.' },
    { id: 'd4', ref: 'FL-2390', statut: 'refusee', created_at: jour(24), updated_at: jour(22), besoin: 'Faire la queue à ma place pour un concert.', message: 'On ne propose pas encore ce type de présence physique. On te tient au courant dès que la Brigade le permet.' },
  ];
  const MSGS = { d1: [
    { auteur: 'client', texte: 'Je suis là jeudi matin, c’est parfait.', created_at: jour(1) },
    { auteur: 'equipe', texte: 'Noté ! On confirme aux deux artisans.', created_at: jour(0.9) },
  ] };

  window.SB = {
    ready: true,
    fromLink: async () => null,
    session: async () => (etat === 'deconnecte' ? null : compte),
    current: () => (etat === 'deconnecte' ? null : compte),
    recovering: () => false,
    providers: async () => ({ google: true, apple: true }),
    login: async () => { setEtat('connecte'); return ok(compte); },
    loginPseudo: async () => { setEtat('connecte'); return ok(compte); },
    signup: async () => ok(null),
    verify: async () => { setEtat('connecte'); return ok(compte); },
    recover: async () => ok(true),
    sendLink: async () => ok(true),
    oauth: () => {},
    logout: async () => { setEtat('deconnecte'); return ok(true); },
    pseudo: async () => 'ben',
    setPseudo: async () => ok(true),
    setPassword: async () => ok(compte),
    supprimer: async () => ok(true),
    equipe: { membre: async () => true },
    demandes: async () => ok(etat === 'vide' ? [] : DEMANDES),
    messages: async id => ok(MSGS[id] || []),
    ecrire: async (id, texte) => { (MSGS[id] ||= []).push({ auteur: 'client', texte, created_at: new Date().toISOString() }); return ok(true); },
    blocPieces(d) {
      const box = document.createElement('div');
      if (!d.precisions) return box;
      box.className = 'pieces-box';
      const b = document.createElement('b'); b.textContent = 'Précisions';
      const p = document.createElement('p'); p.className = 'precisions-txt'; p.textContent = d.precisions;
      box.append(b, p);
      return box;
    },
  };

  // Flemme Manager : une conversation qualifiée (comparaison de devis) et une plus ancienne.
  const conv = {
    c1: { id: 'c1', revision: 3, created_at: jour(1), pending_request_id: null, mission: { state: 'qualified' },
      messages: [
        { role: 'user', content: 'J’ai reçu deux devis pour refaire ma salle de bain, je ne sais pas lequel choisir.', created_at: jour(1) },
        { role: 'assistant', created_at: jour(1), assessment: { mission_status: 'ready', selected_workflow: { workflow_id: 'comparer_devis' },
          user_response: { message: 'Je peux comparer ces deux devis poste par poste : prix, prestations incluses, délais et garanties.' },
          qualification_questions: [{ question: 'As-tu un budget maximal ?' }, { question: 'Une date limite pour le début des travaux ?' }] } },
        { role: 'user', content: 'Budget 9 000 € TTC, travaux avant février.', created_at: jour(0.5) },
        { role: 'assistant', created_at: jour(0.5), assessment: { mission_status: 'ready', selected_workflow: { workflow_id: 'comparer_devis' },
          user_response: { message: 'Brief prêt. Ajoute les deux devis ci-dessous et je prépare le rapport comparatif.' }, qualification_questions: [] } },
      ],
      events: [
        { kind: 'created', created_at: jour(1), payload: {} },
        { kind: 'qualification', created_at: jour(0.5), payload: { note: 'Comparaison de devis, budget 9 000 € TTC.' } },
      ] },
    c2: { id: 'c2', revision: 5, created_at: jour(9), pending_request_id: null, mission: { state: 'completed' },
      messages: [{ role: 'user', content: 'Trouver un déménageur pour Lyon → Annecy.', created_at: jour(9) }],
      events: [{ kind: 'created', created_at: jour(9), payload: {} }, { kind: 'status', created_at: jour(4), payload: { note: 'Déménagement réservé.' } }] },
  };
  window.ManagerV2API = { createClient: () => ({
    list: async () => ok(Object.values(conv).map(c => ({ id: c.id, created_at: c.created_at, state: c.mission.state }))),
    read: async id => ok(structuredClone(conv[id])),
    create: async () => ok({ id: 'c3', revision: 1, created_at: new Date().toISOString(), pending_request_id: null, mission: { state: 'draft' }, messages: [], events: [{ kind: 'created', created_at: new Date().toISOString(), payload: {} }] }),
    send: async (id, body) => { const c = conv[id] || conv.c1; c.messages.push({ role: 'user', content: body.request, created_at: new Date().toISOString() }); c.revision++; return ok(structuredClone(c)); },
    event: async id => ok(structuredClone(conv[id])),
    recover: async id => ok(structuredClone(conv[id])),
    deliveries: async () => ok([]),
    produce: async () => ok({ run: { id: 'r1', created_at: new Date().toISOString(), input: {} }, output: { payload: { result: { markdown: '# Rapport (aperçu)\n\nDevis A : 8 450 € TTC, délai 6 semaines.\nDevis B : 9 200 € TTC, hors budget.' } } } }),
    recoverDelivery: async () => ok(true),
    acquire: async () => ok({ run: { id: 'r2', input: {} }, output: { payload: { result: { markdown: 'Résultat fictif de l’aperçu.', sources: [] } } } }),
    original: async () => new Blob(['aperçu']),
  }) };

  // Sélecteur d'état de l'aperçu
  addEventListener('DOMContentLoaded', () => {
    const bar = document.createElement('div');
    bar.setAttribute('style', 'position:fixed;z-index:99;left:12px;bottom:12px;display:flex;gap:4px;align-items:center;padding:6px;background:#16131f;color:#fff;border-radius:999px;font:12px "Geist Mono",monospace;box-shadow:0 6px 20px rgba(0,0,0,.25)');
    const lbl = document.createElement('span'); lbl.textContent = 'Aperçu'; lbl.setAttribute('style', 'padding:0 8px');
    bar.append(lbl);
    [['deconnecte', 'Déconnecté'], ['connecte', 'Connecté'], ['vide', 'Sans demande']].forEach(([v, t]) => {
      const b = document.createElement('button');
      b.textContent = t; b.type = 'button';
      b.setAttribute('style', 'border:0;border-radius:999px;padding:6px 10px;cursor:pointer;font:inherit;' + (v === etat ? 'background:#a5ccff;color:#16131f' : 'background:transparent;color:#fff'));
      b.addEventListener('click', () => { setEtat(v); location.reload(); });
      bar.append(b);
    });
    document.body.append(bar);
  });
})();
