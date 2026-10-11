// #FR-116: зона риска по уровням НРБ-99/2009 п. 2.3 (10⁻⁶ — пренебрежимо малый, 5·10⁻⁵ — исходя из которого установлены пределы доз) и положение маркера на шкале
// Уровни берутся из записей набора risk; шкала логарифмическая по зонам 0,01–1000 на млн (шкала уровней, а не диаграмма долей)
export function riskAssessmentOf(riskRecords, risk) {
  const rec = (id) => (riskRecords || []).find(r => r.id === id && Number.isFinite(r.value));
  const n = rec('nrb2009_p23_negligible_risk'), l = rec('nrb2009_p23_lifetime_risk_pop');
  if (!n || !l || !Number.isFinite(risk)) return null;
  const level = risk <= n.value ? 'negligible' : risk <= l.value ? 'within' : 'exceeds';
  return { level, negligible: { value: n.value, loc: n.loc }, limit: { value: l.value, loc: l.loc } };
}

// положение на шкале 0,01…1000 на млн (10⁻⁸…10⁻³), % ширины; вне шкалы прижимается к краю
export const logPos = (x) => (x > 0 ? Math.max(0, Math.min(100, (Math.log10(x) + 8) / 5 * 100)) : 0);
