<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { Masthead, ErrorPage } from '@yesid/ui/layout';
  import { Badge } from '@yesid/ui/badge';
  import { StatusDot } from '@yesid/ui/brand';
  import { Card } from '@yesid/ui/card';
  import Chrome from './Chrome.svelte';
  import { Button } from '@yesid/ui/button';
  import { copy, peopleCopy } from './copy.ts';
  import { initialLocale } from './preferences.ts';
  import { siteKey } from './controller.ts';
  const locale = initialLocale(), text = peopleCopy[locale], common = copy[locale];
  const slug = location.pathname.split('/')[1];
  type Member = { id: string; email: string; role: 'owner' | 'employee' | 'it'; status: 'pending' | 'active' | 'expired'; lastEdit: string | null };
  let members = $state<Member[]>([]), email = $state(''), busy = $state(true);
  let message = $state(text.loading), allowed = $state(false), removing = $state<Member>();
  let adding = $state(false), shareLink = $state(false);
  let removeTrigger: HTMLButtonElement | undefined;
  const editorLink = 'https://login.yesid.dev/' + slug + '/';
  function startAction() { message = ''; shareLink = false; removing = undefined; }
  async function askRemove(member: Member, trigger: HTMLButtonElement) {
    startAction(); adding = false; removing = member; removeTrigger = trigger;
    await tick();
    const question = document.getElementById('remove-question');
    question?.focus(); question?.scrollIntoView({ block: 'nearest' });
  }
  async function cancelRemove() { removing = undefined; await tick(); removeTrigger?.focus(); }
  const peopleCount = (n: number) => `${n} ${new Intl.PluralRules(locale).select(n) === 'one' ? text.singular : text.plural}`;
  const labels = { fr: { pending: 'En attente', active: 'Confirmé', expired: 'Expiré', add: 'Ajouter', confirm: 'Confirmer', back: 'Retour', last: 'Dernière modification', account: 'Changer mon courriel' }, en: { pending: 'Pending', active: 'Confirmed', expired: 'Expired', add: 'Add', confirm: 'Confirm', back: 'Back', last: 'Last edit', account: 'Change my email' }, es: { pending: 'Pendiente', active: 'Confirmado', expired: 'Vencido', add: 'Añadir', confirm: 'Confirmar', back: 'Volver', last: 'Última edición', account: 'Cambiar mi correo' } }[locale];
  // The database stores UTC as `YYYY-MM-DD HH:MM:SS`.
  const last = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value.replace(' ', 'T') + 'Z'));
  let siteLabel = $state('');
  const extra = { fr: ['Gérez les accès à votre site.', 'Renouveler', 'Aucune personne pour le moment.', 'personnes', 'Accès réservé', 'Page indisponible'], en: ['Manage access to your site.', 'Renew', 'No people yet.', 'people', 'Restricted page', 'Page unavailable'], es: ['Gestiona el acceso a tu sitio.', 'Renovar', 'Aún no hay personas.', 'personas', 'Página restringida', 'Página no disponible'] }[locale];
  function renew(address: string) { startAction(); email = address; adding = true; document.querySelector('.people-add')?.scrollIntoView(); }
  let token = '';
  const signIn = () => location.replace('/?site=' + encodeURIComponent(slug));
  async function request(method = 'GET', id = '') {
    const response = await fetch('/' + slug + '/people/members' + (id ? '/' + encodeURIComponent(id) : ''), {
      method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'X-Login-Language': locale },
      ...(method === 'POST' ? { body: JSON.stringify({ email }) } : {})
    }).catch(() => { throw Error(method === 'GET' ? text.loadFailed : text.failed); });
    if (response.status === 401) { signIn(); throw Error(text.failed); }
    if (!response.ok) throw Error(response.status === 403 ? text.forbidden : response.status === 409 ? text.full : response.status === 429 ? text.rate : method === 'GET' ? text.loadFailed : text.failed);
    return response.json().catch(() => { throw Error(method === 'GET' ? text.loadFailed : text.failed); });
  }
  async function restore() {
    try {
      token = JSON.parse(localStorage.getItem(siteKey(slug)) || 'null')?.token;
      if (!token) { signIn(); return; }
      const response = await fetch('/auth/sites', { headers: { Authorization: 'Bearer ' + token } });
      if (response.status === 401) { signIn(); return; }
      if (!response.ok) throw Error(text.loadFailed);
      siteLabel = (await response.json()).find((site: { slug: string }) => site.slug === slug)?.label || '';
      members = await request(); allowed = true; message = '';
    } catch (error) { message = error instanceof Error && error.message === text.forbidden ? text.forbidden : text.loadFailed; }
    finally { busy = false; }
  }
  async function change(method: 'POST' | 'DELETE', id = '') {
    if (busy) return;
    message = ''; shareLink = false; busy = true;
    try {
      const result = await request(method, id);
      if (method === 'POST' && !['added', 'renewed', 'unchanged'].includes(result.outcome)) throw Error(text.failed);
      email = ''; adding = false; removing = undefined;
      shareLink = method === 'POST' && result.outcome !== 'unchanged' && result.emailSent === false;
      message = method === 'DELETE' ? text.done : result.outcome === 'unchanged' ? text.unchanged
        : result.outcome === 'renewed' ? (shareLink ? text.renewedMail : text.renewed) : (shareLink ? text.mail : text.added);
      try { members = await request(); }
      catch { message += ' ' + text.loadFailed; }
      if (method === 'DELETE') { await tick(); document.getElementById('people-count')?.focus(); }
    } catch (error) { message = error instanceof Error ? error.message : text.failed; }
    finally { busy = false; }
  }
  onMount(() => { void restore(); });
