// #FR-73: вкладка «Сравнение» — доза от продукта рядом с другими источниками облучения (схема: audit/risk-comparison-design-2026-10-04.md)
// #FR-78: строка «фон на улице» (из data-src/compare.yaml, id bg_street) идёт сразу после природного фона; в подсказке — состав «мира 2,4»
// #FR-74: поля ввода над таблицей; строки «фон в вашем жилище (без радона)» и «радон в вашем жилище» после природного фона; колонки доли фона нет
import { fmtNum, fmtDose, fmtTimes } from '../ui/fmt.js';
import { T, fill } from '../ui/texts_v.js';
import { withRadon, withDwelling, startAge, productRatios } from '../calc/compare.js';
import { radonRisk } from '../vendor/radon_risk/radonRisk.mjs';
import { yearsWord, sourceFull } from '../ui/render.js';
import { DataTable } from './Result.jsx';

const barPos = (sv) => sv > 0 ? Math.max(0, Math.min(100, (Math.log10(sv * 1e3) + 3) / 6 * 100)) : 0;
const p3 = (x) => (x * 100).toLocaleString('ru-RU', { maximumSignificantDigits: 3 });
const BASE_SOURCES = ['ICRP103_ru', 'HPS_PS010', 'UNSCEAR2008']; // #FR-81 V09: МНИОИ (заболеваемость) убран вместе с 0,1695

