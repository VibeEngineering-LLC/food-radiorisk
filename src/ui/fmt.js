/** @param {string} s - Text to escape. @returns {string} HTML-escaped string. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/** @param {number} x - Number. @param {number} sig - Significant digits. @returns {string} Formatted number with Russian comma. */
export const fmtNum = (x, sig = 3) => {
  if (x == null || !isFinite(x)) return '—';
  if (x === 0) return '0';
  if (Math.abs(x) >= 1e-3 && Math.abs(x) < 1e6) {
    const n = Number(Number(x).toPrecision(sig));
    let s = n.toLocaleString('ru-RU', { maximumFractionDigits: 12, useGrouping: true });
    return s.replace(/[\u00A0\u202F]/g, ' ');
  }
  return fmtSci(x, sig);
};

/** @param {number} x - Number. @param {number} sig - Significant digits. @returns {string} Scientific notation string. */
export const fmtSci = (x, sig = 3) => {
  if (!isFinite(x)) return '—';
  if (x === 0) return '0';
  const expDigits = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  let [mStr, eStr] = Number(x).toExponential(sig - 1).split('e');
  mStr = mStr.replace('.', ',').replace(/0+$/, '').replace(/,$/, '');
  const exp = parseInt(eStr, 10);
  const sign = exp < 0 ? '⁻' : '';
  const digits = Math.abs(exp).toString().split('').map(d => expDigits[d]).join('');
  return `${mStr}·10${sign}${digits}`;
};

/** @param {number} sv - Sievert value. @returns {string} Dose with unit. */
export const fmtDose = (sv) => {
  if (!isFinite(sv)) return '—';
  if (sv === 0) return '0 Зв';
  const abs = Math.abs(sv);
  if (abs < 1e-3) return `${fmtNum(sv * 1e6)} мкЗв`;
  if (abs < 1) return `${fmtNum(sv * 1e3)} мЗв`;
  return `${fmtNum(sv)} Зв`;
};

/** @param {number} p - Probability. @returns {string} Risk per million. */
export const fmtRiskPerMillion = (p) => (!isFinite(p)) ? '—' : `${fmtNum(p * 1e6)} на млн`;
// #FR-43: риск одной человекопонятной записью — «1 из N» (N = 1/p, три значащие цифры)
export const fmtOneIn = (p) => (!isFinite(p) || p < 0) ? '—' : p === 0 ? '0' : (1 / p >= 1e6 ? `1 из ${fmtNum(1 / p / 1e6)} млн` : `1 из ${fmtNum(1 / p)}`);

// #FR-50: риск — числом дополнительных случаев рака на 1 млн человек (с согласованием слова «случай»)
export const casesWord = (s) => {
  if (/,/.test(s)) return 'случая';
  const n = Number(s.replace(/\s/g, '')) % 100, d = n % 10;
  return n >= 11 && n <= 14 ? 'случаев' : d === 1 ? 'случай' : d >= 2 && d <= 4 ? 'случая' : 'случаев';
};
export const fmtCases = (p) => { if (!isFinite(p) || p < 0) return '—'; const s = fmtNum(p * 1e6); return `${s} ${casesWord(s)}`; };

/** @param {number} frac - Fraction. @returns {string} Percentage string. */
export const fmtPct = (frac) => (!isFinite(frac)) ? '—' : `${fmtNum(frac * 100, 3)} %`;

/** @param {string} level - Level emoji. @returns {string} CSS class. */
export const levelClass = (level) => level === '✅' ? 'lvl-ok' : 'lvl-w';

/** @param {number} frac - Fraction. @returns {string} Gauge CSS class. */
export const gaugeClass = (frac) => (!isFinite(frac)) ? '' : (frac < 0.5 ? '' : (frac <= 1 ? 'warn' : 'bad'));

/** @param {string} v - Verdict key. @returns {string} Russian text. */
export const verdictText = (v) => ({ conforms: 'соответствует', nonconforms: 'не соответствует', undetermined: 'нужно уточнить измерение' }[v] ?? '—');
