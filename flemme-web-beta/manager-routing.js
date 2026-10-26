(function () {
  'use strict';
  const names={Search:'Recherche web',Compare:'Comparaison',Document:'Documents',Quality:'Qualité',search:'Recherche web',compare:'Comparaison',documents:'Documents',quality:'Qualité'};
  function render(article,row) {
    if(!window.FlemmeAgentAccess?.canRun)return;
    const activity=row.output?.payload.result?.tool_activity||row.output?.payload.tool_activity||row.output?.payload.result?.agent_activity||row.output?.payload.agent_activity;
    const box=document.createElement('section'),title=document.createElement('h3');
    title.textContent='Outils utilisés par Flemme Manager';box.append(title);
    if(!Array.isArray(activity)) {
      const p=document.createElement('p');
      p.textContent='Cette tentative ne contient pas de suivi détaillé par agent. Son statut global ne permet pas de confirmer chaque étape.';box.append(p);
    } else {
      const list=document.createElement('ul');
      for(const item of activity) {
        if(!names[item.tool || item.agent])continue;
        const li=document.createElement('li');
        li.textContent=names[item.tool || item.agent]+' : '+({completed:'effectué',skipped:'non sollicité'}[item.status]||'non confirmé')+' — '+item.task;
        list.append(li);
      }
      box.append(list);
    }
    article.append(box);
  }
  window.addEventListener('flemme:conversation',event=>{
    const old=document.getElementById('agentPlanHistory');old?.remove();
    if(!window.FlemmeAgentAccess?.canRun)return;
    const snapshot=event.detail,plans=snapshot.events.filter(e=>e.payload.agent_plan);
    if(!plans.length)return;
    const section=document.createElement('section');section.id='agentPlanHistory';
    const heading=document.createElement('h3');heading.textContent='Plans du Manager et validations';section.append(heading);
    for(const event of plans){
      const plan=event.payload.agent_plan,details=document.createElement('details'),summary=document.createElement('summary');
      const approval=snapshot.events.find(e=>e.payload.agent_plan_approval?.plan_id===plan.id);
      summary.textContent='Plan '+plan.id.slice(0,8)+' — '+(approval?'validé par l’administrateur':'proposé, en attente de validation');details.append(summary);
      for(const step of plan.steps){
        const title=document.createElement('p');title.textContent='Outil du Manager : '+(names[step.tool || step.agent]||step.agent);details.append(title);
        const list=document.createElement('ul');for(const action of step.actions){const li=document.createElement('li');li.textContent=action;list.append(li);}details.append(list);
      }
      const note=document.createElement('p');note.textContent='Historique conservé. Une modification ou une nouvelle exécution nécessite un plan actuel et sa validation.';details.append(note);section.append(details);
    }
    document.getElementById('conversationPanel').append(section);
  });
  window.FlemmeAgentRouting={render};
  window.addEventListener('flemme:delivery-rendered',e=>render(e.detail.article,e.detail.row));
})();
