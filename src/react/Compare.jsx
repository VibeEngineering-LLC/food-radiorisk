// #FR-73: вкладка «Сравнение» — доза от продукта рядом с другими источниками облучения (схема: audit/risk-comparison-design-2026-10-04.md)
// #FR-78: строка «фон на улице» (из data-src/compare.yaml, id bg_street) идёт сразу после природного фона; в подсказке — состав «мира 2,4»
// #FR-74: поля ввода над таблицей; строки «фон в вашем жилище (без радона)» и «радон в вашем жилище» после природного фона; колонки доли фона нет
import { fmtNum, fmtDose, fmtTimes, nb } from '../ui/fmt.js';
import { T, fill, plural, WORDS } from '../ui/texts_v.js';
import { withRadon, withDwelling, startAge, productRatios } from '../calc/compare.js';
import { radonRisk } from '../vendor/radon_risk/radonRisk.mjs';
import { yearsWord, sourceFull } from '../ui/render.js';
import { locRu } from '../ui/ru.js';
import { DataTable } from './Result.jsx';
import { DEFAULT_FLIGHT_PER_YEAR } from '../calc/summary_charts.js';
import { effectiveInputs } from '../calc/ext_inputs.js';
import { normRegion } from '../calc/region.js';
import { regionName, doseCaption, radonDefaultNote, dwellDefaultText, radonFNote } from '../ui/region_notes.js';
import RegionSwitch from './RegionSwitch.jsx';

// #FR-110 (D-030): шкала ЛИНЕЙНАЯ — ширина полосы ∝ дозе, максимум таблицы = 100 %; минимальная видимая полоска 2 px задаётся в CSS (min-width), пропорция в подписи не искажается
const barPos = (sv, max) => sv > 0 && max > 0 ? Math.min(100, sv / max * 100) : 0;
const p3 = (x) => (x * 100).toLocaleString('ru-RU', { maximumSignificantDigits: 3 });
const BASE_SOURCES = ['ICRP103_ru', 'HPS_PS010']; // #FR-81 V09: МНИОИ (заболеваемость) убран вместе с 0,1695; #FR-101: источник природного фона — из данных региона (rows и parts), не из этого списка

