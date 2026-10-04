// Автор — контур «Радоновый риск». radon_risk v0.1, 2026-10-04. Публикуется целиком вместе с README.md и coefficients.json.
// radonRisk: расчёт радонового риска (канал Дарби 2005 и канал МКРЗ 115) и дозы по SPEC.md (ред. 2).
// Чистый модуль: без I/O, DOM и зависимостей; вход и coeffs не мутируются.
// DEFAULT_COEFFS — копия coefficients.json (литерал сгенерирован из json скриптом; синхронность — тест S).
function deepFreeze(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  Object.freeze(obj);
  for (const key of Object.getOwnPropertyNames(obj)) {
    const v = obj[key];
    if (v !== null && typeof v === "object") deepFreeze(v);
  }
  return obj;
}

export const DEFAULT_COEFFS = deepFreeze({
  "_meta": {
    "version": "0.1.0-draft",
    "date": "2026-10-04",
    "note": "Каждый коэффициент — с источником (документ, пункт или страница; номера строк относятся к тексту, извлечённому из PDF) либо запись локального корпуса проверенных фактов. Статус проверки — поле level."
  },
  "exposure": {
    "wlm_bq_h_m3_eec": {
      "value": 629000,
      "unit": "Бк·ч·м^-3 (ЭРОА)",
      "formula": "3700 Бк/м3 x 170 ч",
      "source": "IRSN PSE-SAN-2018-00002, сноска 2 (1 WLM = 3700 Бк/м3 ЭРОА x 170 ч)",
      "level": "прочитано в тексте"
    },
    "wlm_mJ_h_m3": {
      "value": 3.54,
      "unit": "мДж·ч·м^-3",
      "source": "Книга «Радон: измерение, доза, оценка риска» (1 WLM = 3,54 мДж·ч/м3); согласуется с IRSN PSE-SAN-2018-00002, Table 1: 20 мЗв/WLM : 5,7 мЗв/(мДж·ч/м3)",
      "level": "прочитано в тексте"
    },
    "default_equilibrium_factor_F": {
      "value": 0.4,
      "source": "МКРЗ 126, п. (36): F = 0,4, 7000 ч/год; IRSN PSE-SAN-2018-00002, Table 1",
      "level": "прочитано в тексте"
    },
    "default_hours_per_year_indoors": {
      "value": 7000,
      "unit": "ч/год",
      "source": "МКРЗ 126, п. (36); UNSCEAR 2000 Vol. I, Annex B, §153 (проверено 2026-09-25)",
      "level": "прочитано в тексте / проверено в локальном корпусе фактов"
    }
  },
  "dose": {
    "mSv_per_WLM_dwelling": {
      "value": 10,
      "alt_mSv_per_mJ_h_m3": 3,
      "source": "ICRP Publication 137 (2017), п. (667), разд. 12.7: 3 мЗв на мДж·ч/м3 (около 10 мЗв/WLM), шахты и большинство зданий; применимость к жилищам — по IRSN PSE-SAN-2018-00002",
      "earlier_value": "МКРЗ 126 (2014) п.36: 13 мЗв/WLM для жилищ (Marsh&Bailey 2013); принят более поздний ICRP 137 (2017) — выбор автора, не цитата источника",
      "level": "прочитано в первоисточнике (ICRP 137, п. 667, 2026-10-04)"
    }
  },
  "risk": {
    "icrp115_nominal_lung_per_WLM": {
      "value": 0.0005,
      "alt_per_Bq_h_m3_eec": 8e-10,
      "alt_per_J_h_m3": 0.14,
      "population": "взрослое население, оба пола, курящие и некурящие (смешанная)",
      "source": "МКРЗ Публикация 126 (2014): номинальный коэффициент риска рака лёгкого 5·10-4 на WLM, с поправкой на ущерб; МКРЗ Публикация 115 (русский перевод, 2013): 5·10-4 на WLM",
      "level": "прочитано в тексте (МКРЗ 126 и русский перевод ICRP 115; английский оригинал в библиотеке отсутствует)"
    },
    "darby2005": {
      "err_per_100_Bq_m3": 0.16,
      "err_per_100_Bq_m3_uncorrected": 0.084,
      "err_95ci_per_100": [
        0.05,
        0.31
      ],
      "baseline_cumulative_risk_by_age_75": {
        "never": 0.0041,
        "smoker": 0.101
      },
      "table_points_by_75": {
        "C_Bq_m3": [
          0,
          100,
          400,
          800
        ],
        "never": [
          0.0041,
          0.0047,
          0.0067,
          0.0093
        ],
        "smoker": [
          0.101,
          0.116,
          0.16,
          0.216
        ]
      },
      "source": "Darby S et al. BMJ 2005;330:223, doi:10.1136/bmj.38308.477650.63, PMC546066 (проверено 2026-09-25, уровень ✅); ДИ 5–31 % — реферат Darby 2005 (прочитано 2026-10-04: «16% (5% to 31%) per 100 Bq/m3 increase in usual radon»); МКРЗ 126 пишет 5–32 % — расхождение, взят первоисточник",
      "level": "✅ (локальный корпус проверенных фактов)"
    },
    "uncertainty_factor": {
      "value": 2,
      "source": "IRSN PSE-SAN-2018-00002, разд. 5: неопределённость пожизненного риска — множитель около 2",
      "level": "прочитано в тексте"
    }
  },
  "assumptions": {
    "darby_reference_hours_indoors": {
      "value": 7000,
      "note": "ДОПУЩЕНИЕ АВТОРА (не из источника): концентрация в жилище у Дарби принимается соответствующей типовому пребыванию 7000 ч/год; при другом времени экспозиция масштабируется линейно по ч/год."
    },
    "darby_horizon_years": {
      "value": 75,
      "note": "Горизонт метрики Дарби (кумулятивный риск к возрасту 75 лет)."
    },
    "darby_period_scaling": {
      "note": "ДОПУЩЕНИЕ АВТОРА: риск за N лет облучения = риск пожизненного (до 75 лет) облучения с ERR, умноженным на долю N/75. Зависимость ERR от возраста и времени после облучения не учитывается (МКРЗ: неопределённость ~x2)."
    }
  }
});

