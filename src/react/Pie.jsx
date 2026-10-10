import { linearAngles, fmtShare } from '../calc/summary_charts.js';

// вспомогательные функции: полярные координаты и округление
const rad = (deg) => (deg * Math.PI) / 180;
const pt = (cx, cy, r, deg) => ({
  x: cx + r * Math.cos(rad(deg)),
  y: cy + r * Math.sin(rad(deg)),
});
const r2 = (n) => Math.round(n * 100) / 100;

export default function Pie({ id, title, slices, valueHead = 'Значение', labelHead = 'Источник' }) {
  // защита от пустых/некорректных данных
  if (!Array.isArray(slices) || slices.length === 0) return null;

  const tip = (s) => `${s.label}: ${fmtShare(s.share)}; ${s.valueText}`; // полная подсказка сектора
  const cx = 300, cy = 200, r = 170; // #FR-89: крупная диаграмма (оператор); поля слева/справа 130 px — под текст выноски
  // углы в градусах, сумма 360, каждый ненулевой срез не меньше 3°
  const angles = linearAngles(slices.map((s) => s.share)); // линейный масштаб: угол = доля × 360°

  // накопительный угол, старт сверху (-90°), по часовой
  let acc = -90;
  const shapes = slices.map((s, i) => {
    const a = angles[i];
    const start = acc;
    acc += a;
    const end = acc;
    const mid = start + a / 2;
    const full = a >= 360;
    const cls = `pie-sl pie-s${(s.ci ?? i) % 12}` + (s.me ? ' pie-me' : ''); // цвет закреплён за источником (ci), а не за позицией в отсортированном списке
    return { s, i, a, start, end, mid, full, cls };
  });

  // подсектора: идут подряд от начала родительского сектора (не пересортировываются), доля u.share — от итога круга
  const inner = shapes.flatMap((sh) => { let a0 = sh.start; return (sh.s.inner || []).map((u) => { const a1 = a0 + u.share * 360; const o = { u, a0, a1 }; a0 = a1; return o; }); });

  return (
    <figure className="pie" data-chart={id}>
      <h4 className="pie-title">{title}</h4>
      <div className="pie-body">
        <svg viewBox="0 0 600 400" className="pie-svg" role="img" aria-label={title}>
          <title>{title}</title>
          {shapes.map(({ s, i, a, start, end, mid, full, cls }) => {
            if (a <= 0) return null;
            // полный круг рисуем окружностью, дуга на 360° невозможна
            if (full) {
              return <circle key={s.id} className={cls} cx={cx} cy={cy} r={r} tabIndex={0} aria-label={tip(s)}><title>{tip(s)}</title></circle>;
            }
            const p1 = pt(cx, cy, r, start);
            const p2 = pt(cx, cy, r, end);
            const large = a > 180 ? 1 : 0;
            const d = `M ${cx} ${cy} L ${r2(p1.x)} ${r2(p1.y)} A ${r} ${r} 0 ${large} 1 ${r2(p2.x)} ${r2(p2.y)} Z`;
            // подсказка (наведение, фокус с клавиатуры, долгое нажатие на телефоне): полное название, доля, величина; у тонкого сектора — ещё и невидимая широкая линия-зона наведения вдоль радиуса
            const e1 = pt(cx, cy, r, mid), e0 = pt(cx, cy, 0, mid);
            return <g key={s.id}>
              <path className={cls} d={d} tabIndex={0} aria-label={tip(s)}><title>{tip(s)}</title></path>
              {a < 4 && <line className="pie-hit" x1={r2(e0.x)} y1={r2(e0.y)} x2={r2(e1.x)} y2={r2(e1.y)}><title>{tip(s)}</title></line>}
            </g>;
          })}
          {/* #FR-97: подсектора внутри сектора (радон у некурящего — сплошной, добавка у курящего — штриховка); углы линейны (доля × 360°) от начала родительского сектора, круг не меняется */}
          {inner.length > 0 && <defs><pattern id={`${id}-hatch`} patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)"><rect width="8" height="8" className="pie-hatch-bg" /><line x1="0" y1="0" x2="0" y2="8" className="pie-hatch-line" strokeWidth="3" /></pattern></defs>}
          {inner.map(({ u, a0, a1 }) => {
            const q1 = pt(cx, cy, r, a0), q2 = pt(cx, cy, r, a1), md = (a0 + a1) / 2;
            const d = `M ${cx} ${cy} L ${r2(q1.x)} ${r2(q1.y)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${r2(q2.x)} ${r2(q2.y)} Z`;
            const h1 = pt(cx, cy, r, md);
            return <g key={'in-' + u.id} data-inner={u.id} data-a0={r2(a0)} data-a1={r2(a1)}>
              <path className={'pie-sl pie-sub ' + (u.hatch ? 'pie-sub-hatch' : 'pie-sub-solid')} d={d} fill={u.hatch ? `url(#${id}-hatch)` : undefined} tabIndex={0} aria-label={tip(u)}><title>{tip(u)}</title></path>
              {a1 - a0 < 4 && <line className="pie-hit" x1={cx} y1={cy} x2={r2(h1.x)} y2={r2(h1.y)}><title>{tip(u)}</title></line>}
            </g>;
          })}
          {/* выноска для выделенного среза (продукт) */}
          {shapes.filter((x) => x.s.me).map(({ s, mid }) => {
            const e1 = pt(cx, cy, r, mid);
            const e2 = pt(cx, cy, r + 20, mid);
            const t = pt(cx, cy, r + 26, mid);
            const anchor = t.x >= cx ? 'start' : 'end';
            const text = `${s.callout ?? (s.label.split(' ')[0] === 'Питание' ? 'Питание' : s.label)}: ${fmtShare(s.share)}`; // выноска с названием продукта (оператор)
            return (
              <g key={'co-' + s.id}>
                <line className="pie-lead" x1={r2(e1.x)} y1={r2(e1.y)} x2={r2(e2.x)} y2={r2(e2.y)} />
                <text className="pie-callout" x={r2(t.x)} y={r2(t.y)} textAnchor={anchor} dominantBaseline="middle" fontSize={15}>
                  <title>{tip(s)}</title>{text}
                </text>
              </g>
            );
          })}
        </svg>
        <table className="pie-legend">
          <thead>
            <tr>
              <th></th>
              <th>{labelHead}</th>
              <th className="num">Доля</th>
              <th className="num">{valueHead}</th>
            </tr>
          </thead>
          <tbody>
            {slices.map((s, i) => [
              <tr key={s.id} className={s.me ? 'cmp-me' : undefined}>
                <td>
                  <span className={`pie-sw pie-s${(s.ci ?? i) % 12}` + (s.me ? ' pie-me' : '')} aria-hidden="true" />
                </td>
                <td title={s.label}>{s.short || s.label}</td>
                <td className="num">{fmtShare(s.share)}</td>
                <td className="num">{s.valueText}</td>
              </tr>,
              // подстроки «в т. ч.»: без сектора, без доли, в сумму не входят (они часть строки выше)
              ...(s.subs || []).map((u) => (
                <tr key={s.id + '-' + u.id} className="pie-sub" data-sub={u.id}>
                  <td>{u.sw ? <span className={'pie-sw ' + (u.hatch ? 'pie-sub-hatch' : 'pie-sub-solid')} aria-hidden="true" /> : null}</td>
                  <td title={u.label}>{u.short || u.label}</td>
                  <td className="num">{u.shareText ?? '—'}</td>
                  <td className="num">{u.valueText}</td>
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
