import { test, expect } from 'bun:test';
test('technical data notice names IP only in the three approved languages', async () => {
  const source = await Bun.file('login/legal/copy.ts').text();
  for (const phrase of ['adresse IP et votre navigateur', 'IP address and browser', 'dirección IP y su navegador']) expect(source).not.toContain(phrase);
  expect(source).toContain("LEGAL_UPDATED = '2026-11-08'");
});

test('legal text keeps the public contact, not the operator or private details', async () => {
  const { privacy, terms } = await import('../login/legal/copy.ts');
  for (const language of ['fr','en','es'] as const) for (const page of [privacy[language], terms[language]]) {
    const text = JSON.stringify(page);
    expect(text).toContain('contact@yesid.dev');
    expect(text).not.toContain('admin@yesid.dev');
    expect(text).not.toMatch(/\bGatineau\b/i);
    expect(text).not.toMatch(/\b[A-Z]\d[A-Z][ -]?\d[A-Z]\d\b/);
    for (const name of ['Twilio','Mistral']) expect(text).not.toContain(name);
    // Gemini is named only where the policy lists Google for the editor's optional translation.
    expect(text.split('Gemini')).toHaveLength(page === privacy[language] ? 2 : 1);
  }
  expect(privacy.fr.sections.map(section => section.heading)).toHaveLength(privacy.en.sections.length);
  expect(privacy.es.sections.map(section => section.heading)).toHaveLength(privacy.en.sections.length);
  expect(terms.fr.sections).toHaveLength(terms.en.sections.length); expect(terms.es.sections).toHaveLength(terms.en.sections.length);
});