const MAX_C = 10000;
const MAX_YEARS = 100;
const DARBY_MAX_C = 800;
const MAX_HOURS = 8766;

const REQUIRED_PATHS = [
  "exposure.wlm_bq_h_m3_eec.value",
  "exposure.default_equilibrium_factor_F.value",
  "exposure.default_hours_per_year_indoors.value",
  "dose.mSv_per_WLM_dwelling.value",
  "risk.icrp115_nominal_lung_per_WLM.value",
  "risk.darby2005.err_per_100_Bq_m3",
  "risk.darby2005.err_95ci_per_100",
  "risk.darby2005.baseline_cumulative_risk_by_age_75.never",
  "risk.darby2005.baseline_cumulative_risk_by_age_75.smoker",
  "risk.uncertainty_factor.value",
  "assumptions.darby_reference_hours_indoors.value",
  "assumptions.darby_horizon_years.value",
];

function safeString(v) {
  try {
    return String(v);
  } catch {
    return "<непредставимое значение>";
  }
}

function getPath(obj, path) {
  let cur = obj;
  for (const seg of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = cur[seg];
  }
  return cur;
}

function checkCoeffs(coeffs) {
  if (coeffs === null || typeof coeffs !== "object" || Array.isArray(coeffs)) {
    throw new RangeError("coeffs: ожидается объект коэффициентов, получено " + safeString(coeffs));
  }
  for (const p of REQUIRED_PATHS) {
    const v = getPath(coeffs, p);
    if (v === undefined) {
      throw new RangeError("coeffs: нет обязательного ключа " + p);
    }
    if (p === "risk.darby2005.err_95ci_per_100") {
      if (!Array.isArray(v) || v.length !== 2 || !v.every((x) => typeof x === "number" && Number.isFinite(x))) {
        throw new RangeError("coeffs: risk.darby2005.err_95ci_per_100 должно быть массивом из двух конечных чисел, получено " + safeString(v));
      }
    } else {
      if (typeof v !== "number" || !Number.isFinite(v)) {
        throw new RangeError("coeffs: " + p + " должно быть конечным числом, получено " + safeString(v));
      }
    }
  }
  const positivePaths = [
    "exposure.wlm_bq_h_m3_eec.value",
    "assumptions.darby_reference_hours_indoors.value",
    "assumptions.darby_horizon_years.value",
    "risk.uncertainty_factor.value",
  ];
  for (const p of positivePaths) {
    const v = getPath(coeffs, p);
    if (!(v > 0)) {
      throw new RangeError("coeffs: " + p + " должно быть > 0, получено " + safeString(v));
    }
  }
}

