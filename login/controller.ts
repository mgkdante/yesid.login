import type { Locale, Message } from './copy.ts';

export const USER_KEY = 'sveltia-cms.user';
export const siteKey = (slug: string) => 'login.session.' + slug;
type Site = { slug: string; label: string };
export type State = { step: 'ask' | 'enter' | 'sites'; busy: boolean; message?: Message; sites: Site[] };
export interface Ports {
  fetch: typeof fetch;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  search: string;
  navigate: (path: string) => void;
  handOver: (token: string) => boolean;
}
const reserved = new Set(['auth', 'api', 'admin', 'login', 'editor', 'account', 'privacy', 'terms', 'legal']);
export const validTarget = (slug: string) => /^[a-z0-9][a-z0-9.-]{0,62}$/.test(slug) && !reserved.has(slug);

export function createController(ports: Ports, popup: boolean, update: (state: State) => void) {
  return new LoginController(ports, popup, update);
}

class LoginController {
  state: State = { step: 'ask', busy: false, sites: [] };
  token = '';
  requested: string;
  constructor(private ports: Ports, private popup: boolean, private update: (state: State) => void) {
    this.requested = new URLSearchParams(ports.search).get('site') || '';
  }
  emit(patch: Partial<State>) { this.state = { ...this.state, ...patch }; this.update(this.state); }
  save(slug: string) { this.ports.storage.setItem(siteKey(slug), JSON.stringify({ backendName: 'github', token: this.token })); }
  async navigate(slug: string) {
    if (!validTarget(slug)) return;
    const response = await this.ports.fetch('/auth/bind', { method: 'POST', headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ slug }) });
    if (!response.ok) throw Error('connection');
    if (this.popup) { this.emit({ message: this.ports.handOver(this.token) ? 'connected' : 'reopen' }); return; }
    this.save(slug); this.ports.navigate('/' + slug + '/');
  }
  open(slug: string) { return this.attempt(async () => { if (this.state.sites.some(site => site.slug === slug)) await this.navigate(slug); }, 'connection'); }
  switchSite() {
    return this.attempt(async () => {
      const response = await this.ports.fetch('/auth/api/sign-out', { method:'POST', headers:{Authorization:'Bearer '+this.token,'Content-Type':'application/json'}, body:'{}' });
      if (!response.ok) throw Error('connection');
      if (validTarget(this.requested)) this.ports.storage.removeItem(siteKey(this.requested));
      this.token = ''; this.requested = ''; this.emit({step:'ask',sites:[],message:'switchNotice'});
      const query = new URLSearchParams(this.ports.search);
      query.delete('site'); query.set('switch', '1');
      this.ports.navigate('/?' + query.toString());
    }, 'connection');
  }
  post(path: string, body: object, locale?: Locale, theme?: string) {
    return this.ports.fetch('/auth/api' + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(locale ? { 'X-Login-Language': locale } : {}), ...(theme ? { 'X-Login-Theme': theme } : {}) },
      body: JSON.stringify(body)
    });
  }
  async choose(value: string) {
    const response = await this.ports.fetch('/auth/sites', { headers: { Authorization: 'Bearer ' + value } });
    if (response.status === 401) { this.ports.storage.removeItem(siteKey(this.requested)); this.emit({ step: 'ask' }); return; }
    if (!response.ok) throw Error('sitesError');
    const sites: Site[] = await response.json();
    if (!Array.isArray(sites) || sites.some(site => !validTarget(site.slug) || typeof site.label !== 'string')) throw Error('sitesError');
    this.token = value;
    if (validTarget(this.requested) && sites.some(site => site.slug === this.requested)) { if (new URLSearchParams(this.ports.search).has('switch')) { this.emit({step:'sites',sites,message:'switchNotice'}); return; }
      await this.navigate(this.requested); return; }
    if (sites.length === 1) { await this.navigate(sites[0].slug); return; }
    this.emit({ step: 'sites', sites, message: sites.length ? 'choose' : 'empty' });
  }
  async attempt(work: () => Promise<void>, fallback: Message) {
    if (this.state.busy) return;
    this.emit({ busy: true });
    try { await work(); }
    catch (error) {
      const known: Message[] = ['sitesError', 'sendError', 'invalid', 'connection'];
      this.emit({ message: error instanceof Error && known.includes(error.message as Message) ? error.message as Message : fallback });
    } finally { this.emit({ busy: false }); }
  }
  restore() {
    return this.attempt(async () => {
      if (this.popup) return;
      this.ports.storage.removeItem(USER_KEY);
      if (!validTarget(this.requested)) {
        if (new URLSearchParams(this.ports.search).has('switch')) this.emit({message:'switchNotice'});
        return;
      }
      const stored = JSON.parse(this.ports.storage.getItem(siteKey(this.requested)) || 'null');
      if (typeof stored?.token === 'string' && stored.token) await this.choose(stored.token);
    }, 'unavailable');
  }
  send(email: string, locale: Locale, theme = 'dark') {
    return this.attempt(async () => {
      const response = await this.post('/email-otp/send-verification-otp', { email: email.trim(), type: 'sign-in' }, locale, theme);
      if (response.status === 429) { this.emit({ message: 'rate' }); return; }
      if (!response.ok) throw Error('sendError');
      this.emit({ step: 'enter', message: 'neutral' });
    }, 'sendError');
  }
  verify(email: string, code: string) {
    return this.attempt(async () => {
      const response = await this.post('/sign-in/email-otp', { email: email.trim(), otp: code.trim() });
      if (!response.ok) throw Error('invalid');
      const value = response.headers.get('set-auth-token');
      if (!value) throw Error('connection');
      await this.choose(value);
    }, 'connection');
  }
}

export function popupHandover(host: Window, token: string): boolean {
  const opener = host.opener;
  if (!opener) return false;
  host.addEventListener('message', ({ origin, source, data }) => {
    if (origin !== host.location.origin || source !== opener) return;
    if (data === 'authorizing:github') {
      opener.postMessage('authorization:github:success:' + JSON.stringify({ token }), host.location.origin);
    }
  });
  opener.postMessage('authorizing:github', host.location.origin);
  return true;
}
