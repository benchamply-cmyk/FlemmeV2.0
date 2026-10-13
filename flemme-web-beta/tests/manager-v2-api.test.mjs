import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const context={URL,fetch:()=>{throw Error('Live network forbidden');}};
vm.createContext(context);vm.runInContext(await readFile(new URL('../manager-v2-api.js',import.meta.url),'utf8'),context);
const create=context.ManagerV2API.createClient;
test('No API call without session',async()=>{
 let called=false;const client=create('https://manager.example',async()=>null,async()=>{called=true;});
 await assert.rejects(client.list(),e=>e.status===401);assert.equal(called,false);
});
test('Caller session and revision sent; no server secret',async()=>{
 const calls=[];const client=create('https://manager.example',async()=>({access_token:'user-session'}),async(...args)=>{calls.push(args);return{ok:true,json:async()=>({revision:2})};});
 const body={request_id:'request',expected_revision:0,request:'Besoin'};
 await client.send('conversation',body);await client.send('conversation',body);
 assert.equal(calls[0][0],'https://manager.example/api/v2/conversations/conversation/messages');
 assert.equal(calls[0][1].headers.Authorization,'Bearer user-session');
 assert.equal(calls[0][1].cache,'no-store');assert.equal(calls[0][1].body,calls[1][1].body);
 assert.deepEqual(JSON.parse(calls[0][1].body),body);
});
test('Resume/list/events/recovery use protected routes',async()=>{
 const urls=[];const client=create('https://manager.example',async()=>({access_token:'token'}),async(url)=>{urls.push(url);return{ok:true,json:async()=>[]};});
 await client.list(100);await client.read('abc');await client.create('uuid');await client.event('abc',{});await client.recover('abc',{});
 assert.deepEqual(urls.map(u=>u.replace('https://manager.example','')),['/api/v2/conversations?limit=100&offset=100','/api/v2/conversations/abc','/api/v2/conversations','/api/v2/conversations/abc/mission/events','/api/v2/conversations/abc/messages/recover']);
});
test('Provider errors not displayed; conflict requires reload',async()=>{
 const client=create('https://manager.example',async()=>({access_token:'token'}),async()=>({ok:false,status:409,json:async()=>({detail:'private provider secret'})}));
 await assert.rejects(client.list(),e=>e.status===409 && !e.message.includes('secret') && e.message.includes('Actualise'));
});
test('Only HTTPS is accepted',()=>assert.throws(()=>create('http://unsafe.example',async()=>null)));
