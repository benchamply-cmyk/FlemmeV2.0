import test from 'node:test';
import assert from 'node:assert/strict';
import {produce,quality,cents} from '../netlify/lib/specialists.mjs';
import handler from '../netlify/functions/gestionadmin.mjs';
const now=new Date('2026-10-11T12:00:00Z');
const source=(id,price='980',extra={})=>({id,kind:'quote',title:'Devis '+id,text:'Travaux salle de bains',observed_on:'2026-10-10',price,currency:'EUR',price_basis:'total',tax_basis:'included',inclusions:['Travaux'],...extra});
const fixture=()=>({facts:{objective:'Comparer les devis',requested_action:'compare',immediate_danger:false,required_features:[],comparison_subject:'Salle de bains'},sources:[source('A'),source('B','1200')]});
test('four specialists preserve evidence and compute exact money',()=>{
  const {input,result}=produce('comparer_devis',fixture(),now);
  assert.deepEqual(result.agents,['Search','Compare','Writer','Quality']);assert.equal(result.quality.passed,true);
  assert.equal(result.comparison.price_groups[0].spread,'220.00');assert.equal(result.comparison.price_groups[0].spread_percent_of_lowest,'22.45');
  assert.equal(quality('comparer_devis',input,result).passed,true);
  const tiny=fixture();tiny.sources=[source('A','0.10'),source('B','0.30')];
  const g=produce('comparer_devis',tiny,now).result.comparison.price_groups[0];assert.equal(g.spread,'0.20');assert.equal(g.spread_percent_of_lowest,'200.00');
});
test('zero and tied prices do not invent a winner or a percentage',()=>{
  const f=fixture();f.sources=[source('A','0'),source('B','0')];
  const g=produce('comparer_devis',f,now).result.comparison.price_groups[0];
  assert.equal(g.spread_percent_of_lowest,null);assert.deepEqual(g.lowest_price_ids,['A','B']);
});
test('currencies, bases and taxes are never mixed',()=>{
  const f=fixture();f.sources.push(source('USD','1',{currency:'USD'}),source('hour','1',{price_basis:'per_hour'}),source('tax','1',{tax_basis:'excluded'}));
  assert.equal(produce('comparer_devis',f,now).result.comparison.price_groups.length,4);
  f.sources=[f.sources[0],f.sources[2]];assert.throws(()=>produce('comparer_devis',f,now),/comparables/);
});
test('missing criteria are unknown, explicit failures remain failures',()=>{
  const f=fixture();f.facts.required_features=['Garantie'];f.facts.budget={amount:'1000',currency:'EUR',basis:'total',tax_basis:'included'};
  f.sources[0].features={garantie:null};f.sources[1].features={GARANTIE:false};
  const c=produce('comparer_devis',f,now).result.comparison.candidates;
  assert.equal(c[0].within_budget,true);assert.equal(c[0].meets_supplied_constraints,null);assert.equal(c[1].meets_supplied_constraints,false);
  f.sources[0].features={garantie:true};assert.equal(produce('comparer_devis',f,now).result.comparison.candidates[0].meets_supplied_constraints,true);
});
test('malformed, unsafe and future evidence is refused',()=>{
  for(const [key,value] of [['price','-1'],['price','1.001'],['price',NaN],['source_url','javascript:alert(1)'],['source_url','https://user:password@example.com'],['observed_on','2026-99-99'],['observed_on','2026-02-30'],['observed_on','2026-10-12'],['features',{Garantie:true,garantie:false}]]){
    const f=fixture();f.sources[0][key]=value;assert.throws(()=>produce('comparer_devis',f,now),e=>e.status===422);
  }
  assert.throws(()=>cents('1000000001'));assert.throws(()=>cents(12));
});
test('business preconditions and human actions cannot be bypassed',()=>{
  for(const alter of [f=>f.facts.immediate_danger=true,f=>f.facts.requested_action='buy',f=>f.sources.pop(),f=>delete f.facts.comparison_subject,f=>f.facts.required_features=['été','ete']]){
    const f=fixture();alter(f);assert.throws(()=>produce('comparer_devis',f,now),e=>e.status===422);
  }
});
test('each catalogue workflow produces a grounded private report',()=>{
  const common={objective:'Préparer un choix',requested_action:'compare',immediate_danger:false,required_features:[]};
  for(const [workflow,kind,facts] of [
    ['trouver_prestataire','provider',{service_type:'plumbing',intervention:'Réparer une fuite',zone:'Paris',deadline:'demain'}],
    ['rechercher_produit','product',{product_kind:'appliance',usage:'Laver le linge',purchase_mode:'purchase',budget_flexible:true}],
    ['organiser_voyage','travel',{mission_type:'itinerary',date_flexibility:'Au printemps',travellers:2,destination:'Rome'}]]){
    const {result}=produce(workflow,{facts:{...common,...facts},sources:[source('A','100',{kind})]},now);
    assert.equal(result.quality.passed,true);assert.match(result.markdown,/Aucune recherche web/);assert.ok(result.markdown.includes('2026-10-10'));
  }
});
test('leasing requires duration, apport, monthly budget and mileage',()=>{
  const f={facts:{objective:'Comparer un leasing',requested_action:'compare',immediate_danger:false,required_features:[],product_kind:'vehicle',usage:'Trajets quotidiens',purchase_mode:'leasing',budget:{amount:'300',currency:'EUR',basis:'per_month',tax_basis:'included'},duration_months:36,max_upfront_payment:'1000',annual_mileage:15000,zone:'Paris'},sources:[source('A','250',{kind:'product',price_basis:'per_month',duration_months:36,upfront_payment:'500',annual_mileage:10000,location:'Paris'})]};
  assert.equal(produce('rechercher_produit',f,now).result.comparison.candidates[0].meets_supplied_constraints,false);
  delete f.facts.duration_months;assert.throws(()=>produce('rechercher_produit',f,now),/Durée/);
});
test('quality detects tampered report, calculation and provenance',()=>{
  const {input,result}=produce('comparer_devis',fixture(),now);
  for(const alter of [r=>r.markdown+='Offre vérifiée',r=>r.comparison.price_groups[0].spread='0',r=>r.search.source_ids=['absent']]){
    const r=structuredClone(result);alter(r);assert.throws(()=>quality('comparer_devis',input,r),/qualité refusé/);
  }
});
const id='12345678-1234-1234-1234-123456789abc',request_id='22345678-1234-1234-1234-123456789abc';
const request=(input=fixture(),revision=3)=>new Request('https://flemme.org/api/gestionadmin?resource=livrer:'+id,{method:'POST',headers:{Authorization:'Bearer owner'},body:JSON.stringify({request_id,input,expected_revision:revision})});
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status});
const mission=()=>({mission_id:id,state:'qualified',revision:3,job_id:null,turns:[{failed:false,state:'qualified',assessment:{workflow:'comparer_devis',objective:'Comparer',requested_action:'compare',human_intervention_required:false,missing_information:[]}}],deliveries:[]});
process.env.SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_ANON_KEY='public';delete process.env.FLEMME_MANAGER_URL;delete process.env.FLEMME_MANAGER_TOKEN;
test('owner gateway persists four-agent result without calling any AI or source URL',async()=>{
  const calls=[];global.fetch=async(url,opts)=>{calls.push(url);if(url.endsWith('est_admin'))return reply(true);if(url.includes('manager_missions?'))return reply([mission()]);
    assert.ok(url.endsWith('manager_livrer'));assert.equal(opts.headers.Authorization,'Bearer owner');const b=JSON.parse(opts.body);assert.equal(b.resultat.quality.passed,true);return reply({...mission(),revision:4,deliveries:[{request_id,input:b.donnees,result:b.resultat}]});};
  assert.equal((await handler(request())).status,200);assert.equal(calls.length,3);
});
test('blocked, human-required, active and stale missions cannot execute specialists',async()=>{
  for(const patch of [{state:'blocked'},{state:'human_required'},{job_id:id},{revision:4},{turns:[{failed:true}]}]){
    let writes=0;global.fetch=async url=>url.endsWith('est_admin')?reply(true):url.includes('manager_missions?')?reply([{...mission(),...patch}]):(writes++,reply({}));
    assert.ok([409,422].includes((await handler(request())).status));assert.equal(writes,0);
  }
});
test('owner and transaction race checks protect persistence',async()=>{
  global.fetch=async()=>reply(false);assert.equal((await handler(request())).status,403);
  global.fetch=async url=>url.endsWith('est_admin')?reply(true):url.includes('manager_missions?')?reply([mission()]):reply({code:'40001'},400);
  assert.equal((await handler(request())).status,409);
});
test('retry after lost response is idempotent even with PostgreSQL key ordering',async()=>{
  const f=fixture(),reordered=structuredClone({sources:f.sources,facts:f.facts});let writes=0;
  global.fetch=async url=>url.endsWith('est_admin')?reply(true):url.includes('manager_missions?')?reply([{...mission(),state:'blocked',revision:4,deliveries:[{request_id,input:reordered}]}]):(writes++,reply({}));
  assert.equal((await handler(request())).status,200);assert.equal(writes,0);
  f.facts.objective='Autre objectif';assert.equal((await handler(request(f))).status,409);
});

test('criterion names inherited from JavaScript prototypes remain unknown',()=>{const f=fixture();f.facts.required_features=['constructor','__proto__'];const c=produce('comparer_devis',f,now).result.comparison.candidates[0];assert.equal(c.meets_supplied_constraints,null);assert.equal(c.feature_matches.constructor,null);assert.throws(()=>produce('constructor',f,now),/hors catalogue/);});

test('waiting-information mission requires the same complete structured business input',async()=>{let writes=0;const m=mission();m.state='waiting_information';m.turns[0].state='waiting_information';m.turns[0].assessment.missing_information=['Détails des devis'];global.fetch=async(url,opts)=>url.endsWith('est_admin')?reply(true):url.includes('manager_missions?')?reply([m]):(writes++,reply({...m,revision:4}));assert.equal((await handler(request())).status,200);const f=fixture();delete f.facts.comparison_subject;assert.equal((await handler(request(f))).status,422);assert.equal(writes,1);});
