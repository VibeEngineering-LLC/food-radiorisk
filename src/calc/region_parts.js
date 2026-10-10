import { roleOne, roleSum } from './region.js';

// #FR-101: составляющие данных выбранного региона из записей набора compare (записи уже отфильтрованы recordsFor).

export function regionParts(records, region) {
  // Вспомогательная функция: извлекает первую запись с заданной ролью
  const pv = (role) => {
    const r = roleOne(records, role);
    return r ? { msv: r.value, source: r.source, loc: r.loc, id: r.id, year: r.year ?? null } : null;
  };

  // Естественные компоненты (все обязательны)
  const cosmic = pv('cosmic');
  const terrestrial = pv('terrestrial');
  const radon = pv('radon'); // радон + торон вместе
  const total = pv('natural_total');

  // Ингестия (сумма нескольких записей)
  const s = roleSum(records, 'ingest');
  const ingest = s ? { msv: s.value, source: s.source, loc: s.loc, ids: s.ids, year: null } : null;

  // Если любой из обязательных компонентов отсутствует -> null
  if (!cosmic || !terrestrial || !radon || !ingest || !total) {
    return null;
  }

  // Медицина (необязательная)
  const medicine = pv('medicine');

  // КТ (компьютерная томография)
  let ct = null;
  const freq = roleOne(records, 'ct_freq');
  if (freq) {
    const share = roleOne(records, 'ct_chest_share');
    const doseProc = roleOne(records, 'ct_dose_proc');
    const percaput = roleOne(records, 'ct_percaput');
    
    let doseProcVal = null;
    let derived = false;
    
    if (doseProc) {
      doseProcVal = doseProc.value;
    } else if (percaput) {
      doseProcVal = percaput.value / freq.value;
      derived = true;
    }

    if (doseProcVal !== null) {
      ct = {
        freq: freq.value,
        share: share ? share.value : null,
        doseProc: doseProcVal,
        derived: derived,
        source: freq.source,
        loc: freq.loc
      };
    }
  }

  // Рентгенография
  let rad = null;
  const radFreq = roleOne(records, 'rad_freq');
  if (radFreq) {
    const radDoseProc = roleOne(records, 'rad_dose_proc');
    const radPercaput = roleOne(records, 'rad_percaput');
    
    let radDoseProcVal = null;
    let radDerived = false;
    
    if (radDoseProc) {
      radDoseProcVal = radDoseProc.value;
    } else if (radPercaput) {
      radDoseProcVal = radPercaput.value / radFreq.value;
      radDerived = true;
    }

    if (radDoseProcVal !== null) {
      rad = {
        freq: radFreq.value,
        doseProc: radDoseProcVal,
        derived: radDerived,
        source: radFreq.source,
        loc: radFreq.loc
      };
    }
  }

  // Грудная рентгенография (отдельная запись)
  const chestXray = pv('chest_xray');

  // #FR-101 v41: техногенное облучение (если есть у региона) и коэффициент равновесия радона F региона (мир 0,4 — МКРЗ; Россия 0,5 — МР 2.6.1.0333-23)
  const techno = pv('techno');
  const rfRec = roleOne(records, 'radon_f');
  const radonF = rfRec ? rfRec.value : null;
  const radonFSrc = rfRec ? { source: rfRec.source, loc: rfRec.loc } : null;

  // Годовая внешняя доза от земли (mSv)
  let terrOutdoorMsv = null;
  const terrOutdoor = roleOne(records, 'terr_outdoor');
  if (terrOutdoor) {
    terrOutdoorMsv = terrOutdoor.value;
  } else {
    const terrOutdoorRate = roleOne(records, 'terr_outdoor_rate');
    if (terrOutdoorRate) {
      const dwellHours = records.find(r => r.id === 'dwell_hours');
      if (dwellHours && Number.isFinite(dwellHours.value)) {
        terrOutdoorMsv = terrOutdoorRate.value * (8760 - dwellHours.value) / 1000;
      }
    }
  }

  // Радон: дефолтная концентрация
  let radonDefaultC = null;
  let radonEec = null;
  let radonDefaultSrc = null;

  const radonDefaultCRec = roleOne(records, 'radon_default_c');
  if (radonDefaultCRec) {
    radonDefaultC = radonDefaultCRec.value;
    radonDefaultSrc = { source: radonDefaultCRec.source, loc: radonDefaultCRec.loc };
  } else {
    const radonEecRec = roleOne(records, 'radon_eec');
    const radonFRec = roleOne(records, 'radon_f');
    if (radonEecRec && radonFRec) {
      radonEec = { eec: radonEecRec.value, f: radonFRec.value, source: radonEecRec.source, loc: radonEecRec.loc, fSource: radonFRec.source, fLoc: radonFRec.loc };
      if (radonFRec.value > 0) {
        radonDefaultC = radonEecRec.value / radonFRec.value;
        radonDefaultSrc = { source: radonFRec.source, loc: radonFRec.loc };
      }
    }
  }

  // Дефолтная доля времени в помещении (u)
  const dwellDefaultURec = roleOne(records, 'dwell_default_u');
  const dwellDefaultU = dwellDefaultURec ? dwellDefaultURec.value : null;

  return {
    region,
    cosmic,
    terrestrial,
    radon,
    ingest,
    naturalTotal: total,
    medicine,
    ct,
    rad,
    chestXray,
    techno,
    radonF,
    radonFSrc,
    terrOutdoorMsv,
    radonDefaultC,
    radonEec,
    radonDefaultSrc,
    dwellDefaultU,
    yearNat: total.year,
    yearMed: medicine ? medicine.year : null
  };
}

export function regionDefaults(parts) {
  if (!parts) {
    return { radonC: null, dwellU: null, ctN: null, xrayN: null };
  }
  return {
    radonC: parts.radonDefaultC,
    dwellU: parts.dwellDefaultU,
    ctN: parts.ct ? parts.ct.freq * (parts.ct.share ?? 1) : null,
    xrayN: parts.rad ? parts.rad.freq : null
  };
}
