import { esc, fmtNum } from './fmt.js';
import { stemOf } from '../calc/catalog.js';

export const TUM_HINT = "ТУМ — тип условий местопроизрастания (эдатоп по Погребняку). Буква — богатство почвы: А — бор, В — суборь, С — сугрудок, D — груд. Цифра — влажность: 1 сухой, 2 свежий, 3 влажный, 4 сырой, 5 мокрый. Переход Cs-137 растёт с влажностью: для одного вида КП от А2 до А5 различается в разы.";

export function normRu(s) {
    return String(s ?? '').toLowerCase().replace(/ё/g, 'е').trim().replace(/\s+/g, ' ');
}

export function elementOf(nuclide) {
    if (!nuclide) return '';
    const m = nuclide.match(/^([A-Za-z]+)/);
    return m ? m[1] : '';
}

export function productNames(choices) {
    const seen = new Set();
    const names = [];
    for (const r of choices.transfer ?? []) {
        const part = (r.item_ru || '').split(',')[0].trim();
        const key = normRu(part);
        if (!seen.has(key)) {
            seen.add(key);
            names.push(part);
        }
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'ru'));
}

export function matchesProduct(itemRu, query) {
    const q = normRu(query);
    if (!q) return true;
    return normRu(itemRu).includes(q);
}

// основа первого значимого слова (без слов состояния) — одна реализация в каталоге, здесь реэкспорт
export { stemOf };

function isFiniteNum(v) { return typeof v === 'number' && Number.isFinite(v); }

export function transferValueText(rec) {
    const c = isFiniteNum(rec.am) ? rec.am : isFiniteNum(rec.gm) ? rec.gm : null;
    const lo = isFiniteNum(rec.min) ? rec.min : null;
    const hi = isFiniteNum(rec.max) ? rec.max : null;
    const fC = c != null ? fmtNum(c * (rec.unit_factor || 1)) : null;
    const fLo = lo != null ? fmtNum(lo * (rec.unit_factor || 1)) : null;
    const fHi = hi != null ? fmtNum(hi * (rec.unit_factor || 1)) : null;

    if (fC && fLo && fHi) return `${fC} м²/кг (${fLo}–${fHi})`;
    if (fC) return `${fC} м²/кг`;
    if (!fC && fLo && fHi) return `${fLo}–${fHi} м²/кг`;
    if (!fC && fLo) return `≥ ${fLo} м²/кг`;
    if (!fC && fHi) return `≤ ${fHi} м²/кг`;
    return 'нет значения';
}

export function transferLabel(rec) {
    const basis = rec.mass_basis === 'fresh' ? 'сырая' : rec.mass_basis === 'dry' ? 'сухая' : 'основа не указана';
    return `${rec.item_ru} — ${QTY_RU[rec.quantity] ?? rec.quantity} ${transferValueText(rec)} · ${basis} · ${rec.level}`;
}
// #FR-31: Tag (МАГАТЭ) и КП — одна величина, коэффициент перехода «плотность загрязнения → продукт», м²/кг
const QTY_RU = { Tag: 'КП', KP: 'КП', CR: 'коэф. накопления', Fv: 'коэф. накопления почва → растение', Fm: 'коэф. перехода в молоко', Ff: 'коэф. перехода в мясо' };

export function transferOptions(choices, nuclide, query) {
    const el = elementOf(nuclide);
    const candidates = (choices.transfer ?? []).filter(r => elementOf(r.nuclide) === el);
    let selected = candidates.filter(r => matchesProduct(r.item_ru, query));
    // второй проход: по основе первого значимого слова (шифр пробы ЛСРМ: «Грузди», «Черника ОГО»)
    const stem = selected.length === 0 && normRu(query) ? stemOf(query) : '';
    if (stem) selected = candidates.filter(r => normRu(r.item_ru).includes(stem));
    let matched = selected.length;
    let fallback = false;

    if (normRu(query) && matched === 0) {
        selected = candidates;
        fallback = true;
    }

    const groupsMap = new Map();
    for (const r of selected) {
        const src = r.source || '';
        if (!groupsMap.has(src)) groupsMap.set(src, []);
        groupsMap.get(src).push({ id: r.id, label: transferLabel(r) });
    }

    const groups = [...groupsMap.entries()]
        .map(([source, items]) => ({
            source,
            items: items.sort((a, b) => a.label.localeCompare(b.label, 'ru'))
        }))
        .sort((a, b) => a.source.localeCompare(b.source));

    return { groups, matched, fallback };
}

