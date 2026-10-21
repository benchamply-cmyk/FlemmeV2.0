// Real PostgreSQL semantics in PGlite 0.3.14; no Supabase/OpenAI connection.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const { PGlite } = process.env.SQL_TEST_DATABASE_URL ? {} : await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
let db;
if (process.env.SQL_TEST_DATABASE_URL) {
  const { Client } = (await import('pg')).default;
  const client = new Client({connectionString:process.env.SQL_TEST_DATABASE_URL});
  await client.connect();
  db = {query:(...args)=>client.query(...args),exec:sql=>client.query(sql),close:()=>client.end()};
} else { db = new PGlite(); }
let checks = 0;
await db.exec(`create role anon; create role authenticated; create schema auth;
  create table auth.users(id uuid primary key,email_confirmed_at timestamptz);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
const sql=await readFile(new URL('../../../supabase/manager-memory-v2-20261014.sql',import.meta.url),'utf8');
// Apply twice and verify preservation later by applying again after populated history.
await db.exec(sql); await db.exec(sql);
const a=randomUUID(),b=randomUUID(),unconfirmed=randomUUID(),cid=randomUUID(),rid=randomUUID();
await db.query('insert into auth.users values($1,now()),($2,now()),($3,null)',[a,b,unconfirmed]);
async function actor(id,role='authenticated') {
  await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
  await db.exec(`set role ${role}`);
}
async function command(op,c=cid,r=null,rev=null,payload={}) {
  const result=await db.query('select public.fm_v2_command($1,$2,$3,$4,$5) as value',[op,c,r,rev,payload]);
  return result.rows[0].value;
}
async function reject(fn,code) {
  await assert.rejects(fn,e=>e.code===code); checks++;
}
await actor(a,'anon'); await reject(()=>command('create'),'42501');
await actor(unconfirmed); await reject(()=>command('create'),'42501');
await actor(a); let snap=await command('create');
assert.equal(snap.revision,0); assert.equal(snap.mission.state,'draft'); checks++;
assert.deepEqual(await command('create'),snap); checks++;
await actor(b); await reject(()=>command('snapshot'),'PT404');
await reject(()=>command('create'),'PT404');
assert.deepEqual(await command('list'),[]); checks++;
assert.equal((await db.query('select * from fm_v2.conversations')).rows.length,0); checks++;
await reject(()=>db.query('insert into fm_v2.conversations(id,owner_id) values($1,$2)',[randomUUID(),b]),'42501');
await actor(a);
await reject(()=>db.exec('update fm_v2.conversations set owner_id=owner_id'),'42501');
await reject(()=>db.exec('delete from fm_v2.conversations'),'42501');
await reject(()=>db.exec('truncate fm_v2.conversations cascade'),'42501');
await reject(()=>db.query('select fm_v2.snapshot($1)',[cid]),'42501');
let first=await command('user',cid,rid,0,{content:'Compare ces devis.'});
assert.equal(first.revision,1); assert.equal(first.pending_request_id,rid); checks++;
let replay=await command('user',cid,rid,0,{content:'Compare ces devis.'});
assert.equal(replay.replayed,true); assert.equal(replay.messages.length,1); checks++;
await reject(()=>command('user',cid,rid,0,{content:'Changed'}),'PT409');
await reject(()=>command('user',cid,randomUUID(),1,{content:'Concurrent message'}),'PT409');
await reject(()=>command('recover',cid,rid,1,{note:'Interrupted'}),'PT409');
await reject(()=>command('event',cid,randomUUID(),1,{kind:'status',state:'in_progress',note:'Start'}),'PT409');
await actor(b); await reject(()=>command('assessment',cid,rid,null,{mission_status:'ready',user_response:{message:'ok'}}),'PT404');
await actor(a);
const assessment={mission_status:'ready',user_response:{message:'Brief qualifié.'}};
snap=await command('assessment',cid,rid,null,assessment);
assert.equal(snap.revision,2); assert.equal(snap.pending_request_id,null); assert.equal(snap.mission.state,'qualified'); checks++;
assert.equal(snap.messages.length,2); assert.deepEqual(snap.messages[1].assessment,assessment); checks++;
assert.equal((await command('assessment',cid,rid,null,assessment)).revision,2); checks++;
const eventId=randomUUID(),event={kind:'status',state:'in_progress',note:'Travail commencé',result:null};
snap=await command('event',cid,eventId,2,event); assert.equal(snap.revision,3); checks++;
assert.equal((await command('event',cid,eventId,2,event)).revision,3); checks++;
await reject(()=>command('event',cid,eventId,3,{...event,note:'Changed'}),'PT409');
await reject(()=>command('event',cid,randomUUID(),2,{kind:'action',state:null,note:'Stale'}),'PT409');
await reject(()=>command('user',cid,randomUUID(),3,{content:'Requalify active'}),'PT409');
await reject(()=>command('event',cid,randomUUID(),3,{kind:'result',state:null,note:'Missing result'}),'PT422');
snap=await command('event',cid,randomUUID(),3,{kind:'action',state:null,note:'Sources vérifiées manuellement',result:null});
snap=await command('event',cid,randomUUID(),4,{kind:'result',state:null,note:'Résultat fourni par utilisateur',result:'Rapport conservé.'});
snap=await command('event',cid,randomUUID(),5,{kind:'status',state:'blocked',note:'Pause',result:null});
snap=await command('event',cid,randomUUID(),6,{kind:'status',state:'in_progress',note:'Reprise',result:null});
snap=await command('event',cid,randomUUID(),7,{kind:'status',state:'completed',note:'Terminé',result:null});
assert.equal(snap.mission.state,'completed'); assert.equal(snap.events.length,9); checks++;
await reject(()=>command('event',cid,randomUUID(),8,event),'PT409');
assert(snap.events.every(e=>e.created_at)); assert(snap.messages.every(e=>e.created_at)); checks++;
const saved=await command('snapshot');
await db.exec('reset role'); await db.exec(sql); await actor(a);
assert.deepEqual(await command('snapshot'),saved); checks++;
// Failed analysis preserves original message and allows a new request.
const failedCid=randomUUID(),failedRid=randomUUID();
await command('create',failedCid);
await command('user',failedCid,failedRid,0,{content:'Besoin initial'});
snap=await command('failure',failedCid,failedRid,null,{note:'Échec conservé.'});
assert.equal(snap.messages[0].content,'Besoin initial'); assert.equal(snap.events[2].kind,'failure'); checks++;
const nextRid=randomUUID();
snap=await command('user',failedCid,nextRid,2,{content:'Précision après échec'});
assert.equal(snap.messages.length,2); checks++;
await command('failure',failedCid,nextRid,null,{note:'Échec conservé.'});
assert.equal((await command('list',null,null,null,{limit:1,offset:0})).length,1); checks++;
// Late results are appended after failure, without reviving the mission.
snap=await command('assessment',failedCid,failedRid,null,assessment);
assert.equal(snap.mission.state,'draft'); assert.equal(snap.events.at(-1).kind,'late_result'); checks++;
assert.equal(snap.messages.filter(m=>m.role==='assistant').length,1); checks++;
assert.equal((await command('assessment',failedCid,failedRid,null,assessment)).revision,snap.revision); checks++;
// Explicit recovery after five minutes: timestamp clock simulated only in isolated DB.
const recoveryCid=randomUUID(),recoveryRid=randomUUID();
await command('create',recoveryCid);
await command('user',recoveryCid,recoveryRid,0,{content:'Interrupted worker'});
await db.exec('reset role');
await db.exec('alter table fm_v2.messages disable trigger fm_v2_immutable');
await db.query("update fm_v2.messages set created_at=now()-interval '6 minutes' where conversation_id=$1",[recoveryCid]);
await db.exec('alter table fm_v2.messages enable trigger fm_v2_immutable');
await actor(a);
snap=await command('recover',recoveryCid,recoveryRid,1,{note:'Worker interrupted; explicit recovery.'});
assert.equal(snap.pending_request_id,null); assert.equal(snap.messages.length,1); checks++;
// Two real PostgreSQL sessions contend for the same revision. One must lose.
if (process.env.SQL_TEST_DATABASE_URL) {
  const { Client }=(await import('pg')).default;
  const other=new Client({connectionString:process.env.SQL_TEST_DATABASE_URL});
  await other.connect();
  await other.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
  await other.query('set role authenticated');
  const raceCid=randomUUID(); await command('create',raceCid);
  const values=id=>['event',raceCid,id,0,{kind:'action',state:null,note:'Concurrent journal entry',result:null}];
  const results=await Promise.allSettled([
    db.query('select public.fm_v2_command($1,$2,$3,$4,$5)',values(randomUUID())),
    other.query('select public.fm_v2_command($1,$2,$3,$4,$5)',values(randomUUID()))]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.find(r=>r.status==='rejected').reason.code,'PT409'); checks++;
  await other.end();
}
// Database owner also cannot accidentally overwrite or erase records.
await db.exec('reset role');
await reject(()=>db.exec("update fm_v2.messages set content='overwritten'"),'42501');
await reject(()=>db.exec('delete from fm_v2.events'),'42501');
await reject(()=>db.exec('truncate fm_v2.messages'),'42501');
const {testV3}=await import('./specialists_v3.mjs');
const v3Checks=await testV3(db,actor,command,a,b);
const {testV4}=await import('./acquisition_v4.mjs');
const v4Checks=await testV4(db,actor,command,a,b);
console.log(`${v4Checks} V4 PostgreSQL assertions passed; originals immutable, private and replay preserved.`);
console.log(`${checks} V2 and ${v3Checks} V3 PostgreSQL assertions passed; migration applied 3 times; histories preserved.`);
await actor(b); const customerCid=randomUUID(); await command('create',customerCid);
await db.exec('reset role');
await db.exec(`create function public.est_admin() returns boolean language sql stable as $$ select auth.uid()='${a}'::uuid $$;`);
// Apply additive guard after legacy preservation tests; seeded customer history stays readable.
await db.exec(await readFile(new URL('../../../supabase/manager-admin-agents.sql',import.meta.url),'utf8'));
await actor(a); const adminCid=randomUUID();
assert.equal((await command('create',adminCid)).revision,0);
await actor(b); assert.ok(Array.isArray(await command('list')));
await reject(()=>command('create',randomUUID()),'42501');
assert.equal((await command('snapshot',customerCid)).revision,0);
await reject(()=>command('user',customerCid,randomUUID(),0,{content:'Client must not launch agents.'}),'42501');
assert.equal((await command('snapshot',customerCid)).revision,0); // Entire transaction rolled back.
await reject(()=>command('event',customerCid,randomUUID(),0,{kind:'action',state:null,note:'Forbidden',result:null}),'42501');
await actor(b); await reject(()=>command('snapshot',adminCid),'PT404');
console.log('Admin guard: administrator creation allowed, customer creation denied, histories readable, ownership preserved.');
// Clients write to the Manager from /espace; mission events stay administrator-only.
await db.exec('reset role');
const clientSql=await readFile(new URL('../../../supabase/manager-client-messages.sql',import.meta.url),'utf8');
await db.exec(clientSql); await db.exec(clientSql);
await actor(b); const ownCid=randomUUID(), turn=randomUUID();
assert.equal((await command('create',ownCid)).revision,0);
assert.equal((await command('user',ownCid,turn,0,{content:'Peux-tu comparer mes deux devis ?'})).revision,1);
const answer=await command('assessment',ownCid,turn,null,{mission_status:'needs_information',user_response:{message:'Envoie-moi les deux devis.'}});
assert.equal(answer.revision,2); assert.equal(answer.mission.state,'waiting_information');
await reject(()=>command('event',ownCid,randomUUID(),2,{kind:'action',state:null,note:'Forbidden',result:null}),'42501');
await reject(()=>command('event',ownCid,randomUUID(),2,{kind:'status',state:'cancelled',note:'Forbidden',result:null}),'42501');
assert.equal((await command('snapshot',ownCid)).revision,2);
await actor(a); await reject(()=>command('snapshot',ownCid),'PT404');
assert.equal((await command('event',adminCid,randomUUID(),0,{kind:'action',state:null,note:'Admin action',result:null})).revision,1);
console.log('Client messages: customers create and write, mission events and agents stay administrator-only.');
await db.close();
