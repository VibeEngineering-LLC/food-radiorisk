/** @param {ArrayBuffer|Uint8Array} bytes */
export function decodeSpe(bytes) {
  return new TextDecoder('windows-1251').decode(bytes);
}

/** @param {string|null|undefined} s */
export function speDateToIso(s) {
  const token = String(s ?? '').trim().split(/\s+/)[0];
  const m = token?.match(/^(\d{1,2})-(\d{1,2})-(\d{2}|\d{4})$/);
  if (!m) return null;
  let [, dStr, monStr, yStr] = m;
  const d = Number(dStr), mon = Number(monStr);
  const y = yStr.length === 2 ? 2000 + Number(yStr) : Number(yStr);
  if (mon < 1 || mon > 12) return null;
  const dt = new Date(Date.UTC(y, mon - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mon - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** @param {string|null|undefined} s */
export function parseMassPair(s) {
  if (!s?.trim()) return null;
  const normalized = s.trim().replace(/,/g, '.'); // все запятые: «670,9;0,05» — две
  const parts = normalized.split(';').map(p => p.trim());
  const val = Number(parts[0]);
  const unc = parts.length > 1 ? Number(parts[1]) : null;
  if (!Number.isFinite(val) || val <= 0) return null;
  if (unc !== null && !Number.isFinite(unc)) return null;
  return { value: val, unc };
}

/** @param {string} text */
export function parseSpeHeader(text) {
  const raw = {};
  for (const line of String(text).split(/\r?\n/)) {
    if (/^SPECTR=/.test(line)) break;
    if (/^PEAKS=/.test(line)) continue; // skip peaks header and subsequent data lines
    const m = line.match(/^([A-Z_ ]+)=(.*)$/);
    if (m && !(m[1] in raw)) raw[m[1]] = m[2].trim();
  }
  const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };
  return {
    raw,
    shifr: raw.SHIFR ?? '',
    type: raw.TYPE ?? '',
    geometry: raw.GEOMETRY ?? '',
    material: raw.MATERIAL ?? '',
    comment: raw.COMMENT ?? '',
    measBegin: speDateToIso(raw.MEASBEGIN),
    prepBegin: speDateToIso(raw.PREPBEGIN),
    prepEnd: speDateToIso(raw.PREPEND),
    tLive: num(raw.TLIVE),
    tReal: num(raw.TREAL),
    rawMass: parseMassPair(raw.RAWMASS),
    probeMass: parseMassPair(raw.PROBEMASS),
    sampleMass: parseMassPair(raw.SAMPLEMASS)
  };
}

/** @param {string} shifr */
export function productFromShifr(shifr) {
  return shifr.replace(/(_\d+)+$/, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

/** @param {number|null} rawG @param {number|null} probeG */
export function concentrationFromMasses(rawG, probeG) {
  if (typeof rawG !== 'number' || typeof probeG !== 'number') return null;
  if (!Number.isFinite(rawG) || !Number.isFinite(probeG)) return null;
  if (rawG <= 0 || probeG <= 0) return null;
  return rawG / probeG;
}

/** @param {ReturnType<typeof parseSpeHeader>} h */
export function speToForm(h) {
  const rawMassG = h.rawMass?.value ?? null;
  const probeMassG = h.probeMass?.value ?? null;
  const sampleMassG = h.sampleMass?.value ?? null;
  const k = concentrationFromMasses(rawMassG, probeMassG);
  const warnings = [];
  if (h.type && h.type !== 'Образец') {
    warnings.push(`спектр не образца (тип: ${h.type})`);
  }
  if (k === null) {
    warnings.push('в спектре нет масс сырья и пробы — K не определён');
  }
  warnings.push('активность в форму не переносится — введите её из протокола обработки');
  return {
    product: productFromShifr(h.shifr),
    rawMassG,
    probeMassG,
    sampleMassG,
    refDate: h.measBegin,
    k,
    warnings
  };
}
