<script lang="ts">
  import { onMount } from 'svelte';
  import Chrome from './Chrome.svelte';
  import { legalLocale, legalPage, renderLegal } from './legal/render.ts';
  const locale = legalLocale(new URLSearchParams(location.search).get('lang'));
  const text = legalPage(location.pathname === '/legal/privacy' ? 'privacy' : 'terms', locale);
  // Mounting replaces the server DOM after the browser's initial fragment jump.
  onMount(() => {
    try {
      if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
    } catch { /* An invalid fragment does not prevent reading. */ }
  });
</script>
<svelte:head><title>{text.title} | yesid.dev</title></svelte:head>
<Chrome {locale}>
  {@html renderLegal(text, locale)}
</Chrome>
