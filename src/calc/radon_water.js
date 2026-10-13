import { productEntry, matchProduct } from './products.js';
import { normCodeFor } from './catalog.js';
import { classesFor } from './foodclass.js';
import { T, fill } from '../ui/texts_v.js';
import { riskFromDose } from './core.js';

export const RN = 'Rn-222';

// Радон поступает из водоисточника непрерывно, поэтому распад по годам срока потребления к нему не применяется (распад от даты пробы до даты потребления считается как у остальных нуклидов).
export const isContinuousSupply = (nuclide) => nuclide === RN;

// v58 (TODO-3, оператор): общее название «Вода» (несколько видов воды в словаре), вид не выбран и группа норм не задана — принимается неупакованная вода (waterPackaging даёт 'unpacked' без записи словаря)
export function isDefaultedWaterKind(data, input) {
  if (input.foodGroupCode) return false;
  const m = matchProduct(data.products, input.product?.name, input.product?.confirmId ?? null);
  return m.status === 'ambiguous' && m.candidates.length > 0 && m.candidates.every(c => c.codex?.includes('water'));
}

export function isWaterInput(data, input) {
  if (input.foodGroupCode === 'water') return true;
  if (isDefaultedWaterKind(data, input)) return true;
  const entry = productEntry(data.products, input.product?.name, input.product?.confirmId ?? null);
  const state = input.product?.state || 'fresh';
  const classes = classesFor(entry, normCodeFor(data.limits_ru, entry, state), input.foodGroupCode);
  return classes.includes('water');
}

// Вид воды для радона: mineral — запись словаря с `water_kind: mineral`; группа норм «Упакованная питьевая вода» (выбрана вручную или подставлена записью упакованной воды) — packaged
// (v57: и для записи неупакованной воды — расчёт радона согласован с показателем B по табл. 4 ТР ЕАЭС 044/2017); иначе запись словаря: intervention (кран, колодец, скважина, родник) — unpacked, water_kind: packaged — packaged.
// Сюда попадает только вода (isWaterInput): вид определён всегда; ветки «упаковка не указана» нет (v57: недостижима — выбор группы или записи словаря всегда задаёт вид)
export function waterPackaging(data, input) {
  const entry = productEntry(data.products, input.product?.name, input.product?.confirmId ?? null);
  if (entry?.water_kind === 'mineral') return 'mineral';
  if (input.foodGroupCode === 'water' || entry?.water_kind === 'packaged') return 'packaged';
  return 'unpacked';
}

export function isUnpackedWater(data, input) {
  return waterPackaging(data, input) === 'unpacked';
}

// v57 (замечания 5, 7): радон не рассчитан, потому что продукт не определён как вода, — сообщение называет причину и что выбрать (а не общее «только для питьевой воды»)
export function radonSkipMessage(data, input) {
  const name = String(input.product?.name || '').trim();
  const m = matchProduct(data.products, input.product?.name, input.product?.confirmId ?? null);
  if (m.entry?.codex?.includes('water')) return fill(T.RN_NOT_WATER_GROUP, { name: m.entry.name_ru }); // вода из словаря, но группа норм не относится к воде
  if (m.status === 'ambiguous' && m.candidates.length > 0 && m.candidates.every(c => c.codex?.includes('water'))) return fill(T.RN_NOT_WATER_CHOICE, { name }); // «Вода»: вид воды не выбран
  if (input.product?.dietGroup === 'water') return fill(T.RN_NOT_WATER_DIET, { name }); // свое название, группа рациона «вода»
  return T.RN_NOT_WATER;
}

export function radonUvExtra(data) {
  const rec = (data.risk || []).find(r => r.id === 'nrb2009_p535_rn222_water_uv');
  if (!rec || !Number.isFinite(rec.value)) return {};
  return { 'Rn-222': { uv: rec.value, id: rec.id, loc: rec.loc } };
}

