import { fmtPerMillion } from '../ui/fmt.js';
import { yearsWord } from '../ui/render.js';
import { T, fill, ageWord } from '../ui/texts_v.js';

export default function LifeRisks({ life, input }) {
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

  return (
    <>
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
            {main.map((r) => (
              <tr key={r.id} className={r.kind === 'product' ? 'cmp-me' : undefined}>
                <td className="life-cause">
                  {r.kind === 'product' ? (
                    <b title={pname || undefined}>{pname ? `${pname}: ` : ''}{T.LIFE_PRODUCT}</b>
                  ) : (
                    <span title={r.kind === 'other' ? r.label : undefined}>{r.label}</span>
                  )}
                </td>
                <td className="num">{fmtPerMillion(r.p)}</td>
                <td className="life-bar">
                  <span className="cmpbar">
                    <i style={{ width: `${pct(r.p)}%`, minWidth: 0 }} />
                  </span>
                </td>
              </tr>
            ))}
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
                    <td>{`${r.within ? 'в т. ч. ' : ''}${r.label}`}</td>
                    <td className="num">{fmtPerMillion(r.p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* пояснения */}
      <p className="hint">{T.LIFE_TIMING}</p>
      <p className="hint">{T.LIFE_PURPOSE}</p>
      <p className="hint">{fill(T.LIFE_METHOD, { year: life.year })}</p>
      <p className="hint">{T.LIFE_SOURCE}</p>
    </>
  );
}
