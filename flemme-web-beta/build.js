const fs=require('fs');
const r=f=>JSON.parse(fs.readFileSync('content/'+f+'.json','utf8'));
// Espace personnel : adresse du projet Supabase et clé publique (anon / publishable),
// lues dans les variables d'environnement Netlify. Sans elles, l'espace reste masqué.
const supabase={url:(process.env.SUPABASE_URL||'').replace(/\/+$/,''),cle:process.env.SUPABASE_ANON_KEY||''};
fs.writeFileSync('content.js','window.FLEMME='+JSON.stringify({accueil:r('accueil'),categories:r('categories'),contact:r('contact'),supabase})+';\n');
console.log('content.js généré'+(supabase.url&&supabase.cle?' (espace personnel activé)':' (espace personnel désactivé : SUPABASE_URL / SUPABASE_ANON_KEY absents)'));
