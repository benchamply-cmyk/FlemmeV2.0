const fs=require('fs');
const r=f=>JSON.parse(fs.readFileSync('content/'+f+'.json','utf8'));
// Espace personnel : adresse du projet Supabase et clé publique (anon / publishable).
// Valeurs de content/supabase.json, remplacées par les variables d'environnement Netlify
// SUPABASE_URL / SUPABASE_ANON_KEY si elles existent. La clé publique peut être écrite
// dans le fichier (elle est faite pour être visible) ; jamais la clé service_role / secret.
// Sans adresse ni clé, l'espace reste masqué.
const sb=r('supabase');
const managerUrl=(process.env.MANAGER_V2_API_URL||r('manager-v2').url||'').trim();
const managerOrigin=managerUrl?new URL(managerUrl).origin:'';
if(managerUrl && new URL(managerUrl).protocol!=='https:')throw new Error('MANAGER_V2_API_URL doit être HTTPS');
const supabase={url:(process.env.SUPABASE_URL||sb.url||'').trim().replace(/\/+$/,''),cle:(process.env.SUPABASE_ANON_KEY||sb.cle||'').trim()};
fs.writeFileSync('content.js','window.FLEMME='+JSON.stringify({accueil:r('accueil'),categories:r('categories'),contact:r('contact'),supabase,managerV2:{url:managerOrigin}})+';\n');
console.log('content.js généré'+(supabase.url&&supabase.cle?' (espace personnel activé)':' (espace personnel désactivé : '+(supabase.url?'':'SUPABASE_URL ')+(supabase.cle?'':'SUPABASE_ANON_KEY ')+'manquant)'));

// Autoriser uniquement le serveur Manager configuré, sans modifier les autres règles CSP.
if(managerOrigin){const p="_headers";const headers=fs.readFileSync(p,"utf8");fs.writeFileSync(p,headers.replace(/connect-src ([^;\n]+)/g,(full,values)=>values.split(/\s+/).includes(managerOrigin)?full:full+" "+managerOrigin));}
