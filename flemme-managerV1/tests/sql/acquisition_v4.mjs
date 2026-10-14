import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
export async function testV4(db,actor,v2,a,b){
  let checks=0;
  const directory=new URL('../../../supabase/migrations/',import.meta.url);
  const file=(await readdir(directory)).find(f=>f.endsWith('_manager_acquisition_v4.sql'));
  const sql=await readFile(new URL(file,directory),'utf8');
  await db.exec('reset role');await db.exec(sql);await db.exec(sql);
  const cid=randomUUID(),rid=randomUUID();
  const content=Buffer.from('Total TTC : 1200 EUR devis fictif');
  const doc={name:'devis.txt',sha256:createHash('sha256').update(content).digest('hex'),content_base64:content.toString('base64')};
  const originals=[doc,{...doc,name:'devis2.txt'}];
  const payload={sources:[{id:'acquisition-request',kind:'acquisition_metadata'}],acquisition:{mode:'documents',query:'Comparer',documents:originals.map(({name,sha256})=>({name,sha256}))}};
  async function prepare(c=cid,r=rid,rev=2,p=payload,docs=originals){
    return (await db.query('select public.fm_v4_prepare($1,$2,$3,$4,$5) as value',[c,r,rev,p,docs])).rows[0].value;
  }
  async function get(){return (await db.query('select public.fm_v4_originals($1,$2) as value',[cid,rid])).rows[0].value;}
  async function rejects(fn,code){await assert.rejects(fn,e=>e.code===code);checks++;}
  async function ready(c){await v2('create',c);const msg=randomUUID();await v2('user',c,msg,0,{content:'Compare ces devis.'});
    await v2('assessment',c,msg,null,{mission_status:'ready',selected_workflow:{workflow_id:'comparer_devis'},user_response:{message:'Brief qualifié.'}});}
  await actor(a);await ready(cid);
  await actor(b);await rejects(()=>prepare(),'PT404');await rejects(()=>get(),'PT404');
  await actor(a,'anon');await rejects(()=>prepare(),'42501');
  await actor(a);await rejects(()=>prepare(cid,rid,2,payload,[{...doc,sha256:'bad'},originals[1]]),'PT422');
  assert.equal((await prepare()).replayed,false);checks++;
  assert.deepEqual(await get(),originals);checks++;
  assert.equal((await prepare()).replayed,true);checks++;
  await rejects(()=>prepare(cid,rid,2,payload,[doc,doc]),'PT422');
  await rejects(()=>db.exec('update fm_v4.originals set documents=documents'),'42501');
  await rejects(()=>db.exec('delete from fm_v4.originals'),'42501');
  await rejects(()=>db.exec('truncate fm_v4.originals'),'42501');
  await actor(b);assert.equal((await db.query('select * from fm_v4.originals')).rows.length,0);checks++;
  await actor(a);await db.exec('reset role');await db.exec(sql);await actor(a);
  assert.deepEqual(await get(),originals);checks++;
  // Hourly budget persists across conversations; replay consumes no additional slot.
  const web={sources:[{id:'acquisition-request'}],acquisition:{mode:'web',query:'Recherche',documents:[]}};
  for(let i=0;i<4;i++){const id=randomUUID(),run=randomUUID();await ready(id);await prepare(id,run,2,web,[]);
    await db.query('select public.fm_v3_delivery_command($1,$2,$3,$4,$5)',
      ['finish',id,run,null,{failure:'execution_error',note:'Simulated completion'}]);}
  const blocked=randomUUID();await ready(blocked);
  await rejects(()=>prepare(blocked,randomUUID(),2,web,[]),'PT429');
  assert.equal((await prepare()).replayed,true);checks++;
  await db.exec('reset role');await rejects(()=>db.exec('delete from fm_v4.originals'),'42501');
  return checks;
}
