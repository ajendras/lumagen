import { defineConfig, PluginOption } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function lumagenTemplatePlugin(): PluginOption {
  return {
    name: 'lumagen-template',
    enforce: 'post',
    buildStart() {
      console.log('\x1b[36m🪄 Preparing template.html for standalone scene export...\x1b[0m');
    },
    async generateBundle() {
      const templatePath = path.resolve(__dirname, 'template.html');
      try {
        const templateContent = await fs.readFile(templatePath, 'utf-8');
        
        this.emitFile({
          type: 'asset',
          fileName: 'template.html',
          source: templateContent,
        });
        
        console.log('\x1b[32m✅ template.html prepared and emitted as build asset\x1b[0m');
      } catch (error) {
        console.warn('\x1b[33m⚠️  template.html not found yet (will be added). Export will use inline fallback.\x1b[0m');
      }
    },
  };
}

export default defineConfig({
  plugins: [lumagenTemplatePlugin()],
  
  server: {
    port: 5173,
    open: true,
    hmr: {
      overlay: true,
    },
  },
  
  build: {
    target: 'esnext',
    sourcemap: true,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) return 'vendor';
          return undefined;
        },
      },
    },
  },
  
  worker: {
    format: 'es',
    plugins: [],
  },
  
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
    },
  },
});
