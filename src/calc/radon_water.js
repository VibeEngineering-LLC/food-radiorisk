import { productEntry } from './products.js';
import { normCodeFor } from './catalog.js';
import { classesFor } from './foodclass.js';

export const RN = 'Rn-222';

// Радон поступает из водоисточника непрерывно, поэтому распад по годам срока потребления к нему не применяется (распад от даты пробы до даты потребления считается как у остальных нуклидов).
export const isContinuousSupply = (nuclide) => nuclide === RN;

export function isWaterInput(data, input) {
  if (input.foodGroupCode === 'water') return true;
  const entry = productEntry(data.products, input.product?.name, input.product?.confirmId ?? null);
  const state = input.product?.state || 'fresh';
  const classes = classesFor(entry, normCodeFor(data.limits_ru, entry, state), input.foodGroupCode);
  return classes.includes('water');
}

// v55: вид воды по записи словаря: unpacked — признак `intervention` (кран, колодец, скважина, родник; как для уровней вмешательства Прил. 2а), packaged / mineral — поле `water_kind`;
// нет явного признака (своё название, «вода» до выбора варианта) — unknown, расчёт консервативный: как неупакованная
export function waterPackaging(data, input) {
  const entry = productEntry(data.products, input.product?.name, input.product?.confirmId ?? null);
  if (entry?.intervention === 'nrb2009_app2a') return 'unpacked';
  if (entry?.water_kind === 'mineral' || entry?.water_kind === 'packaged') return entry.water_kind;
  return 'unknown';
}

export function isUnpackedWater(data, input) {
  const k = waterPackaging(data, input);
  return k === 'unpacked' || k === 'unknown';
}

export function radonUvExtra(data) {
  const rec = (data.risk || []).find(r => r.id === 'nrb2009_p535_rn222_water_uv');
  if (!rec || !Number.isFinite(rec.value)) return {};
  return { 'Rn-222': { uv: rec.value, id: rec.id, loc: rec.loc } };
}

export function radonWater(data, input, rows, years) {
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

  return {
    nuclide: RN,
    packaging,
    mineral,
    activityBqPerKg: A,
    years,
    ingestion: {
      doseSvPerYear: row.doseSvPerYear,
      doseSvTotal: row.doseSvTotal
    },
    inhalation: !withInhalation ? null : {
      doseSvPerYear: inhalPerYear,
      doseSvTotal: inhalPerYear * years,
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
