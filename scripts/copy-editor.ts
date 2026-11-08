// Serves the pinned editor and design tokens from this Worker, so no third party can change them.
import { cpSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

mkdirSync(resolve('public/editor'), { recursive: true });
cpSync('node_modules/@sveltia/cms/dist', 'public/editor', {
  recursive: true,
  filter: (source) => !source.endsWith('.map')
});

mkdirSync(resolve('public/login'), { recursive: true });
cpSync('node_modules/@yesid/tokens/tokens.css', 'public/login/tokens.css');
cpSync('node_modules/@yesid/tokens/fonts.css', 'public/login/fonts.css');
cpSync('node_modules/@yesid/tokens/fonts', 'public/login/fonts', {
  recursive: true,
  filter: (source) => !source.endsWith('.txt')
});

mkdirSync('public/editor/locales', { recursive: true });
for (const locale of ['fr', 'es-CO', 'en-CA']) cpSync(`node_modules/@sveltia/cms/locales/${locale}.json`, `public/editor/locales/${locale}.json`);
