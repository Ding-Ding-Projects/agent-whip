import { defineConfig } from 'vite';

// Plain TS/DOM renderer -- no framework dependency needed for a tray popover
// and a tabbed settings window. Keeps the dependency surface (and therefore
// the audit surface around the privacy boundary) as small as possible.
export default defineConfig({
  root: '.',
  base: './',
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: false,
    rollupOptions: {
      input: {
        popover: 'popover.html',
        settings: 'settings.html',
      },
    },
  },
});
