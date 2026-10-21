import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true});
try {
 for(const role of ['admin','customer','unavailable']) {
  const page=await browser.newPage({viewport:{width:1100,height:1000}}),errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.hostname!== 'flemme.test')return route.fulfill({status:200,contentType:'text/css',body:''});
   if(req.method()!=='GET') {writes.push(url.pathname);throw new Error('Unexpected mutation');}
   if(url.pathname==='/api/v2/access')return route.fulfill({status:role==='unavailable'?503:200,json:{can_run_agents:role==='admin'}});
   if(url.pathname==='/api/v2/conversations')return route.fulfill({json:[{id:'cid',created_at:'2026-10-21T04:00:00Z',state:'qualified'}]});
   if(url.pathname==='/api/v3/conversations/cid/deliveries')return route.fulfill({json:[{run:{id:'run',created_at:'2026-10-21T04:00:00Z',input:{}},output:{payload:{result:{markdown:'Résultat fictif consultable',agent_activity:[{agent:'Search',status:'completed',task:'Tâche interne'}]}}}}]});
   if(url.pathname==='/api/v2/conversations/cid')return route.fulfill({json:{id:'cid',revision:2,pending_request_id:null,mission:{state:'qualified'},events:[],messages:[{role:'assistant',created_at:'2026-10-21T04:00:00Z',assessment:{user_response:{message:'Mission de démonstration : comparaison de devis.'},qualification_questions:[],mission_status:'ready',selected_workflow:{workflow_id:'comparer_devis'}}}]}});
   if(url.pathname==='/content.js')return route.fulfill({contentType:'application/javascript',body:"window.FLEMME={managerV2:{url:'https://flemme.test'}};"});
   if(url.pathname==='/sb.js')return route.fulfill({contentType:'application/javascript',body:"window.SB={ready:true,session:async()=>({access_token:'simulated-session'})};"});
   if(url.pathname==='/favicon.ico')return route.fulfill({status:204});
   const filename=url.pathname==='/'?'manager.html':url.pathname.slice(1);
   if(!/^[a-z0-9.-]+$/.test(filename))throw new Error('Unexpected asset');
   return route.fulfill({contentType:filename.endsWith('.js')?'application/javascript':filename.endsWith('.css')?'text/css':'text/html',body:await readFile(new URL('../'+filename,import.meta.url))});
  });
  await page.goto('https://flemme.test/');
  await page.waitForFunction(()=>document.querySelector('#conversationList').options.length===2);
  assert.equal(await page.locator('#newConversation').isVisible(),role==='admin');
  await page.selectOption('#conversationList','cid');
  await page.waitForFunction(()=>!document.getElementById('conversationPanel').hidden);
  for(const id of ['managerMessage','missionUpdate','specialistsForm','acquisitionForm','agentRoles'])
   assert.equal(await page.locator('#'+id).isVisible(),role==='admin',id+' '+role);
  await page.click('#readDeliveries');
  await page.waitForFunction(()=>document.querySelector('#specialistDeliveries pre'));
  assert.equal(await page.getByRole('heading',{name:'Tâches par agent',exact:true}).count(),role==='admin'?1:0);
  if(role!=='admin') {
   await page.evaluate(()=>{document.getElementById('newConversation').click();document.getElementById('managerMessage').dispatchEvent(new Event('submit',{cancelable:true}));});
   assert.equal(writes.length,0);
  }
  await page.screenshot({path:'/tmp/flemme-manager-'+role+'.png',fullPage:true});
  assert.deepEqual(errors,[]);
  await page.close();
 }
 console.log('Admin/customer/unavailable browser checks passed; sessions and upstreams simulated.');
} finally {await browser.close();}
