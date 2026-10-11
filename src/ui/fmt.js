/** @param {string} s - Text to escape. @returns {string} HTML-escaped string. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/** #FR-124: неразрывный пробел — между числом и единицей и в разрядах (ГОСТ 8.417) */
export const NB = ' ';
const NB_UNIT = '(?:мкЗв|мЗв|кБк|МБк|Бк|Зв|Гр|кг|мг|г|ч|мин|сут|%|м²|м³)(?![А-Яа-яЁёA-Za-z])';
/** #FR-124: «число + единица», разряды «1 000 000» и «п. 2.3», «№ 614», «табл. 3.1» — неразрывным пробелом (применяется ко всем текстам экрана и отчётов) */
export const nb = (s) => String(s)
  .replace(new RegExp(`([\\d}]) (?=${NB_UNIT})`, 'g'), `$1${NB}`)
  .replace(/(\d) (?=\d{3}(?!\d))/g, `$1${NB}`)
  .replace(/(^|[\s(«])(п\.|пп\.|табл\.|с\.|ст\.|Прил\.|№) (?=[\d(])/g, `$1$2${NB}`);

/** @param {number} x - Number. @param {number} sig - Significant digits. @returns {string} Formatted number with Russian comma. */
export const fmtNum = (x, sig = 3) => {
  if (x == null || !isFinite(x)) return '—';
  if (x === 0) return '0';
  // #FR-81 E15: 999 999 при 5 значащих округляется до 10⁶ — такое число пишется научной записью, как и 10⁶
  if (Math.abs(x) >= 1e-3 && Math.abs(Number(Number(x).toPrecision(sig))) < 1e6) {
    const n = Number(Number(x).toPrecision(sig));
    const s = n.toLocaleString('ru-RU', { maximumFractionDigits: 12, useGrouping: true });
    return s.replace(/\u202F/g, NB); // #FR-124: \u0440\u0430\u0437\u0440\u044F\u0434\u044B \u0440\u0430\u0437\u0434\u0435\u043B\u0435\u043D\u044B \u043D\u0435\u0440\u0430\u0437\u0440\u044B\u0432\u043D\u044B\u043C \u043F\u0440\u043E\u0431\u0435\u043B\u043E\u043C (U+00A0), \u0447\u0438\u0441\u043B\u043E \u043D\u0435 \u0440\u0430\u0437\u0440\u044B\u0432\u0430\u0435\u0442\u0441\u044F \u043F\u0440\u0438 \u043F\u0435\u0440\u0435\u043D\u043E\u0441\u0435 \u0441\u0442\u0440\u043E\u043A\u0438
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
  if (sv === 0) return `0${NB}Зв`;
  // #FR-81 E15: единица выбирается по ОКРУГЛЁННОМУ значению (9,995·10⁻⁴ Зв — «1 мЗв», а не «1 000 мкЗв»)
  const abs = Math.abs(sv), r3 = (v) => Number(v.toPrecision(3));
  if (r3(abs * 1e6) < 1000) return `${fmtNum(sv * 1e6)}${NB}мкЗв`;
  if (r3(abs * 1e3) < 1000) return `${fmtNum(sv * 1e3)}${NB}мЗв`;
  return `${fmtNum(sv)}${NB}Зв`;
};

/** @param {number} p - Probability. @returns {string} Risk per million. */
export const fmtRiskPerMillion = (p) => (!isFinite(p)) ? '—' : p > 1 ? `расчёт неприменим (вероятность больше 100${NB}%)` : `${fmtNum(p * 1e6)} на${NB}1${NB}000${NB}000`;
// #FR-43: риск одной человекопонятной записью — «1 из N» (N = 1/p, три значащие цифры)
// #FR-81 E15: от миллиарда — «млрд»; вероятность больше 1 — не вероятность
export const fmtOneIn = (p) => (!isFinite(p) || p < 0 || p > 1) ? '—' : p === 0 ? '0' : (1 / p >= 1e9 ? `1 из ${fmtNum(1 / p / 1e9)} млрд` : 1 / p >= 1e6 ? `1 из ${fmtNum(1 / p / 1e6)} млн` : `1 из ${fmtNum(1 / p)}`);

/** #FR-81 V03: «k на 1 000 000» — k≥1: 2 значащие цифры; 0,01≤k<1: одна; меньше — «меньше 0,01»; 0 — «0» */
// четырёхзначные числа — без пробела (1700), от пяти знаков — с пробелом (16 000)
const noGap4 = (s) => s.replace(/^(\d)[  ](\d{3})$/, '$1$2');
// #FR-88 v22 (D-7): вероятность больше 1 (100 %) числом не печатается — линейная беспороговая модель при такой дозе неприменима (МКРЗ 103, п. 64–65)
export const riskOverOne = (p) => isFinite(p) && p > 1;
export const fmtPerMillion = (p) => {
  if (!isFinite(p) || p < 0) return '—';
  if (riskOverOne(p)) return `расчёт неприменим (вероятность больше 100${NB}%)`;
  const k = p * 1e6;
  if (k === 0) return '0';
  if (k < 0.01) return 'меньше 0,01';
  return noGap4(fmtNum(Number(k.toPrecision(k >= 1 ? 2 : 1)), 12));
};
/** #FR-81 V03: целое число, 2 значащие цифры (156 410 → «160 000») */
export const fmtCount = (n) => !isFinite(n) ? '—' : noGap4(fmtNum(Math.round(Number(n.toPrecision(2))), 12));
/** #FR-81 V03: доза, 2 значащие цифры; единица выбирается по округлённому значению (999,6 мкЗв → «1 мЗв») */
export const fmtDose2 = (sv) => {
  if (!isFinite(sv)) return '—';
  if (sv === 0) return `0${NB}Зв`;
  const r2 = (v) => Number(v.toPrecision(2)), abs = Math.abs(sv);
  if (r2(abs * 1e6) < 1000) return `${fmtNum(sv * 1e6, 2)}${NB}мкЗв`;
  if (r2(abs * 1e3) < 1000) return `${fmtNum(sv * 1e3, 2)}${NB}мЗв`;
  return `${fmtNum(sv, 2)}${NB}Зв`;
};
/** #FR-81 V03: доля в процентах, 2 значащие цифры */
export const fmtPct2 = (frac) => !isFinite(frac) ? '—' : `${fmtNum(frac * 100, 2)}${NB}%`;

/** #FR-81 E13: число у границы вердикта не округляется до самой границы (B = 1,0004 пишется «1,0004», а не «1») */
export const fmtNear = (x, ref, sig = 3) => {
  let s = fmtNum(x, sig);
  for (let k = sig; k < 8 && x !== ref && s === fmtNum(ref, sig); k++) s = fmtNum(x, k + 1);
  return s;
};

/** #FR-81 V3-1: показатель B с неопределённостью только если ΔB > 0 («3,92», а не «3,92 ± 0») */
export const fmtBpm = (B, dB) => dB > 0 ? `${fmtNear(B, 1)} ± ${fmtNear(dB, 0.3)}` : fmtNear(B, 1);
export const fmtBLine = (B, dB) => dB > 0 ? `B = ${fmtNear(B, 1)}, ΔB = ${fmtNear(dB, 0.3)}` : `B = ${fmtNear(B, 1)}`;

// #FR-50: риск — числом дополнительных случаев рака на 1 млн человек (с согласованием слова «случай»)
export const casesWord = (s) => {
  if (/,/.test(s)) return 'случая';
  const n = Number(s.replace(/\s/g, '')) % 100, d = n % 10;
  return n >= 11 && n <= 14 ? 'случаев' : d === 1 ? 'случай' : d >= 2 && d <= 4 ? 'случая' : 'случаев';
};
export const fmtCases = (p) => { if (!isFinite(p) || p < 0) return '—'; const s = fmtNum(p * 1e6); return `${s} ${casesWord(s)}`; };

/** @param {number} frac - Fraction. @returns {string} Percentage string. */
export const fmtPct = (frac) => (!isFinite(frac)) ? '—' : `${fmtNum(frac * 100, 3)}${NB}%`;
/** #FR-78: «во сколько раз» — ×104, ×0,15, ×3 300 (три значащие цифры, неразрывный пробел в разрядах). */
export const fmtTimes = (x) => (!isFinite(x)) ? '—' : `×${fmtNum(x, 3).replace(/ /g, NB)}`;

/** @param {string} level - Level emoji. @returns {string} CSS class. */
export const levelClass = (level) => level === '✅' ? 'lvl-ok' : 'lvl-w';
/** #FR-124 (оператор 2026-10-11): уровень проверки источника на экране и в отчётах — словом, не значком; данные (level) не меняются */
export const levelWord = (level) => level === '✅' ? 'сверено с источником' : level ? 'требует уточнения' : '';

/** @param {number} frac - Fraction. @returns {string} Gauge CSS class. */
export const gaugeClass = (frac) => (!isFinite(frac)) ? '' : (frac < 0.5 ? '' : (frac <= 1 ? 'warn' : 'bad'));

/** @param {string} v - Verdict key. @returns {string} Russian text. */
export const verdictText = (v) => ({ conforms: 'соответствует', nonconforms: 'не соответствует', undetermined: 'требуется уточнить результат измерения' }[v] ?? '—');
