// #FR-81 D08/D09: поступление и доза по годам питания (ряды по плану years.js)

export function yearlySeries({ plan, intakeStart, eByAge, eDefault, label }) {
  return plan.map((y) => {
    const e = y.band ? eByAge[y.band] : eDefault;
    if (!(e > 0)) {
      throw Object.assign(
        new Error(`${label}: нет коэффициента e(g) для возрастной группы «${y.band}»`),
        { plain: true }
      );
    }
    const intakeBq = intakeStart * y.weight * y.decay;
    return { ...y, intakeBq, eSvPerBq: e, doseSv: intakeBq * e };
  });
}

export function bandsOf(yearly) {
  const map = new Map();
  for (const item of yearly) {
    if (!map.has(item.band)) {
      map.set(item.band, {
        age: item.band,
        years: 0,
        eSvPerBq: item.eSvPerBq,
        doseSv: 0
      });
    }
    const group = map.get(item.band);
    group.years += item.weight;
    group.doseSv += item.doseSv;
  }
  return [...map.values()];
}
