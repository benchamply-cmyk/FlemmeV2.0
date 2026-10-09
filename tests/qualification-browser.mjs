// Run against tests/e2e_app.py. No real model calls, deployment or external form sends.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const base = process.env.E2E_URL || 'http://127.0.0.1:8765';
const browser = await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
try {
  const context = await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  const page = await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**/*',route=>route.abort());
  await page.goto(base);
  await page.locator('#task').fill('Nettoyer ma terrasse');
  await page.locator('#flemmeForm button[type=submit]').click();
  await page.locator('#qualStart').click();
  assert.match(await page.locator('#qualError').innerText(),/accord/);
  await page.locator('#qualConsent').check();
  await page.locator('#qualStart').click();
  await page.waitForFunction(()=>document.getElementById('qualLog').textContent.includes('ville'));
  const stored=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('flemmeQualification')));
  assert.deepEqual(Object.keys(stored).sort(),['id','token']);
  await page.locator('#contact').fill('toi@example.fr');
  await page.locator('input[name=consent]').check();
  await page.locator('#missionForm button[type=submit]').click();
  assert.match(await page.locator('#err').innerText(),/Termine les questions/);
  await page.locator('#qualMessage').fill('À Lyon samedi pour 200 EUR');
  await page.locator('#qualSend').click();
  await page.locator('#qualReview').waitFor({state:'visible'});
  assert.match(await page.locator('#qualResult').innerText(),/200 EUR/);
  // Recovery fetches the real persisted history; no history is saved in browser storage.
  await page.reload();
  await page.locator('#task').fill('Nettoyer ma terrasse');
  await page.locator('#flemmeForm button[type=submit]').click();
  await page.locator('#qualReview').waitFor({state:'visible'});
  await page.locator('#contact').fill('toi@example.fr');
  await page.locator('input[name=consent]').check();
  // Correcting the form after qualification invalidates the previously reviewed summary.
  await page.locator('#precisions').fill('Ne pas utiliser de produit abrasif.');
  await page.locator('#qualApproved').check();
  await page.locator('#missionForm button[type=submit]').click();
  await page.waitForFunction(()=>document.getElementById('err').textContent.includes('intégrées'));
  assert.equal(await page.locator('#qualApproved').isChecked(),false);
  await page.locator('#qualApproved').check();
  await page.locator('#missionForm button[type=submit]').click();
  await page.waitForFunction(()=>document.getElementById('err').textContent.includes('échoué'));
  await page.locator('#missionForm button[type=submit]').click();
  await page.locator('#tracking.active').waitFor();
  const forms=await (await page.request.get(base+'/__test/forms')).json();
  assert.equal(forms.length,2);assert.equal(forms[0].ref,forms[1].ref);
  assert.equal(forms[1].qualification_id,stored.id);
  assert.ok(!(JSON.stringify(forms)).includes(stored.token));
  const OP={'X-Flemme-Operator-Key':'e2e-operator'},EX={'X-Flemme-Executor-Key':'e2e-executor'};
  assert.equal((await page.request.post(base+'/api/executor/claim/search',{headers:EX})).status(),200);
  const before=await (await page.request.post(base+'/api/executor/claim/search',{headers:EX})).json();assert.equal(before,null);
  const decision=await page.request.post(base+'/api/operator/missions/'+stored.id+'/decision',{headers:OP,data:{approve:true,reason:'Résumé vérifié par opérateur de test'}});assert.equal(decision.status(),200);
  for (const agent of ['search','quality','writer']) {
    const job=await (await page.request.post(base+'/api/executor/claim/'+agent,{headers:EX})).json();
    assert.equal(job.mission.permissions.external_actions,false);
    const done=await page.request.post(base+'/api/executor/jobs/'+job.id+'/complete',{headers:EX,data:{lease_token:job.lease_token,result:'Préparation à relire par un humain'}});assert.equal(done.status(),200);
  }
  const inspected=await (await page.request.get(base+'/api/operator/missions/'+stored.id,{headers:OP})).json();assert.equal(inspected.state,'completed');
  // New request: HTML/script-looking model input is rendered as text, and deletion works.
  await page.getByRole('button',{name:'+ Partager un autre besoin',exact:true}).click();
  await page.locator('#task').fill('<img src=x onerror=alert(1)>');
  await page.locator('#flemmeForm button[type=submit]').click();
  await page.locator('#qualConsent').check();await page.locator('#qualStart').click();
  await page.waitForFunction(()=>sessionStorage.getItem('flemmeQualification')!==null && document.querySelectorAll('.qual-message').length>=3 && !document.getElementById('qualSend').disabled);
  assert.equal(await page.locator('#qualLog img').count(),0);
  const second=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('flemmeQualification')));
  await page.locator('#qualSkip').click();
  await page.waitForFunction(()=>sessionStorage.getItem('flemmeQualification')===null);
  const deleted=await page.request.get(base+'/api/qualification/conversations/'+second.id,{headers:{Authorization:'Bearer '+second.token}});assert.equal(deleted.status(),404);
  assert.deepEqual(errors,[]);
  console.log('Browser integration passed: consent, progressive qualification, reload, corrected summary, failed-send retry, human approval, ordered routing, safe text and deletion.');
  await context.close();
} finally {await browser.close();}