</script>
<svelte:head><title>{text.title} | yesid.dev</title></svelte:head>
<Chrome {locale}>
  <main id="main" class="wide-page" tabindex="-1" aria-busy={busy}>
    {#if allowed || busy}<a href={'/' + slug + '/'}>{text.back}</a><Masthead kicker={siteLabel || "yesid. | login"} heading={text.title} lede={extra[0]} />{/if}
    {#if allowed}
      <div class="people-layout"><aside class="people-add"><Card class="form-card">{#if adding}<div role="group" aria-label={labels.confirm}><p>{labels.add}</p><p class="confirm-address">{email.trim()}?</p><Button size="cta" disabled={busy} onclick={() => change('POST')}>{labels.confirm}</Button> <Button size="cta" variant="outline" onclick={() => { adding = false; }}>{labels.back}</Button></div>{:else}<form onsubmit={event => { event.preventDefault(); startAction(); adding = true; }}>
        <label for="email">{common.email}</label><input id="email" type="email" autocomplete="off" required maxlength="254" bind:value={email} />
        <Button size="cta" type="submit" disabled={busy}>{text.add}</Button>
      </form>{/if}</Card><Button href={"/account?site=" + slug + "&lang=" + locale} variant="outline" size="cta">{labels.account}</Button><Button href={"/?site=" + slug + "&switch=1&lang=" + locale} variant="outline" size="cta">{common.switchSite}</Button></aside><section aria-label={text.title}><p>{text.roleHelp}</p><p id="people-count" tabindex="-1" class="label-station">{peopleCount(members.length)}</p>
      <ul class="people-list">
        {#each members as member (member.id)}
          <li><Card class="person-card"><div class="person"><strong>{member.email}</strong><div class="person-badges"><Badge variant="outline" size="sm">{text[member.role]}</Badge><span class="person-status"><StatusDot color={member.status === "active" ? "green" : member.status === "expired" ? "stop" : "caution"} />{labels[member.status]}</span></div><span class="person-meta">{member.lastEdit ? labels.last + ": " + last(member.lastEdit) : text.never}</span></div>
            {#if member.role === 'employee'}<div class="person-actions">{#if member.status === 'expired'}<Button size="cta" disabled={busy} onclick={() => renew(member.email)}>{extra[1]}<span class="sr-only"> {member.email}</span></Button>{/if}<Button size="cta" variant="outline" disabled={busy} onclick={(event: MouseEvent & { currentTarget: HTMLButtonElement }) => askRemove(member, event.currentTarget)}>{text.remove}<span class="sr-only"> {member.email}</span></Button></div>{/if}
          </Card>
          {#if removing?.id === member.id}
            <div id="remove-question" tabindex="-1" role="group" aria-labelledby="remove-prompt" class="confirmation"><p id="remove-prompt">{text.confirm} <strong>{member.email}</strong></p><Button size="cta" disabled={busy} onclick={() => change('DELETE', member.id)}>{text.remove}</Button> <Button size="cta" variant="outline" disabled={busy} onclick={cancelRemove}>{text.cancel}</Button></div>
          {/if}</li>
        {/each}
      </ul>{#if !members.length}<Card class="form-card"><p>{extra[2]}</p></Card>{/if}</section></div>
    {:else if !busy}<ErrorPage status={message === text.forbidden ? 403 : 502} label="yesid. | login" heading={message === text.forbidden ? extra[4] : extra[5]} body={message} suggestions={[{ href: "/" + slug + "/", label: text.back }, { href: "/account?site=" + slug + "&lang=" + locale, label: labels.account }]} />{/if}
    {#if allowed || busy}<p class="message state-panel" role="status">{message}{#if shareLink} <a href={editorLink}>{editorLink}</a>{/if}</p>{/if}
  </main>
</Chrome>
