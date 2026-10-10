import { detailOf } from '../calc/detail_calc.js';
import { DataTable } from './Result.jsx';
import { fmtNum, fmtSci, fmtDose, fmtPerMillion } from '../ui/fmt.js';
import { sourceFull } from '../ui/render.js';
import { locRu, unitRu } from '../ui/ru.js';
import { AGE_LABEL } from '../ui/form.js';
import { dietReportText } from '../ui/report.js';
import { T } from '../ui/texts_v.js';

// Вспомогательный span для HTML-источника (безопасно для SSR)
const Src = ({ html }) => <span dangerouslySetInnerHTML={{ __html: html }} />;

export default function DetailCalc({ result, input }) {
  // Детализация расчёта по нуклидам
  const d = detailOf(result, input);

  // Колонки таблицы шагов для одного нуклида
  const stepCols = [
    { h: 'Величина', f: r => r.name },
    { h: 'Значение', f: r => r.value, c: 'num' },
    { h: 'Источник и пояснение', f: r => r.note },
  ];

  // Колонки таблицы по годам
  const yearCols = [
    { h: 'Год k', f: y => String(y.k), c: 'num' },
    { h: 'Возраст, лет', f: y => (y.ageFrom == null ? '—' : fmtNum(y.ageFrom)), c: 'num' },
    { h: 'Возрастная группа e(g)', f: y => AGE_LABEL[y.band] || y.band || '—' },
    { h: 'w', f: y => fmtNum(y.weight), c: 'num' },
    { h: 'd', f: y => fmtNum(y.decay, 4), c: 'num' },
    { h: 'I_k, Бк', f: y => fmtNum(y.intakeBq), c: 'num' },
    { h: 'e_k, Зв/Бк', f: y => fmtSci(y.eSvPerBq), c: 'num' },
    { h: 'E_k, Зв', f: y => fmtSci(y.doseSv), c: 'num' },
  ];

  return (
    <>
      {/* Пояснение к формулам */}
      <p className="hint">
        Здесь по шагам показано, как из измеренной активности получаются доза и риск, чтобы пересчитать вручную. Формулы: I₀ = A · Fr · M (поступление за первый год, Бк); I_k = I₀ · w_k · d_k (поступление в год k; w_k — доля года, d_k — множитель физического распада); E_k = I_k · e_k (доза года k, Зв, e_k — коэффициент ожидаемой дозы e(g) для возраста в год k); E = Σ E_k; R = r · E (риск смерти от рака, r — коэффициент риска).
      </p>

      {/* Потребление и масса */}
      <p className="hint" id="detailDiet">
        {`Потребление: ${dietReportText(input, result)} M = ${fmtNum(d.massKg)} кг в год.`}
      </p>

      {/* Блок по каждому нуклиду */}
      {d.nuclides.map(n => {
        // Строки таблицы шагов
        const rows = [
          { name: 'A — активность продукта на начало питания, Бк/кг', value: fmtNum(n.aBqPerKg), note: 'измерено или рассчитано; с поправками пробы и распада до даты употребления' },
          { name: 'Fr — доля, остающаяся после обработки', value: fmtNum(n.fr), note: 'способ и источник коэффициента — в таблице «Происхождение чисел» на вкладке «Источники»' },
          { name: 'M — масса продукта, кг/год', value: fmtNum(n.massKg), note: '' },
          { name: 'I₀ = A · Fr · M — поступление за первый год, Бк', value: fmtNum(n.intakeStartBq), note: '' },
        ];
        if (n.halfLifeProv) {
          rows.push({
            name: 'T½ — период полураспада, сут',
            value: fmtNum(n.halfLifeProv.value),
            note: <Src html={sourceFull(n.halfLifeProv.source)} />,
          });
        }
        if (n.doseProv) {
          const loc = locRu(n.doseProv.loc);
          rows.push({
            name: 'e(g) — коэффициент дозы, ' + unitRu(n.doseProv.unit || 'Sv/Bq'),
            value: fmtSci(n.doseProv.value),
            note: (
              <>
                <Src html={sourceFull(n.doseProv.source)} />
                {loc ? <>, {loc}</> : null}
              </>
            ),
          });
        }

        // Таблица по годам (сворачиваемая при длинном списке)
        const yearsTable = <DataTable rows={n.years} cols={yearCols} />;

        return (
          <fieldset className="rgroup detail-nuclide" key={n.nuclide} data-nuclide={n.nuclide}>
            <legend>{n.nuclide}{n.natural ? ' (природный, предел дозы не установлен)' : ''}</legend>
            <DataTable rows={rows} cols={stepCols} />
            <div className="detail-years" data-nuclide={n.nuclide}>
              {n.years.length > 12 ? (
                <details open className="more">
                  <summary>{`Расчёт по годам (${n.years.length})`}</summary>
                  {yearsTable}
                </details>
              ) : (
                yearsTable
              )}
            </div>
            <p className="detail-sum">
              <b>{`E = Σ E_k = ${fmtSci(n.doseTotalSv)} Зв`}</b> ({fmtDose(n.doseTotalSv)})
              {n.riskSv != null && <>; R = r · E = {fmtPerMillion(n.riskSv)} на 1 000 000</>}
            </p>
            {n.y90 && (
              <p className="hint">
                {`Иттрий-90 при стронции-90: ${n.y90.included ? 'включён в e_k и E_k выше' : 'не включён в расчёт выше'}.`}
              </p>
            )}
          </fieldset>
        );
      })}

      {/* Итоговый блок */}
      <fieldset className="rgroup detail-total">
        <legend>Итог</legend>
        <p>{`Сумма доз по всем нуклидам: E = ${fmtSci(d.doseTotalSv)} Зв (${fmtDose(d.doseTotalSv)}).`}</p>
        {(d.techDoseTotalSv > 0 || d.nuclides.some(n => !n.natural)) && (
          <p>{`Из них техногенные нуклиды (по ним считается риск): ${fmtSci(d.techDoseTotalSv)} Зв.`}</p>
        )}
        {d.riskCoeff != null && (
          <p>{`Коэффициент риска r = ${fmtNum(d.riskCoeff)} Зв⁻¹ (НРБ-99/2009, п. 2.3).`}</p>
        )}
        {d.riskNominal != null && d.riskCoeff != null && (
          <p>
            <b>{`R = r · E(техногенные) = ${fmtNum(d.riskCoeff)} · ${fmtSci(d.techDoseTotalSv)} = ${fmtSci(d.riskNominal)}`}</b> ({fmtPerMillion(d.riskNominal)} на 1 000 000)
          </p>
        )}
        <p className="hint">{T.REF_COEFF}</p>
      </fieldset>
    </>
  );
}
