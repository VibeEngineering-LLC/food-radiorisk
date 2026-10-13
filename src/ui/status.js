// #FR-81 V14 (D-022): строка состояния окна — итог расчёта и цвет значка; вынесено из App.jsx для проверки тестом
import { T, fill } from './texts_v.js';
import { fmtPerMillion, riskOverOne, fmtDose, verdictText } from './fmt.js';
import { yearsWord } from './render.js';

export function statusText(calc) {
  if (!calc?.result) {
    return 'Загрузка данных…';
  }

  const { result, input } = calc;

  if (!result.ok) {
    const why = String(result.errors?.[0] ?? '').trim(); // v58 (TODO-5в): первая причина из плашки
    return why ? `Расчёт не выполнен — исправьте ввод: ${why}` : 'Расчёт не выполнен — исправьте ввод';
  }

  const v = input.product?.state === 'cooked' ? null : result.limits?.compliance?.verdict;
  const shown = result.rows.filter(x => x.nuclide !== 'Rn-222'); // v54: радон-222 в итог не входит
  const nuclides = (shown.length ? shown : result.rows).map(x => x.nuclide).join(', ');

  if (result.totals.riskNominal === null) {
    return `${nuclides} · только природные радионуклиды: основной результат и словесная оценка не рассчитываются`;
  }

  const span = input.lifetime
    ? `с ${input.lifetime.fromAge} до ${input.lifetime.toAge} лет`
    : `за ${input.years} ${yearsWord(input.years)}`;

  return fill(riskOverOne(result.totals.riskNominal) ? T.STATUS_OVER : T.STATUS, {
    nuclides,
    k: fmtPerMillion(result.totals.riskNominal),
    span,
    E: fmtDose(result.totals.doseMaxYearTech),
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
