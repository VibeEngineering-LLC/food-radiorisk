import { REGIONS, REGION_NAME, normRegion } from '../calc/region.js';

// #FR-101 (D-031): переключатель региона данных «Мир / Россия»; одно общее состояние приложения (App.jsx), на вкладках «Сводка», «Сравнение с облучением» и «Бытовые риски» — одна и та же настройка
export default function RegionSwitch({ region, onRegion }) {
  const cur = normRegion(region);
  return <div className="region-switch" role="group" aria-label="Регион данных">
    <span className="region-label">Данные:</span>
    {REGIONS.map(r => <button type="button" key={r} data-region={r} aria-pressed={cur === r} className={cur === r ? 'on' : undefined} disabled={!onRegion} onClick={() => onRegion && onRegion(r)}>{REGION_NAME[r]}</button>)}
    <span className="hint region-hint">Все диаграммы и таблицы строятся по данным одного региона; по умолчанию — «Мир».</span>
  </div>;
}