export default function Compare({ comparison, input, radonC: radonRaw, setRadonC, dwellU: dwellRaw, setDwellU, ctN, setCtN, xrayN, setXrayN, flightN, setFlightN, onRegion }) {
  if (!comparison) return null;
  const H = comparison.horizonYears;
  const region = normRegion(input.region);
  const ei = effectiveInputs(comparison.parts, { radonC: radonRaw, dwellU: dwellRaw, ctN, xrayN, flightN }); // #FR-101: введённое пользователем или умолчание региона
  const radonC = ei.radonC; // действующие значения
  const dwellU = ei.dwellU ?? NaN;
  const num = (v) => (Number.isFinite(v) ? v : ''); // поле показывает только введённое пользователем, умолчание — в подсказке поля (placeholder)
  const ph = (v) => (v == null ? '' : fmtNum(v, 4)); // #FR-104: подсказка поля — общим форматтером (десятичная запятая)
  const okC = Number.isFinite(radonC) && radonC >= 1 && radonC <= 10000;
  const okU = Number.isFinite(dwellU) && dwellU > 0 && dwellU <= 100;
  const rcs = Number.isFinite(radonC) ? String(radonC).replace('.', ',') : ''; // #FR-102: десятичная запятая в тексте (56,2, не 56.2)
  const adult = startAge(input) >= 18; // #FR-102: курящему ребёнку риск не показывается (как на «Сводке» и «Бытовых рисках»)
  const rF = comparison.parts?.radonF; // #FR-101 v41: F региона (мир 0,4; Россия 0,5)
  const ra = (C, smoking) => radonRisk({ C, years: H, ageStart: startAge(input), smoking, ...(Number.isFinite(rF) ? { F: rF } : {}) });
  const home = okC ? ra(radonC, 'never') : null;
  const homeS = okC ? ra(radonC, 'smoker') : null;
  let cmp = okU ? withDwelling(comparison, dwellU, comparison.riskCoeff, nb(`Фон в жилище (по показанию дозиметра, без радона), ${fmtNum(dwellU, 3)} мкЗв/ч, ${comparison.dwell?.hours} ч в год в помещении`)) : comparison;
  if (home) cmp = withRadon(cmp, home, comparison.riskCoeff, nb(`Радон в жилище (${rcs} Бк/м³, ${home.input.hoursPerYear} ч в год в помещении)`), 'radon_home');
  const { scenarioSv, multi, rows, equivalents: q, equivalents1: q1, oneYearSv, natural } = cmp;
  const span = input.lifetime ? `${input.lifetime.fromAge}–${input.lifetime.toAge} лет` : `${input.years} ${yearsWord(input.years)}`;
  const ratios = productRatios(cmp);
  const maxDose = Math.max(0, ...rows.map(r => r.doseSv).filter(Number.isFinite));
  const label = (r) => nb(r.id === 'product' ? `Доза за ${H} ${yearsWord(H)} от потребления этого продукта` : r.label);
  const exposure = (r) => r.kind === 'single' ? 'разовое' : r.kind === 'horizon' ? `постоянно, ${H} ${yearsWord(H)}` : `потребление ${multi ? span : '1 год'}`;
  const me = (r) => r.kind === 'product' ? 'cmp-me' : '';
  const srcIds = [...new Set([...BASE_SOURCES, ...(home ? ['DARBY2005'] : []), ...rows.filter(r => r.source).map(r => r.source), ...['naturalTotal', 'cosmic', 'terrestrial', 'radon', 'ingest', 'medicine', 'terrOutdoorSrc'].map(k => comparison.parts[k]?.source).filter(Boolean), ...(comparison.dwell?.hoursSrc?.source ? [comparison.dwell.hoursSrc.source] : [])])];
  const p = comparison.parts, fm = (x) => `${fmtNum(x.msv)} мЗв`; // #FR-101: описание природного фона — из данных региона
  const bgText = nb(`Природный фон — среднее региона «${regionName(region)}» (${doseCaption(region)}), ${fmtNum(p.naturalTotal.msv)} мЗв в год: космическое излучение (${fm(p.cosmic)}), внешнее облучение от земли и стройматериалов (${fm(p.terrestrial)}), радон и торон (${fm(p.radon)}), пища и вода (${fm(p.ingest)}) — это среднее по населению, а не уровень на улице.`);
  const flightsText = `${DEFAULT_FLIGHT_PER_YEAR} ${plural(String(DEFAULT_FLIGHT_PER_YEAR), WORDS.flight)}`; // #FR-124 (G4): «2 перелёта», а не «N перелёта» при любом N
  const hasStreet = rows.some(r => r.id === 'bg_street');
  return <>
    <RegionSwitch region={region} onRegion={onRegion} />
    <p className="hint" id="cmpCaption">{doseCaption(region)}</p>
    <p className="hint">{fill(T.CMP_INTRO, { H })}</p>
    <div className="cmp-inputs">
      <label>Мощность амбиентного эквивалента дозы H*(10) в жилище, мкЗв/ч<input id="dwellU" type="number" min="0" max="100" step="any" placeholder={ph(ei.dwellDefaultU) || 'показание дозиметра'} value={num(dwellRaw)} onChange={e => setDwellU(e.target.valueAsNumber)} /></label>
      <label>Объёмная активность радона-222 в жилище, Бк/м³<input id="radonC" type="number" min="1" max="10000" step="any" placeholder={ph(ei.defaults.radonC)} value={num(radonRaw)} onChange={e => setRadonC(e.target.valueAsNumber)} /></label>
      {/* #FR-101: частота КТ и рентгенографий для диаграммы (а) «Сводки»; общее состояние в Result.jsx; пусто — среднее на жителя региона */}
      <label>КТ в год<input id="ctN" type="number" min="0" max="365" step="any" placeholder={ph(ei.defaults.ctN)} value={num(ctN)} onChange={e => setCtN(e.target.valueAsNumber)} /></label>
      <label>Рентгенографий и флюорографий в год<input id="xrayN" type="number" min="0" max="365" step="any" placeholder={ph(ei.defaults.xrayN)} value={num(xrayN)} onChange={e => setXrayN(e.target.valueAsNumber)} /></label>
      <label>Перелётов по 3&nbsp;ч в год<input id="flightN" type="number" min="0" max="365" step="any" value={Number.isFinite(flightN) ? flightN : ''} onChange={e => setFlightN(e.target.valueAsNumber)} /></label>
    </div>
    <p className="hint" id="cmpFieldsHint">{fill(T.CMP_FIELDS_HINT, { region: regionName(region), U: dwellDefaultText(comparison.parts), C: fmtNum(ei.defaults.radonC), Csrc: radonDefaultNote(comparison.parts), ct: fmtNum(ei.defaults.ctN), x: fmtNum(ei.defaults.xrayN), f: flightsText })}</p>
    {Number.isFinite(dwellU) && !okU && <p className="msg warn">Строка «фон в жилище» не показана: введите мощность дозы больше 0 и не более 100&nbsp;мкЗв/ч.</p>}
    {!okC && <p className="msg warn">Строка «радон в жилище» не показана: введите объёмную активность радона-222 от 1 до 10&nbsp;000&nbsp;Бк/м³.</p>}
    {home && home.warnings.length > 0 && <p className="msg warn">{home.warnings.join(' ')}</p>}
    {/* #FR-81 D11: эквиваленты — за 1 год питания и за весь срок */}
    {scenarioSv > 0 && [multi && [`За 1 год потребления: `, oneYearSv, q1], [multi ? `За ${span} потребления: ` : '', scenarioSv, q]].filter(Boolean).map(([t, sv, e]) => <p className="cmp-eq" key={t}>{t}<b>{fmtDose(sv)}</b> ≈ {fmtNum(e.bgDays, 2)}&nbsp;дн. природного фона{e.chestXrays != null && <> ≈ {fmtNum(e.chestXrays, 2)} рентгеновского снимка грудной клетки</>}{e.flightHours != null && <> ≈ {fmtNum(e.flightHours, 2)}&nbsp;ч полёта на самолёте</>}</p>)}
    {natural.length > 0 && <p className="hint">В продукте есть природные радионуклиды ({natural.join(', ')}): они уже входят в природный фон, поэтому дозу от продукта следует рассматривать как верхнюю оценку.</p>}
    <DataTable className="cmp-table" rows={[...rows].sort((a, b) => a.doseSv - b.doseSv)} cols={[ // #FR-110 (D-030): строки по возрастанию дозы (все в Зв, единицы подписи не влияют)
      { h: 'Источник облучения', f: r => r.source ? <span title={locRu(r.loc) || undefined}>{label(r)}</span> : <b>{label(r)}</b>, c: me },
      { h: 'Облучение', f: exposure, c: me },
      { h: 'Эффективная доза', f: r => fmtDose(r.doseSv), c: r => 'num ' + me(r) },
      ...(ratios ? [{ h: 'Во сколько раз больше дозы от продукта', f: r => r.kind === 'product' ? '—' : fmtTimes(ratios[r.id]), c: r => 'num ' + me(r) }] : []),
      { h: 'Шкала (линейная)', f: r => <span className="cmpbar"><i style={{ width: `${barPos(r.doseSv, maxDose)}%` }} /></span>, c: me }
    ]} />
    <p className="hint">Доза и риск относятся к условному человеку и служат для сравнения, это не прогноз для конкретного человека (Международная комиссия по радиологической защите, МКРЗ, Публикация 103, резюме, п.&nbsp;(j)). Внешнее и внутреннее облучение сравнимы по эффективной дозе (МКРЗ 103); внутренняя доза от продукта формируется постепенно после поступления, а снимки, томография и перелёт — разово. {bgText}{hasStreet ? <> Строка «фон на улице» (1&nbsp;760&nbsp;ч в год: внешнее облучение 0,07&nbsp;мЗв и радон-222 при объёмной активности 10&nbsp;Бк/м³ — 0,095&nbsp;мЗв, около 0,165&nbsp;мЗв в год; торон — 0,01&nbsp;мЗв; космическое и внутреннее облучение в неё не входят; мировые оценки <abbr title="Научный комитет ООН по действию атомной радиации">НКДАР ООН</abbr> 2000 и 2008) вместе со строкой жилища показывает вклад жилища.</> : ''} Дозы медицинских процедур и перелёта — типичные. Фон в жилище — показание дозиметра (мощность амбиентного эквивалента дозы H*(10), мкЗв/ч) принимается за мощность эффективной дозы (методические указания МУК 2.6.1.1088-02) при 7&nbsp;000&nbsp;ч в год в помещении (НКДАР ООН 2000); в нём излучение стройматериалов, грунта и космическое, радона в нём нет; показание берётся целиком, без вычета собственного фона прибора и космического излучения, поэтому это верхняя оценка. {hasStreet ? 'Строки «природный фон», «фон на улице» и «фон в жилище» — разные опорные величины, их не складывают.' : 'Строки «природный фон» и «фон в жилище» — разные опорные величины, их не складывают.'}</p>
    <p className="hint">{T.CMP_NOT_NORMED}</p>
    <p className="hint">{T.CMP_OTHER_RISKS}</p>
    {home && homeS && <p className="hint">Радон по эпидемиологии (отдельная величина, с дозой не складывается; оценка порядка величины): добавка к риску смерти от рака лёгкого к 75 годам при объёмной активности радона {rcs}&nbsp;Бк/м³ за {home.yearsEff} {yearsWord(home.yearsEff)} — у некурящего {p3(home.darby.excess)}&nbsp;% (с {p3(home.darby.baselineBy75)} до {p3(home.darby.withRadonBy75)}&nbsp;%){adult ? <>, у курящего {p3(homeS.darby.excess)}&nbsp;% (с {p3(homeS.darby.baselineBy75)} до {p3(homeS.darby.withRadonBy75)}&nbsp;%)</> : null} — Darby и др., BMJ 2005; базовые риски по данным США, а у них облучение пожизненное: пересчёт на {home.yearsEff} {yearsWord(home.yearsEff)} пропорционально — допущение авторов модели, не результат исследования. Доза от радона в таблице — по коэффициенту 10&nbsp;мЗв на WLM (рабочий уровень в месяц; МКРЗ 137) при 7&nbsp;000&nbsp;ч в год в помещении и коэффициенте равновесия региона «{regionName(region)}»: {radonFNote(comparison.parts)}; он примерно вдвое выше коэффициента, на котором основан средний природный фон, поэтому строки радона и фона не складываются.</p>}
    <p className="hint">Источники опорных значений: {srcIds.map((s, i) => <span key={s}>{i > 0 && '; '}<span dangerouslySetInnerHTML={{ __html: sourceFull(s) }} /></span>)}.</p>
  </>;
}
