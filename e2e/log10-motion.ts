import type { Browser, Page } from 'playwright-core';

type Check = (name: string, passed: boolean, detail?: string) => void;

/** Every login state is checked, including ErrorIllustration now that rc.3 adopts Y-30. */
function motionSnapshot() {
  const cms = !!document.querySelector('script[src="/editor/sveltia-cms.js"]') && !document.querySelector('#editor-start');
  return { cms, motionAllowed: !matchMedia('(prefers-reduced-motion: reduce)').matches,
    infinite: document.getAnimations().filter(a => a.effect?.getTiming().iterations === Infinity).map(a => ({
      animation: 'animationName' in a ? a.animationName : a.id, state: a.playState,
      target: (() => {
        const target = (a.effect as KeyframeEffect | null)?.target;
        return target instanceof Element ? { tag: target.tagName, id: target.id, classes: [...target.classList] } : null;
      })()
    })) };
}

export async function log10Motion(page: Page, name: string, check: Check) {
  // Finite entrances/transitions may finish; never wait for or hide an infinite animation.
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
  });
  const result = await page.evaluate(motionSnapshot);
  check(`LOG-10 motion allowed ${name}`, result.motionAllowed);
  if (result.cms) { console.info(`LOG-10 Sveltia replaced login loading: ${name}`); return; }
  check(`LOG-10 no infinite animation ${name}`, result.infinite.length === 0, JSON.stringify(result.infinite));
}

/** Observe settled states in every context, including states outside the screenshot matrix. */
export function watchLog10Motion(browser: Browser, check: Check) {
  const failures = new Set<string>();
  let samples = 0;
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async options => {
    const context = await newContext({ ...options, reducedMotion: 'no-preference' });
    await context.exposeBinding('__log10MotionReport', ({ page }, result: ReturnType<typeof motionSnapshot>) => {
      if (result.cms) return;
      samples++;
      if (!result.motionAllowed || result.infinite.length) failures.add(JSON.stringify({ path: new URL(page.url()).pathname, ...result }));
    });
    await context.addInitScript(`globalThis.__log10InspectMotion = (${motionSnapshot.toString()});`);
    await context.addInitScript(() => {
      if (location.protocol !== 'http:') return;
      let changed = performance.now();
      new MutationObserver(() => { changed = performance.now(); }).observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
      setInterval(() => {
        if (document.readyState === 'loading' || performance.now() - changed < 150) return;
        const inspect = Reflect.get(globalThis, '__log10InspectMotion') as () => ReturnType<typeof motionSnapshot>;
        const report = Reflect.get(globalThis, '__log10MotionReport') as (value: ReturnType<typeof motionSnapshot>) => Promise<void>;
        void report(inspect()).catch(() => {}); // Closing a context can discard its last sample.
      }, 250);
    });
    return context;
  };
  return () => {
    check('LOG-10 settled login states were observed with motion allowed', samples > 0, String(samples));
    check(`LOG-10 no infinite animation across ${samples} settled login-state samples`, failures.size === 0, [...failures].join('; '));
  };
}
