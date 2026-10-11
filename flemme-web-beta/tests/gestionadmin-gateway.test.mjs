import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../netlify/functions/gestionadmin.mjs';
process.env.SUPABASE_URL = 'https://example.supabase.co'; process.env.SUPABASE_ANON_KEY = 'public-test-key';
process.env.FLEMME_MANAGER_URL = 'https://manager.example'; process.env.FLEMME_MANAGER_TOKEN = 'server-test-token';
process.env.NETLIFY_ADMIN_TOKEN = 'netlify-test-token'; process.env.SITE_ID = 'test-site';
const request = (resource, body) => new Request('https://www.flemme.org/api/gestionadmin?resource=' + encodeURIComponent(resource), {
  method: body ? 'POST':'GET', headers:{Authorization:'Bearer user-test-token','Content-Type':'application/json'}, body:body ? JSON.stringify(body):undefined
});
const answer = (data, status = 200) => new Response(JSON.stringify(data),{status});
const id = '12345678-1234-1234-1234-123456789abc';
test('refuses unauthenticated calls without accessing upstreams', async () => {
  global.fetch = () => { throw new Error('Must not fetch'); };
  assert.equal((await handler(new Request('https://www.flemme.org/api/gestionadmin'))).status,401);
});
test('non owner cannot access forms or Manager', async () => {
  let count = 0; global.fetch = async () => { count++; return answer(false); };
  assert.equal((await handler(request('brigade'))).status,403); assert.equal(count,1);
  assert.equal((await handler(request('missions'))).status,403); assert.equal(count,2);
});
test('invalid JWT fails closed', async () => {
  global.fetch = async () => answer({},401);
  assert.equal((await handler(request('missions'))).status,401);
});
test('only whitelisted Manager commands with a revision are accepted', async () => {
  global.fetch = async () => answer(true);
  for(const body of [{state:'cancelled',note:'x',expected_revision:1},{state:'blocked',note:'x'},{state:'blocked',note:'',expected_revision:1},{state:'blocked',note:'x',expected_revision:1,url:'https://attacker.example'}]) {
    assert.equal((await handler(request('mission:'+id,body))).status,400);
  }
  assert.equal((await handler(request('mission:../../secret'))).status,400);
});
test('owner command forwards server token and propagates revision conflict', async () => {
  global.fetch = async (url, options) => {
    if(url.includes('supabase.co')) return answer(true);
    assert.equal(url,'https://manager.example/api/v2/conversations/'+id+'/mission/events');
    assert.equal(options.headers.Authorization,'Bearer server-test-token');
    assert.equal(JSON.parse(options.body).expected_revision,7); return answer({},409);
  };
  const result = await handler(request('mission:'+id,{state:'blocked',note:'Vérifier les sources',expected_revision:7}));
  assert.equal(result.status,409); assert.equal(result.headers.get('cache-control'),'no-store');
  assert.ok(!(await result.text()).includes('server-test-token'));
});
test('forms are paginated and preserve both stages', async () => {
  global.fetch = async (url, options) => {
    if(url.includes('supabase.co')) return answer(true);
    assert.equal(options.headers.Authorization,'Bearer netlify-test-token');
    if(url.endsWith('/forms')) return answer([{id:'form-1',name:'facilitateur'}]);
    if(url.endsWith('page=1')) return answer(Array.from({length:100},(_,i)=>({id:String(i),created_at:'2026-10-11',data:{candidat:'BR-TEST',etape:'1'}})));
    return answer([{id:'second-stage',created_at:'2026-10-11',data:{candidat:'BR-TEST',etape:'2'}}]);
  };
  const response = await handler(request('brigade')); const data = await response.json();
  assert.equal(data.items.length,101); assert.equal(data.items[100].data.etape,'2');
});
test('unconfigured and failing integrations are explicit', async () => {
  const token = process.env.FLEMME_MANAGER_TOKEN; delete process.env.FLEMME_MANAGER_TOKEN;
  global.fetch = async () => answer(true);
  assert.equal((await handler(request('missions'))).status,503); process.env.FLEMME_MANAGER_TOKEN = token;
  global.fetch = async () => {throw new Error('network');};
  assert.equal((await handler(request('missions'))).status,502);
});
