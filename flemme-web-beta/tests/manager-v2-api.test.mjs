import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const context={URL,fetch:()=>{throw Error('Live network forbidden');}};
vm.createContext(context);vm.runInContext(await readFile(new URL('../manager-v2-api.js',import.meta.url),'utf8'),context);
const create=context.ManagerV2API.createClient;
test('Unified acquisition and originals use authenticated non cached routes',async()=>{
 const calls=[];const client=create('https://manager.example',async()=>({access_token:'user-session'}),async(...args)=>{
  calls.push(args);return{ok:true,json:async()=>({saved:true}),blob:async()=>new Blob(['original'])};});
 const body={request_id:'id',expected_revision:2,mode:'documents',query:'Comparer',documents:[]};
 await client.acquire('abc',body);await client.original('abc','run',0);
 assert.equal(calls[0][0],'https://manager.example/api/manager/conversations/abc/missions');
 assert.deepEqual(JSON.parse(calls[0][1].body),{kind:'acquisition',request:body});
 assert.equal(calls[1][0],'https://manager.example/api/manager/conversations/abc/missions/run/documents/0');
 assert.equal(calls[1][1].headers.Authorization,'Bearer user-session');assert.equal(calls[1][1].cache,'no-store');
});
test('No API call without session',async()=>{
 let called=false;const client=create('https://manager.example',async()=>null,async()=>{called=true;});
 await assert.rejects(client.list(),e=>e.status===401);assert.equal(called,false);
});
test('Caller session and revision sent; no server secret',async()=>{
 const calls=[];const client=create('https://manager.example',async()=>({access_token:'user-session'}),async(...args)=>{calls.push(args);return{ok:true,json:async()=>({revision:2})};});
 const body={request_id:'request',expected_revision:0,request:'Besoin'};
 await client.send('conversation',body);await client.send('conversation',body);
 assert.equal(calls[0][0],'https://manager.example/api/manager/conversations/conversation/analysis');
 assert.equal(calls[0][1].headers.Authorization,'Bearer user-session');
 assert.equal(calls[0][1].cache,'no-store');assert.equal(calls[0][1].body,calls[1][1].body);
 assert.deepEqual(JSON.parse(calls[0][1].body),body);
});
test('Resume/list/events/recovery use protected routes',async()=>{
 const urls=[];const client=create('https://manager.example',async()=>({access_token:'token'}),async(url)=>{urls.push(url);return{ok:true,json:async()=>[]};});
 await client.list(100);await client.read('abc');await client.create('uuid');await client.event('abc',{});await client.recover('abc',{});
 assert.deepEqual(urls.map(u=>u.replace('https://manager.example','')),['/api/manager/conversations?limit=100&offset=100','/api/manager/conversations/abc','/api/manager/conversations','/api/manager/conversations/abc/mission/events','/api/manager/conversations/abc/analysis/recover']);
});
test('Provider errors not displayed; conflict requires reload',async()=>{
 const client=create('https://manager.example',async()=>({access_token:'token'}),async()=>({ok:false,status:409,json:async()=>({detail:'private provider secret'})}));
 await assert.rejects(client.list(),e=>e.status===409 && !e.message.includes('secret') && e.message.includes('Actualise'));
});
test('Only HTTPS is accepted',()=>assert.throws(()=>create('http://unsafe.example',async()=>null)));

test('Supplied-source tools use unified missions with stable request ids',async()=>{
 const calls=[];const client=create('https://manager.example',async()=>({access_token:'user-session'}),async(...args)=>{calls.push(args);return{ok:true,json:async()=>[]};});
 const body={request_id:'same-id',expected_revision:4,sources:[],constraints:{}};
 await client.produce('abc',body);await client.produce('abc',body);await client.deliveries('abc');await client.recoverDelivery('abc',{request_id:'same-id',expected_revision:6,note:'Interrupted'});
 assert.deepEqual(calls.map(c=>c[0].replace('https://manager.example','')), ['/api/manager/conversations/abc/missions','/api/manager/conversations/abc/missions','/api/manager/conversations/abc/results','/api/manager/conversations/abc/missions/recover']);
 assert.deepEqual(JSON.parse(calls[0][1].body),{kind:'delivery',request:body});
 assert(calls.every(c=>c[1].headers.Authorization==='Bearer user-session'));
 assert.equal(calls[0][1].body,calls[1][1].body);
});

test('Legacy migration option preserves old versioned contracts without retry fallback',async()=>{
 const calls=[];const client=create('https://manager.example',async()=>({access_token:'session'}),async(...args)=>{calls.push(args);return {ok:true,json:async()=>({})};},{legacy:true});
 const body={request_id:'same',expected_revision:2};
 await client.send('abc',body);await client.acquire('abc',body);await client.produce('abc',body);
 assert.deepEqual(calls.map(c=>c[0]),['https://manager.example/api/v2/conversations/abc/messages','https://manager.example/api/v4/conversations/abc/acquisitions','https://manager.example/api/v3/conversations/abc/deliveries']);
 assert(calls.every(c=>JSON.stringify(JSON.parse(c[1].body))===JSON.stringify(body)));
});
test('Unified preparation and approval stay separate from execution',async()=>{
 const calls=[];const client=create('https://manager.example',async()=>({access_token:'session'}),async(...args)=>{calls.push(args);return {ok:true,json:async()=>({})};});
 await client.plan('abc',{plan_id:'plan'});await client.approvePlan('abc','plan',{approved:true});
 assert.deepEqual(calls.map(c=>c[0]),['https://manager.example/api/manager/conversations/abc/plans','https://manager.example/api/manager/conversations/abc/plans/plan/approve']);
});
