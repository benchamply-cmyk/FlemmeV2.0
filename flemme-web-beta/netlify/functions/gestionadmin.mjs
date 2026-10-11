// Server-side gateway. Tokens never leave this function. 2026-10-11.
import { managerNative } from '../lib/manager.mjs';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: {
  'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Authorization',
  'X-Content-Type-Options': 'nosniff'
} });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function upstream(url, options = {}) {
  return fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(12000) });
}
export default async req => {
  if (!['GET', 'POST'].includes(req.method)) return json({ message: 'Méthode refusée.' }, 405);
  const authorization = req.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ message: 'Connexion requise.' }, 401);
  const sb = process.env.SUPABASE_URL?.replace(/\/+$/, ''), key = process.env.SUPABASE_ANON_KEY;
  if (!sb || !key) return json({ message: 'Accès admin non configuré.' }, 503);
  try {
    // Supabase validates the JWT, then checks the pinned owner UUID in the database.
    const access = await upstream(sb + '/rest/v1/rpc/est_admin', {
      method: 'POST', headers: { apikey: key, Authorization: authorization, 'Content-Type': 'application/json' }, body: '{}'
    });
    if (!access.ok) return json({ message: 'Connexion expirée ou contrôle admin indisponible.' }, access.status === 401 ? 401 : 503);
    if (await access.json() !== true) return json({ message: 'Accès réservé au propriétaire.' }, 403);
    const resource = new URL(req.url).searchParams.get('resource');
    if (resource === 'brigade') {
      if (req.method !== 'GET') return json({ message: 'Méthode refusée.' }, 405);
      const token = process.env.NETLIFY_ADMIN_TOKEN, site = process.env.SITE_ID;
      if (!token || !site) return json({ message: 'Les candidatures ne sont pas raccordées : configurer NETLIFY_ADMIN_TOKEN. SITE_ID est fourni automatiquement par Netlify.' }, 503);
      const headers = { Authorization: 'Bearer ' + token };
      const formsResponse = await upstream('https://api.netlify.com/api/v1/sites/' + encodeURIComponent(site) + '/forms', { headers });
      if (!formsResponse.ok) return json({ message: 'Lecture des formulaires indisponible.' }, 502);
      const form = (await formsResponse.json()).find(f => f.name === 'facilitateur');
      if (!form) return json({ items: [] });
      const rows = [];
      for (let page = 1; ; page++) {
        const response = await upstream('https://api.netlify.com/api/v1/forms/' + encodeURIComponent(form.id) + '/submissions?per_page=100&page=' + page, { headers });
        if (!response.ok) return json({ message: 'Lecture des candidatures indisponible.' }, 502);
        const batch = await response.json(); rows.push(...batch);
        if (batch.length < 100) break;
      }
      return json({ items: rows.map(r => ({ id: r.id, created_at: r.created_at, data: r.data })) });
    }
    if (resource === 'missions' || resource?.startsWith('mission:') || resource?.startsWith('qualifier:')) {
      const base = process.env.FLEMME_MANAGER_URL?.replace(/\/+$/, ''), token = process.env.FLEMME_MANAGER_TOKEN;
      if(resource !== 'missions' && !UUID.test(resource.slice(resource.startsWith('qualifier:')?10:8))) return json({message:'Mission ou demande invalide.'},400);
      if(!base && !token) return managerNative(req,resource,{sb,key,authorization},json);
      if (!base || !token) return json({ message: 'Configuration du Manager externe incomplète.' }, 503);
      if(resource.startsWith('qualifier:')) return json({message:'Qualification depuis une demande disponible avec le Manager Netlify.'},422);
      if (new URL(base).protocol !== 'https:') return json({ message: 'Le Manager doit être raccordé en HTTPS.' }, 503);
      let path = '/api/v2/conversations'; let body;
      if (resource === 'missions') {
        if (req.method !== 'GET') return json({ message: 'Méthode refusée.' }, 405);
        const items = []; let offset = 0, total;
        do {
          const response = await upstream(base + path + '?limit=100&offset=' + offset, { headers: { Authorization: 'Bearer ' + token } });
          if (!response.ok) return json({ message: 'Manager indisponible.' }, response.status === 503 ? 503 : 502);
          const result = await response.json(); items.push(...result.items); total = result.total; offset += result.items.length;
          if (!result.items.length) break;
        } while(offset < total);
        return json({ items, total });
      }
      const id = resource.slice(8);
      if (!UUID.test(id)) return json({ message: 'Mission invalide.' }, 400);
      path += '/' + id;
      if (req.method === 'POST') {
        body = await req.json();
        if (Object.keys(body).some(k => !['state','note','expected_revision'].includes(k)) ||
            !['in_progress','blocked','completed'].includes(body.state) || !Number.isInteger(body.expected_revision) || body.expected_revision < 0 ||
            typeof body.note !== 'string' || !body.note.trim() || body.note.length > 2000) return json({ message: 'Commande invalide.' }, 400);
        path += '/mission/events';
      }
      const response = await upstream(base + path, { method: req.method,
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      if (!response.ok) return json({ message: response.status === 409 ? 'Mission modifiée ailleurs : rechargez avant de réessayer.' : 'Commande refusée par le Manager.' }, [404,409,422,503].includes(response.status) ? response.status : 502);
      return json(await response.json());
    }
    return json({ message: 'Ressource inconnue.' }, 404);
  } catch { return json({ message: 'Service indisponible. Réessayez sans modifier les données.' }, 502); }
};
export const config = { path: '/api/gestionadmin' };