export function concentrationFor(mode, dryMatterPercent, userK) {
    if (mode === 'as_is') return { k: 1, auto: true, note: '' };
    if (mode === 'dried') {
        if (typeof dryMatterPercent === 'number' && Number.isFinite(dryMatterPercent) && dryMatterPercent > 0 && dryMatterPercent <= 100) {
            return { k: 100 / dryMatterPercent, auto: true, note: '' };
        }
        return { k: null, auto: true, note: 'для высушенной пробы нужен % сухого вещества' };
    }
    if (mode === 'ashed' || mode === 'concentrated') {
        if (typeof userK === 'number' && Number.isFinite(userK) && userK > 0) {
            return { k: userK, auto: false, note: '' };
        }
        return { k: null, auto: false, note: 'введите коэффициент концентрирования K' };
    }
    return { k: null, auto: false, note: 'неизвестный способ подготовки пробы' };
}

export function depositionHtml(rows) {
    const valid = rows.filter(r => r.depositionEstimate && typeof r.depositionEstimate === 'object');
    if (!valid.length) return '';

    let html = '<h3>Оценка плотности загрязнения места сбора</h3><div class="tablewrap"><table>';
    html += '<tr><th>Нуклид</th><th>Коэффициент перехода</th><th>Основа</th><th>A на основе КП, Бк/кг</th><th>D, кБк/м² (центр)</th><th>Диапазон D, кБк/м²</th><th>Диапазон D, Ки/км²</th></tr>';

    for (const r of valid) {
        const d = r.depositionEstimate;
        const basis = d.basis === 'fresh' ? 'сырая' : d.basis === 'dry' ? 'сухая' : 'основа не указана';
        const act = isFiniteNum(d.activityOnBasis) ? fmtNum(d.activityOnBasis) : '—';
        const kD = d.kBqPerM2;
        const cD = isFiniteNum(kD.central) ? fmtNum(kD.central) : '—';
        // #FR-45: диапазон всегда, с учётом погрешности A, в кБк/м² и Ки/км²
        const rg = d.range;
        const end = (v, inf) => isFiniteNum(v) ? fmtNum(v) : (inf ? '∞' : '—');
        const minD = end(rg?.kBqPerM2.lo), maxD = end(rg?.kBqPerM2.hi, kD.unbounded);
        const rangeCi = `${end(rg?.ciPerKm2.lo)} – ${end(rg?.ciPerKm2.hi, kD.unbounded)}`;

        const kp = d.summary ? `сводная: медиана по ${d.summary.used} оценкам (${d.summary.sources} ист.); диапазон — средние 50 % оценок (между 1-м и 3-м квартилями; полный разброс ${fmtNum(d.summary.fullMin)} – ${fmtNum(d.summary.fullMax)} кБк/м²)${d.summary.early ? `; записи 1986 г. не учтены — ${d.summary.early}` : ''}${d.summary.notStated ? `; основа массы по выводу — ${d.summary.notStated}` : ''}` : null;
        html += `<tr><td>${esc(r.nuclide)}</td><td>${kp ? esc(kp) : `<code>${esc(d.transferId)}</code>`}</td><td>${esc(d.summary ? 'по записи' : basis)}</td><td class="num">${esc(act)}</td><td class="num">${esc(cD)}</td><td class="num">${esc(minD)} – ${esc(maxD)}</td><td class="num">${esc(rangeCi)}</td></tr>`;
    }

    html += '</table></div>';
    html += '<p class="hint">Оценка обратным пересчётом: D = A / (1000 · КП). КП для одного вида различается в разы в зависимости от типа леса и влажности почвы, поэтому это порядок величины, а не измерение. Активность всегда приводится к исходному (свежему) продукту: A<sub>свеж</sub> = A<sub>суш</sub> / коэффициент усушки; для КП на сухую массу — A<sub>свеж</sub> · 100 / % сухого вещества. Диапазон D учитывает разброс КП и погрешность измеренной активности A: нижняя граница — большой КП и A − u, верхняя — малый КП и A + u. 1 Ки/км² = 37 кБк/м².</p>';
    return html;
}
