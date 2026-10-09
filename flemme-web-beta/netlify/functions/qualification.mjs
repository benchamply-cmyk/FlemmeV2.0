// Same-origin proxy. Neither the OpenAI key nor privileged API routes reach the browser.
import { createHash } from 'node:crypto';
const json = (status, body) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}});
const ID = '[0-9a-f-]{36}';
export default async (req, context) => {
  const url = new URL(req.url);
  const path = url.pathname.slice('/api/qualification'.length);
  const allowed = (path === '/conversations' && req.method === 'POST') ||
    (new RegExp(`^/conversations/${ID}$`).test(path) && ['GET','DELETE'].includes(req.method)) ||
    (new RegExp(`^/conversations/${ID}/(messages|confirm)$`).test(path) && req.method === 'POST');
  if (!allowed || url.search) return json(404, {detail:'Route introuvable.'});
  const origin = req.headers.get('origin');
  if ((origin && origin !== url.origin) || req.headers.get('sec-fetch-site') === 'cross-site') return json(403, {detail:'Accès refusé.'});
  if (req.method === 'POST' && (!origin || !req.headers.get('content-type')?.startsWith('application/json'))) return json(415, {detail:'Requête JSON attendue.'});
  const base = process.env.FLEMME_API_URL, key = process.env.FLEMME_SERVICE_KEY;
  if (!base || !key || process.env.QUALIFICATION_ENABLED !== 'true') return json(503, {detail:'Assistant indisponible. Utilise le formulaire.'});
  let upstream;
  try {
    upstream = new URL(base);
    if (upstream.protocol !== 'https:' || upstream.username || upstream.password || upstream.search || upstream.hash || upstream.pathname !== '/') throw new Error();
  } catch {return json(503, {detail:'Assistant indisponible.'});}
  // Stream with a hard byte cap (even if Content-Length is absent or forged).
  let body;
  if (req.method === 'POST') {
    const reader = req.body?.getReader();
    if (!reader) return json(400, {detail:'Corps manquant.'});
    const chunks = []; let size = 0;
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 12000) {await reader.cancel();return json(413, {detail:'Message trop long.'});}
      chunks.push(value);
    }
    body = Buffer.concat(chunks);
  }
  const headers = {'Content-Type':'application/json', 'X-Flemme-Service-Key':key,
    'X-Flemme-Client-Id':createHash('sha256').update(context.ip || 'unknown').digest('hex')};
  const auth = req.headers.get('authorization');
  if (auth) headers.Authorization = auth;
  try {
    const r = await fetch(new URL('/api/qualification' + path, upstream), {method:req.method, headers, body, signal:AbortSignal.timeout(45000), redirect:'error'});
    if (r.status === 204) return new Response(null, {status:204, headers:{'Cache-Control':'no-store'}});
    if (![200,201,404,409,422,429,502,503].includes(r.status)) return json(502, {detail:'Assistant indisponible.'});
    return new Response(await r.text(), {status:r.status, headers:{'Content-Type':'application/json', 'Cache-Control':'no-store'}});
  } catch {return json(502, {detail:'Connexion interrompue. Réessaie ou utilise le formulaire.'});}
};
export const config = {path:'/api/qualification/*'};
