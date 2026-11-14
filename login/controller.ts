import type { Locale, Message } from './copy.ts';
import { normalizeCode } from './code.ts';

export const USER_KEY = 'sveltia-cms.user';
export const siteKey = (slug: string) => 'login.session.' + slug;
type Site = { slug: string; label: string };
export type State = { step: 'ask' | 'enter' | 'sites' | 'loadingSites' | 'sitesFailure' | 'opening'; busy: boolean; empty?: boolean; switching?: boolean; opening?: string; openError?: string; operation?: 'send' | 'verify'; retryMinutes?: number; sentAt?: number; message?: Message; sites: Site[] };
export interface Ports {
  fetch: typeof fetch;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  search: string;
  navigate: (path: string) => void;
  handOver: (token: string, update: (message: Message) => void) => Handover;
}
const reserved = new Set(['auth', 'api', 'admin', 'login', 'editor', 'account', 'privacy', 'terms', 'legal', 'relay']);
export const validTarget = (slug: string) => /^[a-z0-9][a-z0-9.-]{0,62}$/.test(slug) && !reserved.has(slug);

export function createController(ports: Ports, popup: boolean, update: (state: State) => void) {
  return new LoginController(ports, popup, update);
}

class LoginController {
  state: State = { step: 'ask', busy: false, sites: [] };
  token = '';
  handoff?: Handover;
  requested: string;
  constructor(private ports: Ports, private popup: boolean, private update: (state: State) => void) {
    this.requested = new URLSearchParams(ports.search).get('site') || '';
  }
  emit(patch: Partial<State>) { this.state = { ...this.state, ...patch }; this.update(this.state); }
  save(slug: string) { this.ports.storage.setItem(siteKey(slug), JSON.stringify({ backendName: 'github', token: this.token })); }
  async navigate(slug: string) {
    if (!validTarget(slug)) return;
    const response = await this.ports.fetch('/auth/bind', { method: 'POST', headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ slug }) });
    if (response.status === 401) { this.sessionEnded(); return; }
    if (!response.ok) throw Error('openFailure');
    if (this.popup) {
      this.emit({ step: 'opening', message: 'openingEditor' });
      this.handoff ??= this.ports.handOver(this.token, message => this.emit({ message }));
      return;
    }
    try { this.save(slug); } catch { throw Error('editorStorage'); }
    this.ports.navigate('/' + slug + '/');
  }
  async open(slug: string) {
    if (this.state.busy || !this.state.sites.some(site => site.slug === slug)) return;
    await this.openRow(slug);
  }
  async openRow(slug: string) {
    this.emit({ busy: true, opening: slug, openError: undefined, message: undefined });
    try { await this.navigate(slug); }
    catch (error) { this.emit({ step: 'sites', openError: slug, message: error instanceof Error && error.message === 'editorStorage' ? 'editorStorage' : undefined }); }
    finally { this.emit({ busy: false, opening: undefined }); }
  }
  sessionEnded() {
    try { this.ports.storage.removeItem(siteKey(this.requested)); } catch { /* Server session has ended. */ }
    this.token = ''; this.dispose();
    this.emit({ step: 'ask', sites: [], switching: false, message: 'sessionEnded', openError: undefined });
  }
  retrySites() { return this.attempt(() => this.choose(this.token), 'sitesError'); }
  retryHandover() { this.handoff?.retry(); }
  dispose() { this.handoff?.dispose(); this.handoff = undefined; }
  switchSite() {
    return this.attempt(async () => {
      const response = await this.ports.fetch('/auth/api/sign-out', { method:'POST', headers:{Authorization:'Bearer '+this.token,'Content-Type':'application/json'}, body:'{}' });
      if (!response.ok) throw Error('checkError');
      try { if (validTarget(this.requested)) this.ports.storage.removeItem(siteKey(this.requested)); } catch { /* Server sign-out succeeded. */ }
      this.token = ''; this.requested = ''; this.dispose(); this.emit({step:'ask',sites:[],switching:false,message:undefined});
      const query = new URLSearchParams(this.ports.search);
      query.delete('site'); query.delete('switch');
      this.ports.navigate('/' + (query.size ? '?' + query.toString() : ''));
    }, 'checkError');
  }
  post(path: string, body: object, locale?: Locale, theme?: string) {
    return this.ports.fetch('/auth/api' + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(locale ? { 'X-Login-Language': locale } : {}), ...(theme ? { 'X-Login-Theme': theme } : {}) },
      body: JSON.stringify(body)
    });
  }
  async choose(value: string) {
    this.token = value;
    this.emit({ step: 'loadingSites', sites: [], message: undefined, switching: false, empty: false, openError: undefined });
    let sites: Site[];
    try {
      const response = await this.ports.fetch('/auth/sites', { headers: { Authorization: 'Bearer ' + value } });
      if (response.status === 401) { this.sessionEnded(); return; }
      if (!response.ok) throw Error();
      sites = await response.json();
      if (!Array.isArray(sites) || sites.some(site => !site || typeof site.slug !== 'string' || !validTarget(site.slug) || typeof site.label !== 'string')) throw Error();
    } catch { this.emit({ step: 'sitesFailure', message: 'sitesError' }); return; }
    this.emit({ sites, empty: sites.length === 0 });
    if (validTarget(this.requested) && sites.some(site => site.slug === this.requested)) {
      if (new URLSearchParams(this.ports.search).has('switch')) { this.emit({ step: 'sites', message: 'switchNotice', switching: true }); return; }
      await this.openRow(this.requested); return;
    }
    if (sites.length === 1) { await this.openRow(sites[0].slug); return; }
    this.emit({ step: 'sites', message: sites.length ? undefined : 'empty' });
  }
  async attempt(work: () => Promise<void>, fallback: Message) {
    if (this.state.busy) return;
    this.emit({ busy: true });
    try { await work(); }
    catch (error) {
      const known: Message[] = ['sitesError', 'sendError', 'invalid', 'connection', 'checkError'];
      this.emit({ message: error instanceof Error && known.includes(error.message as Message) ? error.message as Message : fallback });
    } finally { this.emit({ busy: false }); }
  }
  restore() {
    return this.attempt(async () => {
      if (this.popup) return;
      try { this.ports.storage.removeItem(USER_KEY); } catch { /* Optional for sign-in. */ }
      if (!validTarget(this.requested)) {
        return;
      }
      let stored;
      try { stored = JSON.parse(this.ports.storage.getItem(siteKey(this.requested)) || 'null'); } catch { return; }
      if (typeof stored?.token === 'string' && stored.token) await this.choose(stored.token);
    }, 'unavailable');
  }
  send(email: string, locale: Locale, theme = 'dark') {
    if (this.state.busy) return Promise.resolve();
    this.emit({ operation: 'send', message: undefined, retryMinutes: undefined });
    return this.attempt(async () => {
      const sentAt = Date.now();
      const response = await this.post('/email-otp/send-verification-otp', { email: email.trim(), type: 'sign-in' }, locale, theme);
      if (response.status === 429) { this.throttle(response); return; }
      if (!response.ok) throw Error('sendError');
      this.emit({ step: 'enter', message: 'neutral', sentAt });
    }, 'sendError');
  }
  verify(email: string, code: string) {
    if (this.state.busy) return Promise.resolve();
    const normalized = normalizeCode(code);
    if (normalized === undefined) { this.emit({ message: 'format' }); return Promise.resolve(); }
    this.emit({ operation: 'verify', message: undefined, retryMinutes: undefined });
    return this.attempt(async () => {
      const response = await this.post('/sign-in/email-otp', { email: email.trim(), otp: normalized });
      if (response.status === 429) { this.throttle(response); return; }
      if (response.status === 400) throw Error('invalid');
      if (!response.ok) throw Error('checkError');
      const value = response.headers.get('set-auth-token');
      if (!value) throw Error('checkError');
      await this.choose(value);
    }, 'checkError');
  }
  throttle(response: Response) {
    this.emit({ message: 'rate', retryMinutes: retryMinutes(response) });
  }
}

