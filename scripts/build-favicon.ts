// Renders the brand mark (the same SVG as the login favicon) to 16, 32 and 48px PNGs and packs them into
// public/favicon.ico. Icon services such as DuckDuckGo's read only /favicon.ico at the site root.
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SIZES = [16, 32, 48] as const;

export function buildIco(svg: string): Uint8Array {
  const images = SIZES.map(size => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng());
  const header = new DataView(new ArrayBuffer(6 + 16 * images.length));
  header.setUint16(0, 0, true); // reserved
  header.setUint16(2, 1, true); // 1 = icon
  header.setUint16(4, images.length, true);
  let offset = header.byteLength;
  images.forEach((png, index) => {
    const entry = 6 + index * 16;
    header.setUint8(entry, SIZES[index]); // width
    header.setUint8(entry + 1, SIZES[index]); // height
    header.setUint16(entry + 4, 1, true); // colour planes
    header.setUint16(entry + 6, 32, true); // bits per pixel
    header.setUint32(entry + 8, png.length, true);
    header.setUint32(entry + 12, offset, true);
    offset += png.length;
  });
  const ico = new Uint8Array(offset);
  ico.set(new Uint8Array(header.buffer), 0);
  let at = header.byteLength;
  for (const png of images) { ico.set(png, at); at += png.length; }
  return ico;
}

if (import.meta.main) {
  writeFileSync(resolve(ROOT, 'public/favicon.ico'), buildIco(readFileSync(resolve(ROOT, 'public/login/favicon-dark.svg'), 'utf8')));
}
