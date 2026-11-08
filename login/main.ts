import { mount } from 'svelte';
import { configureUi } from '@yesid/ui/cn';
import App from './App.svelte';
import './style.css';

configureUi({});
async function start() {
  const path = location.pathname;
  const component = document.documentElement.dataset.page === 'not-found' ? await import('./NotFound.svelte')
    : ['/legal/privacy', '/legal/terms'].includes(path) ? await import('./Legal.svelte')
    : /^\/[^/]+\/people$/.test(path) ? await import('./People.svelte')
    : path === '/account' ? await import('./Account.svelte') : { default: App };
  const target = document.getElementById('app')!;
  target.replaceChildren();
  mount(component.default, { target });
}
void start().catch(() => { const status = document.querySelector('#app [role="status"]');
  if (status) status.textContent = 'Page indisponible, rechargez. Page unavailable, please reload. Página no disponible, recarga.';
  console.error('Login startup failed'); });
