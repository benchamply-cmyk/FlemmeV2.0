(function () {
  'use strict';
  const $=id=>document.getElementById(id), kinds={comparer_devis:'quote',trouver_prestataire:'provider',rechercher_produit:'product',organiser_voyage:'travel'};
  let current, client, pending, active=false, sourceCount=0;
  function field(parent,key,label,type='text',options) {
    const id='offer-'+sourceCount+'-'+key, name=document.createElement('label');name.htmlFor=id;name.textContent=label;
    const input=document.createElement(options?'select':type==='textarea'?'textarea':'input');input.id=id;input.dataset.field=key;
    if(options)options.forEach(([value,text])=>{const option=document.createElement('option');option.value=value;option.textContent=text;input.append(option);});
    else if(type!=='textarea')input.type=type;
    if(type==='number'){input.min='0';input.step=key==='duration_months'?'1':'0.01';}
    if(type==='textarea'){input.rows=3;input.maxLength=key==='text'?5000:3000;}
    if(type==='text')input.maxLength=key==='title'?300:100;
    if(['title','text','observed_on'].includes(key))input.required=true;
    if(key==='observed_on')input.value=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris'}).format(new Date());
    parent.append(name,input);
  }
  function addSource(){
    if(sourceCount>=20)return;sourceCount++;
    const box=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent='Offre '+sourceCount;box.append(legend);
    field(box,'title','Titre de l’offre');field(box,'text','Contenu ou extrait de l’offre','textarea');
    field(box,'observed_on','Date de la source','date');field(box,'source_url','Lien de référence (facultatif)','url');
    field(box,'price','Prix déclaré (facultatif)','number');
    field(box,'currency','Devise du prix','select',[['EUR','EUR'],['USD','USD'],['GBP','GBP'],['CHF','CHF']]);
    field(box,'price_basis','Base du prix','select',[['total','Total'],['per_hour','Par heure'],['per_night','Par nuit'],['per_person','Par personne'],['per_month','Par mois']]);
    field(box,'tax_basis','Taxes du prix','select',[['included','Incluses'],['excluded','Exclues']]);
    field(box,'location','Lieu (facultatif)');field(box,'available_on','Date disponible (facultatif)','date');
    field(box,'duration_months','Durée en mois (facultatif)','number');field(box,'upfront_payment','Apport (facultatif)','number');
    field(box,'inclusions','Prestations incluses — une par ligne (facultatif)','textarea');field(box,'exclusions','Prestations exclues — une par ligne (facultatif)','textarea');
    $('specialistSources').append(box);$('addSpecialistSource').disabled=sourceCount>=20;
  }
  function api(){return client ||= ManagerV2API.createClient(FLEMME.managerV2.url,()=>SB.session());}
  async function perform(action){if(active)return;active=true;$('produceDelivery').disabled=true;try{await action();}
    catch(e){$('specialistsNotice').textContent=e.status===503?'Les agents exécutants ne sont pas encore activés.':e.status?e.message:'Connexion interrompue : consulte les livrables avant de réessayer.';}
    finally{active=false;$('produceDelivery').disabled=false;}}
  function show(rows){
    if(pending && rows.some(row=>row.run.id===pending.request_id && (row.output||row.recovery)))pending=null;
    $('specialistDeliveries').replaceChildren();
    if(!rows.length){$('specialistsNotice').textContent='Aucun livrable enregistré.';return;}
    rows.forEach(row=>{
      const article=document.createElement('article'),heading=document.createElement('h3');heading.textContent='Tentative du '+new Date(row.run.created_at).toLocaleString('fr-FR');article.append(heading);
      const p=document.createElement('p');p.textContent=!row.output?(row.recovery?'Analyse interrompue ; sources conservées.':'Analyse en cours ou interrompue.'):row.output.stale?'Résultat conservé après modification de mission : à valider manuellement.':row.output.payload.failure?'Production non aboutie ; sources conservées.':'Rapport contrôlé et enregistré.';article.append(p);
      if(row.output?.payload.result){const report=document.createElement('pre');report.className='manager-message';report.textContent=row.output.payload.result.markdown;article.append(report);}
      if(!row.output&&!row.recovery){const recover=document.createElement('button');recover.type='button';recover.textContent='Libérer la tentative après cinq minutes';recover.addEventListener('click',()=>perform(async()=>{
        await api().recoverDelivery(current.id,{request_id:row.run.id,expected_revision:current.revision,note:'Récupération manuelle de la production interrompue.'});
        window.dispatchEvent(new CustomEvent('flemme:refresh'));show(await api().deliveries(current.id));}));article.append(recover);}
      $('specialistDeliveries').append(article);
      window.dispatchEvent(new CustomEvent('flemme:delivery-rendered',{detail:{article,row,conversationId:current.id}}));
    });
  }
  window.addEventListener('flemme:conversation',event=>{
    const saved=event.detail;if(current?.id!==saved.id){pending=null;$('specialistDeliveries').replaceChildren();$('specialistsNotice').textContent='';}
    current=saved;const last=[...saved.messages].reverse().find(m=>m.assessment)?.assessment;
    if(last?.selected_workflow.workflow_id==='comparer_devis' && sourceCount<2)addSource();
    $('specialistsPanel').hidden= !last || last.mission_status!=='ready' || !kinds[last.selected_workflow.workflow_id];
    $('specialistsForm').hidden=!!saved.pending_request_id||!['qualified','in_progress'].includes(saved.mission.state);
  });
  $('addSpecialistSource').addEventListener('click',addSource);addSource();
  $('readDeliveries').addEventListener('click',()=>perform(async()=>show(await api().deliveries(current.id))));
  $('specialistsForm').addEventListener('submit',event=>{event.preventDefault();perform(async()=>{
    const last=[...current.messages].reverse().find(m=>m.assessment).assessment;
    const sources=[...$('specialistSources').children].map((box,index)=>{
      const values={};box.querySelectorAll('[data-field]').forEach(input=>values[input.dataset.field]=input.value.trim());
      const source={id:'offre-'+(index+1),kind:kinds[last.selected_workflow.workflow_id],title:values.title,text:values.text,observed_on:values.observed_on};
      for(const key of ['source_url','location','available_on'])if(values[key])source[key]=values[key];
      if(values.price){source.price=values.price;source.currency=values.currency;source.price_basis=values.price_basis;source.tax_basis=values.tax_basis;}
      if(values.upfront_payment){source.upfront_payment=values.upfront_payment;source.currency=values.currency;source.tax_basis=values.tax_basis;}
      if(values.duration_months)source.duration_months=Number(values.duration_months);
      for(const key of ['inclusions','exclusions'])source[key]=values[key].split('\n').map(s=>s.trim()).filter(Boolean);
      return source;
    });
    const constraints={};if($('deliveryBudget').value){constraints.max_price=$('deliveryBudget').value;constraints.currency=$('deliveryCurrency').value;constraints.price_basis=$('deliveryBasis').value;constraints.tax_basis=$('deliveryTax').value;}
    if($('deliveryUpfront').value){constraints.max_upfront_payment=$('deliveryUpfront').value;constraints.currency=$('deliveryCurrency').value;constraints.tax_basis=$('deliveryTax').value;}
    if($('deliveryDuration').value)constraints.duration_months=Number($('deliveryDuration').value);
    if($('deliveryLocation').value.trim())constraints.location=$('deliveryLocation').value.trim();if($('deliveryDate').value)constraints.available_on=$('deliveryDate').value;
    const input={sources,constraints};
    if(pending && JSON.stringify(pending.input)!==JSON.stringify(input)){ $('specialistsNotice').textContent='Consulte les livrables et actualise la mission avant de modifier une requête dont le résultat est incertain.';return;}
    pending ||= {input,request_id:crypto.randomUUID(),expected_revision:current.revision};
    const result=await api().produce(current.id,{...input,request_id:pending.request_id,expected_revision:pending.expected_revision});pending=null;
    show([result]);$('specialistsNotice').textContent='Tentative et résultat conservés.';window.dispatchEvent(new CustomEvent('flemme:refresh'));
  });});
})();
