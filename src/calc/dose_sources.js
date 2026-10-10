import { fmtNum } from '../ui/fmt.js';
import { DEFAULT_FLIGHT_PER_YEAR } from './ext_inputs.js';

export { DEFAULT_FLIGHT_PER_YEAR };
export const SLICE_COLOR = { product: 0, radon: 1, med_other: 2, flights: 3, med_ct: 4, cosmic: 5, terrestrial: 6, internal: 7, med_rad: 8, techno: 10 };  // цвет закреплён за источником

// #FR-101: разбиение средней медицинской дозы на три сектора без двойного счёта.
// parts — comparison.parts (см. region_parts.js): parts.medicine = {msv}, parts.ct = {freq, share|null, doseProc, derived}, parts.rad = {freq, doseProc, derived}.
// ctN, xrayN — число процедур на человека в год (КТ; рентгенография и флюорография). null/undefined/NaN — взять умолчание региона.
// Умолчание ctN0 = ct.freq * (ct.share ?? 1); xrayN0 = rad.freq. Сектор КТ = ctN * ct.doseProc; сектор рентгена = xrayN * rad.doseProc (мЗв в год).
// «Остальная» = medicine.msv - ctN0*ct.doseProc - xrayN0*rad.doseProc — считается ТОЛЬКО от умолчаний, поэтому ввод пользователя меняет только свой сектор. Если «остальная» < 0 (с допуском 1e-9) — bad: true.
// Возвращает null, если нет parts.medicine, parts.ct или parts.rad. Иначе
// { ctMsv, radMsv, otherMsv, ctN, radN (= xrayN), ctN0, xrayN0, ctIsDefault, xrayIsDefault, ctMsv0, radMsv0, medMsv, bad, ctAll: parts.ct.share == null }
export function medicineSplit(parts, ctN, xrayN) {
  if (!parts || !parts.medicine || !parts.ct || !parts.rad) return null;
  const ct = parts.ct;
  const rad = parts.rad;
  const medMsv = parts.medicine.msv;

  const ctN0 = ct.freq * (ct.share == null ? 1 : ct.share);
  const xrayN0 = rad.freq;

  const ctMsv0 = ctN0 * ct.doseProc;
  const radMsv0 = xrayN0 * rad.doseProc;

  const otherMsv = medMsv - ctMsv0 - radMsv0;
  const bad = otherMsv < -1e-9;

  const ctIsDefault = ctN == null || Number.isNaN(ctN);
  const xrayIsDefault = xrayN == null || Number.isNaN(xrayN);

  const ctNFinal = ctIsDefault ? ctN0 : Number(ctN);
  const xrayNFinal = xrayIsDefault ? xrayN0 : Number(xrayN);

  const ctMsv = ctNFinal * ct.doseProc;
  const radMsv = xrayNFinal * rad.doseProc;

  return {
    ctMsv,
    radMsv,
    otherMsv,
    ctN: ctNFinal,
    radN: xrayNFinal,
    ctN0,
    xrayN0,
    ctIsDefault,
    xrayIsDefault,
    ctMsv0,
    radMsv0,
    medMsv,
    bad,
    ctAll: ct.share == null
  };
}

