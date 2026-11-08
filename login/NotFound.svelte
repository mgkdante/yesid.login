<script lang="ts">
  import { ErrorPage } from '@yesid/ui/layout';
  import Chrome from './Chrome.svelte';
  import { initialLocale } from './preferences.ts';
  import { legalLabels } from './legal/labels.ts';
  const locale = initialLocale();
  const text = { fr: ['Page introuvable', 'Vérifiez l’adresse ou revenez à la connexion.'], en: ['Page not found', 'Check the address or return to sign-in.'], es: ['Página no encontrada', 'Comprueba la dirección o vuelve al inicio de sesión.'] }[locale];
</script>
<svelte:head><title>{text[0]} | yesid.dev</title></svelte:head>
<Chrome {locale}><main id="main" class="wide-page" tabindex="-1"><ErrorPage status={404} label="yesid. | login" heading={text[0]} body={text[1]} suggestions={[{ href: '/?lang=' + locale, label: legalLabels[locale].back }]} /></main></Chrome>
