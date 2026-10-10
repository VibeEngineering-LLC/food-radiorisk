// #FR-88 v18: проверка диапазонов ввода — огромные и недопустимые значения дают русское сообщение, а не дозу и не исключение
export const LIMITS = { timesPerDay: 100, daysPerWeek: 7, weeksPerMonth: 4.35, monthsPerYear: 12, massKgPerYear: 3650, activityBqPerKg: 1e12, relUncertainty: 10, depositionKBqPerM2: 1e9 };
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const fmt = (x) => String(x).replace('.', ',');
const LABEL = { timesPerDay: 'раз в день', daysPerWeek: 'дней в неделю', weeksPerMonth: 'недель в месяц', monthsPerYear: 'месяцев в году' };
const validDate = (v) => {
  if (v === null || v === undefined || v === '') return true;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
export function checkInputRanges(input) {
  const errs = [];
  for (const k of ['timesPerDay', 'daysPerWeek', 'weeksPerMonth', 'monthsPerYear']) {
    if (fin(input[k]) && input[k] > LIMITS[k]) errs.push(`Рацион: «${LABEL[k]}» — не больше ${fmt(LIMITS[k])}`);
  }
  if (fin(input.portionKg) && fin(input.portionsPerYear) && input.portionKg * input.portionsPerYear > LIMITS.massKgPerYear) {
    errs.push('Рацион: за год получается больше 3650 кг продукта — проверьте массу порции (в граммах) и частоту');
  }
  if (!validDate(input.eatDate)) errs.push(`Дата «${input.eatDate}» указана неверно — введите дату в формате ГГГГ-ММ-ДД`);
  for (const n of input.nuclides ?? []) {
    if (!validDate(n.sampleDate)) errs.push(`${n.nuclide}: Дата «${n.sampleDate}» указана неверно — введите дату в формате ГГГГ-ММ-ДД`);
    if (!validDate(n.depositionDate)) errs.push(`${n.nuclide}: Дата «${n.depositionDate}» указана неверно — введите дату в формате ГГГГ-ММ-ДД`);
    if (n.source === 'deposition') {
      if (!fin(n.depositionKBqPerM2) || n.depositionKBqPerM2 < 0) errs.push(`${n.nuclide}: укажите плотность загрязнения, кБк/м² (число не меньше 0)`);
      else if (n.depositionKBqPerM2 > LIMITS.depositionKBqPerM2) errs.push(`${n.nuclide}: плотность загрязнения больше 10⁹ кБк/м² — проверьте число и единицу`);
    } else {
      if (fin(n.measuredBqPerKg) && n.measuredBqPerKg > LIMITS.activityBqPerKg) errs.push(`${n.nuclide}: активность больше 10¹² Бк/кг — проверьте число и единицу`);
      const u = n.measuredUncertaintyBqPerKg;
      // #FR-88 v22 (D-2): при некорректной активности ошибка — в поле активности (её даст расчёт строки), а не в производной неопределённости
      const actOk = fin(n.measuredBqPerKg) && n.measuredBqPerKg >= 0;
      if (!actOk) continue;
      if (u !== undefined && u !== null && (!fin(u) || u < 0)) errs.push(`${n.nuclide}: неопределённость: укажите число процентов не меньше 0`);
      else if (fin(u) && fin(n.measuredBqPerKg) && n.measuredBqPerKg > 0) {
        const K = fin(n.samplePrep?.concentrationFactor) && n.samplePrep.concentrationFactor > 0 ? n.samplePrep.concentrationFactor : 1;
        if (u / (n.measuredBqPerKg / K) > LIMITS.relUncertainty) errs.push(`${n.nuclide}: неопределённость больше 1000 % — проверьте число`);
      }
    }
  }
  return errs;
}
export function userMessage(e) {
  const msg = String(e?.message ?? '');
  if (e?.plain || /[А-Яа-яЁё]/.test(msg)) return msg;
  return 'Расчёт не выполнен: проверьте введённые значения (пустые поля, отрицательные и слишком большие числа)';
}
