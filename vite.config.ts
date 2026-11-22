import { defineConfig } from 'vite';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    {
      name: 'prepare-template',
      buildStart() {
        console.log('\x1b[36m🪄 Preparing template.html for standalone scene export...\x1b[0m');
      },
    },
  ],
  css: {
    postcss: {
      plugins: [tailwindcss(), autoprefixer()],
    },
  },
  worker: {
    plugins: () => [],
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        demo: resolve(__dirname, 'docs/index.html'),
      },
    },
  },
});