export function radonWater(data, input, rows, years, riskCoeff = null) {
  const row = rows.find(r => r.nuclide === RN);
  if (!row || !isWaterInput(data, input)) return null;

  const risk = (id) => (data.risk || []).find(r => r.id === id && Number.isFinite(r.value)) || null;
  const foreign = (id) => (data.limits_foreign || []).find(r => r.id === id) || null;

  const ratio = risk('unscear2000_rnw_air_water_ratio');
  const dcf = risk('unscear2000_rnw_inhal_dcf');
  const hours = risk('unscear2000_rnw_occupancy');
  const f = risk('unscear2000_rnw_equilibrium_f');
  // v54: вдыхание радона, выделившегося из воды, — модель НКДАР ООН 2000 (п. 157) описывает бытовое использование водопроводной воды (кран, душ); для неупакованной воды строка есть, для упакованной (бутилированной, минеральной) не выводится
  const withInhalation = isUnpackedWater(data, input);
  if (withInhalation && (!ratio || !dcf || !hours || !f)) return null;

  const A = row.rawBqPerKg;
  const cWater = A * 1000;
  const inhalPerYear = withInhalation ? cWater * ratio.value * hours.value * f.value * dcf.value : null;
  const airBqPerM3 = withInhalation ? cWater * ratio.value : null;
  const share = withInhalation ? (risk('who_gdwq2017_rnw_inhalation_share')?.value ?? null) : null;

  const ruRec = risk('nrb2009_p535_rn222_water_uv');
  // v55 (Б-1): минеральные и лечебные воды — НРБ-99/2009, п. 5.3.5: «специальные нормативы»; Директива 2013/51/Евратом, ст. 3, п. 2(a), исключает природные минеральные воды; сравнения с этими нормами не делаются
  const packaging = waterPackaging(data, input);
  const mineral = packaging === 'mineral';
  const noBackExtrapolation = !!row.noBackDecay; // v56 (Б-2): проба позже начала потребления — активность назад не пересчитана, принята измеренная
  const ru = ruRec && !mineral ? { id: ruRec.id, uv: ruRec.value, ratio: A / ruRec.value, document: 'НРБ-99/2009', loc: ruRec.loc } : null;

  const sanpinRec = risk('sanpin1_2_3685_21_t312_rn222_uv');
  const sanpin = sanpinRec && !mineral ? { id: sanpinRec.id, uv: sanpinRec.value, ratio: A / sanpinRec.value, document: 'СанПиН 1.2.3685-21', loc: 'п. 18, табл. 3.12' } : null;

  const euParamRec = foreign('eu_2013_51_rn222_param');
  const euParam = euParamRec && !mineral ? { id: euParamRec.id, value: euParamRec.value, ratio: A / euParamRec.value, loc: euParamRec.loc } : null;

  const euRemedialRec = foreign('eu_2013_51_rn222_remedial');
  const euRemedial = euRemedialRec && !mineral ? { id: euRemedialRec.id, value: euRemedialRec.value, ratio: A / euRemedialRec.value, loc: euRemedialRec.loc } : null;

  const whoRec = foreign('who_gdwq2017_rn222_no_guidance');
  const who = whoRec && !mineral ? { id: whoRec.id, value: null, loc: whoRec.loc, quote: whoRec.quote, url: whoRec.url } : null;

  const provenance = (withInhalation ? [ratio, dcf, hours, f] : []).map(rec => ({
    step: 'вдыхание радона из воды',
    what: rec.quantity,
    id: rec.id,
    source: rec.source,
    loc: rec.loc,
    level: rec.level,
    value: rec.value,
    unit: rec.unit
  }));

  // v57 (оператор): доза и риск радона на «Сводке» — тот же номинальный коэффициент, что у остальных нуклидов (riskCoeffOf, НРБ-99/2009 п. 2.3: risk = E · r, core.js riskFromDose);
  // питьё — riskTotal строки нуклида, вдыхание — тот же расчёт от дозы вдыхания; сумма — для сведения, в основной итог не входит
  const inhY = withInhalation ? inhalPerYear : 0, inhT = withInhalation ? inhalPerYear * years : 0;
  const riskOf = (e) => (Number.isFinite(riskCoeff) ? riskFromDose(e, riskCoeff) : null);
  const sum = { doseSvPerYear: row.doseSvPerYear + inhY, doseSvTotal: row.doseSvTotal + inhT, riskTotal: riskOf(row.doseSvTotal + inhT) };

  return {
    nuclide: RN,
    riskCoeff,
    sum,
    packaging,
    mineral,
    noBackExtrapolation,
    activityBqPerKg: A,
    years,
    ingestion: {
      doseSvPerYear: row.doseSvPerYear,
      doseSvTotal: row.doseSvTotal,
      riskTotal: row.riskTotal
    },
    inhalation: !withInhalation ? null : {
      doseSvPerYear: inhalPerYear,
      doseSvTotal: inhalPerYear * years,
      riskTotal: riskOf(inhalPerYear * years),
      waterBqPerM3: cWater,
      airBqPerM3,
      ratio: ratio.value,
      dcfSvPerBqHM3: dcf.value,
      hoursPerYear: hours.value,
      f: f.value
    },
    inhalationShare: share,
    norms: {
      ru,
      sanpin,
      eu: { param: euParam, remedial: euRemedial },
      who
    },
    provenance
  };
}
