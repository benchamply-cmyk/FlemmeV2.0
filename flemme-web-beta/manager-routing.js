(function () {
  'use strict';
  const names={Search:'Search Agent — Recherche Web',Compare:'Compare Agent — Comparaison avancée',Document:'Document Agent — Analyse PDF',Quality:'Quality Agent — Vérification'};
  function render(article,row) {
    const activity=row.output?.payload.result?.agent_activity||row.output?.payload.agent_activity;
    const box=document.createElement('section'),title=document.createElement('h3');
    title.textContent='Tâches par agent';box.append(title);
    if(!Array.isArray(activity)) {
      const p=document.createElement('p');
      p.textContent='Cette tentative ne contient pas de suivi détaillé par agent. Son statut global ne permet pas de confirmer chaque étape.';box.append(p);
    } else {
      const list=document.createElement('ul');
      for(const item of activity) {
        if(!names[item.agent])continue;
        const li=document.createElement('li');
        li.textContent=names[item.agent]+' : '+({completed:'effectué',skipped:'non sollicité'}[item.status]||'non confirmé')+' — '+item.task;
        list.append(li);
      }
      box.append(list);
    }
    article.append(box);
  }
  window.FlemmeAgentRouting={render};
  window.addEventListener('flemme:delivery-rendered',e=>render(e.detail.article,e.detail.row));
})();
