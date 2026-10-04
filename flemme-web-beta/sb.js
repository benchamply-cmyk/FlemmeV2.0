'use strict';
/* =========================================================================
   FLEMME — connexion à Supabase pour l'espace personnel
   Pas de bibliothèque : de simples appels HTTP à l'API Supabase.
   - Connexion sans mot de passe : un lien (et un code) envoyés par e-mail.
   - La session est gardée dans le navigateur (localStorage) et renouvelée
     automatiquement.
   Expose window.SB, utilisé par app.js (dépôt d'une demande) et espace.js.
   ========================================================================= */

(() => {
  const C = (window.FLEMME || {}).supabase || {};
  const KEY = 'flemmeSession';
  const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  // Page vers laquelle renvoie le lien de connexion (le vrai site depuis l'application mobile).
  const RETURN_URL = NATIVE ? 'https://www.flemme.org/espace.html' : new URL('espace.html', location.href).href;

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } };
  const save = s => { try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch (e) {} };

  // Messages d'erreur Supabase traduits pour l'utilisateur.
  const FR = {
    otp_expired: 'Ce lien ou ce code a expiré ou a déjà servi. Demande-en un nouveau.',
    over_email_send_rate_limit: 'Trop d’e-mails envoyés. Patiente une minute avant de réessayer.',
    over_request_rate_limit: 'Trop de tentatives. Patiente une minute avant de réessayer.',
    email_address_invalid: 'Cette adresse e-mail n’est pas valide.',
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

    // Inscription ou connexion : Supabase crée le compte au premier envoi.
    sendLink: email => call('/auth/v1/otp?redirect_to=' + encodeURIComponent(RETURN_URL), {
      method: 'POST', body: { email, create_user: true },
    }),

    // Code à 6 chiffres reçu dans le même e-mail (pratique si le lien s'ouvre ailleurs).
    verify: async (email, token) => keep(await call('/auth/v1/verify', { method: 'POST', body: { type: 'email', email, token } })),

    // Retour du lien e-mail : Supabase place la session dans l'adresse (#access_token=…).
    async fromLink() {
      const h = new URLSearchParams(location.hash.slice(1));
      if (!h.get('access_token') && !h.get('error')) return null;
      history.replaceState(null, '', location.pathname + location.search); // on retire les jetons de l'adresse
      if (h.get('error')) throw fail(400, h.get('error_code'), h.get('error_description'));
      const d = { access_token: h.get('access_token'), refresh_token: h.get('refresh_token'), expires_at: h.get('expires_at'), expires_in: h.get('expires_in') };
      d.user = await call('/auth/v1/user', { token: d.access_token });
      return keep(d);
    },

    async logout() {
      const s = load();
      save(null);
      if (s) try { await call('/auth/v1/logout', { method: 'POST', token: s.access_token }); } catch (e) {}
    },

    // Demandes visibles par la personne connectée (les siennes, voir supabase/espace.sql).
    async demandes() {
      const s = await session();
      if (!s) throw fail(401, 'no_session', 'Session expirée. Reconnecte-toi.');
      return call('/rest/v1/demandes?select=ref,besoin,categorie,echeance,statut,message,created_at,updated_at&order=created_at.desc', { token: s.access_token });
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
