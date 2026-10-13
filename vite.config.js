import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` → multi-file static site in dist/
// `npm run build:single` → one self-contained HTML file in dist-single/
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'single' ? [viteSingleFile({ removeViteModuleLoader: true })] : [],
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    target: 'es2020',
    chunkSizeWarningLimit: 4000,
    assetsInlineLimit: mode === 'single' ? 100000000 : 4096,
  },
  server: { host: true },
}));
