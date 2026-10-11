import { fmtDose, fmtNum, fmtSci, nb } from '../ui/fmt.js';
import { T, fill } from '../ui/texts_v.js';
import { locRu } from '../ui/ru.js';

// Вспомогательная функция: строит строку таблицы нормативов
function normRow(key, name, value, activity, ratio, doc) {
  return (
    <tr key={key}>
      <td>{nb(name)}</td>
      <td>{value}</td>
      <td className="num">{activity}</td>
      <td className="num">{ratio}</td>
      <td>{doc}</td>
    </tr>
  );
}

export default function RadonWater({ radon }) {
  const { ingestion, inhalation: inh, norms } = radon;

  // Строки таблицы нормативов (пропускаем null)
  const rows = [];
  if (norms.ru) {
    const { uv, ratio, document, loc } = norms.ru;
    rows.push(
      normRow(
        'ru',
        'Уровень вмешательства, Российская Федерация',
        nb(`${fmtNum(uv)} Бк/кг`),
        fmtNum(radon.activityBqPerKg),
        fmtNum(ratio),
        nb(document + (locRu(loc) ? ` (${locRu(loc)})` : ''))
      )
    );
  }
  if (norms.sanpin) {
    const { uv, ratio, document, loc } = norms.sanpin;
    rows.push(
      normRow(
        'sanpin',
        'Уровень вмешательства, Российская Федерация',
        nb(`${fmtNum(uv)} Бк/кг`),
        fmtNum(radon.activityBqPerKg),
        fmtNum(ratio),
        nb(document + (locRu(loc) ? ` (${locRu(loc)})` : ''))
      )
    );
  }
  if (norms.eu && norms.eu.param) {
    const { value, ratio } = norms.eu.param;
    rows.push(
      normRow(
        'eu-param',
        'Параметрическое значение, Европейский союз',
        nb(`${fmtNum(value)} Бк/л`),
        fmtNum(radon.activityBqPerKg), // 1 кг воды принят равным 1 л
        fmtNum(ratio),
        nb('Директива Совета 2013/51/Евратом, прил. I')
      )
    );
  }
  if (norms.eu && norms.eu.remedial) {
    const { value, ratio } = norms.eu.remedial;
    rows.push(
      normRow(
        'eu-remedial',
        'Выше этого значения меры по снижению обязательны, Европейский союз',
        nb(`${fmtNum(value)} Бк/л`),
        fmtNum(radon.activityBqPerKg),
        fmtNum(ratio),
        nb('Директива Совета 2013/51/Евратом, прил. I')
      )
    );
  }
  if (norms.who) {
    rows.push(
      normRow(
        'who',
        'Всемирная организация здравоохранения (ВОЗ)',
        nb('числового норматива нет'),
        '',
        '',
        nb('Руководство по контролю качества питьевой воды, 2017, гл. 9')
      )
    );
  }

  return (
    <div className="radon-water" id="radonWater">
      <h4 className="subhead">{T.RN_TITLE}</h4>
      <p className="hint">{T.RN_NATURAL}</p>

      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Путь поступления</th>
              <th>
                <span style={{ display: 'block', textAlign: 'right' }}>Доза за 1 год</span>
              </th>
              <th>
                <span style={{ display: 'block', textAlign: 'right' }}>Доза за весь срок</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{T.RN_ROW_ING}</td>
              <td className="num">{fmtDose(ingestion.doseSvPerYear)}</td>
              <td className="num">{fmtDose(ingestion.doseSvTotal)}</td>
            </tr>
            <tr>
              <td>{T.RN_ROW_INH}</td>
              <td className="num">{fmtDose(inh.doseSvPerYear)}</td>
              <td className="num">{fmtDose(inh.doseSvTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {Number.isFinite(radon.inhalationShare) && (
        <p className="hint">
          {fill(T.RN_NOT_SUM, { share: fmtNum(radon.inhalationShare * 100, 2) })}
        </p>
      )}

      <p className="hint">{T.RN_ING_NOTE}</p>
      <p className="hint">
        {fill(T.RN_METHOD, {
          C: fmtNum(inh.waterBqPerM3),
          ratio: fmtSci(inh.ratio, 1),
          h: fmtNum(inh.hoursPerYear),
          F: fmtNum(inh.f),
          dcf: fmtNum(inh.dcfSvPerBqHM3 * 1e9),
          air: fmtNum(inh.airBqPerM3),
        })}
      </p>

      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Норматив</th>
              <th>Значение</th>
              <th>
                <span style={{ display: 'block', textAlign: 'right' }}>Удельная активность, Бк/кг</span>
              </th>
              <th>
                <span style={{ display: 'block', textAlign: 'right' }}>A/значение</span>
              </th>
              <th>Документ и место</th>
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </table>
      </div>

      <p className="hint">{T.RN_RU}</p>
      <p className="hint">{T.RN_EU}</p>
      <p className="hint">{T.RN_WHO}</p>
      <p className="hint">{T.RN_BOIL}</p>
    </div>
  );
}