export type Handover = { retry: () => void; dispose: () => void };

export function popupHandover(host: Window, token: string, update: (message: Message) => void): Handover {
  const opener = host.opener;
  const origin = host.location.origin;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let finished = false;
  function dispose() {
    finished = true;
    clearTimeout(timer);
    host.removeEventListener('message', receive);
    host.removeEventListener('pagehide', leave);
  }
  function leave(event: PageTransitionEvent) { if (!event.persisted) dispose(); }
  function receive(event: MessageEvent) {
    if (finished || event.origin !== origin || event.source !== opener || event.data !== 'authorizing:github') return;
    dispose();
    opener.postMessage('authorization:github:success:' + JSON.stringify({ token }), origin);
    update('connected');
  }
  function missing() { dispose(); update('reopen'); }
  function retry() {
    if (finished) return;
    clearTimeout(timer);
    if (!opener || opener.closed) { missing(); return; }
    update('openingEditor');
    timer = setTimeout(() => {
      if (opener.closed) missing(); else update('handoverFailed');
    }, 10000);
    try { opener.postMessage('authorizing:github', origin); } catch { missing(); }
  }
  host.addEventListener('message', receive);
  host.addEventListener('pagehide', leave);
  retry();
  return { retry, dispose };
}

/** S-12: only a positive authoritative wait is shown, rounded up to minutes. */
export function retryMinutes(response: Response): number | undefined {
  const header = response.headers.get('X-Retry-After');
  const seconds = Number(header);
  return header !== null && header.trim() !== '' && Number.isFinite(seconds) && seconds > 0 ? Math.max(1, Math.ceil(seconds / 60)) : undefined;
}
