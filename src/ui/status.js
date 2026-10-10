// #FR-81 V14 (D-022): строка состояния окна — итог расчёта и цвет значка; вынесено из App.jsx для проверки тестом
import { T, fill } from './texts_v.js';
import { fmtPerMillion, riskOverOne, fmtDose2, verdictText } from './fmt.js';
import { yearsWord } from './render.js';

export function statusText(calc) {
  if (!calc?.result) {
    return 'Загрузка данных…';
  }

  const { result, input } = calc;

  if (!result.ok) {
    return 'Расчёт не выполнен — исправьте ввод';
  }

  const v = input.product?.state === 'cooked' ? null : result.limits?.compliance?.verdict;
  const nuclides = result.rows.map(x => x.nuclide).join(', ');

  if (result.totals.riskNominal === null) {
    return `${nuclides} · только природные нуклиды: главное число и словесная оценка не считаются`;
  }

  const span = input.lifetime
    ? `с ${input.lifetime.fromAge} до ${input.lifetime.toAge} лет`
    : `за ${input.years} ${yearsWord(input.years)}`;

  return fill(riskOverOne(result.totals.riskNominal) ? T.STATUS_OVER : T.STATUS, {
    nuclides,
    k: fmtPerMillion(result.totals.riskNominal),
    span,
    E: fmtDose2(result.totals.doseMaxYearTech),
    verdict: v ? fill(T.STATUS_VERDICT, { verdict: verdictText(v) }) : ''
  });
}

export function statusLevel(calc) {
  if (calc?.error || (calc?.result && !calc.result.ok)) {
    return 'bad';
  }

  if (!calc?.result) {
    return '';
  }

  const { result, input } = calc;
  const v = input.product?.state === 'cooked' ? null : result.limits?.compliance?.verdict;

  const verdictRank = {
    conforms: 1,
    undetermined: 2,
    nonconforms: 3
  };

  const doseRank = {
    c1: 1,
    c2: 0,
    c3: 3
  };

  const rankV = v ? (verdictRank[v] ?? 0) : 0;
  const rankD = result.totals.doseClass ? (doseRank[result.totals.doseClass] ?? 0) : 0;

  const maxRank = Math.max(rankV, rankD);

  if (maxRank === 3) return 'bad';
  if (maxRank === 2) return 'warn';
  if (maxRank === 1) return 'ok';
  return '';
}
