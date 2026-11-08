import { build } from 'vite';

if (Number(process.versions.node.split('.')[0]) !== 24) {
  throw new Error('Build the sign-in app with Node 24 LTS on PATH.');
}
await build();
