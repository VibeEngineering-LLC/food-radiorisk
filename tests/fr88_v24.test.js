// #FR-88 v24: ссылки справки, лицензии в собранном сайте, начальное состояние формы
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { data } from './fr81_helpers.js';
import { listChoices, computeScenario } from '../src/calc/model.js';
import { initialRaw, setField, toInput } from '../src/react/formState.js';
import { T } from '../src/ui/texts_v.js';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

test('v24 п.1: функция link() справки превращает любой DOI в ссылку на doi.org, относительных ссылок нет', () => {
    const html = read('sources.html').replace(/\r\n/g, '\n'); // в рабочей копии могут быть CRLF
    const escMatch = html.match(/function esc\(s\) \{[\s\S]*?\n\}\n/);
    const linkMatch = html.match(/function link\(v\) \{[\s\S]*?\n\}\n/);
    assert.ok(escMatch, 'Функция esc не найдена в sources.html');
    assert.ok(linkMatch, 'Функция link не найдена в sources.html');

    const escSrc = escMatch[0];
    const linkSrc = linkMatch[0];
    const link = new Function(escSrc + linkSrc + '; return link;')();

    const sourcesJson = JSON.parse(read('public/data/sources.json'));
    const limitsRu = JSON.parse(read('public/data/limits_ru.json'));
    const limitsForeign = JSON.parse(read('public/data/limits_foreign.json'));

    const values = [];

    // Сбор DOI и URL из sources.json
    if (sourcesJson.sources) {
        for (const key in sourcesJson.sources) {
            const rec = sourcesJson.sources[key];
            if (rec.doi) values.push(rec.doi);
            if (rec.url) values.push(rec.url);
        }
    }

    // Рекурсивный сбор url из limits
    const collectUrls = (obj) => {
        if (Array.isArray(obj)) {
            obj.forEach(collectUrls);
        } else if (obj && typeof obj === 'object') {
            for (const key in obj) {
                if (key === 'url' && typeof obj[key] === 'string') {
                    values.push(obj[key]);
                } else {
                    collectUrls(obj[key]);
                }
            }
        }
    };

    collectUrls(limitsRu);
    collectUrls(limitsForeign);

    // Уникализация и фильтрация пустых
    const uniqueValues = [...new Set(values.filter(v => v && typeof v === 'string'))];
    assert.ok(uniqueValues.length >= 15, `Ожидалось >= 15 ссылок, найдено ${uniqueValues.length}`);
    assert.ok(uniqueValues.some(v => /^10\.\d+\//.test(v)), 'Не найдено ни одного "голого" DOI');

    const bad = [];
    for (const v of uniqueValues) {
        const a = link(v);
        if (typeof a !== 'string' || !a.startsWith('<a href="https://')) {
            bad.push(v);
        }
    }
    assert.deepEqual(bad, [], 'Некоторые ссылки не превращаются в https-ссылки: ' + bad.join(', '));

    // Проверка конкретных DOI
    for (const v of uniqueValues) {
        if (/^10\.\d+\//.test(v)) {
            const expectedHref = 'href="https://doi.org/' + v.replace(/&/g, '&amp;') + '"';
            assert.ok(link(v).includes(expectedHref), `DOI ${v} не содержит корректной ссылки`);
        }
    }

    // Дополнительные проверки
    assert.ok(link('doi:10.1000/xyz').includes('href="https://doi.org/10.1000/xyz"'), 'DOI с префиксом doi: не обработан');
    assert.ok(!link('просто текст').includes('<a '), 'Обычный текст не должен быть ссылкой');
    assert.equal(link(''), null, 'Пустая строка должна вернуть null');
    assert.equal(link(null), null, 'Null должен вернуть null');
});

test('v24 п.1: относительные ссылки и src на страницах указывают на файлы публикуемого дерева', () => {
    const pages = ['sources.html', 'index.html'];
    const missing = [];
    let sourcesCheckedCount = 0;

    for (const site of pages) {
        let html = read(site);
        
        // Для sources.html берем только часть до первого <script type="module"> с await Promise.all
        if (site === 'sources.html') {
            const scriptRegex = /<script type="module">[\s\S]*?await Promise\.all[\s\S]*?<\/script>/;
            const match = html.match(scriptRegex);
            if (match) {
                html = html.substring(0, match.index);
            }
        }

        const attrRegex = /(?:href|src)="([^"]*)"/g;
        let m;
        while ((m = attrRegex.exec(html)) !== null) {
            const val = m[1];
            
            // Пропускаем внешние ссылки и плейсхолдеры
            if (!val || val.startsWith('http://') || val.startsWith('https://') || 
                val.startsWith('#') || val.startsWith('data:') || val.startsWith('mailto:') || 
                val.startsWith('${')) {
                continue;
            }

            // Нормализация пути
            let path = val;
            if (path.startsWith('./')) path = path.substring(2);
            if (path.startsWith('/')) path = path.substring(1);
            
            // Убираем query и fragment
            const qIndex = path.indexOf('?');
            if (qIndex !== -1) path = path.substring(0, qIndex);
            const hIndex = path.indexOf('#');
            if (hIndex !== -1) path = path.substring(0, hIndex);

            if (!path) continue;

            if (site === 'sources.html') sourcesCheckedCount++;

            // Проверка существования файла в корне или в dist (через vite.config.js)
            const fileExists = existsSync(new URL(path, root));
            const viteCopies = read('vite.config.js').includes("'dist/" + path + "'");

            if (!fileExists && !viteCopies) {
                missing.push(site + ': ' + val);
            }
        }
    }

    assert.ok(sourcesCheckedCount >= 2, 'В sources.html должно быть проверено минимум 2 относительные ссылки');
    assert.deepEqual(missing, [], 'Отсутствующие файлы: ' + missing.join(', '));
});