function nz(v) { return v === 0 ? 0 : v; }

export function radonRisk(input, coeffs = DEFAULT_COEFFS) {
  checkCoeffs(coeffs);

  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    if (Array.isArray(input)) {
      throw new RangeError("input: ожидается обычный объект, получен массив");
    }
    throw new RangeError("input: ожидается обычный объект, получено " + safeString(input));
  }
  const proto = Object.getPrototypeOf(input);
  if (proto !== Object.prototype && proto !== null) {
    throw new RangeError("input: ожидается обычный объект, получен экземпляр класса или объект с нестандартным прототипом");
  }

  const C = input.C;
  const hoursPerYear = input.hoursPerYear === undefined ? coeffs.exposure.default_hours_per_year_indoors.value : input.hoursPerYear;
  const F = input.F === undefined ? coeffs.exposure.default_equilibrium_factor_F.value : input.F;
  const years = input.years;
  const ageStart = input.ageStart === undefined ? 0 : input.ageStart;
  const smoking = input.smoking === undefined ? "never" : input.smoking;

  const horizon = coeffs.assumptions.darby_horizon_years.value;
  const refHours = coeffs.assumptions.darby_reference_hours_indoors.value;

  if (C === undefined) {
    throw new RangeError("C: поле обязательно, значение не задано");
  }
  if (typeof C !== "number" || !Number.isFinite(C)) {
    throw new RangeError("C: должно быть конечным числом, получено " + safeString(C));
  }
  if (C < 0) {
    throw new RangeError("C: не может быть отрицательным, получено " + safeString(C));
  }
  if (C > MAX_C) {
    throw new RangeError("C: превышает допустимый максимум " + MAX_C + ", получено " + safeString(C));
  }

  if (typeof hoursPerYear !== "number" || !Number.isFinite(hoursPerYear)) {
    throw new RangeError("hoursPerYear: должно быть конечным числом, получено " + safeString(hoursPerYear));
  }
  if (hoursPerYear < 0 || hoursPerYear > MAX_HOURS) {
    throw new RangeError("hoursPerYear: должно быть в диапазоне 0.. " + MAX_HOURS + ", получено " + safeString(hoursPerYear));
  }

  if (typeof F !== "number" || !Number.isFinite(F)) {
    throw new RangeError("F: должно быть конечным числом, получено " + safeString(F));
  }
  if (F <= 0 || F > 1) {
    throw new RangeError("F: должно быть в диапазоне (0, 1], получено " + safeString(F));
  }

  if (years === undefined) {
    throw new RangeError("years: поле обязательно, значение не задано");
  }
  if (typeof years !== "number" || !Number.isFinite(years)) {
    throw new RangeError("years: должно быть конечным числом, получено " + safeString(years));
  }
  if (years <= 0) {
    throw new RangeError("years: должно быть > 0, получено " + safeString(years));
  }
  if (years > MAX_YEARS) {
    throw new RangeError("years: превышает допустимый максимум " + MAX_YEARS + ", получено " + safeString(years));
  }

  if (typeof ageStart !== "number" || !Number.isFinite(ageStart)) {
    throw new RangeError("ageStart: должно быть конечным числом, получено " + safeString(ageStart));
  }
  if (ageStart < 0 || ageStart > horizon) {
    throw new RangeError("ageStart: должно быть в диапазоне 0.. " + horizon + " (горизонт), получено " + safeString(ageStart));
  }

  if (smoking !== "never" && smoking !== "smoker") {
    throw new RangeError("smoking: должно быть строго \"never\" или \"smoker\", получено " + safeString(smoking));
  }

  const WLM_per_year = C * F * hoursPerYear / coeffs.exposure.wlm_bq_h_m3_eec.value;
  const annualDose_mSv = WLM_per_year * coeffs.dose.mSv_per_WLM_dwelling.value;
  const yearsEff = Math.max(0, Math.min(years, horizon - ageStart));
  const truncated = years > yearsEff;
  const totalWLM = WLM_per_year * years;
  const totalDose_mSv = annualDose_mSv * years;
  const icrp115Excess = totalWLM * coeffs.risk.icrp115_nominal_lung_per_WLM.value;

  const R0 = coeffs.risk.darby2005.baseline_cumulative_risk_by_age_75[smoking];
  const Ceff = C * hoursPerYear / refHours;
  const f = yearsEff / horizon;
  function darbyExcess(err) {
    const delta = err * (Ceff / 100) * f;
    return -(1 - R0) * Math.expm1(delta * Math.log1p(-R0));
  }

  const darbyExc = nz(darbyExcess(coeffs.risk.darby2005.err_per_100_Bq_m3));
  const withRadonBy75 = nz(R0 + darbyExc);
  const ci = coeffs.risk.darby2005.err_95ci_per_100;
  const excessCI = [nz(darbyExcess(ci[0])), nz(darbyExcess(ci[1]))];

  const u = coeffs.risk.uncertainty_factor.value;
  const icrp115ExcessLow = icrp115Excess / u;
  const icrp115ExcessHigh = icrp115Excess * u;

  const warnings = [];
  if (C > DARBY_MAX_C) {
    warnings.push(`C = ${C} Бк/м3 вне диапазона данных Дарби (таблица до ${DARBY_MAX_C} Бк/м3): экстраполяция.`);
  }
  if (yearsEff < years) {
    warnings.push(`Экспозиция обрезана по горизонту ${horizon} лет: доза и канал МКРЗ 115 считаются за все ${years} лет, канал Дарби — за ${yearsEff} лет.`);
  }
  if (yearsEff === 0) {
    warnings.push("Экспозиция начинается в возрасте горизонта или позже; избыточный риск Дарби равен 0.");
  }

  return {
    input: { C: nz(C), hoursPerYear: nz(hoursPerYear), F: nz(F), years: nz(years), ageStart: nz(ageStart), smoking },
    annualDose_mSv: nz(annualDose_mSv),
    totalDose_mSv: nz(totalDose_mSv),
    WLM_per_year: nz(WLM_per_year),
    totalWLM: nz(totalWLM),
    yearsEff: nz(yearsEff),
    truncated,
    warnings,
    darby: {
      smoking,
      baselineBy75: nz(R0),
      withRadonBy75,
      excess: darbyExc,
      excessCI: [excessCI[0], excessCI[1]],
      metric: "риск (вероятность) рака лёгкого к 75 годам, добавленный облучением",
    },
    icrp115: {
      excess: nz(icrp115Excess),
      excessLow: nz(icrp115ExcessLow),
      excessHigh: nz(icrp115ExcessHigh),
      metric: "номинальный риск рака лёгкого, смешанное население, с поправкой на ущерб",
    },
    provenance: {
      wlm_bq_h_m3_eec: { source: coeffs.exposure.wlm_bq_h_m3_eec.source, level: coeffs.exposure.wlm_bq_h_m3_eec.level },
      mSv_per_WLM_dwelling: { source: coeffs.dose.mSv_per_WLM_dwelling.source, level: coeffs.dose.mSv_per_WLM_dwelling.level },
      icrp115_nominal_lung_per_WLM: { source: coeffs.risk.icrp115_nominal_lung_per_WLM.source, level: coeffs.risk.icrp115_nominal_lung_per_WLM.level },
      darby2005: { source: coeffs.risk.darby2005.source, level: coeffs.risk.darby2005.level },
      uncertainty_factor: { source: coeffs.risk.uncertainty_factor.source, level: coeffs.risk.uncertainty_factor.level },
    },
    assumptions: Object.values(coeffs.assumptions).map((a) => a.note).filter((s) => typeof s === "string"),
  };
}
