// Isolated demonstration: no credentials and no real API calls.
(function(){
 'use strict';
 const admin=new URL(location.href).searchParams.get('role')!=='customer';
 const snapshot={id:'demo',revision:2,pending_request_id:null,mission:{state:'qualified'},events:[],messages:[{role:'assistant',created_at:'2026-10-21T04:00:00Z',assessment:{mission_status:'ready',selected_workflow:{workflow_id:'comparer_devis'},qualification_questions:[],user_response:{message:'Démonstration : comparer deux devis. Les inconnues restent signalées.'}}}]};
 const row={run:{id:'demo-run',created_at:'2026-10-21T04:00:00Z',input:{}},output:{payload:{result:{markdown:'EXEMPLE FICTIF — Devis A : 980 EUR TTC ; devis B : 1200 EUR TTC. Écart : 220 EUR. Prestations et exclusions à vérifier.',agent_activity:[{agent:'Search',status:'skipped',task:'Aucune recherche web'},{agent:'Document',status:'completed',task:'Extraction de deux devis fictifs'},{agent:'Compare',status:'completed',task:'Comparaison des montants disponibles'},{agent:'Quality',status:'completed',task:'Contrôle des citations et calculs ; validation humaine requise'}]}}}};
 window.FLEMME={managerV2:{url:'https://preview.invalid'}};
 window.SB={ready:true,session:async()=>({access_token:'demo-no-credential'})};
 let selected=false;
 const denied=async()=>{throw new Error('Aperçu seulement : aucune mission réelle ne peut être lancée.');};
 window.ManagerV2API={createClient:()=>({access:async()=>({can_run_agents:admin}),list:async()=>{if(!selected){selected=true;setTimeout(()=>{const select=document.getElementById('conversationList');select.value='demo';select.dispatchEvent(new Event('change'));},100);}return [{id:'demo',created_at:'2026-10-21T04:00:00Z',state:'qualified'}];},read:async()=>snapshot,deliveries:async()=>[row],create:denied,send:denied,event:denied,recover:denied,produce:denied,acquire:denied,recoverDelivery:denied,original:denied})};
})();
