import type { Browser, Locator, Page } from 'playwright-core';

type Check = (name: string, passed: boolean, detail?: string) => void;
const labels = {
  fr: { theme: 'Thème sombre', language: 'Langue', name: 'Français', tagline: 'connexion à l’éditeur de site' },
  en: { theme: 'Dark theme', language: 'Language', name: 'English', tagline: 'site editor sign-in' },
  es: { theme: 'Tema oscuro', language: 'Idioma', name: 'Español', tagline: 'acceso al editor del sitio' },
};

export async function log10Chrome(page: Page, lang: keyof typeof labels, check: Check) {
  const footer = page.getByTestId('footer'), text = await footer.textContent() ?? '';
  check(`LOG-10 footer has no availability labels ${lang}`, !/\b(Live|En direct|En vivo|SYSTEM|SYSTÈME|SISTEMA)\b/i.test(text));
  check(`LOG-10 footer has no status lamp ${lang}`, await footer.locator('[data-slot="status-dot"]').count() === 0);
  check(`LOG-10 footer has no date or time ${lang}`, !/\d/.test(text) && await footer.locator('time').count() === 0);
  check(`LOG-10 tagline keeps its words without slashes ${lang}`, await footer.getByText(labels[lang].tagline, { exact: true }).isVisible() && !text.includes('//'));
  check(`LOG-10 theme name unchanged ${lang}`, await page.getByRole('switch', { name: labels[lang].theme, exact: true }).isVisible());
  // The control label/current-language name stays the same; the board suffix follows the release's new order.
  check(`LOG-10 language name and boards ${lang}`, await page.getByRole('link', { name: `${labels[lang].language}: ${labels[lang].name} (EN FR ES)`, exact: true }).isVisible());
  check(`LOG-10 no header menu ${lang}`, await page.getByRole('button', { name: 'Menu', exact: true }).count() === 0);
}

/** Reach the action using Tab only, then measure the real :focus-visible outline. S-1/S-5 remain unchanged. */
export async function log10Focus(page: Page, action: Locator, name: string, check: Check) {
  for (let tabs = 0; tabs < 50; tabs++) {
    await page.keyboard.press('Tab');
    if (await action.evaluate(el => el === document.activeElement)) break;
  }
  check(`LOG-10 keyboard reaches ${name}`, await action.evaluate(el => el === document.activeElement && el.matches(':focus-visible')));
  await action.evaluate(async el => {
    void getComputedStyle(el).outlineColor; // Flush the focus transition before collecting its animations.
    await Promise.all(el.getAnimations().map(animation => animation.finished));
  });
  const ring = await action.evaluate(el => {
    const style = getComputedStyle(el);
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d')!;
    const rgba = (value: string) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = value; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data]; };
    // Composite each ancestor over the opaque canvas. Gradient/image backgrounds cannot be measured this way.
    const layers: number[][] = []; let reliable = true;
    for (let parent = el.parentElement; parent; parent = parent.parentElement) {
      const s = getComputedStyle(parent); reliable &&= s.backgroundImage === 'none'; layers.push(rgba(s.backgroundColor));
    }
    let bg = [255, 255, 255];
    for (const layer of layers.reverse()) bg = bg.map((v, i) => layer[i] * layer[3] / 255 + v * (1 - layer[3] / 255));
    const color = rgba(style.outlineColor), fg = bg.map((v, i) => color[i] * color[3] / 255 + v * (1 - color[3] / 255));
    const luminance = (rgb: number[]) => rgb.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    const a = luminance(fg), b = luminance(bg);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth), offset: parseFloat(style.outlineOffset), color: style.outlineColor, background: bg, reliable, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), fill: getComputedStyle(el).backgroundColor };
  });
  check(`LOG-10 filled action ${name}`, !/rgba\(0, 0, 0, 0\)|transparent/.test(ring.fill), ring.fill);
  check(`LOG-10 visible outline ${name}`, ring.style !== 'none' && ring.style !== 'hidden' && ring.width >= 2, JSON.stringify(ring));
  if (ring.reliable && ring.offset >= 0) check(`LOG-10 outline contrast at least 3:1 ${name}`, ring.ratio >= 3, JSON.stringify(ring));
  console.info(`LOG-10 outline ${name}: ${JSON.stringify(ring)}`);
}

export async function log10Preferences(browser: Browser, origin: string, check: Check) {
  // Unsupported browser language makes the unchanged French fallback deterministic.
  const context = await browser.newContext({ locale: 'de-DE' }), page = await context.newPage();
  try {
    await page.goto(origin); await page.locator('#email').waitFor();
    check('LOG-10 default without query or preference is French', await page.locator('html').getAttribute('lang') === 'fr');
    await page.evaluate(() => localStorage.setItem('login.language', 'unsupported'));
    await page.goto(`${origin}/?lang=unsupported`); await page.locator('#email').waitFor();
    check('LOG-10 invalid query and stored preference fall back to French', await page.locator('html').getAttribute('lang') === 'fr');
    await page.goto(`${origin}/?lang=en`); await page.locator('#email').waitFor();
    for (const next of ['fr', 'es', 'en']) {
      const link = page.getByTestId('language-toggle');
      check(`LOG-10 language link targets ${next}`, new URL((await link.getAttribute('href'))!, origin).searchParams.get('lang') === next);
      await link.click(); await page.waitForURL(`**/?lang=${next}`); await page.locator('#email').waitFor();
      check(`LOG-10 language link opens ${next}`, await page.locator('html').getAttribute('lang') === next);
    }
  } finally { await context.close(); }
  for (const touch of [true, false]) {
    const context = await browser.newContext({ hasTouch: touch, isMobile: touch, viewport: { width: 390, height: 844 } });
    try {
      const page = await context.newPage(); await page.goto(origin); await page.locator('#email').waitFor();
      const result = await page.evaluate(() => ({ coarse: matchMedia('(pointer: coarse)').matches, fine: matchMedia('(pointer: fine)').matches,
        values: [document.documentElement, document.body].map(el => ({ x: getComputedStyle(el).overscrollBehaviorX, y: getComputedStyle(el).overscrollBehaviorY })) }));
      check(`LOG-10 ${touch ? 'touch/coarse' : 'fine'} context`, touch ? result.coarse && !result.fine : result.fine && !result.coarse, JSON.stringify(result));
      if (touch) check('LOG-10 native touch overscroll on root and body', result.values.every(v => v.x === 'auto' && v.y === 'auto'), JSON.stringify(result));
      console.info(`LOG-10 overscroll ${touch ? 'touch' : 'fine'}: ${JSON.stringify(result)}`);
    } finally { await context.close(); }
  }
}
