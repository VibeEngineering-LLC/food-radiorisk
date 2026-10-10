// #FR-88 v18, пункт 2; v24, пункт 4: в файлах tests/ нет внутренних имён (список запрещённых фрагментов берётся из tools/make_public_snapshot.py, в тестах литералов с именами нет); тест источников не зависит от файлов вне репозитория
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dir = new URL('./', import.meta.url);
const tool = new URL('../tools/make_public_snapshot.py', import.meta.url);

// Рекурсивно возвращает абсолютные пути всех файлов в директории d
function walk(d) {
    const results = [];
    const entries = readdirSync(d, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = `${d}/${entry.name}`;
        if (entry.isDirectory()) {
            results.push(...walk(fullPath));
        } else if (entry.isFile()) {
            results.push(fullPath);
        }
    }
    return results;
}

// Декодирует \uXXXX экранирования в текст, чтобы найти запрещённые слова, записанные в JSON
function decode(text) {
    return text.replace(/\\u([0-9a-fA-F]{4})/g, (match, hex) => {
        return String.fromCharCode(parseInt(hex, 16));
    });
}

test('файлы tests/ не содержат запрещённых фрагментов снимка (в том числе записанных \\u-экранированием)', { skip: !existsSync(tool) }, () => {
    // Получаем список запрещённых паттернов из инструмента
    const output = execFileSync('python', [fileURLToPath(tool), '--forbidden-json'], {
        encoding: 'utf8',
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });
    const { pattern, ignorecase } = JSON.parse(output);
    const re = new RegExp(pattern, ignorecase ? 'i' : '');

    // Проверка, что паттерн работает корректно (нейтральная проверка)
    assert.ok(re.test(['D', ':/папка/файл'].join(''))); // литерал с буквой диска сам был бы запрещённым фрагментом

    const allowedExtensions = ['.js', '.json', '.txt', '.md', '.mjs'];
    const hits = [];
    const files = walk(fileURLToPath(dir));

    for (const filePath of files) {
        const ext = filePath.slice(filePath.lastIndexOf('.'));
        if (!allowedExtensions.includes(ext)) {
            continue;
        }
        // временные сборки _render_*.mjs создаёт render_helper.js во время параллельного прогона и сразу удаляет: в публичную копию они не входят
        if (/[\\/]_render_[^\\/]*$/.test(filePath)) continue;

        const text = readFileSync(filePath, 'utf8');
        if (re.test(text) || re.test(decode(text))) {
            // Сохраняем относительный путь от директории tests/
            const relativePath = filePath.replace(fileURLToPath(dir), '').replace(/^\//, '');
            hits.push(relativePath);
        }
    }

    assert.deepEqual(hits, []);
});

test('тест источников рациона не читает файлы вне репозитория без явной просьбы', () => {
    const src = readFileSync(new URL('./fr83_w01_files.test.js', dir), 'utf8');
    assert.match(src, /process\.env\.FR_CHECK_LOCAL === '1' && existsSync/);
});
