'use strict';
// Formulaire privé : chaque valeur inconnue reste inconnue. Pas de données JSON à saisir.
function renderSpecialistForm(snapshot) {
  const box = document.createElement('section'); box.className = 'admin-note';
  const add = (tag, text, parent = box) => { const n = document.createElement(tag); n.textContent = text; parent.append(n); return n; };
  add('h3', 'Préparer un rapport avec les quatre spécialistes');
  add('p', 'Search sélectionne vos sources, Compare calcule les écarts, Writer rédige et Quality contrôle. Les liens ne sont pas consultés. Le rapport reste privé : aucune réponse au client, prise de contact, réservation ou achat.');
  const turn = snapshot.turns?.at(-1), a = turn?.assessment;
  if (!['qualified','in_progress'].includes(snapshot.state) || snapshot.job_id || turn?.failed !== false || turn.state !== 'qualified' || a?.human_intervention_required !== false) {
    add('p', 'Terminez la qualification et levez les blocages avant de préparer un rapport.'); return box;
  }
  const kind = {comparer_devis:'quote',trouver_prestataire:'provider',rechercher_produit:'product',organiser_voyage:'travel'}[a.workflow];
  if (!kind) { add('p','Ce type de mission ne dispose pas de spécialistes.'); return box; }
  const form = document.createElement('form'); box.append(form);
  const controls = {}, sourceControls = [];
  function field(parent, target, name, label, type = 'text', required = false, choices) {
    const wrap = document.createElement('label'); wrap.className = 'admin-field';
    wrap.append(document.createTextNode(label));
    const input = document.createElement(choices ? 'select' : type === 'textarea' ? 'textarea' : 'input');
    if (choices) {
      const blank = document.createElement('option'); blank.value = ''; blank.textContent = 'Non renseigné'; input.append(blank);
      choices.forEach(([value, text]) => { const o = document.createElement('option'); o.value = value; o.textContent = text; input.append(o); });
    } else if (type !== 'textarea') input.type = type;
    input.required = required; input.setAttribute('aria-label', label); input.name = name;
    if(type === 'number') { input.min = '1'; input.step = '1'; }
    if(type === 'text' || type === 'textarea') input.maxLength = type === 'textarea' ? 5000 : 500;
    wrap.append(input); parent.append(wrap); target[name] = input; return input;
  }
  const currencies = ['EUR','USD','GBP','CHF'].map(v=>[v,v]);
  const bases = [['total','Prix total'],['per_hour','Par heure'],['per_night','Par nuit'],['per_person','Par personne'],['per_month','Par mois']];
  const taxes = [['included','Taxes comprises'],['excluded','Hors taxes']];
  const moneyField = (parent,target,name,label) => { const n = field(parent,target,name,label); n.inputMode = 'decimal'; n.pattern = '(?:0|[1-9][0-9]{0,9})(?:[.,][0-9]{1,2})?'; return n; };
  field(form,controls,'objective','Objectif confirmé','text',true).value = a.objective || '';
  field(form,controls,'required_features','Critères indispensables (un par ligne ; laisser vide si aucun)','textarea');
  const danger = field(form,controls,'danger','Je confirme l’absence de danger immédiat','checkbox',true);
  moneyField(form,controls,'budget_amount','Plafond du budget (facultatif selon la mission)');
  field(form,controls,'budget_currency','Devise du budget','text',false,currencies);
  field(form,controls,'budget_basis','Base du budget','text',false,bases);
  field(form,controls,'budget_tax','Taxes du budget','text',false,taxes);
  field(form,controls,'budget_flexible','Le budget est explicitement flexible','checkbox');
  if(kind==='quote') field(form,controls,'comparison_subject','Objet des devis','text',true);
  if(kind==='provider') {
    field(form,controls,'service_type','Type de service','text',true,[['plumbing','Plomberie'],['electrical','Électricité'],['cleaning','Ménage'],['moving','Déménagement'],['other','Autre']]);
    field(form,controls,'intervention','Intervention attendue','text',true);
    field(form,controls,'zone','Zone d’intervention','text',true); field(form,controls,'deadline','Échéance souhaitée'); field(form,controls,'urgent','Intervention urgente','checkbox');
  }
  if(kind==='product') {
    field(form,controls,'product_kind','Type de produit','text',true,[['vehicle','Véhicule'],['appliance','Électroménager'],['electronics','Électronique'],['other','Autre']]);
    field(form,controls,'usage','Usage attendu','text',true);
    field(form,controls,'purchase_mode','Mode d’acquisition','text',true,[['purchase','Achat'],['rental','Location'],['leasing','Leasing']]);
    field(form,controls,'duration_months','Durée du leasing en mois','number'); moneyField(form,controls,'max_upfront_payment','Apport maximal du leasing');
    field(form,controls,'annual_mileage','Kilométrage annuel du leasing','number'); field(form,controls,'zone','Zone recherchée');
  }
  if(kind==='travel') {
    field(form,controls,'mission_type','Aide pour le voyage','text',true,[['itinerary','Itinéraire'],['transport','Transport'],['accommodation','Hébergement'],['package','Séjour complet']]);
    field(form,controls,'travel_start','Date de départ','date'); field(form,controls,'travel_end','Date de retour','date'); field(form,controls,'date_flexibility','Période flexible si les dates sont inconnues');
    field(form,controls,'travellers','Nombre de voyageurs','number',true); field(form,controls,'departure','Lieu de départ'); field(form,controls,'destination','Destination','text',true);
  }
  const sources = document.createElement('div'); form.append(sources);
  function addSource() {
    const i = sourceControls.length + 1, c = {}, group = document.createElement('fieldset'); sources.append(group); sourceControls.push(c);
    add('legend','Source '+i,group);
    field(group,c,'title','Source '+i+' : nom de l’offre','text',true);
    field(group,c,'text','Source '+i+' : contenu fourni','textarea',true);
    field(group,c,'source_url','Source '+i+' : lien de référence','url');
    field(group,c,'observed_on','Source '+i+' : date déclarée','date',true).value = new Date().toISOString().slice(0,10);
    moneyField(group,c,'price','Source '+i+' : prix déclaré');
    field(group,c,'currency','Source '+i+' : devise','text',false,currencies);
    field(group,c,'price_basis','Source '+i+' : base du prix','text',false,bases);
    field(group,c,'tax_basis','Source '+i+' : taxes','text',false,taxes);
    field(group,c,'inclusions','Source '+i+' : prestations incluses (une par ligne)','textarea');
    field(group,c,'exclusions','Source '+i+' : exclusions (une par ligne)','textarea');
    field(group,c,'yes_features','Source '+i+' : critères confirmés (un par ligne)','textarea');
    field(group,c,'no_features','Source '+i+' : critères absents (un par ligne)','textarea');
    if(kind==='provider'||kind==='product') field(group,c,'location','Source '+i+' : zone confirmée');
    if(kind==='provider') field(group,c,'deadline','Source '+i+' : échéance confirmée');
    if(kind==='product') {
      field(group,c,'duration_months','Source '+i+' : durée en mois','number'); moneyField(group,c,'upfront_payment','Source '+i+' : apport'); field(group,c,'annual_mileage','Source '+i+' : kilomètres annuels','number');
    }
    if(kind==='travel') {
      for(const [key,label,type] of [['departure','départ','text'],['destination','destination','text'],['travellers','voyageurs','number'],['travel_start','date de départ','date'],['travel_end','date de retour','date']])field(group,c,key,'Source '+i+' : '+label,type);
    }
  }
  addSource(); if(kind==='quote')addSource();
  const more = add('button','Ajouter une source',form); more.type = 'button'; more.className = 'secondary';
  more.addEventListener('click',()=>{addSource();more.disabled = sourceControls.length>=20;});
  const submit = add('button','Préparer et contrôler le rapport privé',form); submit.type = 'submit'; submit.className = 'primary';
  const status = add('p','',form); status.setAttribute('role','status');
  const output = document.createElement('div'); box.append(output);
  const lines = value=>value.split('\n').map(x=>x.trim()).filter(Boolean);
  const read = c=>Object.fromEntries(Object.entries(c).flatMap(([k,n])=>n.type==='checkbox'?[[k,n.checked]]:!n.value.trim()?[]:[[k,n.type==='number'?Number(n.value):n.value.trim()]]));
  const decimal = value=>value.replace(',','.');
  let pending;
  form.addEventListener('submit',async e=>{
    e.preventDefault(); submit.disabled = true; status.textContent = 'Sélection, comparaison, rédaction et contrôle…';
    try {
      const v = read(controls),facts = {...v,requested_action:'compare',immediate_danger:!danger.checked,required_features:lines(v.required_features||'')};
      delete facts.danger; delete facts.budget_amount; delete facts.budget_currency; delete facts.budget_basis; delete facts.budget_tax;
      if(v.budget_amount)facts.budget = {amount:decimal(v.budget_amount),currency:v.budget_currency,basis:v.budget_basis,tax_basis:v.budget_tax,operator:'lte'};
      if(v.max_upfront_payment)facts.max_upfront_payment = decimal(v.max_upfront_payment);
      delete facts.travel_start; delete facts.travel_end;
      if(v.travel_start||v.travel_end)facts.dates = {start:v.travel_start,end:v.travel_end};
      const input = {facts,sources:sourceControls.map((c,i)=>{
        const s = read(c),yes = lines(s.yes_features||''),no = lines(s.no_features||'');
        if(yes.some(x=>no.some(y=>x.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()===y.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase())))throw new Error('Un critère ne peut pas être présent et absent dans la même source.');
        delete s.yes_features; delete s.no_features;
        s.inclusions = lines(s.inclusions||''); s.exclusions = lines(s.exclusions||'');
        s.features = Object.fromEntries([...yes.map(x=>[x,true]),...no.map(x=>[x,false])]);
        if(s.price)s.price = decimal(s.price); if(s.upfront_payment)s.upfront_payment = decimal(s.upfront_payment);
        return {...s,id:'source-'+(i+1),kind};
      })};
      const serialized = JSON.stringify(input);
      if(!pending||pending.serialized!==serialized)pending = {serialized,id:crypto.randomUUID()};
      const result = await ADMIN.service('livrer:'+snapshot.mission_id,{method:'POST',body:{expected_revision:snapshot.revision,request_id:pending.id,input}});
      output.replaceChildren(renderMissionSnapshot(result)); status.textContent = 'Rapport enregistré dans l’historique privé. Validez-le avant toute utilisation. Rechargez la mission pour la prochaine commande.';
      form.querySelectorAll('input,select,textarea,button').forEach(n=>n.disabled = true);
    } catch(error) { status.textContent = error.message; submit.disabled = false; }
  });
  return box;
}
