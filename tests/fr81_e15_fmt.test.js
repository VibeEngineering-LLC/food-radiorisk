// #FR-81 E15: форматтеры — единица по округлённому значению, 10⁶ научной записью, «млрд», дробные годы
import { fmtDose, fmtNum, fmtOneIn } from '../src/ui/fmt.js';
import { yearsWord } from '../src/ui/render.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('E15: fmtDose на границе единиц', () => {
    assert.equal(fmtDose(9.996e-4), '1 мЗв');
    assert.equal(fmtDose(0.9996), '1 Зв');
    assert.equal(fmtDose(5e-4), '500 мкЗв');
});

test('E15: fmtNum — 999999 при 5 значащих цифрах не «1 000 000»', () => {
    assert.equal(fmtNum(999999, 5), '1·10⁶');
    assert.equal(fmtNum(1e6), '1·10⁶');
    assert.equal(fmtNum(123456), '123 000');
});

test('E15: fmtOneIn — «млрд» и вероятность больше 1', () => {
    assert.equal(fmtOneIn(1e-10), '1 из 10 млрд');
    assert.equal(fmtOneIn(1e-6), '1 из 1 млн');
    assert.equal(fmtOneIn(1.5), '—');
});

test('E15: yearsWord — дробные сроки', () => {
    assert.equal(yearsWord(0.5), 'года');
    assert.equal(yearsWord(1.5), 'года');
    assert.equal(yearsWord(1), 'год');
    assert.equal(yearsWord(5), 'лет');
});
