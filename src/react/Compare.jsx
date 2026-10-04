// #FR-73: вкладка «Сравнение» — доза от продукта рядом с другими источниками облучения (схема: audit/risk-comparison-design-2026-10-04.md)
import { fmtNum, fmtSci, fmtDose, fmtPct } from '../ui/fmt.js';
import { withRadon, startAge } from '../calc/compare.js';
import { radonRisk } from '../vendor/radon_risk/radonRisk.mjs';
import { yearsWord, sourceFull } from '../ui/render.js';
import { DataTable } from './Result.jsx';

const barPos = (sv) => sv > 0 ? Math.max(0, Math.min(100, (Math.log10(sv * 1e3) + 3) / 6 * 100)) : 0;
const pct = (frac, add) => (frac * 100).toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: Math.max(1, Math.min(8, Math.ceil(-Math.log10(add * 100)))) });
const p3 = (x) => (x * 100).toLocaleString('ru-RU', { maximumSignificantDigits: 3 });
const BASE_SOURCES = ['ICRP103_ru', 'MNIOI2023', 'HPS_PS010'];

export default function Compare({ comparison, input, radonC, setRadonC }) {
  if (!comparison) return null;
  const H = comparison.horizonYears;
  const okC = Number.isFinite(radonC) && radonC >= 1 && radonC <= 10000;
  const ra = (C, smoking) => radonRisk({ C, years: H, ageStart: startAge(input), smoking });
  const home = okC ? ra(radonC, 'never') : null;
  const homeS = okC ? ra(radonC, 'smoker') : null;
  let cmp = withRadon(comparison, ra(40, 'never'), input.riskCoeffPerSv, 'Радон, мировое среднее 40 Бк/м³ (МКРЗ 137)', 'radon_world');
  if (home && radonC !== 40) cmp = withRadon(cmp, home, input.riskCoeffPerSv, `Радон дома, ${radonC} Бк/м³`, 'radon_home');
  const { scenarioSv, multi, rows, equivalents: q, cancer: k, natural } = cmp;
  const span = input.lifetime ? `${input.lifetime.fromAge}–${input.lifetime.toAge} лет` : `${input.years} ${yearsWord(input.years)}`;
  const label = (r) => r.id === 'product' ? `Этот продукт: ${multi ? span : '1 год'} питания` : r.id === 'product_horizon' ? `Этот продукт: питание все ${H} лет` : r.label;
  const exposure = (r) => r.kind === 'single' ? 'разовое' : r.kind === 'horizon' ? `постоянно, ${H} лет` : r.id === 'product_horizon' ? `${H} лет` : (multi ? span : '1 год');
  const me = (r) => r.kind === 'product' ? 'cmp-me' : '';
  const srcIds = [...new Set([...BASE_SOURCES, ...(home ? ['DARBY2005'] : []), ...rows.filter(r => r.source).map(r => r.source)])];
  return <>
    <p className="hint">Сравниваются дозы за горизонт ожидаемой дозы ({H} лет; взрослый — 50 лет, ребёнок — до 70 лет возраста, МКРЗ 103, прил. B, п. (f)): риск у всех источников облучения считается умножением дозы на один и тот же коэффициент, поэтому отношение рисков равно отношению доз.</p>
    {scenarioSv > 0 && <p className="cmp-eq"><b>{fmtDose(scenarioSv)}</b> ≈ {fmtNum(q.bgDays, 2)} дн. природного фона{q.chestXrays != null && <> ≈ {fmtNum(q.chestXrays, 2)} рентгеновского снимка грудной клетки</>}{q.flightHours != null && <> ≈ {fmtNum(q.flightHours, 2)} ч полёта на самолёте</>}</p>}
    <p className="cmp-radon"><label>Радон у вас дома, Бк/м³: <input type="number" min="1" max="10000" step="any" value={Number.isFinite(radonC) ? radonC : ''} onChange={e => setRadonC(e.target.valueAsNumber)} /></label></p>
    {!okC && <p className="msg warn">Строка «радон дома» не показана: введите концентрацию радона от 1 до 10000 Бк/м³.</p>}
    {home && home.warnings.length > 0 && <p className="msg warn">{home.warnings.join(' ')}</p>}
    {natural.length > 0 && <p className="hint">В продукте есть природные нуклиды ({natural.join(', ')}): они уже входят в природный фон и в фоновый риск, поэтому дозу продукта и добавку к риску рака читайте как верхнюю оценку.</p>}
    <DataTable rows={rows} cols={[
      { h: 'Источник облучения', f: r => r.source ? <span title={r.loc || undefined}>{label(r)}</span> : <b>{label(r)}</b>, c: me },
      { h: 'Облучение', f: exposure, c: me },
      { h: 'Доза', f: r => fmtDose(r.doseSv), c: r => 'num ' + me(r) },
      { h: 'Шкала (логарифмическая)', f: r => <span className="cmpbar"><i style={{ width: `${barPos(r.doseSv)}%` }} /></span>, c: me },
      { h: 'Риск, порядок величины', f: r => fmtSci(r.risk, 1), c: r => 'num ' + me(r) },
      { h: `Доля от природного фона за ${H} лет`, f: r => fmtPct(r.shareOfBackground), c: r => 'num ' + me(r) }
    ]} />
    {k && scenarioSv > 0 && <p className="cmp-cancer">Риск заболеть раком в возрасте 0–69 лет в России — {pct(k.baseline, k.addScenario)} %. С этим продуктом: <b>{pct(k.baseline + k.addScenario, k.addScenario)} %</b> (добавка {fmtSci(k.addScenario, 2)}). Для масштаба: на природный фон за {H} лет по той же формуле приходится {fmtNum(k.addBackground * 100, 2)} п. п. (процентного пункта), и они уже входят в фоновый риск.</p>}
    {k && <p className="hint">Добавка считается по коэффициенту заболеваемости {fmtNum(k.coeffPerSv * 100, 3)} % на 1 Зв (МКРЗ 103, табл. A.4.1: все раки, включая кожу, без наследственных эффектов), а не по коэффициенту вреда; фоновый риск — МНИОИ им. П.А. Герцена, возраст 0–69 лет, данные 2022 г. из издания 2023 г., при условии отсутствия других причин смерти, включает рак кожи (кроме меланомы), как и коэффициент. Такая добавка статистически не наблюдаема, не исключён и ноль; Общество физики здоровья США советует вообще не оценивать риск на уровне природного фона и ниже, поэтому читайте числа как сравнение порядков величины, а не как предсказание.</p>}
    <p className="hint">Доза и риск относятся к условному человеку и служат для сравнения, это не прогноз для конкретного человека (МКРЗ 103, резюме, п. (j)). Природный фон — среднее по миру с радоном, 2,4 мЗв в год (НКДАР ООН, по обзору ВОЗ 2006); дозы медицинских процедур и перелёта — типичные. С гибелью в ДТП, инфарктом и инсультом риск не сравнивается: отсроченный вред от облучения и немедленная смерть — разные величины.</p>
    {home && homeS && <p className="hint">Радон по эпидемиологии (отдельная величина, с дозой не складывается; оценка порядка величины): добавка к риску смерти от рака лёгкого к 75 годам при {radonC} Бк/м³ за {home.yearsEff} {yearsWord(home.yearsEff)} — у некурящего {p3(home.darby.excess)} % (с {p3(home.darby.baselineBy75)} до {p3(home.darby.withRadonBy75)} %), у курящего {p3(homeS.darby.excess)} % (с {p3(homeS.darby.baselineBy75)} до {p3(homeS.darby.withRadonBy75)} %) — Darby и др., BMJ 2005; базовые риски по данным США, а у них облучение пожизненное: пересчёт на {home.yearsEff} {yearsWord(home.yearsEff)} пропорционально — допущение автора модуля, не результат исследования. Доза от радона в таблице — по коэффициенту 10 мЗв на WLM (МКРЗ 137) при 7000 ч в год в помещении и факторе равновесия 0,4 (по МКРЗ 126 и НКДАР ООН); он примерно вдвое выше коэффициента, на котором основан средний фон НКДАР ООН, поэтому строки радона и фона не складываются.</p>}
    <p className="hint">Источники опорных значений: {srcIds.map((s, i) => <span key={s}>{i > 0 && '; '}<span dangerouslySetInnerHTML={{ __html: sourceFull(s) }} /></span>)}.</p>
  </>;
}
