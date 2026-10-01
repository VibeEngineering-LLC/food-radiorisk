import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cpSync } from 'node:fs';

// Данные лежат в public/data (их строят tools/build_data.py и читают тесты), поэтому publicDir отключён,
// а нужные каталоги копируются в dist как есть: адреса public/data/... остаются теми же, что в старой версии.
const copyStatic = () => ({
  name: 'copy-static',
  closeBundle() {
    cpSync('public', 'dist/public', { recursive: true });
    cpSync('src/ui/source_short.json', 'dist/src/ui/source_short.json');
    cpSync('src/ui/food_ru.json', 'dist/src/ui/food_ru.json');
    cpSync('sources.html', 'dist/sources.html');
    cpSync('src/ui/styles.css', 'dist/src/ui/styles.css'); // sources.html подключает его по относительному адресу
  }
});

export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [react(), copyStatic()],
  build: { outDir: 'dist', emptyOutDir: true, rollupOptions: { input: 'index.html' } }
});
