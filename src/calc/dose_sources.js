import { fmtNum } from '../ui/fmt.js';

export const DEFAULT_XRAY_PER_YEAR = 1;      // решение оператора: 1 снимок грудной клетки в год
export const DEFAULT_FLIGHT_PER_YEAR = 2;    // решение оператора: 2 перелёта по 3 ч в год
export const SLICE_COLOR = { product: 0, radon: 1, medicine: 2, flights: 3, xray: 4, cosmic: 5, terrestrial: 6, internal: 7 };  // цвет закреплён за источником

export function buildDoseSlices(comparison, radonDoseSv, opts = {}) {
  // защита от невалидных входных данных
  if (!comparison || !comparison.worldRadon || !comparison.parts) return null;

  const H = comparison.horizonYears;
  const k = 1e-3; // перевод мЗв в Зв
  const parts = comparison.parts;
  const worldRadon = comparison.worldRadon;

  // нормализация частот: нечисловые значения заменяются на дефолты
  let xrayN = Number(opts.xrayN);
  if (!Number.isFinite(xrayN) || xrayN < 0) xrayN = DEFAULT_XRAY_PER_YEAR;
  let flightN = Number(opts.flightN);
  if (!Number.isFinite(flightN) || flightN < 0) flightN = DEFAULT_FLIGHT_PER_YEAR;

  // определение, является ли значение "по умолчанию"
  const xrayDefault = opts.xrayDefault !== undefined
    ? !!opts.xrayDefault
    : (xrayN === DEFAULT_XRAY_PER_YEAR);
  const flightDefault = opts.flightDefault !== undefined
    ? !!opts.flightDefault
    : (flightN === DEFAULT_FLIGHT_PER_YEAR);

  // доза от продукта (ищем строку с id 'product')
  const productRow = comparison.rows ? comparison.rows.find(r => r && r.id === 'product') : null;
  const productDose = productRow ? productRow.doseSv : NaN;

  // радон: пользовательский ввод или среднее по миру
  let radonLabel, radonDose;
  if (radonDoseSv != null) {
    radonLabel = `Радон в жилище, ОА ${fmtNum(opts.radonC)} Бк/м³ (${opts.radonIsDefault ? 'по умолчанию' : 'по вашему вводу'})`;
    radonDose = radonDoseSv;
  } else {
    radonLabel = 'Радон и торон, среднее по миру (НКДАР ООН)';
    radonDose = (worldRadon.radonSvPerYear + worldRadon.thoronSvPerYear) * H;
  }

  // сборка всех слайсов
  const rawSlices = [
    { id: 'product', label: 'Питание этим продуктом', doseSv: productDose },
    { id: 'radon', label: radonLabel, doseSv: radonDose },
  ];

  // медицина — только если есть данные
  if (parts.medicine) {
    rawSlices.push({
      id: 'medicine',
      label: 'Медицина: средняя диагностика на жителя мира (НКДАР ООН 2008)',
      doseSv: parts.medicine.msv * k * H
    });
  }

  // перелёты
  rawSlices.push({
    id: 'flights',
    label: `Перелёты по 3 ч: ${fmtNum(flightN)} за год (${flightDefault ? 'по умолчанию' : 'по вашему вводу'})`,
    doseSv: flightN * parts.flight.msv * k * H
  });

  // рентген
  rawSlices.push({
    id: 'xray',
    label: `Снимки грудной клетки: ${fmtNum(xrayN)} за год (${xrayDefault ? 'по умолчанию' : 'по вашему вводу'})`,
    doseSv: xrayN * parts.xray.msv * k * H
  });

  // космическое излучение
  rawSlices.push({
    id: 'cosmic',
    label: 'Космическое излучение (среднее по миру)',
    doseSv: parts.cosmic.msv * k * H
  });

  // земное излучение: улица + (жилище по дозиметру или среднее)
  const dwellingSv = opts.dwellingSv;
  const terrDose = parts.terrOutdoor.msv * k * H + (dwellingSv != null ? dwellingSv : parts.terrIndoor.msv * k * H);
  rawSlices.push({
    id: 'terrestrial',
    label: dwellingSv != null
      ? (opts.dwellIsDefault
        ? `Излучение земли и стройматериалов: на улице — среднее, в жилище — показание дозиметра ${fmtNum(opts.dwellU)} мкЗв/ч (по умолчанию)`
        : `Излучение земли и стройматериалов: на улице — среднее, в жилище — по вашему дозиметру${opts.dwellU != null ? `, ${fmtNum(opts.dwellU)} мкЗв/ч` : ''}`)
      : 'Излучение земли и стройматериалов (среднее по миру)',
    doseSv: terrDose
  });

  // внутреннее облучение
  rawSlices.push({
    id: 'internal',
    label: 'Внутреннее облучение: пища, вода, пыль (без радона)',
    doseSv: (parts.ingest.msv + parts.inhalUT.msv) * k * H
  });

  // отбрасываем невалидные слайсы (не конечные или <= 0)
  const validSlices = rawSlices.filter(s => Number.isFinite(s.doseSv) && s.doseSv > 0);

  // сортировка по возрастанию дозы (стабильная)
  validSlices.sort((a, b) => a.doseSv - b.doseSv);

  // суммарная доза
  const total = validSlices.reduce((sum, s) => sum + s.doseSv, 0);

  // обогащаем слайсы: риск, доля, цвет, флаг "это продукт"
  const slices = validSlices.map(s => ({
    ...s,
    riskP: s.doseSv * comparison.riskCoeff,
    share: total > 0 ? s.doseSv / total : 0,
    ci: SLICE_COLOR[s.id],
    me: s.id === 'product'
  }));

  // расчёт естественного фона для сверки с опубликованным значением
  const naturalSumMsv =
    parts.cosmic.msv +
    parts.terrIndoor.msv +
    parts.terrOutdoor.msv +
    parts.ingest.msv +
    parts.inhalUT.msv +
    (worldRadon.radonSvPerYear + worldRadon.thoronSvPerYear) * 1000;

  const naturalTotalMsv = parts.naturalTotal ? parts.naturalTotal.msv : null;
  const naturalGapMsv = naturalTotalMsv == null ? null : naturalSumMsv - naturalTotalMsv;

  return {
    H,
    riskCoeff: comparison.riskCoeff,
    total,
    slices,
    radonFromInput: radonDoseSv != null,
    radonIsDefault: !!opts.radonIsDefault,
    dwellingFromInput: dwellingSv != null,
    dwellingIsDefault: dwellingSv != null && !!opts.dwellIsDefault,
    worldRadon,
    worldRadonMsvPerYear: (worldRadon.radonSvPerYear + worldRadon.thoronSvPerYear) * 1000,
    parts,
    xrayN,
    xrayDefault,
    flightN,
    flightDefault,
    naturalSumMsv,
    naturalTotalMsv,
    naturalGapMsv
  };
}
