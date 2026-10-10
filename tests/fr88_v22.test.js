// #FR-88 v22: дефекты браузерного прохода 5c2cd2f (D-2, D-3, D-4, D-7)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, inputFor } from './fr81_helpers.js';
import { computeScenario } from '../src/calc/model.js';
import { summaryParts } from '../src/ui/summary_text.js';
import { statusText } from '../src/ui/status.js';
import { fmtPerMillion } from '../src/ui/fmt.js';

const milk = (nuc, over = {}) => inputFor('milk_products', 'Молоко', nuc, over);

// Z113 (D-2): активность −5 при заполненной неопределённости — сообщение про активность, а не про неопределённость
test('D-2: отрицательная активность при заданной неопределённости — сообщение относится к полю активности', () => {
  const r = computeScenario(data, milk([['Cs-137', -5, -0.5]]));
  assert.equal(r.ok, false);
  const t = r.errors.join(' | ');
  assert.ok(/активност/.test(t), t);
  assert.ok(!/неопределённост/.test(t), t);
  // само поле неопределённости по-прежнему проверяется при верной активности
  const r2 = computeScenario(data, milk([['Cs-137', 50, -5]]));
  assert.ok(/неопределённост/.test(r2.errors.join(' | ')));
});

// Z114 (D-3): «из справочника» без выбранной записи — русское сообщение без служебного null
test('D-3: способ обработки «из справочника» без записи — понятное сообщение без «null»', () => {
  const r = computeScenario(data, milk([['Cs-137', 50]], { processing: { mode: 'record', recordId: null, variant: 'best' } }));
  assert.equal(r.ok, false);
  const t = r.errors.join(' | ');
  assert.ok(!/null|undefined/.test(t), t);
  assert.ok(/выберите запись|не выбрана/.test(t), t);
});

// Z115 (D-4): в сообщении об обработке — русское название записи, как в списке формы
test('D-4: сообщение об обработке называет продукт записи по-русски', () => {
  const rec = data.processing.find(r => r.food === 'Boletus edulis (dry weight)' && r.nuclide === 'Cs-137');
  assert.ok(rec, 'запись справочника');
  const r = computeScenario(data, milk([['Cs-137', 50]], { processing: { mode: 'record', recordIds: [rec.id, rec.id], variant: 'best' } }));
  const t = r.warnings.join(' | ') + ' | ' + (r.errors ?? []).join(' | ');
  assert.ok(!/Boletus/.test(t), t);
  assert.ok(/Белый гриб \(на сухую массу\)/.test(t), t);
});

// Z116 (D-7а): при дозе выше порога линейной беспороговой модели — предупреждение со ссылкой на МКРЗ-103; вероятность больше 1 не печатается числом
test('D-7: огромная активность — предупреждение о неприменимости ЛБМ, риск > 100 % числом не печатается', () => {
  const input = milk([['Cs-137', 99999999]], { portionKg: 10, portionsPerYear: 300 }); // 3000 кг в год: риск заведомо больше 1
  const r = computeScenario(data, input);
  assert.ok(r.ok);
  assert.ok(r.totals.riskNominal > 1);
  const w = r.warnings.join(' | ');
  assert.ok(/линейн\S* беспороговой модел\S* не применим/.test(w), w);
  assert.ok(/МКРЗ.{0,20}103/.test(w), w);
  assert.ok(/100 мЗв/.test(w), w);
  const sp = summaryParts(r, input);
  assert.ok(!/10⁷|\d{4,} ?\d{3}/.test(sp.number), sp.number);
  assert.ok(/больше 100 %/.test(sp.number), sp.number);
  const st = statusText({ result: r, input });
  assert.ok(/больше 100 %/.test(st), st);
  assert.ok(!/10⁷|\d{4,} ?\d{3} на 1 000 000/.test(st), st);
  assert.equal(fmtPerMillion(1.6), 'расчёт неприменим (вероятность больше 100 %)');
  // обычная доза: предупреждения нет, число печатается
  const okIn = milk([['Cs-137', 50]]);
  const ok = computeScenario(data, okIn);
  assert.ok(!/беспороговой/.test(ok.warnings.join(' | ')));
  assert.ok(/на 1 000 000/.test(summaryParts(ok, okIn).number));
});

// Z117 (D-7б): при вердикте «не соответствует» оговорка «вердикт «соответствует» неполон» не нужна и противоречит
test('D-7: предупреждение о неполноте B не говорит «соответствует неполон» при вердикте «не соответствует»', () => {
  const bad = computeScenario(data, milk([['Cs-137', 99999999]]));
  assert.equal(bad.limits.compliance.verdict, 'nonconforms');
  const wb = bad.warnings.filter(w => /B рассчитан не по всем/.test(w));
  assert.equal(wb.length, 1);
  assert.ok(!/«соответствует» неполон/.test(wb[0]), wb[0]);
  // при вердикте «соответствует» оговорка сохраняется
  const good = computeScenario(data, milk([['Cs-137', 5]]));
  assert.equal(good.limits.compliance.verdict, 'conforms');
  assert.ok(good.warnings.some(w => /«соответствует» неполон/.test(w)));
});
