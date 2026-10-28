import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const { PGlite } = await import(process.env.PGLITE_MODULE_URL || '@electric-sql/pglite');
const db = new PGlite();
await db.exec([
  'create role anon; create role authenticated;',
  'create schema auth;',
  'create table auth.users(id uuid primary key,email_confirmed_at timestamptz);',
  "create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;",
  "create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;",
  'grant usage on schema auth to authenticated;',
  'grant execute on function auth.uid(),auth.jwt() to authenticated;'
].join('\n'));
const users = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
for (const [i, id] of users.entries()) await db.query('insert into auth.users values($1,$2)', [id, i === 3 ? null : new Date()]);
await db.exec(await readFile(new URL('./install.sql', import.meta.url), 'utf8'));
async function actor(id, claims = {}) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)", [id || '', JSON.stringify(claims)]);
  await db.exec('set role authenticated');
}
async function api(action, task = null, data = {}, request = randomUUID()) {
  return (await db.query('select public.flemme_mobile_api($1,$2,$3::jsonb,$4) as data', [action, task, JSON.stringify({ actorName: 'Membre', ...data }), request])).rows[0].data;
}
await actor(users[3]); await assert.rejects(api('list'), /compte confirmé/);
await actor(users[0], { is_anonymous: true }); await assert.rejects(api('list'), /compte confirmé/);
await actor(null); await assert.rejects(api('list'), /compte confirmé/);
await actor(users[0]);
const request = randomUUID(), payload = { title: 'Un meuble', details: 'Un montage simple', place: 'Aix', budget: null };
const created = (await api('create', null, payload, request)).task;
assert.equal(created.status, 'open'); assert.equal(created.budget, null);
assert.equal((await api('create', null, payload, request)).task.id, created.id);
await assert.rejects(api('create', null, { ...payload, title: 'Autre' }, request), /Identifiant déjà utilisé/);
await assert.rejects(db.query('select * from flemme_mobile_v1.tasks'), /permission denied/);
await assert.rejects(db.query("update flemme_mobile_v1.tasks set document='{}'"), /permission denied/);
await assert.rejects(api('offer', created.id, { amount: 4000, slot: 'Samedi', scope: 'Inclus' }), /indisponible/);
await actor(users[1]);
let t = (await api('offer', created.id, { amount: 4005, slot: 'Samedi', scope: 'Déplacement inclus' })).task;
const offerId = t.offers[0].id;
await api('message', t.id, { offerId, text: 'Message privé' });
await assert.rejects(api('accept', t.id, { offerId }), /indisponible/);
await actor(users[2]);
assert.equal((await api('list')).tasks[0].offers.length, 0);
await assert.rejects(api('message', t.id, { offerId, text: 'Intrusion' }), /inaccessible/);
let second = (await api('offer', t.id, { amount: 3000, slot: 'Lundi', scope: 'Autre forfait' })).task.offers[0].id;
await actor(users[0]);
assert.equal((await api('list')).tasks[0].offers.length, 2);
const acceptRequest = randomUUID();
t = (await api('accept', t.id, { offerId, commission: 0, total: 1 }, acceptRequest)).task;
assert.deepEqual([t.agreement.amount,t.agreement.commission,t.agreement.total], [4005,401,4406]);
assert.equal(t.offers[1].status, 'not_selected'); assert.equal(t.offers[0].messages[0].text, 'Message privé');
await api('accept', t.id, { offerId, commission: 0, total: 1 }, acceptRequest);
await assert.rejects(api('accept', t.id, { offerId: second }), /indisponible/);
await assert.rejects(api('declare_payment', t.id), /non autorisée/);
await api('complete', t.id); await api('declare_payment', t.id);
await actor(users[2]);
await assert.rejects(api('confirm_payment', t.id), /non autorisée/);
await assert.rejects(api('report', t.id, { text: 'Intrusion' }), /inaccessible/);
assert.equal((await api('list')).tasks[0].agreement, undefined);
await actor(users[1]);
t = (await api('confirm_payment', t.id)).task;
assert.equal(t.paymentConfirmed, true);
await api('report', t.id, { text: 'Un problème à examiner' });
await actor(users[0]);
t = (await api('list')).tasks[0];
assert.equal(t.reports.length, 1); assert.equal(t.history.length, 9);
await db.exec('reset role; set role anon');
await assert.rejects(api('list'), /permission denied/);
await db.exec('reset role');
const rls = await db.query("select relrowsecurity from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='flemme_mobile_v1' and relkind='r'");
assert.ok(rls.rows.every(r => r.relrowsecurity));
await db.close();
console.log('OK SQL : installation, authentification, autorisations, RLS, confidentialité, prix serveur, commission arrondie, attribution unique, idempotence, paiements déclaratifs et historique.');
