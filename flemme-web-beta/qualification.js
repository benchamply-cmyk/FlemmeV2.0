'use strict';
(() => {
  const box = document.getElementById('qualification');
  if (!box || !window.FLEMME?.qualification?.enabled || window.Capacitor?.isNativePlatform?.()) return;
  box.hidden = false;
  const el = id => document.getElementById(id);
  const storageKey = 'flemmeQualification';
  let session = null, state = null, task = '', busy = false, pendingMessage = null, formContext = '', generation = 0;
  const store = value => {try {value ? sessionStorage.setItem(storageKey, JSON.stringify(value)) : sessionStorage.removeItem(storageKey);} catch {}};
  try {session = JSON.parse(sessionStorage.getItem(storageKey) || 'null');} catch {}
  const error = text => {el('qualError').textContent = text;el('qualError').hidden = !text;};
  const contextText = () => {
    const details = el('precisions').value.trim();
    const when = el('betaWhen').value;
    return [details ? 'Précisions : ' + details : '', when !== 'Aucune urgence' ? 'Échéance : ' + when : ''].filter(Boolean).join('\n');
  };
  function lock(value) {
    busy = value;
    ['qualStart','qualSend','qualSkip','qualMessage'].forEach(id => {el(id).disabled = value;});
    el('qualStart').textContent = value ? 'Un instant…' : 'Discuter avec l’assistant';
  }
  async function api(path, method = 'GET', body) {
    const headers = {'Content-Type':'application/json'};
    if (session) headers.Authorization = 'Bearer ' + session.token;
    const r = await fetch('/api/qualification' + path, {method, headers, body:body ? JSON.stringify(body) : undefined, signal:AbortSignal.timeout(50000), cache:'no-store'});
    const data = r.status === 204 ? null : await r.json();
    if (!r.ok) {
      const exception = new Error(typeof data?.detail === 'string' ? data.detail : 'Vérifie tes réponses puis réessaie.');
      exception.status = r.status;throw exception;
    }
    return data;
  }
  function render(data) {
    state = data;
    el('qualConsent').checked = true;
    el('qualConsent').disabled = true;
    el('qualStart').hidden = true;
    el('qualChat').hidden = false;
    const log = el('qualLog');log.replaceChildren();
    for (const item of data.history) {
      const p = document.createElement('p');p.className = 'qual-message';p.dataset.role = item.role;
      p.textContent = (item.role === 'user' ? 'Toi : ' : 'Flemme : ') + item.content;log.append(p);
    }
    log.scrollTop = log.scrollHeight;
    const summary = data.summary;
    const canConfirm = summary.ready || summary.human_required;
    el('qualSummary').hidden = !canConfirm;
    el('qualReview').hidden = !canConfirm;
    el('qualApproved').checked = data.state !== 'qualifying';
    const labels = {scope:'Besoin',location:'Lieu',budget:'Budget',deadline:'Échéance',success_criteria:'Critères',constraints:'Contraintes',documents_summary:'Devis fournis'};
    el('qualResult').textContent = [summary.expected_result, ...Object.entries(summary.facts).filter(([,v])=>v).map(([k,v])=>(labels[k] || k)+ ' : ' +v), summary.human_required ? 'Une personne doit étudier cette demande.' : 'Une personne validera la mission avant sa prise en charge.'].join('\n');
    const terminal = data.state !== 'qualifying';
    el('qualSend').hidden = terminal;el('qualMessage').hidden = terminal;
    el('qualApproved').disabled = terminal;
  }
  async function turn(text, requestId) {
    if (!pendingMessage || pendingMessage.message !== text) pendingMessage = {message:text,request_id:requestId || crypto.randomUUID()};
    // Reload before retry; the same request id reconciles an already committed turn.
    state = await api('/conversations/' + session.id);
    const data = await api('/conversations/' + session.id + '/messages','POST',{...pendingMessage,version:state.version});
    pendingMessage = null;render(data);
  }
  el('qualStart').addEventListener('click', async () => {
    if (busy) return;
    if (!el('qualConsent').checked) {error('Coche l’accord de transmission à OpenAI pour démarrer.');return;}
    if (!task.trim()) {error('Décris d’abord ta demande.');return;}
    const context = contextText();
    if (context.length > 1400) {error('Raccourcis les précisions à 1 400 caractères ou utilise le formulaire.');return;}
    lock(true);error('');
    try {
      const data = await api('/conversations','POST',{task,consent:true});
      session = {id:data.id,token:data.token};store(session);render(data);
      formContext = context;
      await turn(context || 'Aide-moi à préciser cette demande.');
    } catch (e) {error(e.message || 'Connexion interrompue. Réessaie ou utilise le formulaire.');}
    finally {lock(false);}
  });
  el('qualSend').addEventListener('click', async () => {
    const text = el('qualMessage').value.trim() || pendingMessage?.message;
    if (busy || !text) return;
    lock(true);error('');el('qualApproved').checked = false;
    try {await turn(text);el('qualMessage').value = '';}
    catch (e) {error(e.message || 'Connexion interrompue. Réessaie.');}
    finally {lock(false);}
  });
  async function discard() {
    if (session) {
      try {await api('/conversations/' + session.id,'DELETE');}
      catch(e) {if(e.status !== 404) throw e;}
    }
    session = null;state = null;pendingMessage = null;store(null);generation++;
    el('qualChat').hidden = true;el('qualStart').hidden = false;
    el('qualConsent').disabled = false;el('qualConsent').checked = false;
    el('qualMessage').value = '';error('');
  }
  el('qualSkip').addEventListener('click', async () => {
    if (busy) return;lock(true);
    try {await discard();} catch(e) {error(e.message);}
    finally {lock(false);}
  });
  window.FlemmeQualification = {
    async setTask(value) {
      task = value;
      if (!session || busy) return;
      const current = ++generation;lock(true);
      try {
        const data = await api('/conversations/' + session.id);
        if (current !== generation) return;
        if (data.history[0].content !== value) {
          await discard();
        } else {render(data);formContext = contextText();}
      } catch(e) {
        if (e.status === 404) {await discard();}
        error(e.message);
      } finally {lock(false);}
    },
    async finalize(form, reference) {
      if (!session) return null;
      if (busy) throw new Error('Attends la réponse de l’assistant.');
      if (!el('qualApproved').checked) throw new Error('Termine les questions et confirme le récapitulatif, ou efface l’échange pour utiliser le formulaire.');
      if (!form.elements.consent.checked) throw new Error('Confirme ton accord pour traiter la demande.');
      lock(true);
      try {
        const context = contextText();
        if (state?.state === 'qualifying' && context !== formContext) {
          if (context.length > 1400) throw new Error('Raccourcis les précisions ou utilise le formulaire.');
          await turn(context || 'Je retire les précisions supplémentaires du formulaire.');
          formContext = context;el('qualApproved').checked = false;
          throw new Error('Tes précisions ont été intégrées. Relis et confirme le nouveau récapitulatif.');
        }
        const reviewedVersion = state?.version;
        const fresh = await api('/conversations/' + session.id);
        if (fresh.history[0].content !== task) throw new Error('Le besoin a changé. Efface cet échange et recommence.');
        if (fresh.version !== reviewedVersion) {render(fresh);el('qualApproved').checked=false;throw new Error('La conversation a changé. Relis le récapitulatif.');}
        state = fresh;
        if (state.state !== 'qualifying') {
          if (!['pending_human','queued','completed'].includes(state.state)) throw new Error('L’équipe a refusé cette mission. Crée une nouvelle demande.');
          await api('/conversations/' + session.id + '/confirm','POST',{version:state.version,consent:true,contact:form.elements.contact.value.trim(),reference:state.reference});
          return {id:session.id,reference:state.reference};
        }
        // Version binds customer confirmation to exactly the reviewed snapshot.
        const confirmed = await api('/conversations/' + session.id + '/confirm','POST',{version:state.version,consent:true,contact:form.elements.contact.value.trim(),reference});
        render(confirmed);
        return {id:session.id,reference:confirmed.reference};
      } finally {lock(false);}
    },
    sent() {session=null;state=null;store(null);generation++;},
    reset() {
      session=null;state=null;pendingMessage=null;store(null);generation++;
      el('qualChat').hidden = true;el('qualStart').hidden = false;el('qualConsent').disabled = false;el('qualConsent').checked = false;error('');
    },
  };
})();
