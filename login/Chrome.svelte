<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { SiteFooter, SiteHeader } from '@yesid/ui/layout';
  import { ConstructionProps, Wordmark, createNavigationLifecycle } from '@yesid/ui/brand';
  import { theme } from '@yesid/ui/state';
  import { legalLabels } from './legal/labels.ts';
  import { copy, locales, type Locale } from './copy.ts';
  import { localeHref, savePreferences } from './preferences.ts';
  let { locale, center = false, children }: { locale: Locale; center?: boolean; children: Snippet } = $props();
  const text = $derived(copy[locale]);
  const legal = $derived(legalLabels[locale]);
  const home = $derived('/?lang=' + locale);
  const groups = $derived([
    { label: text.footerProduct, links: [{ href: home, label: text.footerSignIn }] },
    { label: legal.legal, links: [{ href: '/legal/privacy?lang=' + locale, label: legal.privacy }, { href: '/legal/terms?lang=' + locale, label: legal.terms }] },
    { label: 'yesid.dev', links: [{ href: 'https://yesid.dev', label: text.footerSite, external: true }, { href: 'mailto:contact@yesid.dev', label: text.footerContact }] }
  ]);
  // Legal contents links can change the fragment after the language link was rendered.
  let legalHash = $state(location.hash);
  const languageHref = (next: string) => localeHref(next, legalHash);
  // Document navigations unload this app. There are no client router events to publish.
  const navigation = createNavigationLifecycle({ beforeNavigate() {}, onNavigate() {}, afterNavigate() {} });
  onMount(() => {
    theme.init();
    if (!location.pathname.startsWith('/legal/')) return;
    const update = () => { legalHash = location.hash; };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  });
  $effect(() => { document.documentElement.lang = locale; savePreferences(locale, theme.current); });
</script>
<div class="site-grid circuit-grid" aria-hidden="true"></div>
<div class="login-chrome">
  <SiteHeader {navigation} {home} wordmark="Login" links={[]} menuItems={[]}
    labels={{ openMenu: 'Menu', closeMenu: 'Menu', menu: 'Menu', theme: text.theme, menuFooter: '', skipToContent: text.skip }}
    language={{ locale, locales, href: languageHref, label: text.language, names: { fr: 'Français', en: 'English', es: 'Español' }, reload: true }} />
  <div class="shell" class:shell-center={center}>{@render children()}</div>
  {#if location.pathname === '/'}<div class="construction-ground" aria-hidden="true"><ConstructionProps layout="spread" floodlight /></div>{/if}
  <SiteFooter tagline={text.footerTagline} {groups} statusPrefix={text.footerStatus} liveLabel={text.footerLive}>
    {#snippet brand()}
      <span class="brand-cluster"><Wordmark href="https://yesid.dev" external animate={false} class="text-lg" /><span class="brand-divider" aria-hidden="true"></span><a class="brand-product" href={home}>login</a></span>
    {/snippet}
    {#snippet statusStart()}<span>login.yesid.dev</span>{/snippet}
  </SiteFooter>
</div>