export function buildDoseSlices(comparison, radonDoseSv, opts = {}) {
  if (!comparison || !comparison.parts || !comparison.parts.cosmic) return null;

  const H = comparison.horizonYears;
  const k = 1e-3;
  const productRow = comparison.rows.find(r => r && r.id === 'product');
  const productDose = productRow ? productRow.doseSv : NaN;

  let flightN = Number(opts.flightN);
  if (!Number.isFinite(flightN) || flightN < 0) flightN = DEFAULT_FLIGHT_PER_YEAR;
  const flightDefault = opts.flightDefault !== undefined ? !!opts.flightDefault : flightN === DEFAULT_FLIGHT_PER_YEAR;

  let flightMsv = comparison.flightMsv;
  if (!Number.isFinite(flightMsv)) flightMsv = 0.01;

  const parts = comparison.parts;

  // Radon slice
  let radonSlice;
  if (radonDoseSv != null) {
    radonSlice = {
      id: 'radon',
      label: `Радон в жилище (${fmtNum(opts.radonC)} Бк/м³, ${opts.radonIsDefault ? 'по умолчанию' : 'по вашему вводу'})`,
      doseSv: radonDoseSv,
      hint: 'ОА — объёмная активность радона-222 в воздухе жилища; без ввода берётся среднее значение выбранного региона (торон учтён только в среднем значении)'
    };
  } else {
    radonSlice = {
      id: 'radon',
      label: 'Радон и торон в воздухе помещений (среднее)',
      doseSv: parts.radon.msv * k * H,
      hint: 'ОА — объёмная активность радона-222 в воздухе жилища; без ввода берётся среднее значение выбранного региона (торон учтён только в среднем значении)'
    };
  }

  const rawSlices = [];

  // 1. Product
  rawSlices.push({
    id: 'product',
    label: 'Этот продукт (по вашему расчёту)',
    doseSv: productDose
  });

  // 2. Radon
  rawSlices.push(radonSlice);

  // 3. Medicine
  const split = medicineSplit(parts, opts.ctN, opts.xrayN);
  let medicineBad = false;
  if (split) {
    if (split.bad) {
      medicineBad = true;
    } else {
      // med_ct
      const ctLabel = split.ctAll
        ? `Компьютерная томография (все виды; доля грудной клетки для региона не найдена; ${fmtNum(split.ctN)} в год, ${split.ctIsDefault ? 'по умолчанию — среднее на жителя' : 'по вашему вводу'})`
        : `Компьютерная томография грудной клетки (${fmtNum(split.ctN)} в год, ${split.ctIsDefault ? 'по умолчанию — среднее на жителя' : 'по вашему вводу'})`;
      const ctHint = `доза процедуры ${fmtNum(parts.ct.doseProc)} мЗв${parts.ct.derived ? ' (средняя на одну КТ: доза на жителя, делённая на число КТ на жителя)' : ''}; входит в среднюю медицинскую дозу, не добавляется к ней`;
      rawSlices.push({
        id: 'med_ct',
        label: ctLabel,
        hint: ctHint,
        doseSv: split.ctMsv * k * H
      });

      // med_rad
      const radLabel = `Рентгенография и флюорография (${fmtNum(split.radN)} в год, ${split.xrayIsDefault ? 'по умолчанию — среднее на жителя' : 'по вашему вводу'})`;
      const radHint = `доза процедуры ${fmtNum(parts.rad.doseProc)} мЗв${parts.rad.derived ? ' (средняя на один снимок: доза на жителя, делённая на число снимков на жителя)' : ''}; входит в среднюю медицинскую дозу, не добавляется к ней`;
      rawSlices.push({
        id: 'med_rad',
        label: radLabel,
        hint: radHint,
        doseSv: split.radMsv * k * H
      });

      // med_other
      rawSlices.push({
        id: 'med_other',
        label: split.ctAll
          ? 'Остальная медицинская диагностика (интервенционные, радионуклидные и др.; КТ всех видов уже учтена отдельным сектором)'
          : 'Остальная медицинская диагностика (КТ других областей, интервенционные, радионуклидные и др.)',
        hint: 'средняя медицинская доза на жителя за вычетом КТ и рентгенографии при умолчаниях региона — без двойного счёта',
        doseSv: split.otherMsv * k * H
      });
    }
  }

  // 4. Flights
  rawSlices.push({
    id: 'flights',
    label: `Авиаперелёты (${fmtNum(flightN)} × 3 ч в год, ${flightDefault ? 'по умолчанию' : 'по вашему вводу'})`,
    doseSv: flightN * flightMsv * k * H
  });

  // 5. Cosmic
  rawSlices.push({
    id: 'cosmic',
    label: 'Космическое излучение (среднее)',
    doseSv: parts.cosmic.msv * k * H
  });

  // 6. Terrestrial
  const dwellingSv = opts.dwellingSv;
  let terrSlice;
  if (dwellingSv != null) {
    terrSlice = {
      id: 'terrestrial',
      label: `Гамма-фон в вашем жилище (по вашему дозиметру${opts.dwellU != null ? `, ${fmtNum(opts.dwellU)} мкЗв/ч` : ''}); на улице — среднее`,
      doseSv: (parts.terrOutdoorMsv ?? 0) * k * H + dwellingSv
    };
  } else {
    terrSlice = {
      id: 'terrestrial',
      label: 'Гамма-излучение грунта и стройматериалов (среднее)',
      doseSv: parts.terrestrial.msv * k * H
    };
  }
  rawSlices.push(terrSlice);

  // 8. Техногенное (#FR-101 v41): только если у региона есть значение с источником (Россия); для мира НКДАР даёт «несколько мкЗв в год» без числа — сектор не показывается
  if (parts.techno) {
    rawSlices.push({
      id: 'techno',
      label: 'Техногенное (глобальные выпадения, Чернобыль, предприятия)',
      hint: `значение получено по разности итога, природной и медицинской доз (расчёт исследования, не измерение): ${parts.techno.loc}`,
      doseSv: parts.techno.msv * k * H
    });
  }

  // 7. Internal
  rawSlices.push({
    id: 'internal',
    label: 'Природные радионуклиды в пище и воде (калий-40, полоний-210 и др.)',
    hint: 'внутреннее облучение без радона; включает малую долю от вдыхания пыли (уран, торий); в этом секторе — природные радионуклиды обычного рациона, а в секторе «Этот продукт» учтены только введённые вами нуклиды (природный калий-40 есть и в вашем продукте, но не входит в «ваш расчёт»)',
    doseSv: parts.ingest.msv * k * H
  });

  // Filter and sort
  const filtered = rawSlices.filter(s => Number.isFinite(s.doseSv) && s.doseSv > 0);
  filtered.sort((a, b) => a.doseSv - b.doseSv);

  const total = filtered.reduce((sum, s) => sum + s.doseSv, 0);

  const slices = filtered.map(s => ({
    ...s,
    riskP: s.doseSv * comparison.riskCoeff,
    share: total > 0 ? s.doseSv / total : 0,
    ci: SLICE_COLOR[s.id],
    me: s.id === 'product'
  }));

  // Natural background check
  const naturalSumMsv = parts.cosmic.msv + parts.terrestrial.msv + parts.ingest.msv + parts.radon.msv;
  const naturalTotalMsv = parts.naturalTotal ? parts.naturalTotal.msv : null;
  const naturalGapMsv = naturalTotalMsv == null ? null : naturalSumMsv - naturalTotalMsv;

  return {
    H,
    region: comparison.region,
    riskCoeff: comparison.riskCoeff,
    total,
    slices,
    radonFromInput: radonDoseSv != null,
    radonIsDefault: !!opts.radonIsDefault,
    dwellingFromInput: dwellingSv != null,
    dwellingIsDefault: false,
    radonBgMsvPerYear: parts.radon.msv,
    parts,
    medicine: split,
    medicineBad,
    ctN: split ? split.ctN : null,
    ctDefault: split ? split.ctIsDefault : true,
    xrayN: split ? split.radN : null,
    xrayDefault: split ? split.xrayIsDefault : true,
    flightN,
    flightDefault,
    naturalSumMsv,
    naturalTotalMsv,
    naturalGapMsv
  };
}
