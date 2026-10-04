const fs=require('fs');
const r=f=>JSON.parse(fs.readFileSync('content/'+f+'.json','utf8'));
fs.writeFileSync('content.js','window.FLEMME='+JSON.stringify({accueil:r('accueil'),categories:r('categories'),contact:r('contact')})+';\n');
console.log('content.js généré');
