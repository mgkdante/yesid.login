(() => {
  let selected;
  try { selected = localStorage.getItem('theme'); } catch { /* Use the system preference. */ }
  document.documentElement.dataset.theme = selected === 'dark' || selected === 'light'
    ? selected : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const icon = document.querySelector('link[rel="icon"]');
  if (icon) icon.href = '/login/favicon-' + document.documentElement.dataset.theme + '.svg';
  const surface = document.querySelector('meta[name="theme-color"]');
  if (surface) surface.content = document.documentElement.dataset.theme === 'dark' ? '#141414' : '#F3F6FB';
})();
