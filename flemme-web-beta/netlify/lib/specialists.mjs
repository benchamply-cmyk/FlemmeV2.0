// Port of the existing provided-source specialists. No network calls or external actions.
const KIND={comparer_devis:'quote',trouver_prestataire:'provider',rechercher_produit:'product',organiser_voyage:'travel'};
const BASES=['total','per_hour','per_night','per_person','per_month'];
const TAXES=['included','excluded'],CURRENCIES=['EUR','USD','GBP','CHF'];
const normalized=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
const fail=message=>{throw Object.assign(new Error(message),{status:422});};
const text=(value,max=5000)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
export function cents(value) {
  if(typeof value!=='string' || !/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(value)) fail('Montant invalide : utiliser un nombre positif avec au plus deux décimales.');
  const [whole,fraction='']=value.split('.');const result=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
  if(result>100000000000n) fail('Montant trop élevé.'); return result;
}
const money=value=>{const v=BigInt(value);return (v/100n)+'.'+String(v%100n).padStart(2,'0');};
const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const optional=v=>v===null||v===undefined;
function keys(value,allowed) {if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k))) fail('Champs non reconnus.');}
function enumValue(v,allowed,label,required=false) {if((required||!optional(v))&&!allowed.includes(v)) fail(label+' : valeur requise ou invalide.');}
function texts(v,label,required=false) {if((required||!optional(v))&&(!Array.isArray(v)||v.length>20||v.some(x=>!text(x,300))||new Set(v.map(normalized)).size!==v.length)) fail(label+' : liste invalide.');}
function nullableText(v,label,max=300) {if(!optional(v)&&!text(v,max)) fail(label+' : texte invalide.');}
const sourceFields=['id','kind','title','text','source_url','observed_on','price','currency','price_basis','tax_basis','location','available_on','duration_months','upfront_payment','annual_mileage','deadline','departure','destination','travellers','travel_start','travel_end','features','inclusions','exclusions'];
const factFields=['objective','requested_action','immediate_danger','budget','budget_flexible','required_features','comparison_subject','service_type','intervention','zone','deadline','urgent','product_kind','usage','purchase_mode','duration_months','max_upfront_payment','annual_mileage','mission_type','dates','date_flexibility','travellers','departure','destination'];
function budgetValid(b) {
  keys(b,['amount','currency','basis','tax_basis','operator']);cents(b.amount);
  enumValue(b.currency,CURRENCIES,'Devise du budget',true);enumValue(b.basis,BASES,'Base du budget',true);enumValue(b.tax_basis,TAXES,'Taxes du budget',true);
  enumValue(b.operator,['lt','lte'],'Plafond');if(b.operator==='lt'&&cents(b.amount)===0n) fail('Plafond strictement inférieur à zéro impossible.');
}
export function validateInput(workflow,input,now=new Date()) {
  if(!Object.hasOwn(KIND,workflow)) fail('Workflow hors catalogue.');
  keys(input,['facts','sources']);const f=input.facts;keys(f,factFields);
  if(!text(f.objective,500)) fail('Objectif concret requis.');
  enumValue(f.requested_action,['prepare','compare'],'Action préparatoire',true);
  if(f.immediate_danger!==false) fail('Confirmer l’absence de danger immédiat avant traitement.');
  texts(f.required_features,'Critères indispensables',true);
  if(!optional(f.budget_flexible)&&typeof f.budget_flexible!=='boolean') fail('Flexibilité du budget invalide.');
  if(!optional(f.budget)){budgetValid(f.budget);if(f.budget_flexible===true)fail('Choisir un plafond ou un budget flexible.');}
  for(const key of ['comparison_subject','intervention','zone','deadline','usage','date_flexibility','departure','destination'])nullableText(f[key],key);
  for(const [key,max] of [['duration_months',120],['annual_mileage',200000],['travellers',100]])if(!optional(f[key])&&(!Number.isInteger(f[key])||f[key]<1||f[key]>max))fail('Valeur invalide : '+key);
  if(!optional(f.max_upfront_payment)){cents(f.max_upfront_payment);if(!f.budget)fail('Devise et taxes du budget requises pour comparer un apport.');}
  if(!optional(f.dates)){keys(f.dates,['start','end']);if(!date(f.dates.start)||!date(f.dates.end)||f.dates.end<f.dates.start)fail('Dates invalides.');}
  if(!optional(f.urgent)&&typeof f.urgent!=='boolean')fail('Urgence invalide.');
  const required=(ok,label)=>{if(!ok)fail(label+' requis avant de produire un livrable.');};
  if(workflow==='comparer_devis')required(text(f.comparison_subject),'Objet des devis');
  if(workflow==='trouver_prestataire') {
    enumValue(f.service_type,['plumbing','electrical','cleaning','moving','other'],'Type de service',true);
    required(text(f.intervention),'Intervention');required(text(f.zone),'Zone');required(text(f.deadline)||f.urgent===true,'Échéance');
    if(['cleaning','moving'].includes(f.service_type))required(!!f.budget,'Budget');
  }
  if(workflow==='rechercher_produit') {
    enumValue(f.product_kind,['vehicle','appliance','electronics','other'],'Type de produit',true);required(text(f.usage),'Usage');
    enumValue(f.purchase_mode,['purchase','rental','leasing'],'Mode d’acquisition',true);required(!!f.budget||f.budget_flexible===true,'Budget ou flexibilité explicite');
    if(f.purchase_mode==='leasing') {
      required(Number.isInteger(f.duration_months)&&f.duration_months>=1&&f.duration_months<=120,'Durée du leasing');
      required(!optional(f.max_upfront_payment),'Apport maximal');cents(f.max_upfront_payment);
      required(!!f.budget&&f.budget.basis==='per_month','Budget mensuel, devise et taxes');
      if(f.product_kind==='vehicle') {required(text(f.zone),'Zone');required(Number.isInteger(f.annual_mileage)&&f.annual_mileage>0&&f.annual_mileage<=200000,'Kilométrage annuel');}
    }
  }
  if(workflow==='organiser_voyage') {
    enumValue(f.mission_type,['itinerary','transport','accommodation','package'],'Type de voyage',true);
    if(f.dates) {keys(f.dates,['start','end']);required(date(f.dates.start)&&date(f.dates.end)&&f.dates.end>=f.dates.start,'Dates valides');}
    required(!!f.dates||text(f.date_flexibility),'Dates ou période flexible');
    required(Number.isInteger(f.travellers)&&f.travellers>0&&f.travellers<=100,'Nombre de voyageurs');required(text(f.destination),'Destination');
    if(['transport','package'].includes(f.mission_type))required(text(f.departure),'Départ');
    if(f.mission_type!=='itinerary')required(!!f.budget||f.budget_flexible===true,'Budget ou flexibilité explicite');
  }
  if(!Array.isArray(input.sources)||!input.sources.length||input.sources.length>20)fail('Fournir entre une et vingt sources.');
  const ids=new Set();
  for(const s of input.sources) {
    keys(s,sourceFields);
    if(!text(s.id,100)||ids.has(s.id)||!text(s.title,300)||!text(s.text))fail('Chaque source exige un identifiant unique, un titre et un contenu.');ids.add(s.id);
    enumValue(s.kind,Object.values(KIND),'Type de source',true);
    if(!date(s.observed_on)||s.observed_on>now.toISOString().slice(0,10))fail('Date de source invalide ou future.');
    if(!optional(s.source_url)) {if(!text(s.source_url,2000))fail('URL invalide.');let u;try{u=new URL(s.source_url);}catch{fail('URL invalide.');}if(!['https:','http:'].includes(u.protocol)||u.username||u.password)fail('URL de source refusée.');}
    for(const key of ['price','upfront_payment'])if(!optional(s[key]))cents(s[key]);
    enumValue(s.currency,CURRENCIES,'Devise source');enumValue(s.price_basis,BASES,'Base source');enumValue(s.tax_basis,TAXES,'Taxes source');
    for(const key of ['location','deadline','departure','destination'])nullableText(s[key],key);
    for(const key of ['available_on','travel_start','travel_end'])if(!optional(s[key])&&!date(s[key]))fail('Date invalide : '+key);
    if(s.travel_start&&s.travel_end&&s.travel_end<s.travel_start)fail('Dates du voyage inversées.');
    for(const [key,max] of [['duration_months',120],['annual_mileage',200000],['travellers',100]])if(!optional(s[key])&&(!Number.isInteger(s[key])||s[key]<1||s[key]>max))fail('Valeur invalide : '+key);
    texts(s.inclusions,'Prestations incluses');texts(s.exclusions,'Exclusions');
    if(!optional(s.features)) {if(typeof s.features!=='object'||Array.isArray(s.features)||Object.keys(s.features).length>30)fail('Critères source invalides.');const featureNames=new Set();for(const [name,v] of Object.entries(s.features)){if(!text(name,100)||featureNames.has(normalized(name))||![true,false,null].includes(v))fail('Critère source invalide ou dupliqué.');featureNames.add(normalized(name));}}
  }
  const selected=input.sources.filter(s=>s.kind===KIND[workflow]);
  required(selected.length>=(workflow==='comparer_devis'?2:1),'Sources du type attendu');
  if(workflow==='comparer_devis') {
    for(const s of selected)required(!optional(s.price)&&!!s.currency&&!!s.inclusions?.length,'Prix, devise et prestations des devis');
    const groups={};for(const s of selected)if(s.price_basis&&s.tax_basis){const key=[s.currency,s.price_basis,s.tax_basis].join('/');groups[key]=(groups[key]||0)+1;}
    required(Object.values(groups).some(n=>n>=2),'Deux devis avec devise, base de prix et taxes comparables');
  }
  return structuredClone(input);
}
export function search(workflow,query,input) {
  const terms=s=>new Set(normalized(s).match(/[a-z0-9]{4,}/g)||[]),q=terms(query);
  const score=s=>[...terms(s.title+' '+s.text)].filter(t=>q.has(t)).length;
  return {mode:'provided_sources',source_ids:input.sources.filter(s=>s.kind===KIND[workflow]).sort((a,b)=>score(b)-score(a)).map(s=>s.id),excluded_ids:input.sources.filter(s=>s.kind!==KIND[workflow]).map(s=>s.id)};
}
export function compare(selected,input) {
  const f=input.facts,b=f.budget,groups=new Map(),candidates=[];
  const warnings=['Sources fournies par l’administrateur ; prix, disponibilités et affirmations non vérifiés sur le web.','Les critères structurés servent à la comparaison ; un prix plus bas ne prouve pas une meilleure offre.'];
  for(const id of selected.source_ids) {
    const s=input.sources.find(v=>v.id===id),tests=[],unknowns=[],matches={};
    const comparable=!optional(s.price)&&s.currency&&s.price_basis&&s.tax_basis;
    let within_budget=null;
    if(b) {if(comparable&&s.currency===b.currency&&s.price_basis===b.basis&&s.tax_basis===b.tax_basis)within_budget=b.operator==='lt'?cents(s.price)<cents(b.amount):cents(s.price)<=cents(b.amount);else unknowns.push('Prix absent ou devise/base/taxes incompatibles avec le budget.');tests.push(within_budget);}
    const check=(key,expected,actual,fn=(a,e)=>normalized(a)===normalized(e))=>{if(optional(expected))return;const ok=optional(actual)?null:fn(actual,expected);matches[key]=ok;tests.push(ok);if(ok===null)unknowns.push('Information non confirmée : '+key);};
    check('location',f.zone,s.location);check('deadline',f.deadline,s.deadline);check('duration_months',f.duration_months,s.duration_months,(a,e)=>a===e);
    check('annual_mileage',f.annual_mileage,s.annual_mileage,(a,e)=>a>=e);
    for(const k of ['departure','destination','travellers'])check(k,f[k],s[k],typeof f[k]==='number'?(a,e)=>a===e:undefined);
    if(f.dates){check('travel_start',f.dates.start,s.travel_start);check('travel_end',f.dates.end,s.travel_end);}
    if(!optional(f.max_upfront_payment)){const ok=!optional(s.upfront_payment)&&s.currency===b.currency&&s.tax_basis===b.tax_basis?cents(s.upfront_payment)<=cents(f.max_upfront_payment):null;matches.upfront_payment=ok;tests.push(ok);if(ok===null)unknowns.push('Apport, devise ou taxes non confirmés.');}
    const feature_matches={},features=Object.fromEntries(Object.entries(s.features||{}).map(([k,v])=>[normalized(k),v]));
    for(const feature of f.required_features){const name=normalized(feature),v=Object.hasOwn(features,name)?features[name]:null;feature_matches[feature]=v;tests.push(v);if(v===null)unknowns.push('Critère non confirmé : '+feature);}
    candidates.push({source_id:id,within_budget,feature_matches,context_matches:matches,meets_supplied_constraints:tests.includes(false)?false:tests.includes(null)||!tests.length?null:true,unknowns});
    if(comparable){const key=[s.currency,s.price_basis,s.tax_basis].join('/');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(s);}else warnings.push(id+' : prix ou base de comparaison incomplets.');
    if(!s.inclusions?.length)warnings.push(id+' : prestations incluses non documentées.');
    if(!s.exclusions?.length)warnings.push(id+' : exclusions non documentées ; leur absence n’est pas prouvée.');
  }
  const price_groups=[...groups.values()].map(sources=>{
    const prices=sources.map(s=>cents(s.price)),low=prices.reduce((a,b)=>a<b?a:b),high=prices.reduce((a,b)=>a>b?a:b),spread=high-low;
    const percentage=low===0n?null:money((spread*10000n+low/2n)/low);
    return {currency:sources[0].currency,price_basis:sources[0].price_basis,tax_basis:sources[0].tax_basis,source_ids:sources.map(s=>s.id),lowest_price:money(low),highest_price:money(high),spread:money(spread),spread_percent_of_lowest:percentage,lowest_price_ids:sources.filter(s=>cents(s.price)===low).map(s=>s.id)};
  });
  if(groups.size>1)warnings.push('Groupes de prix distincts : aucun classement global ni conversion de devises.');
  return {candidates,price_groups,warnings};
}
const escape=s=>String(s).replace(/[<>&]/g,v=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[v])).replace(/[\\`*_{}\[\]()#+.!|]/g,'\\$&').replace(/\s+/g,' ');
const label=v=>({total:'prix total',per_hour:'par heure',per_night:'par nuit',per_person:'par personne',per_month:'par mois',included:'taxes comprises',excluded:'hors taxes',location:'zone',deadline:'échéance',duration_months:'durée en mois',annual_mileage:'kilométrage annuel',departure:'départ',destination:'destination',travellers:'voyageurs',travel_start:'date de départ',travel_end:'date de retour',upfront_payment:'apport'}[v]||v);
const verdict=v=>v===true?'Oui (déclaré)':v===false?'Non (déclaré)':'Non confirmé';
export function writer(workflow,selected,comparison,input,generated_at) {
  const titles={quote:'Comparaison des devis fournis',provider:'Sélection des prestataires fournis',product:'Comparaison des produits fournis',travel:'Comparaison des offres de voyage fournies'};
  const lines=['# '+titles[KIND[workflow]],'', 'Généré le '+generated_at+'.','', 'Objectif confirmé : '+escape(input.facts.objective),'', 'Analyse des sources fournies uniquement. Aucune recherche web, vérification de disponibilité, prise de contact, réservation ou achat n’a été exécuté.','', '## Tableau comparatif','','| Source | Prix déclaré | Budget | Critères fournis |','| --- | --- | --- | --- |'];
  for(const c of comparison.candidates){const s=input.sources.find(v=>v.id===c.source_id);lines.push('| '+escape(s.id+' — '+s.title)+' | '+(optional(s.price)?'Non renseigné':money(cents(s.price))+' '+(s.currency||'devise inconnue')+' ('+label(s.price_basis||'base inconnue')+', '+label(s.tax_basis||'taxes inconnues')+')')+' | '+verdict(c.within_budget)+' | '+verdict(c.meets_supplied_constraints)+' |');}
  lines.push('','## Écarts de prix calculés','');
  if(!comparison.price_groups.length)lines.push('Aucun groupe de prix comparable avec devise, base et taxes explicites.');
  for(const g of comparison.price_groups){lines.push('- '+g.currency+', '+label(g.price_basis)+', '+label(g.tax_basis)+' : minimum '+g.lowest_price+', maximum '+g.highest_price+', écart '+g.spread+'. Sources au minimum : '+g.lowest_price_ids.map(escape).join(', ')+'.');lines.push(g.source_ids.length<2?'Une seule offre dans ce groupe : aucune comparaison interoffres.':g.spread_percent_of_lowest===null?'Prix minimum nul : pourcentage non calculable.':'Écart relatif au prix minimum : '+g.spread_percent_of_lowest+' %.');}
  lines.push('','## Prestations et points à confirmer','');
  for(const c of comparison.candidates){const s=input.sources.find(v=>v.id===c.source_id);lines.push('### '+escape(s.id+' — '+s.title),'Inclus (déclaré) : '+(s.inclusions?.map(escape).join(' ; ')||'non documenté'),'Exclus (déclaré) : '+(s.exclusions?.map(escape).join(' ; ')||'non documenté'));for(const [k,v]of Object.entries({...c.feature_matches,...c.context_matches}))lines.push('- '+escape(label(k))+' : '+verdict(v));for(const v of c.unknowns)lines.push('- À confirmer : '+escape(v));}
  lines.push('','## Limites','',...comparison.warnings.map(w=>'- '+escape(w)),'','## Sources et dates déclarées','');
  for(const id of selected.source_ids){const s=input.sources.find(v=>v.id===id);lines.push('- '+escape(id+' — '+s.title)+', date déclarée '+s.observed_on+'. '+(s.source_url?'Référence : '+escape(s.source_url)+'. URL non consultée.':'Document fourni sans URL.'));}
  return lines.join('\n');
}
export function quality(workflow,input,result) {
  const selected=search(workflow,input.facts.objective,input),comparison=compare(selected,input),markdown=writer(workflow,selected,comparison,input,result.generated_at);
  if(result.workflow_id!==workflow||JSON.stringify(result.search)!==JSON.stringify(selected)||JSON.stringify(result.comparison)!==JSON.stringify(comparison)||result.markdown!==markdown)fail('Contrôle qualité refusé : provenance, calcul ou rapport incohérent.');
  return {passed:true,checks:['source_ids','workflow_evidence_kind','decimal_prices','currency_basis_tax_separation','unknown_information','source_dates','no_external_action_claim','grounded_report']};
}
export function produce(workflow,raw,now=new Date()) {
  const input=validateInput(workflow,raw,now),selected=search(workflow,input.facts.objective,input),comparison=compare(selected,input),generated_at=now.toISOString();
  const result={workflow_id:workflow,generated_at,agents:['Search','Compare','Writer','Quality'],search:selected,comparison,markdown:writer(workflow,selected,comparison,input,generated_at)};
  result.quality=quality(workflow,input,result);return {input,result};
}
