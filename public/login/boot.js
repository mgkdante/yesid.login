(() => {
  const root = document.documentElement;
  // Editor and legal shells have no startup fallback: leave their startup state alone.
  if (root.hasAttribute('data-login-startup')) {
    const language = root.lang;
    root.dataset.startup = 'loading';
    const stop = () => {
      window.removeEventListener('error', scriptFailed, true);
      window.removeEventListener('login-startup-failed', failed);
      window.removeEventListener('login-startup-mounted', mounted);
    };
    const failed = () => {
      const status = document.querySelector('[data-startup-failure]');
      if (status) {
        root.lang = language;
        root.dataset.startup = 'failed';
        status.textContent = status.dataset.startupFailure;
      }
      stop();
    };
    const mounted = () => { root.dataset.startup = 'mounted'; stop(); };
    const scriptFailed = (event) => {
      if (event.target instanceof HTMLScriptElement
        && new URL(event.target.src).pathname === '/login/start.js') failed();
    };
    window.addEventListener('error', scriptFailed, true);
    window.addEventListener('login-startup-failed', failed);
    window.addEventListener('login-startup-mounted', mounted);
  }
  let selected;
  try { selected = localStorage.getItem('theme'); } catch { /* Use the system preference. */ }
  document.documentElement.dataset.theme = selected === 'dark' || selected === 'light'
    ? selected : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const icon = document.querySelector('link[rel="icon"]');
  if (icon) icon.href = '/login/favicon-' + document.documentElement.dataset.theme + '.svg';
  const surface = document.querySelector('meta[name="theme-color"]');
  if (surface) surface.content = document.documentElement.dataset.theme === 'dark' ? '#141414' : '#F3F6FB';
})();
