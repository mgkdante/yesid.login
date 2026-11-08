import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  publicDir: false,
  plugins: [svelte(), tailwindcss()],
  build: {
    outDir: 'public/login/build', emptyOutDir: true, minify: true,
    lib: { entry: 'login/main.ts', formats: ['es'], fileName: 'app', cssFileName: 'app' },
    assetsInlineLimit: 0
  }
});
