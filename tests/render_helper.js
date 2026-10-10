// #FR-81 P2-9 (fix-review-1 №8): серверный рендер React-компонентов проекта в строку HTML — тесты проверяют показанный текст, а не исходник .jsx
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { writeFile, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

// Корень проекта: этап выше каталога tests/
const root = fileURLToPath(new URL('../', import.meta.url));

// #FR-88 v21: один раз собрать модуль и рендерить много раз (tools/check_report_vs_screen.mjs); renderJsx — прежний одноразовый вызов
export async function renderJsx(relPath, exportName, props) {
  const { render, done } = await loadJsx(relPath, exportName);
  try { return render(props); } finally { await done(); }
}

export async function loadJsx(relPath, exportName) {
  // Собираем компонент в ES-модуль для Node (SSR), без записи в файловую систему
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    root,
    plugins: [react()],
    build: {
      write: false,
      ssr: path.join(root, relPath),
      target: 'node20',
      rollupOptions: {
        output: {
          format: 'es',
        },
      },
    },
  });

  // Результат может быть одним объектом или массивом — берём первый
  const bundle = Array.isArray(result) ? result[0] : result;

  // Ищем входной чанк среди выходов
  const entryChunk = bundle.output.find((chunk) => chunk.type === 'chunk' && chunk.isEntry === true);
  if (!entryChunk) {
    throw new Error('Не удалось найти входной чанк в результате сборки Vite');
  }

  // Уникальное имя временного файла внутри tests/, чтобы bare-импорты резолвились из node_modules проекта
  const tmpName = `_render_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2)}.mjs`;
  const tmpFile = path.join(root, 'tests', tmpName);

  // Записываем собранный код во временный файл
  await writeFile(tmpFile, entryChunk.code, 'utf8');

  try {
    // Динамически импортируем собранный модуль
    const mod = await import(pathToFileURL(tmpFile).href);

    // Извлекаем нужный экспорт
    const Comp = mod[exportName];
    if (typeof Comp !== 'function') {
      throw new Error(`Экспорт "${exportName}" из "${relPath}" не является функцией (компонентом)`);
    }

    // Рендерим компонент в статическую HTML-строку
    return { render: (props) => renderToStaticMarkup(createElement(Comp, props)), done: () => rm(tmpFile, { force: true }) };
  } catch (e) {
    // Удаляем временный файл при ошибке загрузки
    await rm(tmpFile, { force: true });
    throw e;
  }
}
