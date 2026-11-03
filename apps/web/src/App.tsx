import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Command, Input, Offer, Task } from '../../mobile/src/domain.ts';
import { commission, money, parseMoney } from '../../mobile/src/domain.ts';
import { DemoGateway, RemoteGateway, demoActors, newId } from '../../mobile/src/gateway.ts';
import type { Gateway } from '../../mobile/src/gateway.ts';
import { readDemo, tokens, writeDemo } from './storage.ts';

// Portage web de apps/mobile/App.tsx : mêmes écrans, mêmes textes, mêmes règles (domain.ts, gateway.ts).
// Différence web : chaque écran est une entrée d’historique, le bouton Retour du navigateur remplace BackHandler.
type Screen = 'home' | 'list' | 'new' | 'detail' | 'offer' | 'review' | 'report' | 'account';
type Tab = 'mine' | 'find';
// depth : nombre d’écrans empilés dans l’app depuis l’arrivée, pour que Retour ne quitte jamais l’app par erreur.
type Place = { screen: Screen; tab: Tab; taskId: string; offerId: string; depth: number };
type Draft = Record<string, string>;
const status = { open: 'Ouverte', assigned: 'Attribuée', completed: 'Terminée' };
const offerStatus = { pending: 'En attente', accepted: 'Acceptée', declined: 'Déclinée', not_selected: 'Flemme attribuée à un autre Brigadier' };
const date = (s: string) => new Date(s).toLocaleString('fr-FR');
const url = import.meta.env.VITE_SUPABASE_URL || '';
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const remoteMode = !!(url || key);
// Lien direct depuis la vitrine : app.html#mine ou app.html#find.
const initialTab = location.hash === '#find' ? 'find' : location.hash === '#mine' ? 'mine' : null;
const start: Place = { screen: initialTab ? 'list' : 'home', tab: initialTab || 'mine', taskId: '', offerId: '', depth: 0 };
// Écrans ouverts depuis la fiche d’une flemme : combien de pas pour y revenir.
const aboveDetail: Partial<Record<Screen, number>> = { offer: 1, review: 2, report: 1 };

function Action({ children, onClick, secondary = false, disabled = false }: { children: ReactNode; onClick: () => void; secondary?: boolean; disabled?: boolean }) {
  return <button type="button" className={'btn' + (secondary ? ' secondary' : '')} disabled={disabled} onClick={onClick}>{children}</button>;
}
function Bill({ amount }: { amount: number }) {
  return <div className="card" aria-label="Récapitulatif du prix"><div className="row"><span>Forfait Brigadier</span><span className="strong">{money(amount)}</span></div><div className="row"><span>FLEMME · 10 %</span><span className="strong">{money(commission(amount))}</span></div><div className="divider"/><div className="row"><span className="strong">Total déposant</span><span className="price">{money(amount + commission(amount))}</span></div></div>;
}

