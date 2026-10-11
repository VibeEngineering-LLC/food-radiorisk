// #FR-81 V15 (D-022): строки главного экрана одной функцией — для экрана (Summary.jsx) и отчёта (report.js)
import { T, fill, plural, WORDS, nuclideRu, ageWord, deathsPhrase, yearsGen } from './texts_v.js';
import { fmtNum, fmtNear, fmtBpm, fmtPerMillion, riskOverOne, fmtCount, fmtDose, fmtPct2, verdictText } from './fmt.js'; // #FR-99: одна величина — одно округление на экране (fmtDose, 3 значащие), не fmtDose2
import { unitRu } from './ru.js';
import { regionName } from './region_notes.js';
import { dietSummaryText } from '../calc/diet.js';
import { yearsWord } from './render.js';

export function summaryParts(result, input) {
  const totals = result.totals;

  // Заголовок: диапазон возраста или срок в годах
  const head = input.lifetime
    ? fill(T.MAIN_HEAD_RANGE, { a: input.lifetime.fromAge, b: input.lifetime.toAge })
    : fill(T.MAIN_HEAD, { span: `${input.years} ${yearsWord(input.years)}` });

  // Только природные нуклиды: главного числа и словесной оценки нет, блоки B и C считаются как обычно
  const natural = totals.riskNominal === null;

  // Эквиваленты (A5)
  const e = result.comparison?.equivalents;
  let equiv = null;
  if (!natural && e && Number.isFinite(e.bgDays) && e.bgDays > 0) {
    const d = fmtNum(e.bgDays, 2);
    const days = `${d} ${plural(d, WORDS.day)}`;
    const parts = [];
    if (e.chestXrays != null) {
      const x = fmtNum(e.chestXrays, 2);
      parts.push(fill(T.EQUIV_TAIL_XRAY, { xrays: `${x} ${plural(x, WORDS.xray)}` }));
    }
    if (e.flightHours != null) {
      const h = fmtNum(e.flightHours, 2);
      parts.push(fill(T.EQUIV_TAIL_FLIGHT, { hours: `${h} ${plural(h, WORDS.hour)}` }));
    }
    const tail = parts.length === 2 ? `, ${parts[0]} или ${parts[1]}` : parts.length === 1 ? ` или ${parts[0]}` : '';
    equiv = fill(T.EQUIV, { days, tail });
  }

  // Словесная оценка (A6)
  let verbal = null;
  if (totals.doseClass != null) {
    let which;
    if (totals.doseMaxYearUniform) {
      which = T.VERBAL_WHICH_UNIFORM;
    } else if (totals.doseMaxYearAge != null) {
      which = fill(T.VERBAL_WHICH_YEAR_AGE, { i: totals.doseMaxYearIndex, a1: totals.doseMaxYearAge, a2: totals.doseMaxYearAge + 1 });
    } else {
      which = fill(T.VERBAL_WHICH_YEAR, { i: totals.doseMaxYearIndex });
    }
    const prefix = fill(T.VERBAL_PREFIX, { E: fmtDose(totals.doseMaxYearTech), which });
    let clsText;
    if (totals.doseClass === 'c1') clsText = T.VERBAL_C1;
    else if (totals.doseClass === 'c2') clsText = T.VERBAL_C2;
    else clsText = totals.doseMaxYearTech > 5e-3 ? T.VERBAL_C3_OVER5 : T.VERBAL_C3;
    verbal = `${prefix} ${clsText}`;
  }

  // Оговорки (A7)
  const hasInfant = result.rows.some(r => r.yearly.some(y => y.band === '3m'));
  const notes = natural ? [] : [T.AGE_CAVEAT, T.LNT_CAVEAT];
  if (!natural && hasInfant) notes.push(T.INFANT_NOTE);
  if (result.diet) notes.unshift(dietSummaryText(result.diet)); // #FR-83 W08: расчёт для стандартного потребления — первой строкой, в том числе для природных нуклидов

  // Фон (A4)
  const termPhrase = input.lifetime ? `с ${input.lifetime.fromAge} до ${input.lifetime.toAge} лет` : `в течение ${input.years} ${yearsGen(input.years)}`; // #FR-123: срок со склонением
  let background = null;
  if (!natural && !riskOverOne(totals.riskNominal) && result.background && Number.isFinite(result.background.F)) {
    const { a, F, year } = result.background;
    background = fill(T.BG_CANCER, {
      who: a >= 18 ? 'человек' : 'детей',
      age: a,
      yearsWord: ageWord(a),
      horizon: a > 0 ? 'всю оставшуюся жизнь (без ограничения возрастом 70 лет)' : 'всю жизнь', // #FR-99 (Б-3): срок назван явно — не путать с диаграммой «с a до 70 лет»
      F: fmtCount(1e6 * F),
      src: ` (${regionName(input.region)}, ${year} г.)`, // #FR-101: фон — по таблице дожития выбранного региона
      // #FR-123: единица названа («смерти от рака»), число людей — целым с «около», точное значение «N на 1 000 000» в скобках; «меньше одной смерти», если меньше единицы
      k: result.eating && result.eating.ok ? fill(T.BG_CANCER_TERM, { k: deathsPhrase(totals.riskNominal, fmtCount, fmtPerMillion), term: termPhrase }) : deathsPhrase(totals.riskNominal, fmtCount, fmtPerMillion),
    });
  }

  // Блок B: соответствие нормам
  const limits = result.limits || {};
  const c = limits.compliance;
  const ru = (limits.ru || []).filter(l => l.limitId);
  const state = input.product?.state;

  // Класс рамки по вердикту (только для неготовой продукции)
  let cls = '';
  if (state !== 'cooked' && c) {
    cls = { conforms: 'risk-negligible', undetermined: 'risk-within', nonconforms: 'risk-exceeds' }[c.verdict] || '';
  }

  let verdictLines = [];
  if (state === 'cooked') {
    verdictLines.push({ kind: 'plain', text: T.VERDICT_COOKED });
  } else if (!input.foodGroupCode && limits.ruNone) {
    verdictLines.push({ kind: 'plain', text: limits.intervention ? T.VERDICT_UV : fill(T.VERDICT_NO_RU_NORM, { entry: limits.productName }) }); // #FR-85 v11; v14 п. 7: вода из колодца
  } else if (!input.foodGroupCode) {
    verdictLines.push({ kind: 'plain', text: T.VERDICT_NOGROUP });
  } else if (limits.formNote?.kind === 'no_k') {
    verdictLines.push({ kind: 'plain', text: T.VERDICT_NO_K }); // V10: сушёный без своего норматива и без K
  } else if (!c) {
    verdictLines.push({ kind: 'plain', text: fill(T.VERDICT_HEAD, { verdict: 'не оценивается' }) });
  } else {
    verdictLines.push({ kind: 'head', text: fill(T.VERDICT_HEAD, { verdict: verdictText(c.verdict) }) });
    if (ru.length > 0) {
      const rawGroup = ru[0].groupRu;
      const group = rawGroup.split(' (')[0].toLowerCase();
      const norms = ru.map(l => `${nuclideRu(l.nuclide)} — ${fmtNum(l.H)} ${unitRu(l.unit)}`).join(', ');
      const meas = ru.map(l => fmtNum(l.activity)).join(' и ') + ' ' + unitRu(ru[0].unit);
      verdictLines.push({ kind: 'plain', text: fill(T.VERDICT_B, { B: fmtBpm(c.B, c.dB), group, norms, meas }) });
      if (limits.productCaption) verdictLines.push({ kind: 'plain', text: fill(T.VERDICT_CAPTION, { entry: limits.productName, caption: limits.productCaption }) }); // #FR-85 v17 (B4-1)
      const conv = limits.formNote?.kind === 'converted' ? limits.formNote : null; // V10: пересчёт сушёного на сырьё
      if (conv) verdictLines.push({ kind: 'plain', text: fill(T.VERDICT_CONVERTED, { K: fmtNum(conv.K), items: conv.items.map(i => fill(T.VERDICT_CONVERTED_ITEM, { nuclide: nuclideRu(i.nuclide), aDry: fmtNum(i.aDry), K: fmtNum(conv.K), aRaw: fmtNum(i.aRaw) })).join('; ') }) });
    }
    if (c.precisionOk === false) {
      verdictLines.push({ kind: 'warn', text: T.VERDICT_PRECISION });
    }
  }

  // Блок C: доза и нормы
  let doseLines = [];
  if (totals.doseMaxYearTech === null) {
    doseLines.push(fill(T.DOSE_NATURAL_ONLY, { list: totals.naturalNuclides.join(', ') }));
  } else {
    // Примечание к году максимума
    let note;
    if (totals.doseMaxYearUniform && result.period.years > 1) {
      note = T.DOSE_MAXYEAR_UNIFORM;
    } else if (totals.doseMaxYearUniform) {
      note = '';
    } else if (totals.doseMaxYearAge != null) {
      note = ` (${totals.doseMaxYearIndex}-й год, возраст ${totals.doseMaxYearAge}–${totals.doseMaxYearAge + 1} лет)`;
    } else {
      note = ` (${totals.doseMaxYearIndex}-й год)`;
    }

    doseLines.push(fill(T.DOSE_MAXYEAR, { E: fmtDose(totals.doseMaxYearTech), note, p: fmtPct2(totals.budgetShareMaxYear) }));
    doseLines.push(fill(T.DOSE_NEGL, { E: fmtDose(totals.doseMaxYearTech) }));
    doseLines.push(fill(T.DOSE_TOTAL, { E_N: fmtDose(totals.techDoseSvTotal), w: fmtPct2(totals.lifeShare70mSv) }));
  }

  // #FR-117: два числа — риск за введённый срок (подписан точно) и риск, если питаться так всю жизнь (режим «с a до a+H» той же модели)
  const eat = result.eating;
  const termLabel = natural ? null : fill(T.EAT_TERM_LABEL, { term: termPhrase, horizon: input.age === 'adult' ? '50 лет' : 'до 70 лет возраста' });
  const lifeVars = eat ? { H: eat.H, years: yearsGen(eat.H), a: eat.fromAge, b: eat.toAge } : null;
  const life = natural || !eat ? null : {
    head: fill(T.EAT_LIFE_HEAD, lifeVars),
    number: eat.ok ? (riskOverOne(eat.riskNominal) ? T.MAIN_NUMBER_OVER : fill(T.MAIN_NUMBER, { k: fmtPerMillion(eat.riskNominal) })) : null,
    unavailable: eat.ok ? null : fill(T.EAT_LIFE_UNAVAIL, { reason: eat.reason }),
    cap: fill(T.EAT_CAP_LIFE, lifeVars),
  };
  // #FR-123: одна фраза «Для сравнения …» с обоими числами (вместо двух отдельных предложений)
  if (life && eat.ok && background && !riskOverOne(eat.riskNominal)) {
    const kk = eat.riskNominal * 1e6, n = fmtCount(kk);
    const k2 = Number(kk.toPrecision(2)) < 1 ? 'меньше одной смерти' : `около ${n}`;
    background = background.replace(/\.$/, fill(T.BG_CANCER_AND_LIFE, { k2, H: eat.H, years: yearsGen(eat.H) }));
  }
  const termCap = fill(T.EAT_CAP_TERM, { term: termPhrase });
  const legend = eat && eat.ok ? { text: fill(T.EAT_LEG, { H: eat.H, years: yearsGen(eat.H), term: termPhrase }), life: fill(T.EAT_LEG_LIFE, { H: eat.H, years: yearsGen(eat.H) }), term: fill(T.EAT_LEG_TERM, { term: termPhrase }) } : null;
  return {
    termLabel, termCap, legend, headShort: T.RS_HEAD_SHORT, life,
    head,
    natural: natural ? fill(T.VERBAL_NATURAL, { list: totals.naturalNuclides.join(', ') }) : null,
    number: natural ? null : riskOverOne(totals.riskNominal) ? T.MAIN_NUMBER_OVER : fill(T.MAIN_NUMBER, { k: fmtPerMillion(totals.riskNominal) }),
    caption: natural ? null : T.MAIN_CAPTION,
    background,
    equiv,
    verbal,
    notes,
    link: T.LINK_NORMS,
    verdict: {
      cls,
      title: T.VERDICT_BOX,
      lines: verdictLines,
      sep: T.VERDICT_SEPARATE
    },
    dose: {
      head: T.DOSE_HEAD,
      lines: doseLines
    }
  };
}
