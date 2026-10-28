import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RemoteGateway } from '../src/gateway.ts';
test('transport : jeton sécurisé, session et identifiant idempotent envoyés à la RPC', async () => {
  let saved: string | null = null;
  const calls: { path: string; body: any; headers: any }[] = [];
  const transport = async (path: any, init: any) => {
    calls.push({ path, body: JSON.parse(init.body), headers: init.headers });
    return new Response(JSON.stringify(path.includes('/token') ? { access_token: 'access', refresh_token: 'refresh', expires_in: 3600, user: { id: 'a', email: 'ben@example.com' } } : { tasks: [], task: { id: 'new' } }), { status: 200 });
  };
  const g = new RemoteGateway('https://example.supabase.co', 'sb_publishable_test', { get: async () => saved, set: async v => { saved = v; }, clear: async () => { saved = null; } }, transport);
  await g.login('ben@example.com', 'password');
  assert.equal(saved, 'refresh'); assert.equal(g.actor.id, 'a');
  await g.create({ title: 'Une tâche' }, 'request-id');
  assert.equal(calls[1].headers.Authorization, 'Bearer access');
  assert.equal(calls[1].body.p_request, 'request-id');
  assert.equal(calls[1].body.p_data.actorName, 'ben');
  await g.logout(); assert.equal(saved, null); assert.equal(g.actor.id, '');
});
test('erreurs réseau remontées, pas de faux succès ni de bascule silencieuse en démo', async () => {
  const storage = { get: async () => null, set: async () => {}, clear: async () => {} };
  const g = new RemoteGateway('https://example.supabase.co', 'public', storage, async () => { throw new Error('offline'); });
  await assert.rejects(g.login('x', 'x'), /Connexion interrompue/);
  assert.equal(g.actor.id, '');
  assert.throws(() => new RemoteGateway('http://example.com', 'public', storage));
  assert.throws(() => new RemoteGateway('https://example.com', 'sb_secret_x', storage));
});
test('reprise : les appels concurrents partagent un seul renouvellement du jeton', async () => {
  let refreshes = 0;
  const storage = { get: async () => 'refresh', set: async () => {}, clear: async () => {} };
  const g = new RemoteGateway('https://example.supabase.co', 'public', storage, async (path: any) => {
    if (path.includes('/token')) { refreshes++; await new Promise(r => setTimeout(r, 5)); return new Response(JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_in: 3600, user: { id: 'u', email: 'u@example.com' } })); }
    return new Response(JSON.stringify({ tasks: [] }));
  });
  await Promise.all([g.list(), g.list()]); assert.equal(refreshes, 1);
});
