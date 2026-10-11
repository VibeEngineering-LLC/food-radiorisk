import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderJsx } from './render_helper.js';
import { ch } from './render_scenario.js';
import { initialRaw } from '../src/react/formState.js';

// Рендерит форму для всех вкладок и возвращает объединённый HTML
async function formHtml() {
  const parts = [];
  for (let tab = 0; tab <= 4; tab++) {
    const html = await renderJsx('src/react/Form.jsx', 'default', {
      choices: ch,
      raw: initialRaw(ch, '2026-10-05'),
      setRaw() {},
      tab,
      setTab() {},
      onPreset() {},
      onExport() {}
    });
    parts.push(html);
  }
  return parts.join('\n');
}

test('FR-90: галочка и её текст внутри одного label, в одной строке', async () => {
  const html = await formHtml();
  const ids = ['includeY90', 'constAct', 'lifeMode'];
  for (const id of ids) {
    const re = new RegExp('<label[^>]*class="check"[^>]*>\\s*<input[^>]*id="' + id + '"[^>]*>([\\s\\S]*?)</label>');
    const m = html.match(re);
    assert.ok(m, `label.check с input id="${id}" не найден`);
    // Убираем теги и лишние пробелы, проверяем длину текста
    const text = m[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    assert.ok(text.length >= 10, `Текст label для "${id}" слишком короткий: "${text}"`);
  }
});

test('FR-90: поле даты начала питания имеет класс rdate и тип date', async () => {
  const html = await formHtml();
  // Проверяем наличие label с классом rdate и текстом
  assert.ok(html.includes('<label class="r3 rdate">Дата начала потребления'), 'label.rdate с текстом не найден');

  // Находим первый input после этого текста
  const idx = html.indexOf('<label class="r3 rdate">Дата начала потребления');
  const after = html.slice(idx);
  const inputMatch = after.match(/<input[^>]*>/);
  assert.ok(inputMatch, 'input не найден после label.rdate');
  const inputTag = inputMatch[0];
  assert.ok(inputTag.includes('id="eatDate"'), 'input не имеет id="eatDate"');
  assert.ok(inputTag.includes('type="date"'), 'input не имеет type="date"');
});

test('FR-90: CSS: галочка слева от текста, дата вмещается, узкий экран', () => {
  const css = readFileSync('src/ui/window.css', 'utf8');
  const styles = readFileSync('src/ui/styles.css', 'utf8');

  // Глобальное правило label с flex-direction: column (причина бага)
  const labelRuleIdx = styles.indexOf('\nlabel {');
  assert.ok(labelRuleIdx > -1, 'Правило label { не найдено в styles.css');
  const afterLabel = styles.slice(labelRuleIdx, labelRuleIdx + 120);
  assert.ok(afterLabel.includes('flex-direction: column'), 'flex-direction: column не найден в правиле label');

  // Правило fieldset.gbox label.check
  const checkRuleIdx = css.indexOf('fieldset.gbox label.check {');
  assert.ok(checkRuleIdx > -1, 'Правило fieldset.gbox label.check { не найдено');
  const checkRuleEnd = css.indexOf('}', checkRuleIdx);
  const checkRuleBody = css.slice(checkRuleIdx, checkRuleEnd);
  assert.ok(checkRuleBody.includes('display: flex'), 'display: flex не найден в правиле .check');
  assert.ok(checkRuleBody.includes('flex-direction: row'), 'flex-direction: row не найден в правиле .check');

  // Правило label.rdate с 11.5rem
  const rdateIdx = css.indexOf('label.rdate');
  assert.ok(rdateIdx > -1, 'Правило label.rdate не найдено');
  const rdateRuleEnd = css.indexOf('}', rdateIdx);
  const rdateRuleBody = css.slice(rdateIdx, rdateRuleEnd);
  assert.ok(rdateRuleBody.includes('11.5rem'), '11.5rem не найден в правиле label.rdate');

  // Медиа-запрос для узкого экрана
  const mediaIdx = css.indexOf('@media (max-width: 800px)');
  assert.ok(mediaIdx > -1, 'Медиа-запрос @media (max-width: 800px) не найден');
  const afterMedia = css.slice(mediaIdx);
  assert.ok(afterMedia.includes('label.rdate'), 'label.rdate не найден в медиа-запросе');
  assert.ok(afterMedia.includes('grid-template-columns: minmax(0, 1fr)'), 'grid-template-columns не найден в медиа-запросе');
});

test('FR-90: в форме нет других label.check вне списка обработки без привязки', async () => {
  const html = await formHtml();
  // Разбиваем на части по '<label' и проверяем каждый label.check
  const chunks = html.split('<label');
  for (const chunk of chunks) {
    // Проверяем, начинается ли чанк с class="check" (точно, не "check dis")
    if (chunk.startsWith(' class="check"') || chunk.startsWith('class="check"')) {
      // Находим конец этого label
      const labelEnd = chunk.indexOf('</label>');
      assert.ok(labelEnd > -1, 'Не найден закрывающий </label> для label.check');
      const labelContent = chunk.slice(0, labelEnd);
      assert.ok(labelContent.includes('type="checkbox"'), 'label.check не содержит input type="checkbox"');
    }
  }
});
