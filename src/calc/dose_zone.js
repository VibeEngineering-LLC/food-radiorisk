// #FR-120: зона дозы по уровням из расчёта: ≤ пренебрежимо малого уровня (10 мкЗв/год, ОСПОРБ-99/2010) — зелёная, ≤ предела — янтарная, выше — красная
export function doseZone(doseSv, negligibleSv, limitSv) {
  if (!Number.isFinite(doseSv) || !Number.isFinite(negligibleSv) || !Number.isFinite(limitSv)) return '';
  return doseSv <= negligibleSv ? 'negligible' : doseSv <= limitSv ? 'within' : 'exceeds';
}

// слово зоны в подписи карточки (смысл не держится только на цвете)
export const ZONE_WORD = { negligible: 'пренебрежимо мало', within: 'ниже предела', exceeds: 'выше предела' };
