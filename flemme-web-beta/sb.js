'use strict';
/* =========================================================================
   FLEMME — connexion à Supabase pour l'espace personnel
   Pas de bibliothèque : de simples appels HTTP à l'API Supabase.
   - Connexion par e-mail et mot de passe, par un lien (et un code) envoyés
     par e-mail, ou avec un compte Google / Apple.
   - Liens et comptes Google / Apple passent par le flux PKCE : l'adresse de
     retour ne contient qu'un code à usage unique, inutilisable sans le secret
     gardé dans ce navigateur (aucun jeton de session dans l'URL).
   - La session est gardée dans le navigateur (localStorage) et renouvelée
     automatiquement.
   Expose window.SB, utilisé par app.js (dépôt d'une demande) et espace.js.
   ========================================================================= */

(() => {
  const C = (window.FLEMME || {}).supabase || {};
  const KEY = 'flemmeSession';
  const PKCE = 'flemmePkce';
  const RECOVER = 'flemmeRecover'; // posé quand on demande un lien « mot de passe oublié »
  const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  // Page vers laquelle renvoie le lien de connexion (le vrai site depuis l'application mobile).
  const RETURN_URL = NATIVE ? 'https://www.flemme.org/espace.html' : new URL('espace.html', location.href).href;

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } };
  const save = s => { try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch (e) {} };

  // PKCE : secret aléatoire gardé ici, Supabase n'en reçoit que l'empreinte SHA-256.
  const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  async function challenge() {
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
    try { localStorage.setItem(PKCE, verifier); } catch (e) {}
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return { code_challenge: b64url(hash), code_challenge_method: 's256' };
  }

  // Messages d'erreur Supabase traduits pour l'utilisateur.
  const FR = {
    otp_expired: 'Ce lien ou ce code a expiré ou a déjà servi. Demande-en un nouveau.',
    over_email_send_rate_limit: 'Trop d’e-mails de connexion envoyés pour l’instant. Réessaie un peu plus tard, ou utilise le dernier e-mail reçu.',
    over_request_rate_limit: 'Trop de tentatives. Patiente une minute avant de réessayer.',
    email_address_invalid: 'Cette adresse e-mail n’est pas valide.',
    flow_state_not_found: 'Ce lien a été ouvert dans un autre navigateur que celui de la demande. Saisis plutôt le code reçu dans l’e-mail, ou redemande un lien ici.',
    flow_state_expired: 'Ce lien a expiré. Demande-en un nouveau.',
    access_denied: 'Connexion annulée.',
    invalid_credentials: 'Identifiant ou mot de passe incorrect.',
    email_not_confirmed: 'Confirme d’abord ton adresse avec le lien reçu par e-mail.',
    weak_password: 'Mot de passe trop faible : au moins 8 caractères, avec lettres et chiffres.',
    same_password: 'C’est déjà ton mot de passe actuel.',
    user_already_exists: 'Un compte existe déjà avec cette adresse. Utilise l’onglet « Se connecter ».',
    pseudo_pris: 'Ce pseudo est déjà pris. Choisis-en un autre.',
    otp_disabled: 'Aucun compte n’existe avec cette adresse. Utilise l’onglet « Créer mon compte ».',
  };
  const fail = (status, code, msg) => {
    const e = new Error(FR[code] || (status === 429 ? FR.over_request_rate_limit : msg || 'Erreur ' + status));
    e.status = status; e.code = code;
    return e;
  };

  async function call(path, { method = 'GET', body, token, headers = {} } = {}) {
    const r = await fetch(C.url + path, {
      method,
      headers: Object.assign({ apikey: C.cle, 'Content-Type': 'application/json' },
        token ? { Authorization: 'Bearer ' + token } : {}, headers),
      body: body ? JSON.stringify(body) : undefined,
    });
    const txt = await r.text();
    let data = null;
    try { data = txt ? JSON.parse(txt) : null; } catch (e) {}
    if (!r.ok) throw fail(r.status, data && (data.error_code || data.code), data && (data.msg || data.message || data.error_description));
    return data;
  }

  // Enregistre la session renvoyée par Supabase.
  function keep(d) {
    const s = {
      access_token: d.access_token,
      refresh_token: d.refresh_token,
      expires_at: Number(d.expires_at) || Math.floor(Date.now() / 1000) + Number(d.expires_in || 3600),
      email: d.user && d.user.email,
      id: d.user && d.user.id,
    };
    save(s);
    return s;
  }

  // Session valide (renouvelée si besoin), ou null si personne n'est connecté.
  async function session() {
    const s = load();
    if (!s || !s.refresh_token) return null;
    if (s.expires_at - 60 > Date.now() / 1000) return s;
    try {
      return keep(await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh_token } }));
    } catch (e) {
      if (e.status >= 400 && e.status < 500) save(null); // session révoquée : il faut se reconnecter
      return null;
    }
  }

  window.SB = {
    ready: !!(C.url && C.cle),
    session,
    current: load,

    // create = true : inscription (Supabase crée le compte s'il n'existe pas) ;
    // false : connexion seulement, refusée si aucun compte n'a cette adresse.
    sendLink: async (email, create) => call('/auth/v1/otp?redirect_to=' + encodeURIComponent(RETURN_URL), {
      method: 'POST', body: Object.assign({ email, create_user: !!create }, await challenge()),
    }),

    // Connexion directe avec e-mail et mot de passe.
    login: async (email, password) => keep(await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } })),

    // Connexion avec un pseudo : la base ne renvoie l'e-mail du compte que si
    // le mot de passe est le bon (voir supabase/espace.sql).
    async loginPseudo(pseudo, password) {
      const email = await call('/rest/v1/rpc/connexion_pseudo', { method: 'POST', body: { p: pseudo, mdp: password } });
      if (!email) throw fail(400, 'invalid_credentials');
      return keep(await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } }));
    },

    // Pseudo de la personne connectée ('' si aucun).
    async pseudo() {
      const s = await session();
      if (!s) return '';
      try { const r = await call('/rest/v1/profils?select=pseudo', { token: s.access_token }); return (r[0] && r[0].pseudo) || ''; } catch (e) { return ''; }
    },
    // Choisir, changer (pseudo) ou retirer ('') son pseudo.
    async setPseudo(pseudo) {
      const s = await session();
      if (!s) throw fail(401, 'no_session', 'Session expirée. Reconnecte-toi.');
      if (!pseudo) return call('/rest/v1/profils?user_id=eq.' + s.id, { method: 'DELETE', token: s.access_token });
      try {
        await call('/rest/v1/profils?on_conflict=user_id', {
          method: 'POST', token: s.access_token,
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: { user_id: s.id, pseudo },
        });
      } catch (e) {
        throw e.code === '23505' ? fail(409, 'pseudo_pris') : e; // pseudo déjà utilisé par un autre compte
      }
    },

    // Inscription avec mot de passe. Pseudo facultatif. Renvoie la session si Supabase n'exige pas
    // de confirmer l'adresse, sinon null : un e-mail de confirmation est parti.
    async signup(email, password, pseudo) {
      if (pseudo && !(await call('/rest/v1/rpc/pseudo_libre', { method: 'POST', body: { p: pseudo } }))) throw fail(409, 'pseudo_pris');
      const d = await call('/auth/v1/signup?redirect_to=' + encodeURIComponent(RETURN_URL), {
        method: 'POST', body: Object.assign({ email, password, data: pseudo ? { pseudo } : {} }, await challenge()),
      });
      return d && d.access_token ? keep(d) : null;
    },

    // Mot de passe oublié (ou jamais créé) : lien et code par e-mail, puis nouveau mot de passe.
    async recover(email) {
      await call('/auth/v1/recover?redirect_to=' + encodeURIComponent(RETURN_URL), {
        method: 'POST', body: Object.assign({ email }, await challenge()),
      });
      try { localStorage.setItem(RECOVER, '1'); } catch (e) {}
    },
    // true une seule fois après le retour d'un lien « mot de passe oublié ».
    recovering() {
      try { const r = localStorage.getItem(RECOVER); localStorage.removeItem(RECOVER); return !!r; } catch (e) { return false; }
    },

    async setPassword(password) {
      const s = await session();
      if (!s) throw fail(401, 'no_session', 'Session expirée. Reconnecte-toi.');
      await call('/auth/v1/user', { method: 'PUT', token: s.access_token, body: { password } });
    },

    // Code à 6 chiffres reçu dans le même e-mail (pratique si le lien s'ouvre ailleurs).
    verify: async (email, token) => keep(await call('/auth/v1/verify', { method: 'POST', body: { type: 'email', email, token } })),

    // Fournisseurs activés dans Supabase (Authentication > Providers), ex. { google: true, apple: false }.
    async providers() {
      if (NATIVE) return {}; // Google refuse la connexion dans une vue intégrée d'application
      try { return (await call('/auth/v1/settings')).external || {}; } catch (e) { return {}; }
    },

    // Connexion avec Google ou Apple : on part chez le fournisseur, retour sur espace.html?code=…
    async oauth(provider) {
      const c = await challenge();
      location.assign(C.url + '/auth/v1/authorize?' + new URLSearchParams(Object.assign({ provider, redirect_to: RETURN_URL }, c)));
    },

    // Retour d'un lien e-mail ou de Google / Apple : on échange le code contre une session.
    async fromLink() {
      const q = new URLSearchParams(location.search), h = new URLSearchParams(location.hash.slice(1));
      const err = q.get('error') ? q : h.get('error') ? h : null;
      const code = q.get('code');
      if (!code && !err) return null;
      history.replaceState(null, '', location.pathname); // on retire le code de l'adresse
      if (err) throw fail(400, err.get('error_code') || err.get('error'), err.get('error_description'));
      let verifier = null;
      try { verifier = localStorage.getItem(PKCE); localStorage.removeItem(PKCE); } catch (e) {}
      if (!verifier) throw fail(400, 'flow_state_not_found');
      return keep(await call('/auth/v1/token?grant_type=pkce', { method: 'POST', body: { auth_code: code, code_verifier: verifier } }));
    },

    // everywhere = true : déconnecte aussi tous les autres appareils.
    async logout(everywhere) {
      const s = await session();
      save(null);
      if (s) try { await call('/auth/v1/logout' + (everywhere ? '?scope=global' : ''), { method: 'POST', token: s.access_token }); } catch (e) {}
    },

    // Droit à l'effacement : supprime le compte et les demandes associées (voir supabase/espace.sql).
    async supprimer() {
      const s = await session();
      if (!s) throw fail(401, 'no_session', 'Session expirée. Reconnecte-toi.');
      await call('/rest/v1/rpc/supprimer_mon_compte', { method: 'POST', token: s.access_token, body: {} });
      save(null);
    },

    // Demandes visibles par la personne connectée (les siennes, voir supabase/espace.sql).
    async demandes() {
      const s = await session();
      if (!s) throw fail(401, 'no_session', 'Session expirée. Reconnecte-toi.');
      return call('/rest/v1/demandes?select=id,ref,besoin,categorie,echeance,statut,message,created_at,updated_at&order=created_at.desc', { token: s.access_token });
    },

    // Discussion d'une demande, du plus ancien au plus récent.
    async messages(demandeId) {
      const s = await session();
      if (!s) throw fail(401, 'no_session', 'Session expirée. Reconnecte-toi.');
      return call('/rest/v1/messages?select=id,auteur,texte,created_at&order=created_at.asc&demande_id=eq.' + encodeURIComponent(demandeId), { token: s.access_token });
    },

    async ecrire(demandeId, texte) {
      const s = await session();
      if (!s) throw fail(401, 'no_session', 'Session expirée. Reconnecte-toi.');
      return call('/rest/v1/messages', { method: 'POST', token: s.access_token, headers: { Prefer: 'return=minimal' }, body: { demande_id: demandeId, texte } });
    },

    // Copie d'une demande envoyée depuis l'accueil, pour pouvoir la suivre.
    async deposer(row) {
      const s = await session();
      return call('/rest/v1/demandes', {
        method: 'POST',
        token: s && s.access_token,
        headers: { Prefer: 'return=minimal' }, // un visiteur n'a pas le droit de relire la ligne
        body: Object.assign({}, row, { user_id: s ? s.id : null }),
      });
    },
  };
})();
