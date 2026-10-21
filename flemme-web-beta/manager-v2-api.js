(function (root) {
  'use strict';
  function createClient(base, session, fetcher = fetch) {
    const url = new URL(base);
    if (url.protocol !== 'https:') throw new Error('Adresse du Manager invalide.');
    async function call(path, method = 'GET', body, prefix = '/api/v2') {
      const account = await session();
      if (!account) throw Object.assign(new Error('Connecte-toi pour retrouver tes conversations.'), {status: 401});
      const response = await fetcher(url.origin + prefix + path, {
        method, cache: 'no-store',
        headers: {Authorization: 'Bearer ' + account.access_token, 'Content-Type': 'application/json'},
        ...(body ? {body: JSON.stringify(body)} : {})
      });
      if (!response.ok) {
        const messages = {401: 'Reconnecte-toi et vérifie que ton e-mail est confirmé.',
          403: 'Les agents sont réservés aux administrateurs.',
          404: 'Conversation introuvable.', 409: 'La conversation a changé. Actualise-la avant de poursuivre.',
          422: 'Vérifie les informations saisies.', 429: 'La limite d’analyse est atteinte. Réessaie plus tard.', 502: 'Analyse non aboutie. Actualise pour retrouver ton message.',
          503: 'Le Manager est indisponible. Actualise pour vérifier si ton message a été enregistré.'};
        throw Object.assign(new Error(messages[response.status] || 'Le Manager n’a pas pu répondre.'), {status: response.status});
      }
      return response.json();
    }
    return {
      access: () => call('/access'),
      plan: (id,body) => call('/conversations/'+encodeURIComponent(id)+'/agent-plans','POST',body),
      approvePlan: (id,plan,body) => call('/conversations/'+encodeURIComponent(id)+'/agent-plans/'+encodeURIComponent(plan)+'/approve','POST',body),
      acquire: (id, body) => call('/conversations/' + encodeURIComponent(id) + '/acquisitions', 'POST', body, '/api/v4'),
      original: async (id, run, index) => {
        const account = await session();
        if (!account) throw Object.assign(new Error('Reconnecte-toi.'), {status:401});
        const response = await fetcher(url.origin + '/api/v4/conversations/' + encodeURIComponent(id) + '/acquisitions/' + encodeURIComponent(run) + '/documents/' + index,
          {cache:'no-store',headers:{Authorization:'Bearer '+account.access_token}});
        if (!response.ok) throw Object.assign(new Error('Document indisponible.'), {status:response.status});
        return response.blob();
      },
      deliveries: id => call('/conversations/' + encodeURIComponent(id) + '/deliveries', 'GET', undefined, '/api/v3'),
      produce: (id, body) => call('/conversations/' + encodeURIComponent(id) + '/deliveries', 'POST', body, '/api/v3'),
      recoverDelivery: (id, body) => call('/conversations/' + encodeURIComponent(id) + '/deliveries/recover', 'POST', body, '/api/v3'),
      list: (offset = 0) => call('/conversations?limit=100&offset=' + offset),
      create: id => call('/conversations', 'POST', {conversation_id: id}),
      read: id => call('/conversations/' + encodeURIComponent(id)),
      send: (id, body) => call('/conversations/' + encodeURIComponent(id) + '/messages', 'POST', body),
      event: (id, body) => call('/conversations/' + encodeURIComponent(id) + '/mission/events', 'POST', body),
      recover: (id, body) => call('/conversations/' + encodeURIComponent(id) + '/messages/recover', 'POST', body)
    };
  }
  root.ManagerV2API = {createClient};
})(typeof window === 'undefined' ? globalThis : window);
