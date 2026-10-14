import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
export async function testV3(db,actor,v2,a,b) {
 let count=0;
 async function rejects(fn,code){await assert.rejects(fn,e=>e.code===code);count++;}
 await db.exec('reset role');
 const sql=await readFile(new URL('../../../supabase/manager-specialists-v3-20261014.sql',import.meta.url),'utf8');
 await db.exec(sql);await db.exec(sql);
 const cid=randomUUID(),rid=randomUUID();
 const input={sources:[{id:'A',kind:'quote'},{id:'B',kind:'quote'}],constraints:{}};
 const result={workflow_id:'comparer_devis',agents:['Search','Compare','Writer','Quality'],
   quality:{passed:true},markdown:'Rapport vérifié sur sources fournies.'};
 async function rpc(op,c=cid,r=rid,revision=null,payload={}){
  return (await db.query('select public.fm_v3_delivery_command($1,$2,$3,$4,$5) as value',[op,c,r,revision,payload])).rows[0].value;
 }
 async function ready(c){await v2('create',c);const msg=randomUUID();await v2('user',c,msg,0,{content:'Compare ces devis.'});
   await v2('assessment',c,msg,null,{mission_status:'ready',selected_workflow:{workflow_id:'comparer_devis'},user_response:{message:'Brief qualifié.'}});}
 await actor(a);await ready(cid);
 await actor(b);await rejects(()=>rpc('list'),'PT404');await rejects(()=>rpc('reserve',cid,rid,2,input),'PT404');
 await actor(a,'anon');await rejects(()=>rpc('list'),'42501');
 await actor(a);let reserved=await rpc('reserve',cid,rid,2,input);
 assert.equal(reserved.snapshot.mission.state,'in_progress');assert.equal(reserved.snapshot.revision,3);count++;
 assert.deepEqual(reserved.run.input,input);assert.equal(reserved.run.workflow_id,'comparer_devis');count++;
 assert.equal((await rpc('reserve',cid,rid,2,input)).replayed,true);count++;
 await rejects(()=>rpc('reserve',cid,rid,2,{...input,constraints:{location:'changed'}}),'PT409');
 await rejects(()=>rpc('reserve',cid,randomUUID(),3,input),'PT409');
 await rejects(()=>rpc('recover',cid,rid,3,{note:'Too soon'}),'PT409');
 await rejects(()=>rpc('finish',cid,rid,null,{result:{...result,workflow_id:'organiser_voyage'}}),'PT422');
 let finished=await rpc('finish',cid,rid,null,{result});assert.equal(finished.output.stale,false);assert.deepEqual(finished.output.payload.result,result);count++;
 assert.equal((await rpc('finish',cid,rid,null,{result})).replayed,true);count++;
 await rejects(()=>rpc('finish',cid,rid,null,{result:{...result,markdown:'Changed'}}),'PT409');
 assert.equal((await rpc('list')).length,1);count++;
 await rejects(()=>db.exec('update fm_v3.runs set input=input'),'42501');
 await rejects(()=>db.exec('delete from fm_v3.outputs'),'42501');
 await rejects(()=>db.exec('truncate fm_v3.recoveries'),'42501');
 await actor(b);assert.equal((await db.query('select * from fm_v3.runs')).rows.length,0);count++;
 assert.equal((await db.query('select * from fm_v3.outputs')).rows.length,0);count++;
 await actor(a);
 const lateRid=randomUUID();await rpc('reserve',cid,lateRid,4,input);
 await v2('event',cid,randomUUID(),5,{kind:'status',state:'cancelled',note:'Cancel during execution',result:null});
 finished=await rpc('finish',cid,lateRid,null,{result});
 assert.equal(finished.output.stale,true);assert.equal(finished.snapshot.mission.state,'cancelled');count++;
 assert.equal((await rpc('list')).length,2);count++;
 await rejects(()=>rpc('reserve',cid,randomUUID(),7,input),'PT409');
 const saved=await rpc('list');await db.exec('reset role');await db.exec(sql);await actor(a);
 assert.deepEqual(await rpc('list'),saved);count++;
 const recoverCid=randomUUID(),recoverRid=randomUUID();await ready(recoverCid);
 await rpc('reserve',recoverCid,recoverRid,2,input);
 await db.exec('reset role');await db.exec('alter table fm_v3.runs disable trigger immutable');
 await db.query("update fm_v3.runs set created_at=now()-interval '6 minutes' where id=$1",[recoverRid]);
 await db.exec('alter table fm_v3.runs enable trigger immutable');await actor(a);
 const recovered=await rpc('recover',recoverCid,recoverRid,3,{note:'Worker interrupted'});
 assert.equal(recovered.recovered,true);count++;
 const freshRid=randomUUID();await rpc('reserve',recoverCid,freshRid,4,input);
 finished=await rpc('finish',recoverCid,recoverRid,null,{result});assert.equal(finished.output.stale,true);count++;
 await rpc('finish',recoverCid,freshRid,null,{failure:'execution_error',note:'Failure retained'});
 const history=await rpc('list',recoverCid);assert.equal(history.length,2);assert(history[0].recovery);count++;
 await db.exec('reset role');await rejects(()=>db.exec('delete from fm_v3.runs'),'42501');
 await rejects(()=>db.exec('truncate fm_v3.outputs'),'42501');
 if(process.env.SQL_TEST_DATABASE_URL){
   const {Client}=(await import('pg')).default;
   const other=new Client({connectionString:process.env.SQL_TEST_DATABASE_URL});await other.connect();
   await other.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);await other.query('set role authenticated');
   await actor(a);const raceCid=randomUUID();await ready(raceCid);
   const values=id=>['reserve',raceCid,id,2,input];
   const outcomes=await Promise.allSettled([
     db.query('select public.fm_v3_delivery_command($1,$2,$3,$4,$5)',values(randomUUID())),
     other.query('select public.fm_v3_delivery_command($1,$2,$3,$4,$5)',values(randomUUID()))]);
   assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);
   assert.equal(outcomes.find(o=>o.status==='rejected').reason.code,'PT409');count++;
   await other.end();
 }
 return count;
}
