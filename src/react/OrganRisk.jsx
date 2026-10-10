// #FR-76: блок «Добавочный риск рака от продукта» на вкладке органов (EPA FGR 13, питание); риск не заменяет прогноз для конкретного человека
import { fmtSci, fmtDose, fmtNum, fmtPct } from '../ui/fmt.js';
import { sourceFull, yearsWord } from '../ui/render.js';
import { DataTable } from './Result.jsx';

export default function OrganRisk({ risk, input }) {
  if (!risk || risk.lifetime || !input) return null;
  const top = risk.sites[0];
  const name = input.product?.name?.trim();
  const what = name ? `продукта «${name}»` : 'этого продукта';
  const span = `${input.years} ${yearsWord(input.years)}`;
  const intakes = risk.byNuclide.map(b => `${b.nuclide} — ${fmtNum(b.intakeBq)} Бк`).join('; ');

  return <>
    <p className="cmp-eq"><b>Добавочный риск рака от {what}.</b> Срок питания этим продуктом — {span}. За этот срок с ним поступит: {intakes}. Ниже — добавочный пожизненный риск рака только от радионуклидов в этом продукте. Он прибавляется к обычному риску рака, который от продукта не зависит. По модели EPA (FGR 13): заболеть раком — <b>{fmtSci(risk.totalMorbidity, 2)}</b>, умереть от рака — <b>{fmtSci(risk.totalMortality, 2)}</b>.{risk.nominal != null && <> Для сравнения, номинальный риск смерти по эффективной дозе (коэффициент 0,05 на Зв) — {fmtSci(risk.nominal, 2)}. Модель EPA — проверка согласия двух моделей, а не независимая оценка: обе опираются на одни и те же данные и допущения (линейная беспороговая модель, DDREF = 2).</>}</p>
    <DataTable rows={risk.sites} cols={[
      { h: 'Локализация', f: s => s.label },
      { h: 'Доза органа', f: s => s.organDose ? fmtDose(s.organDose.doseSv) : '—', c: () => 'num' },
      { h: 'Добавочный риск заболеть раком', f: s => fmtSci(s.morbidity, 2), c: () => 'num' },
      { h: 'Шкала (линейная, 100 % — локализация с наибольшим риском)', f: s => <span className="cmpbar"><i style={{ width: `${top && top.morbidity > 0 ? s.morbidity / top.morbidity * 100 : 0}%` }} /></span> },
      { h: 'Добавочный риск умереть от рака', f: s => fmtSci(s.mortality, 2), c: () => 'num' }
    ]} />
    <p className="hint">Доза органа — эквивалентная доза самого органа от этого же продукта за тот же срок, та же, что в таблице ниже; для толстой кишки, лёгких, пищевода и прочих органов доза взята по весам FGR 13 (табл. 7.4): толстая кишка — 0,568 · верхний отдел + 0,432 · нижний; пищевод — вилочковая железа; лёгкие и прочие органы — взвешенные средние по органам, названным в подписи.</p>
    {risk.byNuclide.length > 1 && <>
      <p className="cmp-eq"><b>Вклад нуклидов в добавочный риск заболеть.</b></p>
      <DataTable rows={risk.byNuclide} cols={[
        { h: 'Нуклид', f: b => b.nuclide },
        { h: 'Добавочный риск заболеть раком', f: b => fmtSci(b.morbidity, 2), c: () => 'num' },
        { h: 'Доля в суммарном риске', f: b => b.shareMorbidity != null ? fmtPct(b.shareMorbidity) : '—', c: () => 'num' }
      ]} />
    </>}
    {risk.missing.length > 0 && <p className="msg warn">Для {risk.missing.join(', ')} в наборе EPA коэффициентов риска для этого возраста нет, эти нуклиды в таблице не учтены.</p>}
    <p className="hint">Модель риска EPA (1994): линейная беспороговая, по данным выживших после атомных бомбардировок, коэффициент снижения риска при малой мощности дозы 2 (для молочной железы 1); для кости, кожи и щитовидной железы модель абсолютная, для остальных локализаций — относительная. Риск усреднён по полу. Из файла EPA взята полоса возраста поступления {risk.band.replace('-', '–')} лет, подобранная по возрастной группе калькулятора: это приближение, а трём месяцам и году соответствует одна и та же полоса 0–5 лет. Это сравнение порядков величины, а не прогноз для конкретного человека. Источник: <span dangerouslySetInnerHTML={{ __html: sourceFull('EPA_FGR13') }} />.</p>
  </>;
}
