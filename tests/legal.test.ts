import { expect, test } from 'bun:test';
import { publicHtml } from '../src/pages.ts';
import { privacy, terms, LEGAL_UPDATED, type LegalSection } from '../login/legal/copy.ts';
import { escapeLegal, legalDate, renderLegal } from '../login/legal/render.ts';

const flatten = (sections: readonly LegalSection[]): LegalSection[] => sections.flatMap(section => [section, ...flatten(section.subsections ?? [])]);

for (const [kind, pages] of Object.entries({ privacy, terms })) {
  for (const locale of ['fr', 'en', 'es'] as const) {
    test(`LOG-8: ${kind} ${locale} has complete, linked and localized HTML`, () => {
      const text = pages[locale], sections = flatten(text.sections);
      const html = publicHtml(kind as 'privacy' | 'terms', locale);
      expect(html).toContain(`<html lang="${locale}"`);
      expect(html).toContain(`<h1 class="legal-title">${escapeLegal(text.title)}</h1>`);
      expect(html).toContain(escapeLegal(text.intro));
      expect(sections.map(s => s.id)).toEqual(flatten(pages.fr.sections).map(s => s.id));
      expect(new Set(sections.map(s => s.id)).size).toBe(sections.length);
      for (const section of sections) {
        expect(html).toContain(`id="${section.id}"`);
        expect(html).toContain(`href="#${section.id}"`);
        for (const value of [...section.paragraphs ?? [], ...section.list ?? [], ...section.after ?? []]) {
          // Links add markup without changing any approved text.
          const plain = html.replace(/<[^>]*>/g, '');
          expect(plain).toContain(escapeLegal(value));
        }
      }
      expect(html).toContain('href="mailto:contact@yesid.dev"');
      expect(html).toContain(`datetime="${LEGAL_UPDATED}">${legalDate(locale)}</time>`);
      expect(html).toContain(`href="/?lang=${locale}"`);
      expect(html).not.toContain('<noscript>');
      expect(html).not.toContain('role="status"');
    });
  }
}

test('LOG-8: legal renderer escapes every text and attribute boundary', () => {
  const unsafe = `<img src=x onerror="bad"> & 'quoted'`;
  const html = renderLegal({ title: unsafe, intro: unsafe, updatedLabel: unsafe,
    sections: [{ id: unsafe, heading: unsafe, paragraphs: [unsafe], list: [unsafe], after: [unsafe],
      subsections: [{ id: unsafe, heading: unsafe, paragraphs: [unsafe] }] }] }, 'en');
  expect(html).not.toContain('<img');
  expect(html).toContain(escapeLegal(unsafe));
  expect(html).toContain(`id="${escapeLegal(unsafe)}"`);
});

test('LOG-8: legal locale defaults to French for absent and invalid queries', () => {
  for (const query of [undefined, null, 'de', 'EN', '<script>']) {
    expect(publicHtml('privacy', query)).toContain('<html lang="fr"');
  }
});

test('LOG-8: legal text is delivered in HTML without JavaScript', () => {
  const html = publicHtml('privacy');
  expect(html).toContain('data-testid="legal-body"');
  expect(html).toContain('href="mailto:contact@yesid.dev"');
  expect(html).toContain('datetime="2026-11-14"');
});
