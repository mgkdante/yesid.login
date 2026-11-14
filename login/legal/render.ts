import type { Locale } from '../copy.ts';
import { LEGAL_UPDATED, privacy, terms, type LegalPage, type LegalSection } from './copy.ts';
import { legalLabels } from './labels.ts';

export const legalLocale = (value: unknown): Locale => value === 'en' || value === 'es' ? value : 'fr';
export const legalPage = (kind: 'privacy' | 'terms', locale: Locale) => ({ privacy, terms })[kind][locale];
export const escapeLegal = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const legalDate = (locale: Locale) => new Intl.DateTimeFormat(locale, {
  year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC'
}).format(new Date(LEGAL_UPDATED + 'T00:00:00Z'));

/** Escape each text fragment, including addresses, before adding the only allowed link markup. */
function linked(text: string): string {
  return text.split(/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi).map((part, index) => {
    const safe = escapeLegal(part);
    return index % 2 ? `<a href="mailto:${safe}">${safe}</a>` : safe;
  }).join('');
}

function sectionHtml(section: LegalSection, level = 2): string {
  const id = escapeLegal(section.id);
  const paragraphs = (values: readonly string[] = []) => values.map(p => `<p>${linked(p)}</p>`).join('');
  return `<h${level} id="${id}">${escapeLegal(section.heading)}<a class="heading-anchor" href="#${id}" aria-labelledby="${id}">#</a></h${level}>`
    + paragraphs(section.paragraphs)
    + (section.list ? `<ul>${section.list.map(item => `<li>${linked(item)}</li>`).join('')}</ul>` : '')
    + paragraphs(section.after)
    + (section.subsections ?? []).map(sub => sectionHtml(sub, level + 1)).join('');
}

function contents(sections: readonly LegalSection[]): string {
  return `<ul>${sections.map(section => `<li><a href="#${escapeLegal(section.id)}">${escapeLegal(section.heading)}</a>`
    + (section.subsections ? contents(section.subsections) : '') + '</li>').join('')}</ul>`;
}

/** Shared by the Worker fallback and Svelte; only escaped approved copy enters the HTML. */
export function renderLegal(text: LegalPage, locale: Locale): string {
  const labels = legalLabels[locale];
  return `<main id="main" class="legal-page" tabindex="-1" data-testid="page-legal">
<a href="/?lang=${locale}">${escapeLegal(labels.back)}</a>
<h1 class="legal-title">${escapeLegal(text.title)}</h1>
<article class="article-body" data-testid="legal-body">
<p>${escapeLegal(text.updatedLabel)} <time datetime="${LEGAL_UPDATED}">${legalDate(locale)}</time></p>
<p>${linked(text.intro)}</p>
<nav class="legal-toc" aria-label="${escapeLegal(labels.contents)}"><p>${escapeLegal(labels.contents)}</p>${contents(text.sections)}</nav>
${text.sections.map(section => sectionHtml(section)).join('')}
</article></main>`;
}
