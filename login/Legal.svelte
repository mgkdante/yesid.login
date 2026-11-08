<script lang="ts">
  import Chrome from './Chrome.svelte';
  import { initialLocale } from './preferences.ts';
  import { privacy, terms, LEGAL_UPDATED as updated, type LegalSection } from './legal/copy.ts';
  const locale = initialLocale();
  const text = (location.pathname === '/legal/privacy' ? privacy : terms)[locale];
  const anchor = (heading: string) => heading.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
</script>
<svelte:head><title>{text.title} | yesid.dev</title></svelte:head>
{#snippet body(section: LegalSection)}
  {#each section.paragraphs ?? [] as paragraph}<p>{paragraph}</p>{/each}
  {#if section.list}<ul>{#each section.list as item}<li>{item}</li>{/each}</ul>{/if}
  {#each section.after ?? [] as paragraph}<p>{paragraph}</p>{/each}
{/snippet}
<Chrome {locale}>
  <main id="main" class="legal-page" tabindex="-1" data-testid="page-legal">
    <h1 class="legal-title">{text.title}</h1>
    <article class="article-body" data-testid="legal-body">
      <p>{text.intro}</p>
      <p>{text.updatedLabel} {updated}</p>
      {#each text.sections as section}
        {@const id = anchor(section.heading)}
        <h2 {id}>{section.heading}<a class="heading-anchor" href={'#' + id} aria-labelledby={id}>#</a></h2>
        {@render body(section)}
        {#each section.subsections ?? [] as subsection}
          {@const subId = anchor(subsection.heading)}
          <h3 id={subId}>{subsection.heading}<a class="heading-anchor" href={'#' + subId} aria-labelledby={subId}>#</a></h3>
          {@render body(subsection)}
        {/each}
      {/each}
    </article>
  </main>
</Chrome>
