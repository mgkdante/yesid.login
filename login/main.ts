import { mount, unmount, flushSync } from 'svelte';
import { configureUi } from '@yesid/ui/cn';
import App from './App.svelte';
import { startAnalytics } from './analytics';
import './style.css';

configureUi({});
startAnalytics();
async function start() {
  const path = location.pathname;
  const component = document.documentElement.dataset.page === 'not-found' ? await import('./NotFound.svelte')
    : ['/legal/privacy', '/legal/terms'].includes(path) ? await import('./Legal.svelte')
    : /^\/[^/]+\/people$/.test(path) ? await import('./People.svelte')
    : path === '/account' ? await import('./Account.svelte') : { default: App };
  const target = document.getElementById('app')!;
  const language = document.documentElement.lang;
  const fallback = document.createDocumentFragment();
  while (target.firstChild) fallback.appendChild(target.firstChild);
  let app: ReturnType<typeof mount> | undefined;
  try {
    app = mount(component.default, { target });
    flushSync();
    window.dispatchEvent(new Event('login-startup-mounted'));
  } catch (error) {
    try {
      if (app) await unmount(app);
    } finally {
      target.replaceChildren(fallback);
      document.documentElement.lang = language;
    }
    throw error;
  }
}
void start().catch(() => {
  window.dispatchEvent(new Event('login-startup-failed'));
  console.error('Login startup failed');
});
