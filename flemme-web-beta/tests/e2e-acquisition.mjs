// Simulated browser journey: no live website, account, search, or document service.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
try{
 const page=await browser.newPage({viewport:{width:1000,height:1000}}),calls=[],errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.pathname==='/api/v4/conversations/cid/acquisitions'){
   assert.equal(request.headers().authorization,'Bearer simulated-session');
   const input=request.postDataJSON();calls.push(input);
   return route.fulfill({contentType:'application/json',body:JSON.stringify({run:{id:'rid',input:{acquisition:{documents:input.documents.map(d=>({name:d.name}))}}},output:{payload:{result:{
    markdown:'Rapport simulé : inconnus conservés. <img src=x onerror="window.hacked=true">',
    sources:[{origin:'web',url:'https://example.com/source',title:'Source citée'}]}}}})});
  }
  if(url.pathname==='/api/v4/conversations/cid/acquisitions/rid/documents/0')return route.fulfill({contentType:'application/octet-stream',body:'original simulated'});
  if(url.pathname==='/manager.html'){
   return route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html lang="fr"><head><meta charset="utf-8"><link rel="stylesheet" href="manager-v2.css"></head><body><section id="specialistsPanel"></section>
    <script>window.FLEMME={managerV2:{url:'https://flemme.test'}};window.SB={session:async()=>({access_token:'simulated-session'})};
    window.ready=function(workflow){window.dispatchEvent(new CustomEvent('flemme:conversation',{detail:{id:'cid',revision:2,pending_request_id:null,mission:{state:'qualified'},messages:[{assessment:{mission_status:'ready',selected_workflow:{workflow_id:workflow}}}]}}))};</script>
    <script src="manager-v2-api.js"></script><script src="manager-v4.js"></script></body></html>`});
  }
  if(['manager-v2-api.js','manager-v4.js','manager-v2.css'].includes(url.pathname.slice(1)))return route.fulfill({
    contentType:url.pathname.endsWith('.js')?'application/javascript; charset=utf-8':'text/css; charset=utf-8',
    body:await readFile(new URL('../'+url.pathname.slice(1),import.meta.url))});
  throw new Error('Unexpected browser network request: '+url.pathname);
 });
 await page.goto('https://flemme.test/manager.html');
 assert.deepEqual(errors,[]);assert.equal(await page.locator('#acquisitionQuery').count(),1);
 await page.evaluate(()=>ready('rechercher_produit'));
 await page.fill('#acquisitionQuery','Trois offres leasing hybride moins de 300 EUR/mois');await page.fill('#acquisitionBudget','300');
 await page.click('#acquisitionSubmit');await page.waitForFunction(()=>document.getElementById('acquisitionNotice').textContent.includes('Résultat enregistré'));
 assert.equal(calls[0].mode,'web');assert.equal(calls[0].constraints.price_basis,'per_month');
 assert.equal(await page.locator('#acquisitionResult img').count(),0);assert.equal(await page.evaluate(()=>!!window.hacked),false);
 assert.equal(await page.locator('#acquisitionResult a').getAttribute('href'),'https://example.com/source');
 await page.evaluate(()=>ready('comparer_devis'));
 await page.fill('#acquisitionQuery','Comparer les deux devis');
 await page.setInputFiles('#acquisitionFiles',[
  {name:'A.txt',mimeType:'text/plain',buffer:Buffer.from('Total TTC : 1200 EUR')},
  {name:'B.txt',mimeType:'text/plain',buffer:Buffer.from('Total TTC : 1400 EUR')}]);
 await page.click('#acquisitionSubmit');await page.waitForFunction(()=>document.querySelector('#acquisitionResult button'));
 assert.equal(calls[1].mode,'documents');assert.equal(calls[1].documents.length,2);
 assert.equal(Buffer.from(calls[1].documents[0].content_base64,'base64').toString(),'Total TTC : 1200 EUR');
 const download=page.waitForEvent('download');await page.locator('#acquisitionResult button').first().click();
 assert.equal((await download).suggestedFilename(),'A.txt');
 await page.screenshot({path:process.env.E2E_SCREENSHOT||join(tmpdir(),'flemme-acquisition-e2e.png'),fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('Browser E2E passed: web request, two quotes, literal safe rendering, source link, authenticated original download. All upstreams simulated.');
}finally{await browser.close();}
