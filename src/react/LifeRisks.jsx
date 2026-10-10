import { fmtPerMillion, fmtNum } from '../ui/fmt.js';
import { yearsWord } from '../ui/render.js';
import { T, fill, ageWord, timesVars } from '../ui/texts_v.js';
import { radonLungSub, radonSubShares } from '../calc/cancer_sub.js';
import { RISK_LABEL, riskLabel } from '../calc/summary_charts.js';
import { normRegion } from '../calc/region.js';
import { riskCaption } from '../ui/region_notes.js';
import RegionSwitch from './RegionSwitch.jsx';

export default function LifeRisks({ life, input, radonC = NaN, radonIsDefault = true, onRegion }) {
  // защита от отсутствующих данных
  if (!life || !input || !life.lifetime) return null;

  const lt = life.lifetime;
  const pname = String(life.productName || input.product?.name || '').trim(); // продукт из формы — в строке питания
  const n = lt.b - lt.a;

  // только конечные значения, сортировка по возрастанию (копия массива)
  const main = (lt.rows || [])
    .filter((r) => Number.isFinite(r.p))
    .slice()
    .sort((x, y) => x.p - y.p);

  // максимум для линейной шкалы
  const maxP = main.length ? Math.max(...main.map((r) => r.p)) : 0;

  // ширина полосы в процентах
  const pct = (p) => (maxP > 0 && p > 0 ? (p / maxP) * 100 : 0);
  const region = normRegion(input.region);
  const sub0 = Number.isFinite(radonC) ? radonLungSub(input, lt.H, radonC, lt.b) : null; // #FR-95/#FR-99: «в т. ч.» (радон, некурящий, на тот же срок) под «Новообразованиями», вне суммы
  const lungP = (lt.refs || []).find((r) => r.code === '1034')?.p;
  const cancerRow = main.find((r) => r.id === 'cs_1026');
  const shr = sub0 ? radonSubShares(sub0, Number.isFinite(lungP) ? lungP : cancerRow?.p, 1) : null; // громкая проверка: подсектор не больше смертей от рака лёгкого
  const sub = shr && !shr.bad ? sub0 : null;
  const origin = radonIsDefault ? 'по умолчанию' : 'по вашему вводу';

  return (
    <>
      {/* #FR-101: регион данных — переключатель и подпись региона и года */}
      <RegionSwitch region={region} onRegion={onRegion} />
      <p className="hint" id="lifeCaption">{riskCaption(region)}</p>
      {/* вводная строка */}
      <p className="hint">
        {fill(T.LIFE_INTRO, {
          H: lt.H,
          years: yearsWord(lt.H),
          a: lt.a,
          ageYears: ageWord(lt.a),
          b: lt.b,
          N: life.N,
          Nyears: yearsWord(life.N),
        })}
      </p>

      {/* предупреждение об ограничении */}
      {lt.capped && (
        <p className="msg warn">{fill(T.LIFE_CAPPED, { n, years: yearsWord(n) })}</p>
      )}

      {/* примечание о возрасте */}
      {!input.lifetime && input.age === 'adult' && (
        <p className="hint">{T.LIFE_AGE_NOTE}</p>
      )}

      {/* основная таблица */}
      <div className="tablewrap">
        <table className="life-table">
          <thead>
            <tr>
              <th>{T.LIFE_COL_CAUSE}</th>
              <th
                className="num"
                title="на 1 млн — на 1 000 000 человек"
              >
                {fill(lt.capped ? T.LIFE_COL_P_CAPPED : T.LIFE_COL_P, {
                  n,
                  years: yearsWord(n),
                })}
              </th>
              <th>{T.LIFE_COL_SCALE}</th>
            </tr>
          </thead>
          <tbody>
            {main.map((r) => [
              <tr key={r.id} className={r.kind === 'product' ? 'cmp-me' : undefined}>
                <td className="life-cause">
                  {r.kind === 'product' ? (
                    <b title={T.LIFE_PRODUCT}>{pname ? `Этот продукт: ${pname}` : 'Этот продукт'} — рак от облучения</b>
                  ) : (
                    <span title={RISK_LABEL[r.id]?.[1] ?? (r.kind === 'other' ? r.label : undefined)}>{riskLabel(r.id, r.label)}</span>
                  )}
                </td>
                <td className="num">{fmtPerMillion(r.p)}</td>
                <td className="life-bar">
                  <span className="cmpbar">
                    <i style={{ width: `${pct(r.p)}%`, minWidth: 0 }} />
                  </span>
                </td>
              </tr>,
              r.id === 'cs_1026' && sub ? (
                <tr key="sub_radon" className="life-sub" data-sub="radon">
                  <td className="life-cause">{fill(T.LIFE_SUB_RADON, { C: fmtNum(sub.C), origin })}</td>
                  <td className="num">{fill(T.LIFE_SUB_VALUE, { never: fmtPerMillion(sub.neverB) })}</td>
                  <td className="life-bar"></td>
                </tr>
              ) : null,
              (() => { // #FR-98: «в т. ч. от загрязнения воздуха» (набор «Россия»); величина не больше причины, иначе строка не показывается (предупреждение ниже)
                const g = lt.air?.groups?.find(x => x.parent === r.id);
                if (!g || !(g.p >= 0) || g.p + (r.id === 'cs_1026' && sub ? sub.neverB : 0) > r.p) return null;
                return <tr key={g.id} className="life-sub" data-sub={g.id}><td className="life-cause" title={g.hint}>{g.label}</td><td className="num">{fmtPerMillion(g.p)}</td><td className="life-bar"></td></tr>;
              })(),
            ])}
          </tbody>
        </table>
      </div>

      {/* справочные значения */}
      {lt.refs && lt.refs.length > 0 && (
        <>
          <h4 className="subhead">{T.LIFE_REFS_HEAD}</h4>
          <p className="hint">{T.LIFE_REF_NOTE}</p>
          <div className="tablewrap">
            <table className="life-table life-refs">
              <tbody>
                {lt.refs.map((r) => (
                  <tr key={r.id}>
                    <td title={RISK_LABEL[r.id]?.[1]}>{`${r.within ? 'в т. ч. ' : ''}${riskLabel(r.id, r.label)}`}</td>
                    <td className="num">{fmtPerMillion(r.p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* пояснения */}
      {lt.air ? <p className="hint" id="lifeAirNote">{fill(T.LIFE_AIR_NOTE, { year: lt.air.year, a: lt.a, b: lt.b })}</p> : null}
      {shr && shr.bad ? <p className="msg warn" id="lifeSubBad">{T.LIFE_SUB_BAD}</p> : null}
      {sub && sub.s >= 18 && Number.isFinite(sub.ratio) ? <p className="hint" id="lifeSubSmoke">{fill(T.LIFE_SUB_SMOKE_NOTE, timesVars(fmtNum(Math.round(sub.ratio))))}</p> : null}
      <p className="hint" id="lifeSubNote">{fill(T.LIFE_SUB_NOTE, { H: lt.H, years: yearsWord(lt.H), b: lt.b, overlap: lt.air ? 'радона, курения и загрязнения воздуха' : 'радона и курения' })}</p>
      <p className="hint">{T.LIFE_TIMING}</p>
      <p className="hint">{T.LIFE_PURPOSE}</p>
      <p className="hint">{fill(region === 'ru' ? T.LIFE_METHOD : T.LIFE_METHOD_WORLD, { year: life.year })}</p>
      <p className="hint">{region === 'ru' ? T.LIFE_SOURCE : T.LIFE_SOURCE_WORLD}</p>
    </>
  );
}
