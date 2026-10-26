import test from 'node:test';
import assert from 'node:assert/strict';
import {qualifyWithManager,managerURL} from '../netlify/lib/manager-api-bridge.mjs';

const assessment={mission_status:'ready',selected_workflow:{workflow_id:'rechercher_produit'},
  expected_result:{description:'Comparer trois offres de leasing'},user_response:{message:'Besoin qualifié.'},
  human_intervention_required:false,missing_information:[],qualification_questions:[]};
test('Netlify compatibility qualification forwards caller session to the single Manager API',async()=>{
  const calls=[];
  const result=await qualifyWithManager('Leasing hybride 300 EUR/mois','Bearer user',async(...args)=>{
    calls.push(args);return {ok:true,json:async()=>assessment};
  });
  assert.equal(calls.length,1);
  assert.equal(calls[0][0],'https://flemme-manager-v2-api.onrender.com/api/manager/analyze');
  assert.equal(calls[0][1].headers.Authorization,'Bearer user');
  assert.equal(calls[0][1].redirect,'error');
  assert.equal(result.state,'qualified');assert.deepEqual(result.agents,['Flemme Manager']);
});
test('Bridge does not trust incomplete or incoherent Manager output',async()=>{
  for(const value of [{}, {...assessment,human_intervention_required:true}])
    await assert.rejects(qualifyWithManager('brief','Bearer user',async()=>({ok:true,json:async()=>value})));
});
test('Bridge never forwards authentication to an unsafe configured origin',()=>{
  const before=process.env.FLEMME_MANAGER_API_URL;
  try {
    for(const url of ['http://localhost','https://user:pass@example.com','https://example.com/path','https://example.com/?x=1']) {
      process.env.FLEMME_MANAGER_API_URL=url;assert.throws(()=>managerURL());
    }
  } finally {if(before===undefined)delete process.env.FLEMME_MANAGER_API_URL;else process.env.FLEMME_MANAGER_API_URL=before;}
});
