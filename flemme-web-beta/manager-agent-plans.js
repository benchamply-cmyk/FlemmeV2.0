(function(){
 'use strict';
 const names={Search:'Recherche web',Document:'Documents',Compare:'Comparaison',Quality:'Qualité',search:'Recherche web',documents:'Documents',compare:'Comparaison',quality:'Qualité'};
 const fields={query:'Recherche validée',documents:'Documents à extraire',sources:'Sources à sélectionner',max_price:'Plafond',currency:'Devise',price_basis:'Base du prix',tax_basis:'Taxes',duration_months:'Durée en mois',max_upfront_payment:'Apport maximal',location:'Lieu',available_on:'Date',required_features:'Critères indispensables',required:'Contrôles obligatoires'};
 const active=new WeakMap();
 async function prepare({kind,current,input,form,onResult,onError}) {
  if(!window.FlemmeAgentAccess?.canRun)return;
  active.get(form)?.dispose();
  const box=document.createElement('section');box.className='manager-message';box.setAttribute('aria-label','Plan du Manager à valider');form.after(box);
  const add=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;box.append(n);return n;};
  add('h3','Outils et étapes du Manager');
  const status=add('p','Préparation du plan, sans exécution des outils.');status.setAttribute('role','status');
  const api=ManagerV2API.createClient(FLEMME.managerV2.url,()=>SB.session());
  let alive=true,dirty=false,revision=current.revision,approved,proposal;
  const request={...input,request_id:crypto.randomUUID(),expected_revision:revision};
  const validate=add('button','Valider ce plan'),execute=add('button','Exécuter le plan validé');
  validate.type=execute.type='button';validate.dataset.planCommand='';execute.dataset.planCommand='';validate.disabled=execute.disabled=true;
  function invalidate(){if(!alive)return;dirty=true;approved=null;validate.disabled=execute.disabled=true;status.textContent='Paramètres modifiés : prépare un nouveau plan puis valide-le.';}
  function changed(event){if(!window.FlemmeAgentAccess?.canRun||event.detail.id!==current.id){dispose();return;}if(event.detail.revision!==revision)invalidate();}
  function publish(snapshot){revision=snapshot.revision;window.dispatchEvent(new CustomEvent('flemme:plan-snapshot',{detail:snapshot}));}
  const dispose=()=>{alive=false;form.removeEventListener('input',invalidate);form.removeEventListener('change',invalidate);window.removeEventListener('flemme:conversation',changed);box.remove();};
  active.set(form,{dispose});
  form.addEventListener('input',invalidate);form.addEventListener('change',invalidate);window.addEventListener('flemme:conversation',changed);
  try {
   proposal=await api.plan(current.id,{plan_id:crypto.randomUUID(),kind,request});
   if(!alive)return;
   publish(proposal.snapshot);if(dirty)return;
   const list=document.createElement('ol');
   for(const step of proposal.plan.steps){
    const li=document.createElement('li'),title=document.createElement('h4');title.textContent='Outil du Manager : '+names[step.tool || step.agent];li.append(title);
    const tasks=document.createElement('ul');for(const task of step.actions){const n=document.createElement('li');n.textContent=task;tasks.append(n);}li.append(tasks);
    for(const [key,value] of Object.entries(step.parameters)){
     if(value===null||value===undefined||(Array.isArray(value)&&!value.length))continue;
     const p=document.createElement('p');
     const display=Array.isArray(value)?value.map(v=>typeof v==='object'?(v.title||v.name||v.id):v).join(' ; '):value===true?'Oui':String(value);
     p.textContent=(fields[key]||key)+' : '+display;li.append(p);
    }
    if(!['quality','Quality'].includes(step.tool || step.agent)){
     const edit=document.createElement('button');edit.type='button';edit.textContent='Modifier les paramètres de '+(step.tool || step.agent);
     edit.addEventListener('click',()=>{const target=form.querySelector(['documents','Document'].includes(step.tool || step.agent)?'[type=file]':['search','Search'].includes(step.tool || step.agent)&&kind==='acquisition'?'#acquisitionQuery':['compare','Compare'].includes(step.tool || step.agent)?'#acquisitionBudget, #deliveryBudget':'textarea');target?.focus();target?.scrollIntoView({block:'center',behavior:'smooth'});});li.append(edit);
    }
    list.append(li);
   }
   box.insertBefore(list,status);
   const help=document.createElement('p');help.textContent='Modifie la recherche, les documents, les sources ou les critères dans le formulaire, puis prépare un nouveau plan. Les contrôles qualité sont obligatoires. Aucun script système ni instruction arbitraire n’est exécuté.';box.insertBefore(help,status);
   status.textContent='Plan proposé. Aucun outil n’a été exécuté. Vérifie les tâches avant de valider.';validate.disabled=false;
  } catch(error){status.textContent=error.message;onError?.(error);return;}
  const approvalRequestId=crypto.randomUUID();
  validate.addEventListener('click',async()=>{
   if(dirty||!alive)return;
   validate.disabled=true;execute.disabled=true;
   try{
    const result=await api.approvePlan(current.id,proposal.plan.id,{request_id:approvalRequestId,expected_revision:revision,approved:true});
    if(!alive)return;publish(result.snapshot);if(dirty)return;approved=result.approval_id;
    status.textContent='Plan validé et enregistré. Tu peux maintenant lancer son exécution.';execute.disabled=false;
   }catch(error){status.textContent=error.message;validate.disabled=dirty;onError?.(error);}
  });
  execute.addEventListener('click',async()=>{
   if(!approved||!alive||dirty)return;execute.disabled=true;
   try{
    const payload={...request,expected_revision:revision,approval_id:approved};
    const result=await (kind==='acquisition'?api.acquire(current.id,payload):api.produce(current.id,payload));
    status.textContent='Exécution terminée ; résultat et historique conservés.';approved=null;
    onResult(result);window.dispatchEvent(new CustomEvent('flemme:refresh'));
   }catch(error){status.textContent=error.message;execute.disabled=false;onError?.(error);}
  });
 }
 window.ManagerAgentPlans={prepare};
})();
