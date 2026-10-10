// #FR-81 V08 (D-022): вкладка «Бытовые риски за {срок}» — вероятность умереть от обычных причин за те же N лет, на 1 000 000 человек; первая строка — риск от питания R (то же число, что на главном экране); без «во сколько раз» и «1 из»
import { fmtPerMillion } from '../ui/fmt.js';
import { yearsWord } from '../ui/render.js';
import { T, fill, ageWord } from '../ui/texts_v.js';
import { DataTable } from './Result.jsx';

// логарифмическая шкала от 10⁻⁸ до 1
const barPos = (p) => p > 0 ? Math.max(0, Math.min(100, (Math.log10(p) + 8) / 8 * 100)) : 0;
const me = (r) => r.kind === 'product' ? 'cmp-me' : '';

export default function LifeRisks({ life, input }) {
  if (!life || !input) return null;
  const yrs = (n) => yearsWord(n);
  const pHead = fill(life.capped ? T.LIFE_COL_P_CAPPED : T.LIFE_COL_P, { n: life.n, years: yrs(life.n) });
  return (
    <>
      <p className="hint">{fill(T.LIFE_INTRO, { N: life.N, years: yrs(life.N), a: life.a, ageYears: ageWord(life.a) })}</p>
      {life.capped && <p className="msg warn">{fill(T.LIFE_CAPPED, { n: life.n, years: yrs(life.n) })}</p>}
      {!input.lifetime && input.age === 'adult' && <p className="hint">{T.LIFE_AGE_NOTE}</p>}
      <DataTable
        rows={life.rows}
        cols={[
          { h: T.LIFE_COL_CAUSE, f: r => r.kind === 'product' ? <b>{T.LIFE_PRODUCT}</b> : r.label, c: me },
          { h: pHead, f: r => fmtPerMillion(r.p), c: r => 'num ' + me(r) },
          { h: T.LIFE_COL_SCALE, f: r => <span className="cmpbar"><i style={{ width: `${barPos(r.p)}%` }} /></span>, c: me },
        ]}
      />
      <p className="hint">{T.LIFE_TIMING}</p>
      <p className="hint">{T.LIFE_PURPOSE}</p>
      <p className="hint">{fill(T.LIFE_METHOD, { year: life.year })}</p>
      <p className="hint">{T.LIFE_SOURCE}</p>
    </>
  );
}