test('v24 п.3: тексты MIT для react, react-dom, scheduler дословно в THIRD_PARTY_LICENSES.md, файл копируется в собранный сайт и есть ссылка из справки', () => {
    const lic = read('THIRD_PARTY_LICENSES.md').replace(/\r\n/g, '\n');
    const packages = ['react', 'react-dom', 'scheduler'];

    for (const pkg of packages) {
        const p = new URL('node_modules/' + pkg + '/LICENSE', root);
        if (existsSync(p)) {
            const text = readFileSync(p, 'utf8').replace(/\r\n/g, '\n').trim();
            assert.ok(lic.includes(text), `Лицензия для ${pkg} не найдена дословно в THIRD_PARTY_LICENSES.md`);
        }
    }

    // Проверка заголовков и авторских прав
    assert.ok(lic.includes('### 3. react'), 'Отсутствует заголовок ### 3. react');
    assert.ok(lic.includes('### 4. react-dom'), 'Отсутствует заголовок ### 4. react-dom');
    assert.ok(lic.includes('### 5. scheduler'), 'Отсутствует заголовок ### 5. scheduler');
    
    const copyrightCount = lic.split('Copyright (c) Meta Platforms, Inc. and affiliates.').length - 1;
    assert.ok(copyrightCount >= 3, `Ожидалось >= 3 упоминания Copyright Meta, найдено ${copyrightCount}`);

    // Копирование файла в dist проверяет предыдущий тест: адрес ссылки из sources.html обязан быть среди cpSync в vite.config.js
    // Проверка ссылки в sources.html
    assert.match(read('sources.html'), /<a href="THIRD_PARTY_LICENSES\.txt">/, 'Отсутствует ссылка на THIRD_PARTY_LICENSES.txt в sources.html');
});

test('v24 п.6: README описывает, как сайт попадает в docs/ для GitHub Pages', () => {
    const md = read('README.md');
    for (const part of ['`docs/`', 'npm run build', '`dist/`', '`.nojekyll`', 'GitHub Pages']) assert.ok(md.includes(part), part);
});

test('v24 п.2: начальное состояние формы — вид продукта не выбран, расчёт не выполняется, норматив сухого молока (500 Бк/кг) не применяется', () => {
    const ch = listChoices(data);
    let raw = setField(initialRaw(ch), ch, 'product', 'Молоко');
    raw = { ...raw, age: 'adult', nuclides: [{ ...raw.nuclides[0], nuclide: 'Cs-137', measured: '100' }] };

    // Начальное состояние
    assert.equal(raw.measuredForm, '', 'Начальное measuredForm должно быть пустым');
    assert.equal(raw.foodGroup, 'milk', 'Начальная foodGroup должна быть milk');

    // Расчёт без выбора вида продукта
    const r0 = computeScenario(data, toInput(raw, ch));
    assert.equal(r0.ok, false, 'Расчёт без measuredForm должен быть невалидным');
    assert.ok(r0.errors.join(' ').includes(T.FORM_STATE_REQUIRED), 'Ошибка должна содержать T.FORM_STATE_REQUIRED');
    assert.equal((r0.limits?.ru ?? []).length, 0, 'В невалидном расчёте не должно быть нормативов');

    // Расчёт для свежего молока
    const r1 = computeScenario(data, toInput(setField(raw, ch, 'measuredForm', 'fresh'), ch));
    assert.equal(r1.ok, true, 'Расчёт для свежего молока должен быть валидным');
    assert.ok(r1.limits.ru.length >= 1, 'Должен быть хотя бы один норматив');
    assert.equal(r1.limits.ru[0].H, 100, 'Норматив для свежего молока должен быть 100');
    assert.equal(r1.limits.ru[0].dryNorm, false, 'Норматив не должен быть помечен как dryNorm');
    assert.ok(!r1.limits.ru.some(l => l.H === 500), 'Норматив 500 Бк/кг не должен применяться к свежему молоку');

    // Расчёт для сухого молока без коэффициента K
    const r2 = computeScenario(data, toInput(setField(setField(raw, ch, 'measuredForm', 'dried'), ch, 'dryingFactor', ''), ch));
    assert.equal(r2.ok, false, 'Расчёт для сухого молока без dryingFactor должен быть невалидным');
});
