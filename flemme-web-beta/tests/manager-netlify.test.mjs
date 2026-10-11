import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../netlify/functions/gestionadmin.mjs';
import {validateQualification} from '../netlify/lib/manager.mjs';
process.env.SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_ANON_KEY='public';
delete process.env.FLEMME_MANAGER_URL;delete process.env.FLEMME_MANAGER_TOKEN;
const id='12345678-1234-1234-1234-123456789abc';
const request=(resource,body)=>new Request('https://flemme.org/api/gestionadmin?resource='+resource,{method:body?'POST':'GET',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status});
const qualified={workflow:'rechercher_produit',objective:'Comparer des lave-linge',requested_action:'compare',immediate_danger:false,missing_information:[],questions:[],summary:'Brief enregistré.'};
test('qualification rejects bad output and routes external actions to humans',()=>{
  assert.equal(validateQualification(qualified).state,'qualified');
  assert.equal(validateQualification({...qualified,requested_action:'buy'}).state,'human_required');
  assert.equal(validateQualification({...qualified,requested_action:'unknown'}).state,'waiting_information');
  assert.equal(validateQualification({...qualified,workflow:'other'}).state,'out_of_catalog');
  assert.throws(()=>validateQualification({...qualified,summary:null}));
  assert.throws(()=>validateQualification({...qualified,questions:['x'.repeat(501)]}));
});
test('no owner or malformed id: no AI call',async()=>{
  let count=0;global.fetch=async()=>{count++;return reply(false);};
  assert.equal((await handler(request('qualifier:'+id,{}))).status,403);assert.equal(count,1);
  global.fetch=async()=>reply(true);
  assert.equal((await handler(request('qualifier:../../secret',{}))).status,400);
});
test('missing key does not reserve or spend',async()=>{
  delete process.env.OPENAI_API_KEY;let count=0;global.fetch=async()=>{count++;return reply(true);};
  assert.equal((await handler(request('qualifier:'+id,{}))).status,503);assert.equal(count,1);
});
test('duplicate reservation conflict prevents a second AI call',async()=>{
  process.env.OPENAI_API_KEY='test-private';
  global.fetch=async url=>url.endsWith('est_admin')?reply(true):reply({code:'40001'},400);
  assert.equal((await handler(request('qualifier:'+id,{}))).status,409);
});
test('successful qualification stores server result and never exposes key',async()=>{
  const calls=[];
  global.fetch=async (url,options)=>{
    calls.push(url);
    if(url.endsWith('est_admin')) return reply(true);
    if(url.endsWith('manager_reserver')) return reply({mission_id:id,job_id:id,request_text:'Comparer un lave-linge'});
    if(url.includes('api.openai.com')) {
      assert.equal(options.headers.Authorization,'Bearer test-private');
      const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);
      return reply({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(qualified)}]}]});
    }
    assert.equal(options.headers.Authorization,'Bearer owner');
    const body=JSON.parse(options.body);assert.equal(body.resultat.state,'qualified');assert.equal(body.erreur,false);
    return reply({mission_id:id,state:'qualified',turns:[body.resultat],revision:2});
  };
  const response=await handler(request('qualifier:'+id,{}));assert.equal(response.status,200);
  assert.ok(!(await response.text()).includes('test-private'));assert.equal(calls.length,4);
});
test('AI refusal or incomplete output records failure, no auto retry',async()=>{
  let ai=0,failed=false;
  global.fetch=async (url,options)=>{
    if(url.endsWith('est_admin'))return reply(true);
    if(url.endsWith('manager_reserver'))return reply({mission_id:id,job_id:id,request_text:'test'});
    if(url.includes('api.openai.com')){ai++;return reply({status:'incomplete',output:[]});}
    failed=JSON.parse(options.body).erreur;return reply({state:'waiting_information'});
  };
  assert.equal((await handler(request('qualifier:'+id,{}))).status,502);assert.equal(ai,1);assert.equal(failed,true);
});
test('native listing uses owner RLS and supports pagination',async()=>{
  global.fetch=async url=>url.endsWith('est_admin')?reply(true):reply(url.endsWith('offset=0')?Array.from({length:100},()=>({mission_id:id})):[]);
  const data=await (await handler(request('missions'))).json();assert.equal(data.backend,'netlify');assert.equal(data.total,100);
});
test('provider diagnostics distinguish credit and key without exposing raw errors',async()=>{
  for(const [status,code,expected] of [[401,'invalid_api_key',/refuse la clé/],[403,'permission_denied',/permissions/],[429,'insufficient_quota',/crédit disponible/],[429,'rate_limit_exceeded',/limite de requêtes/]]) {
    global.fetch=async url=>{
      if(url.endsWith('est_admin'))return reply(true);
      if(url.endsWith('manager_reserver'))return reply({mission_id:id,job_id:id,request_text:'test'});
      if(url.includes('api.openai.com'))return reply({error:{code,message:'SECRET-RAW-ERROR'}},status);
      return reply({state:'waiting_information'});
    };
    const response=await handler(request('qualifier:'+id,{}));assert.equal(response.status,502);
    const text=await response.text();assert.match(text,expected);assert.ok(!text.includes('SECRET-RAW-ERROR'));
  }
});
test('revision conflicts and unavailable migration have useful statuses',async()=>{
  global.fetch=async url=>url.endsWith('est_admin')?reply(true):reply({code:'40001'},400);
  assert.equal((await handler(request('mission:'+id,{state:'blocked',note:'Vérifier',expected_revision:1}))).status,409);
  global.fetch=async url=>url.endsWith('est_admin')?reply(true):reply({code:'PGRST205'},404);
  const response=await handler(request('missions'));assert.equal(response.status,503);assert.match(await response.text(),/manager-netlify.sql/);
});
