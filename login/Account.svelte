<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { Masthead } from '@yesid/ui/layout';
  import { Button } from '@yesid/ui/button';
  import { Card } from '@yesid/ui/card';
  import Chrome from './Chrome.svelte';
  import { copy } from './copy.ts';
  import { initialLocale } from './preferences.ts';
  import { siteKey, validTarget } from './controller.ts';
  const slug = new URLSearchParams(location.search).get('site') || '';
  const locale = initialLocale(), common = copy[locale];
  const text = {
    fr: { title: 'Changer mon courriel', lead: 'Vérifiez votre adresse actuelle, puis votre nouvelle adresse avec deux codes.', sentCurrent: 'Un code vient d’être envoyé à votre adresse actuelle. Il expire dans 5 minutes.', sent: 'Si cette adresse peut être utilisée, un code vient d’y être envoyé. Il expire dans 5 minutes.', done: 'Votre courriel a été modifié. Toutes vos sessions sont fermées. Reconnectez-vous avec la nouvelle adresse.', save: 'Confirmer mon courriel', back: 'Retour à la connexion' },
    en: { title: 'Change my email', lead: 'Verify your current address, then your new address with two codes.', sentCurrent: 'A code has just been sent to your current address. It expires in 5 minutes.', sent: 'If this address can be used, a code has just been sent there. It expires in 5 minutes.', done: 'Your email has changed. All sessions are closed. Sign in again with your new address.', save: 'Confirm my email', back: 'Back to sign-in' },
    es: { title: 'Cambiar mi correo', lead: 'Verifica tu dirección actual y luego tu nueva dirección con dos códigos.', sentCurrent: 'Acabamos de enviar un código a tu dirección actual. Vence en 5 minutos.', sent: 'Si esta dirección se puede usar, acabamos de enviarle un código. Vence en 5 minutos.', done: 'Tu correo ha cambiado. Todas tus sesiones están cerradas. Inicia sesión con tu nueva dirección.', save: 'Confirmar mi correo', back: 'Volver al inicio de sesión' }
  }[locale];
  let email = $state(''), currentEmail = $state(''), code = $state(''), step = $state('ask'), busy = $state(true), message = $state('');
  const steps = { fr: ['Nouvelle adresse', 'Code à l’adresse actuelle', 'Code à la nouvelle adresse'], en: ['New address', 'Code to current address', 'Code to new address'], es: ['Nueva dirección', 'Código a la dirección actual', 'Código a la nueva dirección'] }[locale];
  let token = '';
  let codeInput = $state<HTMLInputElement>();
  const headers = () => ({ Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'X-Login-Language': locale, 'X-Login-Theme': document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light' });
  onMount(() => { void restore(); });
  async function restore() {
    try {
      if (!validTarget(slug)) { location.replace('/'); return; }
      token = JSON.parse(localStorage.getItem(siteKey(slug)) || 'null')?.token || '';
      if (!token) { location.replace('/'); return; }
      const response = await fetch('/auth/api/get-session', { headers: headers() });
      const data = await response.json();
      currentEmail = data?.user?.email || '';
      if (!response.ok || !data?.session) { location.replace('/'); return; }
      const access = await fetch('/account', { headers: headers() });
      if (!access.ok) { location.replace('/'); return; }
      const sites = await fetch('/auth/sites', { headers: headers() });
      if (!sites.ok || !(await sites.json()).some((site: {slug:string}) => site.slug === slug)) { location.replace('/'); return; }
      busy = false;
    } catch { message = common.unavailable; busy = false; }
  }
  async function submit() {
    if (busy) return;
    busy = true; message = '';
    try {
      const response = await fetch('/auth/api/email-otp/' + (step === 'ask' ? 'send-verification-otp' : step === 'current' ? 'request-email-change' : 'change-email'), {
        method: 'POST', headers: headers(), body: JSON.stringify(step === 'ask' ? { type: 'email-verification' } : { newEmail: email.trim(), otp: code })
      });
      if (response.status === 401) { location.replace('/'); return; }
      if (!response.ok) { message = response.status === 429 ? common.rate : common.invalid; return; }
      if (step === 'ask' || step === 'current') { step = step === 'ask' ? 'current' : 'enter'; code = ''; message = step === 'current' ? text.sentCurrent : text.sent; await tick(); codeInput?.focus(); }
      else { step = 'done'; code = ''; localStorage.removeItem(siteKey(slug)); message = text.done; }
    } catch { message = common.connection; }
    finally { busy = false; }
  }
</script>
<svelte:head><title>{text.title} | yesid.dev</title></svelte:head>
<Chrome {locale}>
  <main id="main" tabindex="-1">
    <a href="/">{text.back}</a><Masthead kicker="yesid. | login" heading={text.title} lede={text.lead} />
    <p class="label-station">{step === 'ask' ? '1 / 3' : step === 'current' ? '2 / 3' : '3 / 3'} · {steps[step === 'ask' ? 0 : step === 'current' ? 1 : 2]}</p>
    {#if step !== 'done'}
      <Card class="form-card"><form onsubmit={event => { event.preventDefault(); void submit(); }}>
        {#if step === 'ask'}<label for="email">{common.email}</label><input id="email" name="email" type="email" autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="email" required bind:value={email} />
        {:else}<p class="confirm-address">{step === 'current' ? currentEmail : email}</p><label for="code">{common.code}</label><input id="code" name="code" bind:this={codeInput} inputmode="numeric" autocomplete="one-time-code" pattern={'[0-9]{6}'} maxlength="6" required bind:value={code} />{/if}
        <Button type="submit" size="cta" disabled={busy}>{step === 'ask' ? common.send : text.save}</Button>
      </form></Card>
    {/if}
    <p role="status" class="message state-panel">{message}</p>
  </main>
</Chrome>
