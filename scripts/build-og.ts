import { Resvg } from '@resvg/resvg-js';
import { touchIconSvg } from '@yesid/seo-kit/icons';
import { OG_PALETTE, OG_WIDTH, renderOgPng } from '@yesid/seo-kit/og';
import { readOgFonts } from '@yesid/seo-kit/og/files';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../public/login');
const TOUCH_ICON_SIZE = 180;

/** A link preview cannot know the reader's language, so the one card carries all three. */
const CARD = {
  eyebrow: 'Connexion · Sign in · Iniciar sesión',
  wordmark: 'yesid',
  title: 'Votre site. Your site. Tu sitio.',
  handle: 'login.yesid.dev',
  location: 'FR · EN · ES'
};

const png = (svg: string, width: number) => new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng();

writeFileSync(resolve(OUT_DIR, 'og.png'), await renderOgPng(CARD, readOgFonts(), svg => png(svg, OG_WIDTH)));
writeFileSync(resolve(OUT_DIR, 'apple-touch-icon.png'), png(touchIconSvg(OG_PALETTE.background, OG_PALETTE.accent, TOUCH_ICON_SIZE), TOUCH_ICON_SIZE));