export default function App() {
  const [gateway, setGateway] = useState<Gateway | null>(null), [actorId, setActorId] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]), [place, setPlace] = useState<Place>(start);
  const [draft, setDraft] = useState<Draft>({}), [busy, setBusy] = useState(false), [ready, setReady] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [showHistory, setShowHistory] = useState(false);
  const locked = useRef(false), pending = useRef<{ signature: string; id: string } | null>(null), main = useRef<HTMLElement>(null), flash = useRef('');
  const { screen, tab, taskId, offerId } = place;
  const task = tasks.find(t => t.id === taskId), offer = task?.offers.find(o => o.id === offerId);
  const isOwner = task?.owner.id === actorId;
  const isBrigadier = task?.agreement?.brigadier.id === actorId;

  async function execute(fn: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(''); setNotice('');
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Une erreur est survenue.'); }
    finally { locked.current = false; setBusy(false); }
  }
  async function initialize() {
    await execute(async () => {
      if (remoteMode) {
        if (!url || !key) throw new Error('Configuration incomplète : renseigne l’URL et la clé publique Supabase.');
        const g = new RemoteGateway(url, key, tokens); setGateway(g);
        if (await g.restore()) { setActorId(g.actor.id); setTasks(await g.list()); }
      } else {
        const g = new DemoGateway(await readDemo(), s => writeDemo(s)); setGateway(g); setActorId(g.actor.id); setTasks(await g.list());
      }
    }); setReady(true);
  }
  useEffect(() => {
    history.replaceState(start, '');
    const onPop = (e: PopStateEvent) => { if (!e.state?.screen) return; show(e.state as Place); setNotice(flash.current); flash.current = ''; };
    addEventListener('popstate', onPop); void initialize();
    return () => removeEventListener('popstate', onPop);
  }, []);
  function show(next: Place) { setPlace(next); setDraft({}); setError(''); setNotice(''); setShowHistory(false); main.current?.focus(); scrollTo(0, 0); }
  function go(screen: Screen, change: Partial<Place> = {}, replace = false) {
    const next = { ...place, ...change, screen, depth: replace ? place.depth : place.depth + 1 };
    if (replace) history.replaceState(next, ''); else history.pushState(next, '');
    show(next);
  }
  function back() { if (place.depth > 0) history.back(); else go('home', {}, true); }
  async function refresh() { if (gateway) await execute(async () => { setTasks(await gateway.list()); }); }
  function updateTask(t: Task) { setTasks(old => [t, ...old.filter(v => v.id !== t.id)]); }
  async function mutate(action: Command | 'create', data: Input, next: Screen = 'detail', message = '') {
    if (!gateway) return;
    await execute(async () => {
      const signature = JSON.stringify([actorId, action, taskId, data]);
      if (pending.current?.signature !== signature) pending.current = { signature, id: newId() };
      const t = action === 'create' ? await gateway.create(data, pending.current.id) : await gateway.command(taskId, action, data, pending.current.id);
      pending.current = null; updateTask(t);
      // Après création, l’écran « nouvelle flemme » est remplacé : Retour ramène à la liste, pas au formulaire vide.
      // Accord, refus ou signalement : on revient à la fiche déjà dans l’historique au lieu d’empiler une copie,
      // pour que Retour mène ensuite à la liste, comme sur le mobile.
      const steps = next === 'detail' ? aboveDetail[place.screen] : undefined;
      if (steps && place.depth >= steps) { flash.current = message; history.go(-steps); return; }
      go(next, { taskId: t.id }, action === 'create' || next === place.screen); setNotice(message);
    });
  }
  function validated(fn: () => void) { try { fn(); } catch (e) { setError((e as Error).message); } }
  function field(label: string, name: string, multiline = false, numeric = false, secret = false) {
    const id = 'f-' + name, common = { id, value: draft[name] || '', disabled: busy, onChange: (e: { target: { value: string } }) => setDraft(d => ({ ...d, [name]: e.target.value })) };
    return <div className="field" key={name}><label htmlFor={id}>{label}</label>{multiline ? <textarea {...common} maxLength={1000}/> : <input {...common} type={secret ? 'password' : name === 'email' ? 'email' : 'text'} inputMode={numeric ? 'decimal' : undefined} placeholder={numeric ? 'En €' : ''} maxLength={name === 'password' ? 200 : 100} autoComplete={name === 'email' ? 'email' : secret ? 'current-password' : 'off'}/>}</div>;
  }
  function openTask(t: Task) { go('detail', { taskId: t.id }); }
  function openOffer(o: Offer) { go('offer', { offerId: o.id }); }
  function taskCard(t: Task) {
    return <button type="button" key={t.id} onClick={() => openTask(t)} className="card"><span className="row"><span className="tag">{status[t.status]}</span><span className="strong">{t.budget == null ? 'Prix à proposer' : money(t.budget)}</span></span><span className="card-title">{t.title}</span><span className="muted">{t.place}</span><span className="link">{t.owner.id === actorId ? String(t.offers.filter(o => o.status === 'pending').length) + ' proposition(s) · suivre →' : t.offers.some(o => o.brigadier.id === actorId) ? 'Ma proposition et le suivi →' : 'Je peux aider →'}</span></button>;
  }

  let content: ReactNode;
  if (!ready) content = <p className="muted" role="status">Chargement…</p>;
  else if (remoteMode && (!gateway || !actorId)) content = <><h1 className="heading">Un peu de flemme ?</h1><p>Connecte-toi pour déposer une tâche ou proposer ton aide.</p>{field('E-mail', 'email')}{field('Mot de passe', 'password', false, false, true)}<Action disabled={busy || !gateway} onClick={() => execute(async () => { const g = gateway as RemoteGateway; await g.login(draft.email || '', draft.password || ''); const list = await g.list(); setActorId(g.actor.id); setTasks(list); setDraft({}); })}>Me connecter</Action><Action secondary disabled={busy || !gateway} onClick={() => execute(async () => { if ((draft.password || '').length < 12) throw new Error('Choisis un mot de passe d’au moins 12 caractères.'); await (gateway as RemoteGateway).signup(draft.email || '', draft.password || ''); setNotice('Vérifie ton e-mail, puis connecte-toi.'); setDraft(d => ({ ...d, password: '' })); })}>Créer un compte</Action>{!gateway && <Action secondary onClick={initialize}>Réessayer</Action>}</>;
  else if (!gateway) content = <><h1 className="heading">Chargement interrompu</h1><Action onClick={initialize}>Réessayer sans effacer mes données</Action></>;
  else if (screen === 'account') content = <><h1 className="heading">Salut {gateway.actor.name}.</h1>{gateway instanceof DemoGateway ? <><p>Démonstration locale. Change de personnage pour tester les deux côtés d’une mission. Aucun échange entre appareils, aucun paiement réel.</p>{demoActors.map(a => <Action secondary key={a.id} disabled={busy} onClick={() => execute(async () => { gateway.actor = a; setActorId(a.id); setTasks(await gateway.list()); pending.current = null; go('home', { taskId: '', offerId: '' }); })}>{a.name}{a.id === actorId ? ' · actif' : ''}</Action>)}</> : <><p>Les comptes, annonces et discussions utilisent le service FLEMME configuré.</p><Action secondary disabled={busy} onClick={() => execute(async () => { try { await (gateway as RemoteGateway).logout(); } finally { setActorId(''); setTasks([]); setDraft({}); pending.current = null; go('home', { taskId: '', offerId: '' }); } })}>Me déconnecter</Action></>}</>;
  else if (screen === 'home') content = <div className="home"><div><p className="eyebrow">Le droit d’avoir la flemme.</p><h1 className="heading">On fait quoi aujourd’hui ?</h1><p className="muted">Déléguer un peu. Aider quelqu’un.</p></div><div className="choices"><button type="button" className="choice" aria-label="Mes flemmes · déposer et suivre mes demandes" onClick={() => go('list', { tab: 'mine' })}><span className="choice-icon" aria-hidden="true">☕</span><span className="choice-title">Mes flemmes</span><span className="choice-hint">Déposer et suivre mes demandes</span></button><button type="button" className="choice secondary" aria-label="Résoudre une flemme · voir les flemmes à résoudre" onClick={() => go('list', { tab: 'find' })}><span className="choice-icon" aria-hidden="true">↗</span><span className="choice-title">Résoudre une flemme</span><span className="choice-hint">Trouver quelqu’un à aider</span></button></div></div>;
  else if (screen === 'new') content = <><h1 className="heading">La flemme de quoi ?</h1><p className="muted">Raconte. Un Brigadier prendra le relais.</p>{field('Ce qu’il faut faire', 'title')}{field('Quelques détails', 'details', true)}{field('Ville ou « À distance »', 'place')}{field('Budget Brigadier · facultatif, hors frais', 'amount', false, true)}<p className="note">Sans expiration. Commission FLEMME de 10 % ajoutée au forfait accepté. Les achats à avancer ne sont pas inclus dans ce premier test.</p><Action disabled={busy} onClick={() => validated(() => { void mutate('create', { title: draft.title, details: draft.details, place: draft.place, budget: parseMoney(draft.amount || '', true) }, 'detail', 'Ta flemme est publiée.'); })}>Publier ma flemme</Action></>;
  else if (screen === 'list') {
    const own = tasks.filter(t => t.owner.id === actorId);
    const helping = tasks.filter(t => t.owner.id !== actorId && t.offers.some(o => o.brigadier.id === actorId));
    const available = tasks.filter(t => t.owner.id !== actorId && t.status === 'open' && !t.offers.some(o => o.brigadier.id === actorId));
    const reload = <Action secondary disabled={busy} onClick={refresh}>↻ Actualiser</Action>;
    content = tab === 'mine' ? <><h1 className="heading">Mes flemmes</h1><p className="muted">Dépose une demande et retrouve tes flemmes en cours.</p><Action onClick={() => go('new')}>＋ Déposer ma flemme</Action><h2 className="section-title">Mes demandes</h2>{own.length ? own.map(taskCard) : <p className="muted">Aucune flemme déposée. Par quoi veux-tu commencer ?</p>}{reload}</> : <><p className="eyebrow">À toi de jouer, Brigadier.</p><h1 className="heading">Résoudre une flemme</h1><p className="muted">Propose ton forfait. Le déposant règle 10 % en plus à FLEMME.</p>{helping.length > 0 && <><h2 className="section-title">Mes propositions et missions</h2>{helping.map(taskCard)}</>}<h2 className="section-title">Flemmes disponibles</h2>{available.length ? available.map(taskCard) : <p className="muted">Aucune nouvelle flemme pour l’instant. Actualise la liste un peu plus tard.</p>}{reload}</>;
  } else if (!task) content = <><h1 className="heading">Flemme indisponible</h1><Action secondary onClick={() => go('list')}>Revenir à la liste</Action></>;
  else if (screen === 'report') content = <><h1 className="heading">Un problème ?</h1><p>Décris les faits. L’accord et les échanges restent conservés. Aucun remboursement n’est déclenché automatiquement.</p>{field('Ce qui s’est passé', 'text', true)}<Action disabled={busy} onClick={() => mutate('report', { text: draft.text }, 'detail', remoteMode ? 'Signalement enregistré pour examen manuel. Aucun remboursement automatique.' : 'Signalement local enregistré. Aucun support réel contacté.')}>Enregistrer le signalement</Action></>;
  else if ((screen === 'offer' || screen === 'review') && offer) content = <><h1 className="heading">{screen === 'review' ? 'On se met d’accord ?' : 'L’offre de ' + offer.brigadier.name}</h1><p className="card-title">{task.title}</p><span className="tag">{offerStatus[offer.status]}</span><h2 className="section-title">Ce qui est convenu</h2><p>{offer.scope}</p><p className="muted">{offer.slot}</p><Bill amount={offer.amount}/>{screen === 'review' ? <><p className="note">Tu attribues cette flemme à {offer.brigadier.name}. Les autres propositions restent dans l’historique. Forfait et frais sont confirmés ensemble.</p><Action disabled={busy || task.status !== 'open' || offer.status !== 'pending'} onClick={() => mutate('accept', { offerId }, 'detail', 'Accord confirmé. Le Brigadier prend le relais.')}>Accepter · {money(offer.amount + commission(offer.amount))}</Action></> : <><h2 className="section-title">Votre discussion</h2>{offer.messages.length === 0 && <p className="muted">Un détail à préciser avant de vous mettre d’accord ?</p>}{offer.messages.map((m, i) => <div key={i} className="bubble"><span className="strong">{m.actor.name}</span><span>{m.text}</span><span className="note">{date(m.at)}</span></div>)}{field('Ton message', 'text', true)}<Action secondary disabled={busy} onClick={() => mutate('message', { offerId, text: draft.text }, 'offer')}>Envoyer le message</Action>{isOwner && task.status === 'open' && offer.status === 'pending' && <><Action disabled={busy} onClick={() => go('review')}>Voir l’accord avant d’accepter</Action><Action secondary disabled={busy} onClick={() => mutate('decline', { offerId }, 'detail', 'Offre déclinée et conservée. Le Brigadier peut proposer un nouveau forfait.')}>Décliner cette proposition</Action></>}<p className="note">Pour changer le prix : décliner l’offre, puis demander un nouveau forfait au Brigadier. Chaque proposition reste conservée.</p></>}</>;
  else content = <><span className="tag">{status[task.status]}{task.status === 'open' ? ' · sans expiration' : ''}</span><h1 className="heading">{task.title}</h1><p className="muted">{task.place} · déposée par {task.owner.name}</p><p>{task.details}</p><p className="strong">{task.budget == null ? 'Prix à proposer' : 'Budget indicatif : ' + money(task.budget) + ' hors frais'}</p>{task.agreement && <><h2 className="section-title">{task.agreement.brigadier.name} prend le relais</h2><p>{task.agreement.scope}</p><p className="muted">{task.agreement.slot}</p><Bill amount={task.agreement.amount}/><p className="note">Paiement direct : {money(task.agreement.amount)} au Brigadier. Commission FLEMME : {money(task.agreement.commission)} à régler séparément, non encaissée dans cette version.</p>{isOwner && task.status === 'assigned' && <Action disabled={busy} onClick={() => mutate('complete', {})}>Confirmer la tâche terminée</Action>}{isOwner && task.status === 'completed' && !task.paymentDeclared && <Action disabled={busy} onClick={() => mutate('declare_payment', {})}>J’ai payé le Brigadier</Action>}{isBrigadier && task.paymentDeclared && !task.paymentConfirmed && <Action disabled={busy} onClick={() => mutate('confirm_payment', {})}>Confirmer avoir reçu le paiement</Action>}<p className="muted">{task.paymentConfirmed ? 'Paiement confirmé par les deux personnes · déclaratif' : task.paymentDeclared ? 'Paiement déclaré · confirmation Brigadier attendue' : 'Paiement non déclaré'}<br/>Commission : à régler · encaissement non connecté</p></>}{task.offers.length > 0 && <><h2 className="section-title">{isOwner ? 'Les propositions' : 'Mes propositions'}</h2>{task.offers.map(o => <button type="button" key={o.id} onClick={() => openOffer(o)} className="card"><span className="row"><span className="strong">{o.brigadier.name}</span><span className="price">{money(o.amount)}</span></span><span>{o.scope}</span><span className="muted">{offerStatus[o.status]}</span><span className="link">Discussion et récapitulatif →</span></button>)}</>}{!isOwner && task.status === 'open' && !task.offers.some(o => o.brigadier.id === actorId && o.status === 'pending') && <><h2 className="section-title">Proposer mon aide</h2>{field('Mon forfait Brigadier', 'amount', false, true)}{(() => { try { const n = parseMoney(draft.amount || ''); return n != null ? <Bill amount={n}/> : null; } catch { return null; } })()}{field('Mes disponibilités', 'slot')}{field('Ce qui est inclus et non inclus', 'scope', true)}<Action disabled={busy} onClick={() => validated(() => { void mutate('offer', { amount: parseMoney(draft.amount || ''), slot: draft.slot, scope: draft.scope }, 'detail', 'Proposition envoyée. La flemme reste ouverte jusqu’à acceptation.'); })}>Proposer mon aide</Action></>}{(isOwner || isBrigadier) && <Action secondary disabled={busy} onClick={() => go('report')}>Signaler un désaccord</Action>}{task.reports.map((r, i) => <div className="bubble" key={i}><span className="strong">Signalement de {r.actor.name}</span><span>{r.text}</span><span className="note">En attente d’examen manuel · {date(r.at)}</span></div>)}<Action secondary onClick={() => setShowHistory(!showHistory)}>{showHistory ? 'Masquer l’historique' : 'Voir l’historique conservé'}</Action>{showHistory && task.history.map((h, i) => <div key={i} className="history"><p>{h.text}</p><span className="note">{date(h.at)}</span></div>)}</>;

  return <>
    <header className="top"><a href="./" aria-label="FLEMME · retour à la présentation"><img src={import.meta.env.BASE_URL + 'flemme-logo.png'} alt="FLEMME"/></a>{actorId !== '' && <button type="button" className="avatar" aria-label="Mon compte" onClick={() => go('account')}>{gateway?.actor.name.slice(0, 1).toUpperCase()}</button>}</header>
    <main ref={main} tabIndex={-1} className="app" aria-busy={busy}>
      {screen !== 'home' && actorId !== '' && <Action secondary onClick={back}>{screen === 'list' || screen === 'account' ? '← Accueil' : '← Retour'}</Action>}
      {!!error && <div role="alert" className="alert">{error}</div>}
      {!!notice && <p aria-live="polite" className="notice">{notice}</p>}
      {content}
      {busy && <p className="muted" role="status">En cours…</p>}
    </main>
    <p className="foot">{remoteMode ? 'Test accompagné · paiements directs' : 'Démo locale · données fictives · aucun paiement'}</p>
  </>;
}
