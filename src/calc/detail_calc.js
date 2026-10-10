// src/calc/detail_calc.js
// Чистая функция: собирает детализацию расчёта дозы и риска из result и input.

export function detailOf(result, input) {
  // Масса на год: порция * количество порций
  const massKg = input.portionKg * input.portionsPerYear;

  // Коэффициент риска: из сравнения или null
  const r = result.comparison ? result.comparison.riskCoeff : null;

  // Обработка каждого нуклида
  const nuclides = result.rows.map(row => {
    // Провенанс: доза и распад (с фолбэком)
    const doseProv = row.provenance?.find(p => p.step === 'доза') ?? null;
    const halfLifeProv = row.provenance?.find(p => p.step === 'распад по годам')
      ?? row.provenance?.find(p => p.step === 'распад')
      ?? null;

    // Годовые данные (если нет — пустой массив)
    const yearly = row.yearly ?? [];

    // Суммарная доза по годам
    const doseTotalSv = yearly.reduce((sum, y) => sum + y.doseSv, 0);

    // Риск: только для техногенных и если есть коэффициент
    const riskSv = row.natural ? null : (r != null ? row.doseSvTotal * r : null);

    return {
      nuclide: row.nuclide,
      natural: row.natural,
      aBqPerKg: row.rawBqPerKg,
      fr: row.frUsed,
      massKg,
      intakeStartBq: row.rawBqPerKg * massKg * row.frUsed,
      doseProv,
      halfLifeProv,
      years: yearly.map(y => ({
        k: y.k,
        ageFrom: y.ageFrom,
        band: y.band,
        weight: y.weight,
        decay: y.decay,
        intakeBq: y.intakeBq,
        eSvPerBq: y.eSvPerBq,
        doseSv: y.doseSv
      })),
      doseTotalSv,
      riskSv,
      y90: row.y90
    };
  });

  // Суммарная доза по всем нуклидам
  const doseTotalSv = nuclides.reduce((sum, n) => sum + n.doseTotalSv, 0);

  // Техногенная доза (только natural === false)
  const techDoseTotalSv = nuclides
    .filter(n => n.natural === false)
    .reduce((sum, n) => sum + n.doseTotalSv, 0);

  return {
    massKg,
    riskCoeff: r,
    nuclides,
    doseTotalSv,
    techDoseTotalSv,
    riskNominal: result.totals.riskNominal
  };
}
