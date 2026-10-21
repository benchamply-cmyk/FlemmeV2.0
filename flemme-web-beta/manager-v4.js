(function () {
  'use strict';
  const panel=document.getElementById('specialistsPanel');
  const section=document.createElement('section');
  // Static markup only; all source content is rendered with textContent.
  section.innerHTML='<h2>Recherche web et devis</h2><p>Recherche les sources réelles ou compare deux à trois documents. Les données absentes restent inconnues. Aucun achat, réservation ou envoi.</p>'+
    '<form id="acquisitionForm"><label for="acquisitionMode">Mode</label><select id="acquisitionMode"><option value="web">Chercher sur Internet</option><option value="documents">Comparer des documents</option></select>'+
    '<label for="acquisitionQuery">Recherche ou objectif</label><textarea id="acquisitionQuery" minlength="4" maxlength="1000" required rows="3"></textarea>'+
    '<label for="acquisitionFiles">Devis (PDF, DOCX, TXT ; 1 Mo chacun, deux à trois fichiers)</label><input id="acquisitionFiles" type="file" multiple accept=".pdf,.docx,.txt">'+
    '<p>Les scans et PDF chiffrés sont refusés. Les originaux sont conservés dans ton historique privé. DOCX et TXT sont cités par blocs, sans pagination physique.</p>'+
    '<label for="acquisitionBudget">Plafond en EUR (facultatif)</label><input id="acquisitionBudget" type="number" min="0" step="0.01">'+
    '<label for="acquisitionTaxes">Taxes du plafond</label><select id="acquisitionTaxes"><option value="included">TTC</option><option value="excluded">HT</option></select>'+
    '<p>Recherche web : plafond mensuel ; documents : plafond total. Le prix ne suffit pas à confirmer les conditions ou la disponibilité.</p>'+
    '<button id="acquisitionSubmit" type="submit">Rechercher ou analyser</button></form><p id="acquisitionNotice" role="status" aria-live="polite"></p><div id="acquisitionResult"></div>';
  section.hidden=true; panel.append(section);
  const $=id=>document.getElementById(id);
  let current,client,busy=false,pending;
  const api=()=>client ||= ManagerV2API.createClient(FLEMME.managerV2.url,()=>SB.session());
  window.addEventListener('flemme:conversation',event=>{
    if(current?.id!==event.detail.id){pending=null;$('acquisitionResult').replaceChildren();}
    current=event.detail;
    const last=[...current.messages].reverse().find(m=>m.assessment)?.assessment;
    section.hidden=!window.FlemmeAgentAccess?.canRun || !last || last.mission_status!=='ready' || !!current.pending_request_id || !['qualified','in_progress'].includes(current.mission.state);
    if(!pending)$('acquisitionMode').value=last?.selected_workflow.workflow_id==='comparer_devis'?'documents':'web';
  });
  function references(article,row,id){
    for(const source of row.output?.payload.result?.sources||[]){
      if(source.origin!=='web' || !source.url)continue;
      try{const url=new URL(source.url);if(url.protocol!=='https:'||url.username||url.password)continue;
        const a=document.createElement('a');a.href=url.href;a.textContent='Consulter '+source.title;
        a.target='_blank';a.rel='noopener noreferrer';article.append(a,document.createElement('br'));}catch{}
    }
    (row.run.input.acquisition?.documents||[]).forEach((document,index)=>{
      const button=window.document.createElement('button');button.type='button';button.textContent='Télécharger l’original : '+document.name;
      button.addEventListener('click',async()=>{button.disabled=true;try{
        const blob=await api().original(id,row.run.id,index),url=URL.createObjectURL(blob),a=window.document.createElement('a');
        a.href=url;a.download=document.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      }catch{ $('acquisitionNotice').textContent='Document indisponible. Reconnecte-toi et réessaie.';}finally{button.disabled=false;}});
      article.append(button);
    });
  }
  window.addEventListener('flemme:delivery-rendered',e=>references(e.detail.article,e.detail.row,e.detail.conversationId));
  $('acquisitionForm').addEventListener('submit',async event=>{
    event.preventDefault();if(!window.FlemmeAgentAccess?.canRun||busy||!current)return;busy=true;$('acquisitionSubmit').disabled=true;
    try{
      const mode=$('acquisitionMode').value,files=[...$('acquisitionFiles').files];
      if(mode==='documents'&&(files.length<2||files.length>3))throw new Error('Choisis deux à trois devis.');
      if(mode==='web'&&files.length)throw new Error('Choisis le mode documents pour joindre des devis.');
      const documents=[];
      for(const file of files){
        if(file.size>1000000||!file.size||! /^[\p{L}\p{N}_ .()-]+\.(pdf|docx|txt)$/iu.test(file.name))throw new Error('Document invalide ou supérieur à 1 Mo.');
        const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
        documents.push({name:file.name,content_base64:btoa(binary)});
      }
      const constraints={};if($('acquisitionBudget').value){constraints.max_price=$('acquisitionBudget').value;constraints.currency='EUR';constraints.price_basis=mode==='web'?'per_month':'total';constraints.tax_basis=$('acquisitionTaxes').value;}
      const input={mode,query:$('acquisitionQuery').value.trim(),constraints,documents};
      if(pending&&JSON.stringify(input)!==JSON.stringify(pending.input))throw new Error('Consulte les livrables et libère la tentative interrompue avant de changer cette demande.');
      pending ||= {input,request_id:crypto.randomUUID(),expected_revision:current.revision};
      $('acquisitionNotice').textContent='Analyse en cours ; les inconnues seront signalées.';
      const row=await api().acquire(current.id,{...pending.input,request_id:pending.request_id,expected_revision:pending.expected_revision});pending=null;
      const article=document.createElement('article'),pre=document.createElement('pre');pre.className='manager-message';
      pre.textContent=row.output?.payload.result?.markdown||'Tentative conservée sans rapport.';article.append(pre);window.FlemmeAgentRouting?.render(article,row);references(article,row,current.id);
      $('acquisitionResult').replaceChildren(article);$('acquisitionNotice').textContent='Résultat enregistré. Consulte les sources avant de décider.';
      window.dispatchEvent(new CustomEvent('flemme:refresh'));
    }catch(error){$('acquisitionNotice').textContent=error.status===503?'Recherche et documents non activés.':error.message;
      if(error.status&&error.status!==409)pending=null;
    }finally{busy=false;$('acquisitionSubmit').disabled=false;}
  });
})();
