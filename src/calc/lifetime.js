// Константа конечного возраста для расчета дозы за жизнь
export const LIFETIME_END_AGE = 70;

// Возрастные группы согласно ICRP 72/119
export const AGE_BANDS = [
  { age: '3m', from: 0, to: 1 },
  { age: '1y', from: 1, to: 2 },
  { age: '5y', from: 2, to: 7 },
  { age: '10y', from: 7, to: 12 },
  { age: '15y', from: 12, to: 17 },
  { age: 'adult', from: 17, to: Infinity }
];

// Функция для расчета количества лет в каждой возрастной группе
export function bandYears(startAge, endAge) {
  // Проверка на конечность чисел
  if (!Number.isFinite(startAge) || !Number.isFinite(endAge)) {
    throw new RangeError('bandYears: startAge и endAge должны быть конечными числами');
  }

  // Проверка на отрицательный начальный возраст
  if (startAge < 0) {
    throw new RangeError('bandYears: startAge не может быть отрицательным');
  }

  // Проверка на корректность интервала
  if (endAge <= startAge) {
    throw new RangeError('bandYears: endAge должно быть больше startAge');
  }

  const result = [];

  for (const band of AGE_BANDS) {
    // Вычисление пересечения интервалов
    const overlapStart = Math.max(band.from, startAge);
    const overlapEnd = Math.min(band.to, endAge);
    const years = Math.max(0, overlapEnd - overlapStart);

    if (years > 0) {
      result.push({ age: band.age, years });
    }
  }

  return result;
}

// Функция для расчета дозы за жизнь
export function lifetimeDose(intakeBqPerYear, startAge, endAge, eByAge) {
  // Проверка intakeBqPerYear
  if (!Number.isFinite(intakeBqPerYear) || intakeBqPerYear < 0) {
    throw new RangeError('lifetimeDose: intakeBqPerYear должно быть конечным числом >= 0');
  }

  // Получаем возрастные группы для заданного интервала
  const bands = bandYears(startAge, endAge);

  let totalDoseSv = 0;
  let totalYears = 0;
  const detailedBands = [];

  for (const band of bands) {
    // Проверка наличия коэффициента e(g) для данной возрастной группы
    if (!eByAge.hasOwnProperty(band.age)) {
      throw new RangeError(`lifetimeDose: отсутствует коэффициент e(g) для возрастной группы '${band.age}'`);
    }

    const eSvPerBq = eByAge[band.age];

    // Проверка корректности коэффициента e(g)
    if (!Number.isFinite(eSvPerBq) || eSvPerBq <= 0) {
      throw new RangeError(`lifetimeDose: коэффициент e(g) для возрастной группы '${band.age}' должен быть конечным числом > 0`);
    }

    // Расчет дозы для данной возрастной группы
    const doseSv = intakeBqPerYear * band.years * eSvPerBq;

    totalDoseSv += doseSv;
    totalYears += band.years;

    detailedBands.push({
      age: band.age,
      years: band.years,
      eSvPerBq,
      doseSv
    });
  }

  // Общее количество введенных беккерелей
  const intakeBq = intakeBqPerYear * totalYears;

  return {
    doseSv: totalDoseSv,
    intakeBq,
    years: totalYears,
    bands: detailedBands
  };
}
