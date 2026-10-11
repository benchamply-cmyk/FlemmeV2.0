
'use strict';
window.SB = { ready:true, session:async()=>({email:'administrateur@example.test'}), blocPieces:()=>document.createElement('div'), messages:async()=>[], logout:async()=>{} };
const demoDemande = {id:'demo',ref:'FL-DEMO',created_at:'2026-10-11T10:00:00Z',statut:'recue',besoin:'Comparer les devis de rénovation de ma cuisine',email:'client@example.test',categorie:'Comparer des devis',precisions:'Deux devis à vérifier avant vendredi.',ambassadeur:true};
window.ADMIN = {
  membre:async()=>true,demandes:async()=>[demoDemande],derniers:async()=>({}),journal:async()=>[],liens:async()=>[],
  modifier:async()=>{},repondre:async()=>{},noter:async()=>{},lier:async()=>{},
  service:async r=>r==='brigade'?{items:[{id:'1',created_at:'2026-10-11',data:{candidat:'BR-DEMO',nom:'Camille — candidature de démonstration',email:'candidat@example.test',ville:'Lyon',mode:'À distance',competences:'Recherches et comparaisons'}}]}:
    r==='missions'?{items:[{mission_id:'12345678-1234-1234-1234-123456789abc',state:'qualified',revision:1,delivery_count:0}]}:
    {state:'qualified',revision:1,turns:[{request_text:'Comparer deux devis',assessment:{user_response:{message:'Les devis sont prêts à être examinés.'}}}],events:[],deliveries:[]}
};
