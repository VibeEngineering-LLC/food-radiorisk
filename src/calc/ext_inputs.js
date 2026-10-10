import { regionDefaults } from './region_parts.js';

export const DEFAULT_FLIGHT_PER_YEAR = 2;  // решение оператора: 2 перелёта по 3 ч в год (не зависит от региона)

// #FR-101: введённое пользователем и умолчания региона. ext — { radonC, dwellU, ctN, xrayN, flightN }; NaN, null, undefined или не число — «не введено» (берётся умолчание региона).
const entered = (v) => typeof v === 'number' && Number.isFinite(v);

export function effectiveInputs(parts, ext = {}) {
  const d = regionDefaults(parts);
  const radonEntered = entered(ext.radonC), dwellEntered = entered(ext.dwellU), ctEntered = entered(ext.ctN) && ext.ctN >= 0, xrayEntered = entered(ext.xrayN) && ext.xrayN >= 0, flightEntered = entered(ext.flightN) && ext.flightN >= 0;
  return {
    radonC: radonEntered ? ext.radonC : d.radonC,
    radonIsDefault: !radonEntered,
    dwellU: dwellEntered ? ext.dwellU : null,       // мощность дозы в жилище учитывается в расчёте, только если введена пользователем
    dwellIsDefault: false,
    dwellDefaultU: d.dwellU,                         // умолчание региона — только подсказка поля
    ctN: ctEntered ? ext.ctN : d.ctN,
    ctIsDefault: !ctEntered,
    xrayN: xrayEntered ? ext.xrayN : d.xrayN,
    xrayIsDefault: !xrayEntered,
    flightN: flightEntered ? ext.flightN : DEFAULT_FLIGHT_PER_YEAR,
    flightIsDefault: !flightEntered || ext.flightN === DEFAULT_FLIGHT_PER_YEAR,
    defaults: d,
  };
}