export default function Compare({ comparison, input, radonC, setRadonC, dwellU, setDwellU }) {
  if (!comparison) return null;
  const H = comparison.horizonYears;
  const okC = Number.isFinite(radonC) && radonC >= 1 && radonC <= 10000;
  const okU = Number.isFinite(dwellU) && dwellU > 0 && dwellU <= 100;
  const ra = (C, smoking) => radonRisk({ C, years: H, ageStart: startAge(input), smoking });
  const home = okC ? ra(radonC, 'never') : null;
  const homeS = okC ? ra(radonC, 'smoker') : null;
  let cmp = okU ? withDwelling(comparison, dwellU, comparison.riskCoeff, `Фон в вашем жилище (без радона), ${fmtNum(dwellU, 3)} мкЗв/ч, ${comparison.dwell?.hours} ч/год в помещении`) : comparison;
  if (home) cmp = withRadon(cmp, home, comparison.riskCoeff, `Радон в вашем жилище, ОА ${radonC} Бк/м³, ${home.input.hoursPerYear} ч/год в помещении`, 'radon_home');
  const { scenarioSv, multi, rows, equivalents: q, equivalents1: q1, oneYearSv, natural } = cmp;
  const span = input.lifetime ? `${input.lifetime.fromAge}–${input.lifetime.toAge} лет` : `${input.years} ${yearsWord(input.years)}`;
  const ratios = productRatios(cmp);
  const label = (r) => r.id === 'product' ? `Эффект за ${H} лет от питания этим продуктом` : r.label;
  const exposure = (r) => r.kind === 'single' ? 'разовое' : r.kind === 'horizon' ? `постоянно, ${H} лет` : `питание ${multi ? span : '1 год'}`;
  const me = (r) => r.kind === 'product' ? 'cmp-me' : '';
  const srcIds = [...new Set([...BASE_SOURCES, ...(home ? ['DARBY2005'] : []), ...rows.filter(r => r.source).map(r => r.source)])];
  return <>
    <p className="hint">{fill(T.CMP_INTRO, { H })}</p>
    <div className="cmp-inputs">
      <label>Мощность дозы в вашем жилище, мкЗв/ч<input type="number" min="0" max="100" step="any" placeholder="показание дозиметра" value={Number.isFinite(dwellU) ? dwellU : ''} onChange={e => setDwellU(e.target.valueAsNumber)} /></label>
      <label>Объёмная активность (ОА) радона-222 в вашем жилище, Бк/м³<input type="number" min="1" max="10000" step="any" value={Number.isFinite(radonC) ? radonC : ''} onChange={e => setRadonC(e.target.valueAsNumber)} /></label>
    </div>
    {Number.isFinite(dwellU) && !okU && <p className="msg warn">Строка «фон в вашем жилище» не показана: введите мощность дозы больше 0 и не более 100 мкЗв/ч.</p>}
    {!okC && <p className="msg warn">Строка «радон в вашем жилище» не показана: введите ОА радона-222 от 1 до 10000 Бк/м³.</p>}
    {home && home.warnings.length > 0 && <p className="msg warn">{home.warnings.join(' ')}</p>}
    {/* #FR-81 D11: эквиваленты — за 1 год питания и за весь срок */}
    {scenarioSv > 0 && [multi && [`За 1 год питания: `, oneYearSv, q1], [multi ? `За ${span} питания: ` : '', scenarioSv, q]].filter(Boolean).map(([t, sv, e]) => <p className="cmp-eq" key={t}>{t}<b>{fmtDose(sv)}</b> ≈ {fmtNum(e.bgDays, 2)} дн. природного фона{e.chestXrays != null && <> ≈ {fmtNum(e.chestXrays, 2)} рентгеновского снимка грудной клетки</>}{e.flightHours != null && <> ≈ {fmtNum(e.flightHours, 2)} ч полёта на самолёте</>}</p>)}
    {natural.length > 0 && <p className="hint">В продукте есть природные нуклиды ({natural.join(', ')}): они уже входят в природный фон, поэтому дозу продукта читайте как верхнюю оценку.</p>}
    <DataTable rows={rows} cols={[
      { h: 'Источник облучения', f: r => r.source ? <span title={r.loc || undefined}>{label(r)}</span> : <b>{label(r)}</b>, c: me },
      { h: 'Облучение', f: exposure, c: me },
      { h: 'Доза', f: r => fmtDose(r.doseSv), c: r => 'num ' + me(r) },
      ...(ratios ? [{ h: 'Во сколько раз больше дозы от продукта', f: r => r.kind === 'product' ? '—' : fmtTimes(ratios[r.id]), c: r => 'num ' + me(r) }] : []),
      { h: 'Шкала (логарифмическая)', f: r => <span className="cmpbar"><i style={{ width: `${barPos(r.doseSv)}%` }} /></span>, c: me }
    ]} />
    <p className="hint">Доза и риск относятся к условному человеку и служат для сравнения, это не прогноз для конкретного человека (МКРЗ 103, резюме, п. (j)). Внешнее и внутреннее облучение сравнимы по эффективной дозе (МКРЗ 103); внутренняя доза от продукта набирается постепенно после поступления, а снимки, томография и перелёт — разово. Природный фон — среднее по миру, 2,4 мЗв в год (НКДАР ООН, по обзору ВОЗ 2006): сумма космического излучения (0,39), внешнего облучения от земли (0,48), радона и торона (1,25) и пищи с водой (0,29), посчитанная для смеси 80 % времени в помещении (радон 40 Бк/м³) и 20 % на улице (радон 10 Бк/м³), а не уровень на улице; строка «фон на улице» (1760 ч в год: внешнее облучение 0,07 мЗв и радон-222 при ОА 10 Бк/м³ 0,095 мЗв, около 0,165 мЗв в год; торон 0,01 мЗв, космическое и внутреннее облучение в неё не входят) вместе со строкой жилища показывает вклад жилища; дозы медицинских процедур и перелёта — типичные. Фон в вашем жилище — показание дозиметра (мкЗв/ч, амбиентный эквивалент дозы) принимается за эффективную дозу (МУК 2.6.1.1088-02) при 7000 ч в год в помещении (НКДАР ООН 2000); в нём излучение стройматериалов, грунта и космическое, радона в нём нет; показание берётся целиком, без вычета собственного фона прибора и космического излучения, поэтому это верхняя оценка. Строки «природный фон, среднее по миру», «фон на улице» и «фон в вашем жилище» — разные опорные величины, их не складывают.</p>
    <p className="hint">{T.CMP_NOT_NORMED}</p>
    <p className="hint">{T.CMP_OTHER_RISKS}</p>
    {home && homeS && <p className="hint">Радон по эпидемиологии (отдельная величина, с дозой не складывается; оценка порядка величины): добавка к риску смерти от рака лёгкого к 75 годам при ОА радона {radonC} Бк/м³ за {home.yearsEff} {yearsWord(home.yearsEff)} — у некурящего {p3(home.darby.excess)} % (с {p3(home.darby.baselineBy75)} до {p3(home.darby.withRadonBy75)} %), у курящего {p3(homeS.darby.excess)} % (с {p3(homeS.darby.baselineBy75)} до {p3(homeS.darby.withRadonBy75)} %) — Darby и др., BMJ 2005; базовые риски по данным США, а у них облучение пожизненное: пересчёт на {home.yearsEff} {yearsWord(home.yearsEff)} пропорционально — допущение автора модуля, не результат исследования. Доза от радона в таблице — по коэффициенту 10 мЗв на WLM (МКРЗ 137) при 7000 ч в год в помещении и факторе равновесия 0,4 (по МКРЗ 126 и НКДАР ООН); он примерно вдвое выше коэффициента, на котором основан средний фон НКДАР ООН, поэтому строки радона и фона не складываются.</p>}
    <p className="hint">Источники опорных значений: {srcIds.map((s, i) => <span key={s}>{i > 0 && '; '}<span dangerouslySetInnerHTML={{ __html: sourceFull(s) }} /></span>)}.</p>
  </>;
}
