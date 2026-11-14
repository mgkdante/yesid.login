import { mount, flushSync } from 'svelte';
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
  const fallback = [...target.childNodes];
  try {
    mount(component.default, { target });
    flushSync();
    for (const node of fallback) node.remove();
  } catch (error) {
    target.replaceChildren(...fallback);
    throw error;
  }
}
void start().catch(() => {
  window.dispatchEvent(new Event('login-startup-failed'));
  console.error('Login startup failed');
});
