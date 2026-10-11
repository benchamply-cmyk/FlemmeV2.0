 'use strict';
window.ADMIN = (() => {
  const C = window.FLEMME.supabase;
  async function call(path, options = {}) {
    const s = await SB.session();
    if (!s) throw Object.assign(new Error('Reconnectez-vous pour continuer.'), { status: 401 });
    const response = await fetch(C.url + '/rest/v1/' + path, {
      method: options.method || 'GET', cache: 'no-store',
      headers: { apikey: C.cle, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    if (!response.ok) throw Object.assign(new Error('Accès refusé ou opération indisponible (' + response.status + ').'), { status: response.status });
    const text = await response.text(); return text ? JSON.parse(text) : null;
  }
  async function paged(path) {
    const result = []; let offset = 0;
    for (;;) {
      const batch = await call(path + '&limit=500&offset=' + offset);
      result.push(...batch); if (batch.length < 500) return result; offset += 500;
    }
  }
  async function service(resource, options = {}) {
    const s = await SB.session();
    if (!s) throw Object.assign(new Error('Reconnectez-vous.'), { status: 401 });
    const response = await fetch('/api/gestionadmin?resource=' + encodeURIComponent(resource), {
      method: options.method || 'GET', cache: 'no-store',
      headers: { Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json' },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.message || 'Service indisponible.'), { status: response.status });
    return data;
  }
  return {
    membre: () => call('rpc/est_admin', { method: 'POST', body: {} }),
    demandes: () => paged('demandes?select=*&order=created_at.desc,id.desc'),
    derniers: async () => {
      const rows = await paged('messages?select=demande_id,auteur,created_at&order=created_at.desc,id.desc');
      const last = {}; rows.forEach(m => { if (!last[m.demande_id]) last[m.demande_id] = m; }); return last;
    },
    modifier: (id, champs) => call('rpc/admin_modifier_demande', { method: 'POST', body: { cible: id, nouveau_statut: champs.statut, nouveau_message: champs.message } }),
    repondre: (id, texte) => call('rpc/admin_repondre', { method: 'POST', body: { cible: id, contenu: texte } }),
    journal: () => paged('admin_journal?select=*&order=created_at.desc,id.desc'),
    noter: (sujet, statut, note) => call('rpc/admin_noter', { method: 'POST', body: { sujet, statut, note } }),
    liens: id => call('admin_missions?select=mission_id&demande_id=eq.' + encodeURIComponent(id)),
    lier: (cible, mission) => call('rpc/admin_lier_mission', { method:'POST', body:{cible,mission} }),
    service
  };
})();
