// #FR-107 v47: охранный тест выноски круговой диаграммы «Сводки» (без браузера): подпись целиком внутри ширины SVG (600), значение доли не режется
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/react/Pie.jsx', import.meta.url), 'utf8');

// Динамический импорт модуля выноски; если модуля нет — оставляем null, тесты упадут с понятным сообщением
let calloutLayout = null;
try {
  ({ calloutLayout } = await import('../src/react/pie_callout.js'));
} catch {
  /* модуля нет */
}

// Оценка ширины глифа как доли размера шрифта (совпадает с дефолтом модуля)
const CHAR_W = 0.62;
// Ширина SVG-канваса
const W = 600;

// Правая граница выноски: для anchor 'start' — x + ширина, для 'end' — x
function right(co, anchor) {
  const width = Math.max(...co.lines.map((line) => line.length * co.font * CHAR_W));
  return anchor === 'start' ? co.x + width : co.x;
}

// Левая граница выноски: для anchor 'start' — x, для 'end' — x - ширина
function left(co, anchor) {
  const width = Math.max(...co.lines.map((line) => line.length * co.font * CHAR_W));
  return anchor === 'start' ? co.x : co.x - width;
}

test('Pie.jsx строит выноску через calloutLayout (перенос строк), а не одной строкой text', () => {
  assert.match(src, /calloutLayout\(/);
  assert.match(src, /<tspan/);
  assert.doesNotMatch(src, /textAnchor=\{anchor\}[^>]*>\s*<title>\{tip\(s\)\}<\/title>\{text\}/);
});

test('длинное название у правого края (anchor start, x=496) целиком в [0, 600]', () => {
  assert.equal(typeof calloutLayout, 'function', 'calloutLayout должен быть функцией');
  const names = [
    'Черника дикорастущая (лесная)',
    'Черника дикорастущая (лесная) (Cs-137)',
    'Молоко',
    'Белый гриб',
    'Этот продукт: Черника дикорастущая (лесная) — рак от облучения',
  ];
  const pairs = [
    ['start', 496],
    ['start', 300],
    ['start', 470],
    ['end', 104],
    ['end', 300],
    ['end', 130],
  ];
  for (const name of names) {
    for (const [anchor, x] of pairs) {
      const co = calloutLayout({ label: name, share: '0,12 %', x, anchor, width: W });
      const l = left(co, anchor);
      const r = right(co, anchor);
      assert.ok(
        l >= 0 && r <= W,
        `Выноска выходит за границы [0, ${W}]: name="${name}", anchor=${anchor}, x=${x}, left=${l}, right=${r}`
      );
    }
  }
});

test('значение доли — отдельной неразрывной частью последней строки, строки не пустые', () => {
  assert.equal(typeof calloutLayout, 'function', 'calloutLayout должен быть функцией');
  const co = calloutLayout({
    label: 'Черника дикорастущая (лесная)',
    share: '12,5 %',
    anchor: 'start',
    x: 496,
    width: W,
  });
  const lines = co.lines;
  assert.ok(lines.length > 0, 'должна быть хотя бы одна строка');
  assert.ok(lines[lines.length - 1].endsWith('12,5 %'), 'последняя строка должна заканчиваться значением доли');
  for (const line of lines) {
    assert.ok(line.trim().length > 0, 'строка не должна быть пустой');
  }
  assert.equal(lines.join(' '), 'Черника дикорастущая (лесная): 12,5 %');
});

test('короткое название не переносится и не мельчает', () => {
  assert.equal(typeof calloutLayout, 'function', 'calloutLayout должен быть функцией');
  const co = calloutLayout({
    label: 'Молоко',
    share: '3 %',
    anchor: 'start',
    x: 300,
    width: W,
  });
  assert.equal(co.lines.length, 1, 'короткое название должно быть в одной строке');
  assert.equal(co.font, 15, 'шрифт должен быть 15');
  assert.equal(co.x, 300, 'x должен остаться 300');
});

test('длинное название у края переносится на несколько строк', () => {
  assert.equal(typeof calloutLayout, 'function', 'calloutLayout должен быть функцией');
  const co = calloutLayout({
    label: 'Черника дикорастущая (лесная)',
    share: '0,12 %',
    anchor: 'start',
    x: 496,
    width: W,
  });
  assert.ok(co.lines.length >= 2, 'длинное название должно переноситься на несколько строк');
});

test('шрифт не меньше 10 и не больше 15', () => {
  assert.equal(typeof calloutLayout, 'function', 'calloutLayout должен быть функцией');
  const co = calloutLayout({
    label: 'Черника дикорастущая (лесная)',
    share: '0,12 %',
    anchor: 'start',
    x: 496,
    width: W,
  });
  assert.ok(co.font >= 10 && co.font <= 15, `шрифт должен быть в диапазоне [10, 15], получен ${co.font}`);
});
