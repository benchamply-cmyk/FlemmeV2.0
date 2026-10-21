(async function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const labels = {draft:'Nouveau besoin',qualified:'Brief qualifié',waiting_information:'Informations attendues',
    human_required:'Intervention humaine nécessaire',out_of_catalog:'Hors catalogue',in_progress:'En cours',
    blocked:'Bloquée',completed:'Terminée',cancelled:'Annulée'};
  const eventLabels={created:'Mission créée',user:'Message envoyé',qualification:'Qualification',failure:'Analyse non aboutie',late_result:'Résultat reçu après interruption',status:'Statut',action:'Action',result:'Résultat'};
  let client, snapshot, pendingMessage, pendingEvent, pendingCreation, listOffset = 0, busy = false;
  function notice(text) { $('managerNotice').textContent = text; }
  function paragraph(parent, text) { const p = document.createElement('p'); p.textContent = text; parent.append(p); }
  async function perform(action) {
    if (busy) return;
    busy = true;
    document.querySelectorAll('#managerPanel button').forEach(b => b.disabled = true);
    try { await action(); } catch (error) { notice(error.status ? error.message : 'Connexion interrompue. Actualise avant de réessayer.'); }
    finally { busy = false; document.querySelectorAll('#managerPanel button').forEach(b => b.disabled = false); if(snapshot) render(snapshot); }
  }
  async function list(more = false) {
    if(!more) listOffset=0;
    const rows = await client.list(listOffset); if(!more) $('conversationList').replaceChildren();
    const empty = document.createElement('option'); empty.value=''; empty.textContent='Choisis une conversation'; if(!more) $('conversationList').append(empty);
    rows.forEach(row => { const option=document.createElement('option'); option.value=row.id;
      option.textContent=new Date(row.created_at).toLocaleString('fr-FR')+' — '+(labels[row.state]||row.state);
      $('conversationList').append(option); });
    listOffset+=rows.length; $('olderConversations').hidden=rows.length<100;
    if(snapshot) $('conversationList').value=snapshot.id;
  }
  function render(saved) {
    snapshot=saved;
    window.dispatchEvent(new CustomEvent('flemme:conversation',{detail:saved})); $('conversationPanel').hidden=false;
    $('missionState').textContent='Mission : '+(labels[saved.mission.state]||saved.mission.state);
    $('conversationMessages').replaceChildren();
    saved.messages.forEach(message => {
      const card=document.createElement('article');card.className='manager-message from-'+(message.role==='user'?'user':'manager');
      paragraph(card,message.role==='user'?'Toi':'Flemme Manager');
      paragraph(card,message.assessment ? message.assessment.user_response.message : message.content);
      if(message.assessment) message.assessment.qualification_questions.forEach(q=>paragraph(card,q.question));
      const time=document.createElement('time');time.dateTime=message.created_at;time.textContent=new Date(message.created_at).toLocaleString('fr-FR');card.append(time);
      $('conversationMessages').append(card);
    });
    $('missionEvents').replaceChildren();saved.events.forEach(event=>{
      const li=document.createElement('li');li.textContent=new Date(event.created_at).toLocaleString('fr-FR')+' — '+(eventLabels[event.kind]||'Événement');
      if(event.payload.note) paragraph(li,event.payload.note);if(event.payload.result) paragraph(li,event.payload.result);
      $('missionEvents').append(li);
    });
    const locked=saved.pending_request_id || ['in_progress','blocked','completed','cancelled'].includes(saved.mission.state);
    $('sendMessage').disabled=!!locked||busy;
    $('recoverMessage').hidden=!saved.pending_request_id;
    if(saved.pending_request_id) notice('Analyse en cours ou interrompue. Actualise pour retrouver la réponse. Une récupération est possible après cinq minutes.');
  }
  if(!window.SB || !SB.ready || !window.FLEMME.managerV2 || !FLEMME.managerV2.url) {notice('Les conversations du Manager ne sont pas encore ouvertes.');return;}
  const session=await SB.session();if(!session){notice('Connecte-toi pour retrouver tes conversations.');$('managerLogin').hidden=false;return;}
  client=ManagerV2API.createClient(FLEMME.managerV2.url,()=>SB.session());$('managerPanel').hidden=false;
  $('newConversation').addEventListener('click',()=>perform(async()=>{const saved=await client.create(pendingCreation ||= crypto.randomUUID());pendingCreation=null;pendingMessage=null;pendingEvent=null;$('messageText').value='';notice('Conversation créée.');render(saved);await list();}));
  $('olderConversations').addEventListener('click',()=>perform(()=>list(true)));
  $('conversationList').addEventListener('change',()=>perform(async()=>{const id=$('conversationList').value;if(!id)return;pendingMessage=null;pendingEvent=null;notice('');render(await client.read(id));}));
  $('refreshConversation').addEventListener('click',()=>perform(async()=>{notice('');if(snapshot){const saved=await client.read(snapshot.id);if(pendingMessage && saved.messages.some(m=>m.request_id===pendingMessage.request_id)){pendingMessage=null;$('messageText').value='';}pendingMessage=null; if(pendingEvent && saved.events.some(e=>e.request_id===pendingEvent.request_id)){$('eventNote').value='';$('eventResult').value='';} pendingEvent=null;render(saved);}await list();}));
  $('managerMessage').addEventListener('submit',event=>{event.preventDefault();perform(async()=>{
    const text=$('messageText').value.trim();if(!text||!snapshot)return;
    if(pendingMessage && pendingMessage.request!==text) throw Object.assign(new Error('Actualise la conversation avant de modifier le message dont l’envoi est incertain.'),{status:409});
    pendingMessage ||= {request_id:crypto.randomUUID(),expected_revision:snapshot.revision,request:text};
    const saved=await client.send(snapshot.id,pendingMessage);pendingMessage=null;$('messageText').value='';notice('Échange enregistré.');render(saved);await list();
  });});
  $('missionUpdate').addEventListener('submit',event=>{event.preventDefault();perform(async()=>{
    if(!snapshot)return;const kind=$('eventKind').value;const payload={kind,state:kind==='status'?$('eventState').value:null,
      note:$('eventNote').value.trim(),result:kind==='result'?$('eventResult').value.trim():null};
    if(kind==='result'&&!payload.result){notice('Ajoute le résultat obtenu.');return;}
    if(pendingEvent && JSON.stringify(pendingEvent.payload)!==JSON.stringify(payload))throw Object.assign(new Error('Actualise avant de modifier cet événement.'),{status:409});
    pendingEvent ||= {payload,request_id:crypto.randomUUID(),expected_revision:snapshot.revision};
    const saved=await client.event(snapshot.id,{...payload,request_id:pendingEvent.request_id,expected_revision:pendingEvent.expected_revision});pendingEvent=null;
    $('eventNote').value='';$('eventResult').value='';notice('Historique mis à jour.');render(saved);await list();
  });});
  $('recoverMessage').addEventListener('click',()=>perform(async()=>{
    render(await client.recover(snapshot.id,{request_id:snapshot.pending_request_id,expected_revision:snapshot.revision,note:'Récupération manuelle après interruption.'}));notice('Analyse libérée ; ton message reste conservé.');
  }));
  window.addEventListener('flemme:refresh',()=>perform(async()=>{if(snapshot)render(await client.read(snapshot.id));await list();}));
  await perform(list);
})();
