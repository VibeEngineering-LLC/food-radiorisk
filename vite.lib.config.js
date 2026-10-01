import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

// #FR-57: CSS для проверки Claude Design — без повторного тёмного блока @media (prefers-color-scheme: dark)
// (остаётся :root[data-theme=dark]), шрифтовые токены помечены @kind font, служебные --lightningcss-* — @kind other.
// На сайт не влияет: сайт собирается vite.config.js и автоматическую тёмную тему сохраняет.
export function dsCss(css) {
  let out = '', i = 0, m;
  const re = /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{/g;
  while ((m = re.exec(css))) {
    out += css.slice(i, m.index);
    let d = 1, j = re.lastIndex;
    while (d && j < css.length) { if (css[j] === '{') d++; else if (css[j] === '}') d--; j++; }
    i = re.lastIndex = j;
  }
  out += css.slice(i);
  const tag = (names, kind) => (s) => s.replace(new RegExp(`(--(?:${names}):[^;}]*)([;}])`, 'g'), (_, decl, end) => `${decl};/* @kind ${kind} */${end === '}' ? '}' : ''}`);
  return tag('lightningcss-light|lightningcss-dark', 'other')(tag('mono|sans', 'font')(out));
}
const dsCssPlugin = () => ({ name: 'ds-css', closeBundle() { for (const f of readdirSync('dist-lib').filter(f => f.endsWith('.css'))) writeFileSync(`dist-lib/${f}`, dsCss(readFileSync(`dist-lib/${f}`, 'utf8'))); } });

// Библиотека компонентов для Claude Design: dist-lib/index.es.js + style.css + index.d.ts (типы написаны вручную в src/react/lib.d.ts)
const copyTypes = () => ({ name: 'copy-types', closeBundle() { copyFileSync('src/react/lib.d.ts', 'dist-lib/index.d.ts'); copyFileSync('src/react/types.d.ts', 'dist-lib/types.d.ts'); } });

export default defineConfig({
  publicDir: false,
  plugins: [react(), copyTypes(), dsCssPlugin()],
  build: {
    outDir: 'dist-lib', emptyOutDir: true, cssFileName: 'style',
    lib: { entry: 'src/react/lib.jsx', formats: ['es'], fileName: () => 'index.es.js' },
    rollupOptions: { external: ['react', 'react-dom', 'react/jsx-runtime'] }
  }
});
