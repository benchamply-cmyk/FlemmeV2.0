'use strict';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const views=$$('.view'),SS=window.sessionStorage;
let task='',pref='auto',offer=null,ref='';
const safe=(f)=>{try{return f()}catch(e){}};
function show(id,push=true,focus=true){
  if((id==='clarify'||id==='offer')&&!task)id='home';
  if(id==='tracking'&&!ref)id='home';
  if(!$('#'+id))id='home';
  views.forEach(v=>v.classList.toggle('active',v.id===id));
  if(push&&location.hash!=='#'+id)history.pushState(null,'','#'+id);
  scrollTo(0,0);
  if(focus){const h=$('#'+id+' h1,#'+id+' h2');if(h){h.tabIndex=-1;h.focus({preventScroll:true})}}
}
function setCounter(){$('#counter').textContent=$('#task').value.length+'/280'}
$('#task').addEventListener('input',()=>{setCounter();safe(()=>SS.setItem('flemmeDraft',$('#task').value))});
$('#flemmeForm').addEventListener('submit',e=>{e.preventDefault();task=$('#task').value.trim();if(!task)return;$('#taskTitle').textContent='“'+task+'”';show('clarify')});
$$('[data-prefill]').forEach(b=>b.addEventListener('click',()=>{const t=$('#task');t.value=b.dataset.prefill;setCounter();safe(()=>SS.setItem('flemmeDraft',t.value));t.focus()}));
$$('.choice').forEach(b=>b.addEventListener('click',()=>{$$('.choice').forEach(x=>{x.classList.remove('selected');x.setAttribute('aria-pressed','false')});b.classList.add('selected');b.setAttribute('aria-pressed','true');pref=b.dataset.v}));
const has=(t,w)=>new RegExp('(^|[^a-zà-ÿ])('+w.join('|')+')','i').test(t);
function classify(t){
  const physical=has(t,['terrasse','colis','course','ménage','nettoy','meuble','déménag','chercher','récupér','déposer']);
  const human=has(t,['appel','rendez','sav','négoci','artisan','devis','garage','résili']);
  const sell=has(t,['vendre','annonce','canapé','vélo']);
  if(physical)return{route:['🤖 IA organise','🧑 Flemmeur sur place'],price:'19–39 €',delay:pref==='fast'?'Aujourd’hui':'24–72 h',saved:'1 à 3 h'};
  if(human)return{route:['🤖 IA prépare','🎧 Assistant humain'],price:'9–19 €',delay:pref==='fast'?'Quelques heures':'< 24 h',saved:'45 min à 2 h'};
  if(sell)return{route:['🤖 IA prépare l’annonce','🎧 Assistant gère les réponses'],price:'12–24 €',delay:'< 24 h',saved:'1 à 2 h'};
  return{route:['🤖 Agent IA'],price:'4,90–9,90 €',delay:pref==='fast'?'Quelques minutes':'< 2 h',saved:'30 à 90 min'};
}
function buildOffer(){
  offer=classify(task);const r=$('#route');r.replaceChildren();
  offer.route.forEach((x,i)=>{if(i){const a=document.createElement('b');a.textContent='→';r.append(a)}const s=document.createElement('span');s.textContent=x;r.append(s)});
  $('#price').textContent=offer.price;$('#delay').textContent=offer.delay;$('#summary').textContent=task;$('#saved').textContent=offer.saved;
  show('offer');
}
const genRef=()=>'FL-'+Array.from(crypto.getRandomValues(new Uint8Array(5)),n=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n%32]).join('');
$('#missionForm').addEventListener('submit',async e=>{
  e.preventDefault();const f=e.target,btn=f.querySelector('button[type=submit]'),err=$('#err');
  err.hidden=true;btn.disabled=true;const label=btn.textContent;btn.textContent='Envoi…';
  const n=genRef(),prefs={auto:'Le moins d’effort',cheap:'Le moins cher',fast:'Le plus rapide'};
  f.elements['task'].value=task;f.elements['when'].value=$('#when').value;f.elements['pref'].value=prefs[pref];
  f.elements['route'].value=offer.route.join(' → ');f.elements['price'].value=offer.price;f.elements['ref'].value=n;
  try{
    const r=await fetch('/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(new FormData(f)).toString()});
    if(!r.ok)throw new Error(r.status);
    ref=n;f.reset();safe(()=>SS.removeItem('flemmeDraft'));
    $('#missionRef').textContent='Mission '+ref+' · On te contacte à l’adresse indiquée, seulement quand ton intervention est nécessaire.';
    show('tracking');
  }catch(x){err.textContent='L’envoi a échoué. Vérifie ta connexion et réessaie dans un instant.';err.hidden=false}
  finally{btn.disabled=false;btn.textContent=label}
});
function resetApp(){task='';ref='';offer=null;$('#task').value='';setCounter();safe(()=>SS.removeItem('flemmeDraft'));show('home')}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-go]');if(!b)return;e.preventDefault();
  const g=b.dataset.go;g==='reset'?resetApp():g==='offer'?buildOffer():show(g);
});
addEventListener('popstate',()=>show(location.hash.slice(1)||'home',false));
const draft=safe(()=>SS.getItem('flemmeDraft'));if(draft){$('#task').value=draft;setCounter()}
history.replaceState(null,'','./');show('home',false,false);
if('serviceWorker'in navigator)addEventListener('load',()=>navigator.serviceWorker.register('./sw.js'));
