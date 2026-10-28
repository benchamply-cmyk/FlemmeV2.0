import { applyCommand, createTask, visibleTask } from './domain.ts';
import type { Actor, Command, Input, Task } from './domain.ts';

// Identifiants de ressources/idempotence uniquement : jamais utilisés comme secrets.
export const newId = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const n = Math.floor(Math.random() * 16); return (c === 'x' ? n : (n & 3) | 8).toString(16);
});
export interface Gateway {
  actor: Actor;
  list(): Promise<Task[]>;
  create(data: Input, requestId: string): Promise<Task>;
  command(taskId: string, action: Command, data: Input, requestId: string): Promise<Task>;
}
export const demoActors: Actor[] = [{ id: 'demo-ben', name: 'Benjamin' }, { id: 'demo-lou', name: 'Lou' }, { id: 'demo-camille', name: 'Camille' }];
export function seed(): Task[] {
  const at = '2026-10-28T08:00:00.000Z';
  const a = createTask('demo-colis', demoActors[0], { title: 'Faire mes retours de colis', details: 'Deux colis à déposer au point relais. Étiquettes imprimées, déplacement compris dans le forfait proposé.', place: 'Aix-en-Provence', budget: 2000 }, at);
  return [applyCommand(a, demoActors[1], 'offer', { id: 'demo-offer', amount: 2000, slot: 'Samedi matin', scope: 'Récupération à domicile et dépôt des deux colis, déplacement compris.' }, at),
    createTask('demo-meuble', demoActors[2], { title: 'Monter mon meuble IKEA', details: 'Un petit meuble à monter. Outils disponibles. Sans fixation au mur.', place: 'Aix-en-Provence', budget: 3500 }, at),
    createTask('demo-cv', demoActors[1], { title: 'Remettre mon CV au propre', details: 'Une page à remettre en forme. Le contenu est déjà rédigé.', place: 'À distance', budget: null }, at)];
}
export type DemoState = { version: 1; tasks: Task[]; requests: Record<string, Task> };
export class DemoGateway implements Gateway {
  actor = demoActors[0];
  private state: DemoState;
  private persist: (s: DemoState) => Promise<void>;
  constructor(saved: DemoState | null, persist: (s: DemoState) => Promise<void>) {
    this.persist = persist;
    this.state = saved || { version: 1, tasks: seed(), requests: {} };
  }
  async list() {
    return this.state.tasks.filter(t => t.status === 'open' || t.owner.id === this.actor.id || t.offers.some(o => o.brigadier.id === this.actor.id)).map(t => visibleTask(t, this.actor));
  }
  private async commit(task: Task, request: string): Promise<Task> {
    const next: DemoState = JSON.parse(JSON.stringify(this.state));
    const index = next.tasks.findIndex(t => t.id === task.id);
    if (index < 0) next.tasks.unshift(task); else next.tasks[index] = task;
    next.requests[this.actor.id + ':' + request] = task;
    await this.persist(next); // Ne jamais annoncer un succès si la sauvegarde échoue.
    this.state = next;
    return visibleTask(task, this.actor);
  }
  async create(data: Input, request: string) {
    const prior = this.state.requests[this.actor.id + ':' + request];
    if (prior) return visibleTask(prior, this.actor);
    return this.commit(createTask(newId(), this.actor, data, new Date().toISOString()), request);
  }
  async command(taskId: string, action: Command, data: Input, request: string) {
    const prior = this.state.requests[this.actor.id + ':' + request];
    if (prior) return visibleTask(prior, this.actor);
    const task = this.state.tasks.find(t => t.id === taskId);
    if (!task) throw new Error('Flemme introuvable.');
    return this.commit(applyCommand(task, this.actor, action, action === 'offer' ? { ...data, id: newId() } : data, new Date().toISOString()), request);
  }
}

export interface TokenStorage { get(): Promise<string | null>; set(value: string): Promise<void>; clear(): Promise<void> }
type Session = { access_token: string; refresh_token: string; expires_in: number; user: { id: string; email: string } };
export class RemoteGateway implements Gateway {
  actor: Actor = { id: '', name: '' };
  private access = '';
  private expires = 0;
  private refreshing: Promise<void> | null = null;
  private url: string;
  private key: string;
  private tokens: TokenStorage;
  private transport: typeof fetch;
  constructor(url: string, key: string, tokens: TokenStorage, transport: typeof fetch = fetch) {
    this.url = url; this.key = key; this.tokens = tokens; this.transport = transport;
    if (!/^https:\/\//.test(url)) throw new Error('La connexion Supabase doit utiliser HTTPS.');
    if (!key || key.startsWith('sb_secret_')) throw new Error('Utilise uniquement une clé Supabase publique.');
  }
  private async request(path: string, body: unknown, token = '') {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 15000);
    let response: Response;
    try { response = await this.transport(this.url.replace(/\/$/, '') + path, { method: 'POST', headers: { apikey: this.key, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body), signal: controller.signal }); }
    catch { throw new Error('Connexion interrompue. Réessaie : ton action ne sera pas dupliquée.'); }
    finally { clearTimeout(timeout); }
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error('Session ou accès refusé. Reconnecte-toi si nécessaire.');
      throw new Error(result.message || result.msg || 'Le service est indisponible.');
    }
    return result;
  }
  private async session(s: Session) {
    if (!s.access_token || !s.refresh_token || !s.user?.id) throw new Error('Session invalide.');
    await this.tokens.set(s.refresh_token); // Seulement le jeton de renouvellement dans le coffre natif.
    this.access = s.access_token; this.expires = Date.now() + s.expires_in * 1000;
    this.actor = { id: s.user.id, name: (s.user.email || 'Membre').split('@')[0].slice(0, 40) };
  }
  async login(email: string, password: string) { await this.session(await this.request('/auth/v1/token?grant_type=password', { email: email.trim(), password })); }
  async signup(email: string, password: string) { await this.request('/auth/v1/signup', { email: email.trim(), password }); }
  async restore() { if (!(await this.tokens.get())) return false; await this.refresh(); return true; }
  private async refresh() {
    if (!this.refreshing) this.refreshing = (async () => {
      const token = await this.tokens.get(); if (!token) throw new Error('Connecte-toi pour continuer.');
      await this.session(await this.request('/auth/v1/token?grant_type=refresh_token', { refresh_token: token }));
    })().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }
  async logout() {
    try { if (this.access) await this.request('/auth/v1/logout?scope=local', {}, this.access); }
    finally { await this.tokens.clear(); this.access = ''; this.expires = 0; this.actor = { id: '', name: '' }; }
  }
  private async rpc(action: string, task: string | null, data: Input, requestId: string | null) {
    if (Date.now() > this.expires - 60000) await this.refresh();
    return this.request('/rest/v1/rpc/flemme_mobile_api', { p_action: action, p_task: task, p_data: { ...data, actorName: this.actor.name }, p_request: requestId }, this.access);
  }
  async list(): Promise<Task[]> { return (await this.rpc('list', null, {}, null)).tasks; }
  async create(data: Input, requestId: string): Promise<Task> { return (await this.rpc('create', null, data, requestId)).task; }
  async command(taskId: string, action: Command, data: Input, requestId: string): Promise<Task> { return (await this.rpc(action, taskId, data, requestId)).task; }
}
